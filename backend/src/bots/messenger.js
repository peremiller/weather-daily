import { config } from '../config.js';
import { formatMessage } from '../weather.js';
import { getSubscribers } from '../store.js';

/**
 * Facebook Messenger (Meta) integration.
 *
 * ⚠️ POLICY WARNING: Meta does NOT allow arbitrary scheduled/promotional
 * messages. Standard messages are only deliverable inside the 24-hour
 * window after the user's last interaction. To push a true *daily* weather
 * message you must use the "Recurring Notifications" opt-in flow (limited,
 * requires app review) or an approved message tag. This module sends with
 * a best-effort approach and will surface Meta's error if a send is blocked.
 *
 * Docs: https://developers.facebook.com/docs/messenger-platform/
 */
const GRAPH = 'https://graph.facebook.com/v19.0/me/messages';

async function call(payload) {
  const url = `${GRAPH}?access_token=${encodeURIComponent(config.messenger.pageToken)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Messenger send failed: ${data.error.message} (code ${data.error.code})`);
  }
  return data;
}

/** Recipients = configured PSIDs plus any captured via the webhook. */
async function allRecipients() {
  const fromStore = await getSubscribers('messenger');
  return [...new Set([...config.messenger.recipientIds, ...fromStore])];
}

/** Send the daily weather to all known Messenger recipients. */
export async function sendDaily(weather) {
  if (!config.messenger.enabled) return { skipped: true };
  const text = formatMessage(weather, 'plain');
  const recipients = await allRecipients();
  const results = [];
  for (const psid of recipients) {
    try {
      await call({
        recipient: { id: psid },
        messaging_type: 'MESSAGE_TAG',
        // CONFIRMED_EVENT_UPDATE is the closest standard tag; for true
        // recurring weather you should migrate to Recurring Notifications.
        tag: 'CONFIRMED_EVENT_UPDATE',
        message: { text },
      });
      results.push({ psid, ok: true });
    } catch (err) {
      results.push({ psid, ok: false, error: err.message });
    }
  }
  return { channel: 'messenger', results };
}

/** Reply within the standard 24h window (webhook command replies). */
export async function sendText(psid, text) {
  return call({
    recipient: { id: psid },
    messaging_type: 'RESPONSE',
    message: { text },
  });
}
