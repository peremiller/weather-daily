import app from './app.js';
import { config, enabledChannels } from './config.js';
import { startScheduler } from './scheduler.js';
import * as telegram from './bots/telegram.js';
import { handleTelegramMessage } from './app.js';

app.listen(config.port, () => {
  console.log(`[server] Listening on http://localhost:${config.port}`);
  console.log(
    `[server] Enabled channels: ${enabledChannels().join(', ') || '(none — set tokens in .env)'}`
  );
  startScheduler();

  // Always-on hosts receive Telegram updates through long polling. Vercel
  // imports app.js through api/index.js and uses the webhook route instead.
  if (config.telegram.enabled) {
    telegram.registerCommands();
    telegram.startPolling(handleTelegramMessage).catch((err) =>
      console.error('[telegram] Failed to start polling:', err.message)
    );
  }
});
