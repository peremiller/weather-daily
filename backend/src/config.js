import dotenv from 'dotenv';
dotenv.config();

/**
 * Central configuration, loaded from environment variables (.env).
 * Every integration is optional: if its credentials are missing, that
 * channel is simply skipped instead of crashing the whole service.
 */
export const config = {
  port: Number(process.env.PORT) || 3000,

  // Where/when to report weather.
  location: {
    name: process.env.LOCATION_NAME || 'Manila',
    // If lat/lon are provided we skip geocoding entirely.
    latitude: process.env.LATITUDE ? Number(process.env.LATITUDE) : null,
    longitude: process.env.LONGITUDE ? Number(process.env.LONGITUDE) : null,
  },

  // IANA timezone, e.g. "Asia/Manila". Open-Meteo localises times to this.
  timezone: process.env.TZ_NAME || 'Asia/Manila',

  // Cron expression for the daily broadcast. Default: 07:00 every day.
  // Field order: minute hour day-of-month month day-of-week
  dailyCron: process.env.DAILY_CRON || '0 7 * * *',

  units: {
    temperature: process.env.TEMP_UNIT || 'celsius', // celsius | fahrenheit
    wind: process.env.WIND_UNIT || 'kmh',            // kmh | mph | ms | kn
  },

  telegram: {
    enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    // Comma-separated list of chat IDs to broadcast to.
    chatIds: (process.env.TELEGRAM_CHAT_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Who receives the owner statistics report. Defaults to the first chat id.
    ownerChatId:
      process.env.OWNER_CHAT_ID ||
      (process.env.TELEGRAM_CHAT_IDS || '').split(',')[0].trim(),
  },

  // When to send the owner's daily user report (cron, in TZ_NAME). Default 08:00.
  ownerReportCron: process.env.OWNER_REPORT_CRON || '0 8 * * *',

  // The daily user report is emailed (not posted to Telegram). SMTP via env;
  // Gmail needs an App Password (https://myaccount.google.com/apppasswords).
  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    to: process.env.OWNER_EMAIL || 'pjomill@gmail.com',
    get configured() {
      return Boolean(this.host && this.user && this.pass && this.to);
    },
  },

  viber: {
    enabled: Boolean(process.env.VIBER_BOT_TOKEN),
    token: process.env.VIBER_BOT_TOKEN || '',
    senderName: process.env.VIBER_SENDER_NAME || 'Weather Bot',
    // Subscribers are captured automatically via webhook (see store.js).
  },

  messenger: {
    enabled: Boolean(process.env.MESSENGER_PAGE_TOKEN),
    pageToken: process.env.MESSENGER_PAGE_TOKEN || '',
    verifyToken: process.env.MESSENGER_VERIFY_TOKEN || 'weather_verify',
    // Comma-separated PSIDs (page-scoped user IDs) to message.
    recipientIds: (process.env.MESSENGER_RECIPIENT_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  // Public base URL of this server (used when registering webhooks).
  publicUrl: process.env.PUBLIC_URL || '',
};

/** Returns the list of channels that are configured and ready to send. */
export function enabledChannels() {
  const channels = [];
  if (config.telegram.enabled) channels.push('telegram');
  if (config.viber.enabled) channels.push('viber');
  if (config.messenger.enabled) channels.push('messenger');
  return channels;
}
