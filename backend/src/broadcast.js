import { getDailyWeather } from './weather.js';
import * as telegram from './bots/telegram.js';
import * as viber from './bots/viber.js';
import * as messenger from './bots/messenger.js';
import { enabledChannels } from './config.js';

/**
 * Fetch the daily weather once and fan it out to every enabled channel.
 * Each channel failing independently does not stop the others.
 */
export async function broadcastDaily() {
  const channels = enabledChannels();
  if (channels.length === 0) {
    console.warn('[broadcast] No channels configured — nothing to send.');
    return { weather: null, results: [] };
  }

  console.log(`[broadcast] Fetching weather for channels: ${channels.join(', ')}`);
  const weather = await getDailyWeather();

  const results = await Promise.allSettled([
    telegram.sendDaily(weather),
    viber.sendDaily(weather),
    messenger.sendDaily(weather),
  ]);

  const summary = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { error: r.reason?.message || String(r.reason) }
  );
  console.log('[broadcast] Done:', JSON.stringify(summary));
  return { weather, results: summary };
}
