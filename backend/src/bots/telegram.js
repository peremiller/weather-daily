import { config } from '../config.js';
import { formatMessage } from '../weather.js';

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

/** Send the daily weather to all configured chat ids. */
export async function sendDaily(weather) {
  if (!config.telegram.enabled) return { skipped: true };
  const text = formatMessage(weather, 'markdown');
  const results = [];
  for (const chatId of config.telegram.chatIds) {
    try {
      await call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
      results.push({ chatId, ok: true });
    } catch (err) {
      results.push({ chatId, ok: false, error: err.message });
    }
  }
  return { channel: 'telegram', results };
}

/** Send an arbitrary text to one chat (used by webhook command replies). */
export async function sendText(chatId, text) {
  return call('sendMessage', { chat_id: chatId, text });
}
