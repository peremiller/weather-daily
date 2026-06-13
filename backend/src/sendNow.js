/**
 * One-off CLI: fetch today's weather and broadcast immediately.
 * Usage: npm run send-now
 * Useful for testing your bot tokens without waiting for the cron time.
 */
import { broadcastDaily } from './broadcast.js';

broadcastDaily()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
