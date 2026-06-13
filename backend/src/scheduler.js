import cron from 'node-cron';
import { config } from './config.js';
import { broadcastDaily } from './broadcast.js';

/**
 * Schedules the daily weather broadcast using a cron expression.
 * The job runs in the configured timezone so "07:00" means 07:00 local.
 */
export function startScheduler() {
  if (!cron.validate(config.dailyCron)) {
    throw new Error(`Invalid DAILY_CRON expression: "${config.dailyCron}"`);
  }

  const task = cron.schedule(
    config.dailyCron,
    async () => {
      console.log(`[scheduler] Triggered at ${new Date().toISOString()}`);
      try {
        await broadcastDaily();
      } catch (err) {
        console.error('[scheduler] Broadcast failed:', err.message);
      }
    },
    { timezone: config.timezone }
  );

  console.log(
    `[scheduler] Daily broadcast scheduled: "${config.dailyCron}" (${config.timezone})`
  );
  return task;
}
