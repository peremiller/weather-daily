import express from 'express';
import { config, enabledChannels } from './config.js';
import { startScheduler } from './scheduler.js';
import { broadcastDaily } from './broadcast.js';
import { getDailyWeather, formatMessage } from './weather.js';
import { addSubscriber, removeSubscriber } from './store.js';
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

// ---- Telegram message handling ---------------------------------------------
// Replies with the current weather to ANY incoming message. Used by both the
// long-polling loop and the webhook below.
export async function handleTelegramMessage(chatId, text) {
  const cmd = (text || '').toLowerCase();
  try {
    if (cmd === '/start' || cmd === '/help') {
      await telegram.sendText(
        chatId,
        "👋 I'm your weather bot! I'll message you every morning at 7 AM — " +
          'and you can get the current forecast anytime by sending me any message.'
      );
    }
    // Always reply with the latest weather, whatever you send.
    const weather = await getDailyWeather();
    await telegram.sendText(chatId, formatMessage(weather, 'plain'));
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
  await handleTelegramMessage(msg.chat.id, (msg.text || '').trim());
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
