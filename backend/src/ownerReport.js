import { config } from './config.js';
import { getAllUserLocations } from './store.js';
import { getForecast, describeCode } from './weather.js';
import * as telegram from './bots/telegram.js';

/**
 * Builds and sends a daily statistics report to the app owner: every user who
 * has shared a location, where they are, and the current weather there.
 *
 * NOTE: this shares users' locations with the owner — make sure your privacy
 * policy discloses it.
 */
export async function sendOwnerReport() {
  const owner = config.telegram.ownerChatId;
  if (!config.telegram.enabled || !owner) {
    console.warn('[owner report] No Telegram owner chat id configured — skipping.');
    return { skipped: true };
  }

  const locations = await getAllUserLocations();
  const entries = Object.entries(locations); // [chatId, { name, latitude, longitude }]

  const dateLabel = new Date().toISOString().slice(0, 10);
  const lines = [
    `📊 Daily User Report — ${dateLabel}`,
    `Users with a saved location: ${entries.length}`,
    '',
  ];

  if (entries.length === 0) {
    lines.push('No users have shared a location yet.');
  } else {
    let temps = 0;
    let counted = 0;
    for (const [, loc] of entries) {
      try {
        const w = await getForecast(loc, 'auto');
        const c = describeCode(w.current.code);
        const temp = Math.round(w.current.temp);
        temps += temp;
        counted += 1;
        lines.push(`• ${loc.name}: ${c.emoji} ${c.label}, ${temp}°`);
      } catch {
        lines.push(`• ${loc.name}: weather unavailable`);
      }
    }
    if (counted > 0) {
      lines.push('', `🌡️ Average temperature across users: ${Math.round(temps / counted)}°`);
    }
  }

  try {
    await telegram.sendText(owner, lines.join('\n'));
    console.log(`[owner report] Sent to ${owner} (${entries.length} users).`);
    return { ok: true, users: entries.length };
  } catch (err) {
    console.error('[owner report] Failed to send:', err.message);
    return { ok: false, error: err.message };
  }
}
