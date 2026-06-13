import { config } from '../config.js';
import { formatMessage } from '../weather.js';
import { getSubscribers } from '../store.js';

/**
 * Viber REST bot integration.
 * Setup: create a bot at https://partners.viber.com -> get the auth token.
 * Viber requires a public HTTPS webhook; users must send your bot a message
 * once to become subscribers (captured in store.js via the webhook).
 * Docs: https://developers.viber.com/docs/api/rest-bot-api/
 */
const SEND_URL = 'https://chatapi.viber.com/pa/send_message';
const WEBHOOK_URL = 'https://chatapi.viber.com/pa/set_webhook';

async function call(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Viber-Auth-Token': config.viber.token,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  // Viber returns { status: 0, status_message: "ok" } on success.
  if (data.status !== 0) {
    throw new Error(`Viber call failed: ${data.status_message || 'unknown'} (status ${data.status})`);
  }
  return data;
}

/** Register the webhook so Viber forwards events to our server. */
export async function setWebhook(publicUrl) {
  return call(WEBHOOK_URL, {
    url: `${publicUrl.replace(/\/$/, '')}/webhook/viber`,
    event_types: ['subscribed', 'unsubscribed', 'conversation_started', 'message'],
    send_name: true,
    send_photo: false,
  });
}

/** Send the daily weather to every Viber subscriber. */
export async function sendDaily(weather) {
  if (!config.viber.enabled) return { skipped: true };
  const text = formatMessage(weather, 'plain');
  const subscribers = await getSubscribers('viber');
  const results = [];
  for (const receiver of subscribers) {
    try {
      await call(SEND_URL, {
        receiver,
        min_api_version: 1,
        sender: { name: config.viber.senderName },
        type: 'text',
        text,
      });
      results.push({ receiver, ok: true });
    } catch (err) {
      results.push({ receiver, ok: false, error: err.message });
    }
  }
  return { channel: 'viber', results };
}

/** Send arbitrary text to one Viber user (webhook replies). */
export async function sendText(receiver, text) {
  return call(SEND_URL, {
    receiver,
    min_api_version: 1,
    sender: { name: config.viber.senderName },
    type: 'text',
    text,
  });
}
