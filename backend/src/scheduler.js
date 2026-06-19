import cron from 'node-cron';
import { config } from './config.js';
import { broadcastDaily } from './broadcast.js';
import { sendOwnerReport } from './ownerReport.js';

/**
 * Schedules the daily weather broadcast and the owner's daily user report.
 * Jobs run in the configured timezone so "07:00" means 07:00 local.
 */
export function startScheduler() {
  if (!cron.validate(config.dailyCron)) {
    throw new Error(`Invalid DAILY_CRON expression: "${config.dailyCron}"`);
  }
  if (!cron.validate(config.ownerReportCron)) {
    throw new Error(`Invalid OWNER_REPORT_CRON expression: "${config.ownerReportCron}"`);
  }

  // 1) Daily weather broadcast to subscribers.
  cron.schedule(
    config.dailyCron,
    async () => {
      console.log(`[scheduler] Broadcast triggered at ${new Date().toISOString()}`);
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

  // 2) Daily owner report (users + their weather) — emailed, not posted to chat.
  if (config.email.to) {
    cron.schedule(
      config.ownerReportCron,
      async () => {
        console.log(`[scheduler] Owner report triggered at ${new Date().toISOString()}`);
        try {
          await sendOwnerReport();
        } catch (err) {
          console.error('[scheduler] Owner report failed:', err.message);
        }
      },
      { timezone: config.timezone }
    );
    console.log(
      `[scheduler] Owner report scheduled: "${config.ownerReportCron}" (${config.timezone}) -> email ${config.email.to}${config.email.configured ? '' : ' (SMTP not configured yet)'}`
    );
  }
}
