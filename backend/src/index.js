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
    await telegram.sendText(chatId, `📍 Location set to ${loc.name}.`, {
      reply_markup: { remove_keyboard: true },
    });
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
  await telegram.sendText(chatId, text, {
    reply_markup: { remove_keyboard: true },
  });
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
  '📍 Sure — send your new city name (e.g. Cebu), or paste coordinates.\n' +
  '💻 On Telegram Desktop the location button does nothing, so just type the city.\n' +
  '📱 On mobile you can tap the button below instead.';

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
        await telegram.sendText(chatId, `🤔 I couldn't find "${setCmd[1].trim()}". Try another spelling, a nearby city, or coordinates (lat, lon).`);
      }
      return;
    }

    // Bare /changelocation — ask for the new city (button for mobile).
    if (text === '/changelocation' || text === '/change' || text === '/setlocation') {
      awaitingLocation.add(chatId);
      await promptForLocation(chatId, CHANGE_LOCATION_PROMPT);
      return;
    }

    // 1) User shared a location pin (mobile "Share my location", or Desktop's
    //    attachment → Location menu).
    if (msg.location) {
      const { latitude, longitude } = msg.location;
      const name = await reverseGeocode(latitude, longitude);
      const loc = { name, latitude, longitude };
      await setUserLocation(chatId, loc);
      awaitingLocation.delete(chatId);
      await sendForecastFor(chatId, loc);
      return;
    }

    const saved = await getUserLocation(chatId);

    // 2) We're waiting for a location (new user, or after /changelocation), or
    //    the user has none yet — treat any typed text as a city / coordinates.
    if (awaitingLocation.has(chatId) || !saved) {
      if (raw && !isCommand && (await setLocationByText(chatId, raw))) return;
      // Couldn't resolve it (or empty/command) — (re)prompt.
      awaitingLocation.add(chatId);
      if (raw && !isCommand) {
        await telegram.sendText(chatId, `🤔 I couldn't find "${raw}". Type your city name (e.g. Manila), paste coordinates, or tap the button (mobile).`);
      } else {
        await promptForLocation(chatId, FIRST_TIME_INTRO);
      }
      return;
    }

    // 3) Returning user with a saved location — send their local forecast.
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
    telegram.startPolling(handleTelegramMessage).catch((err) =>
      console.error('[telegram] Failed to start polling:', err.message)
    );
  }
});
