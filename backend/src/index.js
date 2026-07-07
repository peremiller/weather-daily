import express from 'express';
import { config, enabledChannels } from './config.js';
import { startScheduler } from './scheduler.js';
import { broadcastDaily } from './broadcast.js';
import { sendOwnerReport } from './ownerReport.js';
import { pagasaTenDayPanel } from './pagasaTenDay.js';
import { getDailyWeather, getForecast, formatMessage, reverseGeocode, geocode } from './weather.js';
import {
  addSubscriber,
  removeSubscriber,
  setUserLocation,
  getUserLocation,
} from './store.js';
import * as telegram from './bots/telegram.js';
import * as viber from './bots/viber.js';
import * as messenger from './bots/messenger.js';

const app = express();
app.use(express.json());

// ---- Health & status -------------------------------------------------------
app.get('/', (_req, res) => {
  res.json({
    service: 'weather-daily-backend',
    status: 'ok',
    channels: enabledChannels(),
    schedule: config.dailyCron,
    timezone: config.timezone,
    location: config.location.name,
  });
});

// Returns the formatted forecast as JSON (handy for the mobile app too).
app.get('/weather', async (_req, res) => {
  try {
    const weather = await getDailyWeather();
    res.json({ weather, message: formatMessage(weather, 'plain') });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Manually trigger a broadcast (protect this in production!).
app.post('/broadcast', async (_req, res) => {
  try {
    const result = await broadcastDaily();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Keyboard with a one-tap "share my location" button. NOTE: request_location
// works ONLY on the Telegram mobile apps — on Desktop/Web the button does
// nothing, so we always also let the user type their city (see below).
const LOCATION_KEYBOARD = {
  reply_markup: {
    keyboard: [[{ text: '📍 Share my location (mobile)', request_location: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

// Subtle footer reminding users how to update their saved location.
const CHANGE_LOCATION_HINT =
  '\n\nℹ️ Moved? Send /changelocation — or /setlocation <city> — to update.';

// Chat ids we're expecting a typed city / location from next (in-memory; a
// restart just means the user re-sends /changelocation — no harm).
const awaitingLocation = new Set();

// Parse "lat, lon" (or "lat lon") into coordinates, or null.
function parseCoords(s) {
  const m = String(s).match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/**
 * Set a user's location from typed text — either "lat, lon" coordinates or a
 * place name (geocoded). Sends the forecast on success. Returns true if set.
 */
async function setLocationByText(chatId, raw) {
  const coords = parseCoords(raw);
  try {
    let loc;
    if (coords) {
      const name = await reverseGeocode(coords.lat, coords.lon);
      loc = { name, latitude: coords.lat, longitude: coords.lon };
    } else {
      const g = await geocode(raw); // throws if no match
      loc = { name: g.name, latitude: g.latitude, longitude: g.longitude };
    }
    await setUserLocation(chatId, loc);
    awaitingLocation.delete(chatId);
    await telegram.sendText(
      chatId,
      `📍 Location set to ${loc.name}. (Wrong place? Send /changelocation.)`,
      MENU_KEYBOARD,
    );
    await sendForecastFor(chatId, loc);
    return true;
  } catch {
    return false;
  }
}

/** Fetch + send the forecast (text + image card) for a stored location. */
async function sendForecastFor(chatId, loc) {
  // timezone 'auto' → sunrise/sunset etc. localised to the user's own area.
  const weather = await getForecast(loc, 'auto');
  let text = formatMessage(weather, 'plain') + CHANGE_LOCATION_HINT;
  // PAGASA official TenDay panel (PH only; best-effort).
  try {
    const panel = await pagasaTenDayPanel(loc);
    if (panel) text += '\n\n' + panel;
  } catch {
    /* skip panel on error */
  }
  // Keep the persistent quick-action menu visible.
  await telegram.sendText(chatId, text, MENU_KEYBOARD);
  // Image card at the end of the message (rich postcard when available).
  const card = await telegram.safeDailyCard(weather);
  if (card) {
    await telegram.sendPhoto(chatId, card).catch((e) => console.error('[telegram card]', e.message));
  }
  // Typhoon postcard when a system is inside/approaching PAR.
  const typhoonCard = await telegram.safeTyphoonCard(weather);
  if (typhoonCard) {
    await telegram
      .sendPhoto(chatId, typhoonCard, `Typhoon Watch · ${weather.typhoon.category} ${weather.typhoon.name} · source GDACS`)
      .catch((e) => console.error('[telegram typhoon card]', e.message));
  }
}

/** Prompt the user to share a (new) location. */
async function promptForLocation(chatId, intro) {
  await telegram.sendText(chatId, intro, LOCATION_KEYBOARD);
}

// ---- Telegram message handling ---------------------------------------------
// Gives each user the weather for THEIR location. We only ask for the location
// once; afterwards any message returns their local forecast, and /changelocation
// lets them update it. Used by both the long-polling loop and the webhook below.
const FIRST_TIME_INTRO =
  "👋 I'm your weather bot! Tell me where you are and I'll send the forecast:\n\n" +
  '• 💻 Desktop/Web: just type your city name (e.g. Manila) — or send /setlocation <city>\n' +
  '• 📱 Mobile: tap "📍 Share my location" below\n' +
  '• Or paste coordinates like 14.55, 121.02\n\n' +
  "After that, message me anytime for your local weather, or /changelocation if you move.";

const CHANGE_LOCATION_PROMPT =
  '📍 Send your city name (e.g. Cebu), or paste coordinates like 14.55, 121.02.\n' +
  '💻 On Telegram Desktop the location button does nothing, so just type the city.\n' +
  '📱 On mobile you can tap the button below instead.';

// Persistent quick-action menu shown under the message box.
const MENU_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: '🌦 My weather' }],
      [{ text: '📍 Change location' }, { text: '❓ Help' }],
    ],
    resize_keyboard: true,
  },
};

const HELP_TEXT =
  '🤖 *My Daily Weather* — here\'s what I can do:\n\n' +
  '🌦 /weather — your current forecast\n' +
  '📍 /changelocation — set or change your location\n' +
  '❓ /help — show this menu\n\n' +
  'You also get an automatic forecast every morning.\n' +
  '💡 To set your location, just type your *city name* (e.g. Manila) or send /setlocation <city>.';

// Greetings / noise that must NOT be geocoded (e.g. "Hi" matched a town in
// Timor-Leste). Also reject anything too short to be a real place name.
const GREETINGS = new Set([
  'hi', 'hi!', 'hello', 'hello!', 'hey', 'heya', 'hiya', 'yo', 'sup', 'hallo',
  'hola', 'oi', 'hoy', 'kumusta', 'kamusta', 'musta', 'test', 'testing', 'ok',
  'okay', 'k', 'thanks', 'thank you', 'ty', 'salamat', 'good morning',
  'good afternoon', 'good evening', 'good day', 'start', 'menu', 'help',
]);
function isNoise(t) {
  const s = String(t).trim().toLowerCase();
  if (!s) return true;
  if (GREETINGS.has(s)) return true;
  // too short to be a real place (guards "hi", "yo", "ok", etc.)
  if (s.replace(/[^a-z]/gi, '').length < 3) return true;
  return false;
}

export async function handleTelegramMessage(msg) {
  const chatId = msg?.chat?.id;
  if (!chatId) return;
  const raw = (msg.text || '').trim();
  const text = raw.toLowerCase();
  const isCommand = raw.startsWith('/');

  try {
    // Owner-only: email the daily user report on demand (never shown in chat).
    if (text === '/report' && String(chatId) === String(config.telegram.ownerChatId)) {
      const r = await sendOwnerReport();
      const out = r.ok
        ? `📧 Daily user report emailed to ${config.email.to}.`
        : r.skipped
          ? '⚠️ Email isn\'t configured yet (set SMTP_USER / SMTP_PASS).'
          : `⚠️ Couldn't send the report: ${r.error || 'unknown error'}`;
      await telegram.sendText(chatId, out);
      return;
    }

    // Explicit "set my city" commands (work on EVERY platform, incl. Desktop).
    const setCmd = raw.match(/^\/(?:setlocation|location|loc|changelocation|change)\s+(.+)/i);
    if (setCmd) {
      if (!(await setLocationByText(chatId, setCmd[1].trim()))) {
        awaitingLocation.add(chatId);
        await telegram.sendText(chatId, `🤔 I couldn't find "${setCmd[1].trim()}". Try another spelling, a nearby city, or coordinates (lat, lon).`, MENU_KEYBOARD);
      }
      return;
    }

    const saved = await getUserLocation(chatId);
    const menuBtn = text.replace(/[^\w ]/g, '').trim(); // strip emoji from menu taps

    // Help / menu.
    if (text === '/help' || text === '/menu' || menuBtn === 'help' || menuBtn === 'menu') {
      await telegram.sendText(chatId, HELP_TEXT, { parse_mode: 'Markdown', ...MENU_KEYBOARD });
      return;
    }

    // Change location (button, command, or bare word).
    if (text === '/changelocation' || text === '/change' || text === '/setlocation' ||
        menuBtn === 'change location') {
      awaitingLocation.add(chatId);
      await promptForLocation(chatId, CHANGE_LOCATION_PROMPT);
      return;
    }

    // Get weather now (button, command) — needs a saved location.
    if (text === '/weather' || text === '/now' || menuBtn === 'my weather' || menuBtn === 'weather') {
      if (saved) return void (await sendForecastFor(chatId, saved));
      awaitingLocation.add(chatId);
      await promptForLocation(chatId, FIRST_TIME_INTRO);
      return;
    }

    // /start or a first hello — greet, show the menu, ask for location.
    if (text === '/start' || text.startsWith('/start ')) {
      if (saved) {
        await telegram.sendText(chatId, "👋 Welcome back! Here's your latest forecast.", MENU_KEYBOARD);
        await sendForecastFor(chatId, saved);
      } else {
        awaitingLocation.add(chatId);
        await telegram.sendText(chatId, FIRST_TIME_INTRO, MENU_KEYBOARD);
      }
      return;
    }

    // User shared a location pin (mobile button, or Desktop attachment → Location).
    if (msg.location) {
      const { latitude, longitude } = msg.location;
      const name = await reverseGeocode(latitude, longitude);
      const loc = { name, latitude, longitude };
      await setUserLocation(chatId, loc);
      awaitingLocation.delete(chatId);
      await sendForecastFor(chatId, loc);
      return;
    }

    // We asked for a location and are waiting for it — treat the text as a
    // city / coordinates, but ignore greetings/noise so "Hi" never geocodes.
    if (awaitingLocation.has(chatId)) {
      if (!isCommand && !isNoise(raw) && (await setLocationByText(chatId, raw))) return;
      await telegram.sendText(
        chatId,
        `🤔 I need a place name. Type your city (e.g. Manila or Cebu City), paste coordinates, or tap 📍 below.`,
        LOCATION_KEYBOARD,
      );
      return;
    }

    // Brand-new user with no saved location — greet + menu, DON'T geocode their
    // first message (that's how "Hi" became Timor-Leste). Wait for a real city.
    if (!saved) {
      awaitingLocation.add(chatId);
      await telegram.sendText(chatId, FIRST_TIME_INTRO, MENU_KEYBOARD);
      return;
    }

    // Returning user with a saved location — send their local forecast.
    await sendForecastFor(chatId, saved);
  } catch (err) {
    console.error('[telegram handler]', err.message);
    try {
      await telegram.sendText(
        chatId,
        "⚠️ Sorry, I couldn't fetch the weather right now. Please try again shortly."
      );
    } catch {
      /* give up quietly */
    }
  }
}

// Webhook alternative to polling (used only if you set a public webhook URL).
app.post('/webhook/telegram', async (req, res) => {
  res.sendStatus(200); // ack immediately
  const msg = req.body?.message || req.body?.edited_message;
  if (!msg?.chat?.id) return;
  await handleTelegramMessage(msg);
});

// ---- Viber webhook ---------------------------------------------------------
app.post('/webhook/viber', async (req, res) => {
  res.sendStatus(200);
  const event = req.body;
  try {
    if (event.event === 'subscribed' || event.event === 'conversation_started') {
      const id = event.user?.id;
      if (id) {
        await addSubscriber('viber', id);
        await viber.sendText(id, 'Subscribed to daily weather! Send "now" for the current forecast.');
      }
    } else if (event.event === 'unsubscribed') {
      if (event.user_id) await removeSubscriber('viber', event.user_id);
    } else if (event.event === 'message') {
      const id = event.sender?.id;
      const text = (event.message?.text || '').trim().toLowerCase();
      if (id && (text === 'now' || text === 'weather')) {
        const weather = await getDailyWeather();
        await viber.sendText(id, formatMessage(weather, 'plain'));
      } else if (id) {
        await viber.sendText(id, 'Send "now" for the current weather. You\'ll get a daily update automatically.');
      }
    }
  } catch (err) {
    console.error('[viber webhook]', err.message);
  }
});

// ---- Messenger webhook -----------------------------------------------------
// Verification handshake (GET) required by Meta.
app.get('/webhook/messenger', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.messenger.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook/messenger', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== 'page') return;
  try {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const psid = event.sender?.id;
        if (!psid) continue;
        await addSubscriber('messenger', psid);
        const text = (event.message?.text || '').trim().toLowerCase();
        if (text === 'now' || text === 'weather') {
          const weather = await getDailyWeather();
          await messenger.sendText(psid, formatMessage(weather, 'plain'));
        } else if (event.message) {
          await messenger.sendText(psid, 'Send "now" for the current weather. You\'re subscribed to daily updates.');
        }
      }
    }
  } catch (err) {
    console.error('[messenger webhook]', err.message);
  }
});

// ---- Start -----------------------------------------------------------------
app.listen(config.port, () => {
  console.log(`[server] Listening on http://localhost:${config.port}`);
  console.log(`[server] Enabled channels: ${enabledChannels().join(', ') || '(none — set tokens in .env)'}`);
  startScheduler();

  // Reply to on-demand Telegram messages via long polling (no public URL needed).
  if (config.telegram.enabled) {
    telegram.registerCommands();
    telegram.startPolling(handleTelegramMessage).catch((err) =>
      console.error('[telegram] Failed to start polling:', err.message)
    );
  }
});
