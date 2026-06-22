import { config } from '../config.js';
import { formatMessage } from '../weather.js';
import { renderWeatherCard } from '../weatherCard.js';
import { pagasaTenDayPanel } from '../pagasaTenDay.js';

/**
 * Telegram Bot API integration.
 * Setup: talk to @BotFather -> /newbot -> get the token.
 * Get your chat id: message your bot, then GET
 *   https://api.telegram.org/bot<TOKEN>/getUpdates
 * and read result[].message.chat.id.
 */
const api = (method) =>
  `https://api.telegram.org/bot${config.telegram.token}/${method}`;

async function call(method, payload) {
  const res = await fetch(api(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
  }
  return data.result;
}

/** Send the daily weather (text + image card) to all configured chat ids. */
export async function sendDaily(weather) {
  if (!config.telegram.enabled) return { skipped: true };
  let text = formatMessage(weather, 'markdown');
  try {
    const panel = await pagasaTenDayPanel(weather.location);
    if (panel) text += '\n\n' + panel;
  } catch {
    /* skip panel on error */
  }
  const card = safeCard(weather);
  const results = [];
  for (const chatId of config.telegram.chatIds) {
    try {
      await call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
      if (card) await sendPhoto(chatId, card).catch((e) => console.error('[telegram card]', e.message));
      results.push({ chatId, ok: true });
    } catch (err) {
      results.push({ chatId, ok: false, error: err.message });
    }
  }
  return { channel: 'telegram', results };
}

/**
 * Send a text message to one chat. `extra` merges extra Bot API fields, e.g.
 * a reply_markup keyboard for requesting the user's location.
 */
export async function sendText(chatId, text, extra = {}) {
  return call('sendMessage', { chat_id: chatId, text, ...extra });
}

/** Render the weather card, returning null (and logging) if it fails. */
export function safeCard(weather) {
  try {
    return renderWeatherCard(weather);
  } catch (err) {
    console.error('[telegram] card render failed:', err.message);
    return null;
  }
}

/** Send a PNG buffer as a photo message. */
export async function sendPhoto(chatId, pngBuffer, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption);
  form.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'weather.png');
  const res = await fetch(api('sendPhoto'), { method: 'POST', body: form });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram sendPhoto failed: ${data.description || res.status}`);
  }
  return data.result;
}

/** Remove any registered webhook so long polling can be used instead. */
export async function deleteWebhook() {
  try {
    await call('deleteWebhook', { drop_pending_updates: false });
  } catch {
    /* ignore — nothing was set */
  }
}

/**
 * Long-poll Telegram for incoming messages and dispatch each to `handler`.
 * Works without any public URL (the server pulls updates itself), so it's
 * ideal for hosts like Railway where you haven't set up a webhook.
 *
 * `handler` is called as handler(chatId, text) for every text message.
 * Runs forever; call once at startup. Does not block the caller.
 */
export async function startPolling(handler) {
  await deleteWebhook(); // getUpdates fails if a webhook is active
  console.log('[telegram] Long-polling for incoming messages…');
  let offset = 0;
  (async function loop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 30 });
        for (const u of updates) {
          offset = u.update_id + 1;
          const msg = u.message || u.edited_message;
          if (msg?.chat?.id) {
            await handler(msg); // full message: text, location, etc.
          }
        }
      } catch (err) {
        console.error('[telegram poll]', err.message);
        await new Promise((r) => setTimeout(r, 3000)); // back off, then retry
      }
    }
  })();
}
