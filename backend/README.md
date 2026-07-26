# Weather Daily — Backend

Fetches the daily weather from Open-Meteo and broadcasts it to Telegram, Viber,
and Messenger on a schedule.

## Run locally or on an always-on server

```bash
cp .env.example .env     # fill in tokens — see ../docs/BOTS.md
npm install
npm run send-now         # one-off test broadcast
npm start                # server + daily cron
```

## Deploy on Vercel

Vercel runs this backend through Telegram webhooks instead of long polling:

1. Import the repository into Vercel and set the project root directory to
   `backend`.
2. Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`,
   `TELEGRAM_WEBHOOK_SECRET`, and `CRON_SECRET`.
3. In the Vercel Storage marketplace, connect an Upstash Redis database. The
   integration provides `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.
4. Deploy production and open `/`. The health response should report
   `"runtime":"vercel"`, `"storage":"upstash-redis"`, and
   `"telegramWebhook":"ready"`.

The production health request registers the Telegram webhook automatically.
`vercel.json` schedules the daily forecast for `23:00 UTC`, which is
`07:00 Asia/Manila`. Vercel Hobby cron execution can occur within the hour.

## Endpoints

| Method | Path                  | Purpose |
|--------|-----------------------|---------|
| GET    | `/`                   | Health + current config. |
| GET    | `/weather`            | Today's forecast as JSON + formatted message. |
| POST   | `/broadcast`          | Trigger a broadcast with `CRON_SECRET`. |
| GET    | `/cron/daily`         | Vercel's authenticated daily cron endpoint. |
| POST   | `/webhook/telegram`   | Telegram updates (`/now`, `/subscribe`). |
| POST   | `/webhook/viber`      | Viber events (auto-subscribes users). |
| GET/POST | `/webhook/messenger`| Meta verification + message events. |

## Configuration (`.env`)

| Key | Default | Notes |
|-----|---------|-------|
| `LOCATION_NAME` | `Manila` | City to report; geocoded automatically. |
| `LATITUDE`/`LONGITUDE` | – | Optional, skips geocoding. |
| `TZ_NAME` | `Asia/Manila` | IANA timezone for the schedule. |
| `DAILY_CRON` | `0 7 * * *` | When to send (cron, in `TZ_NAME`). |
| `TEMP_UNIT` | `celsius` | `celsius` or `fahrenheit`. |
| `WIND_UNIT` | `kmh` | `kmh`/`mph`/`ms`/`kn`. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS` | – | See docs/BOTS.md. |
| `TELEGRAM_WEBHOOK_SECRET` | – | Verifies Telegram webhook requests. |
| `CRON_SECRET` | – | Protects cron and manual broadcast routes. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | – | Persistent locations on Vercel. |
| `VIBER_BOT_TOKEN`, `VIBER_SENDER_NAME` | – | See docs/BOTS.md. |
| `MESSENGER_PAGE_TOKEN`, `MESSENGER_VERIFY_TOKEN` | – | See docs/BOTS.md. |
| `PUBLIC_URL` | – | HTTPS base URL for webhooks. |

## Architecture

```
app.js          Express routes + webhook handlers; exported to Vercel
index.js        Always-on server entrypoint; starts scheduler + polling
scheduler.js    node-cron job -> broadcastDaily()
broadcast.js    fetch weather once, fan out to all channels
weather.js      Open-Meteo client + message formatter
bots/*.js       per-channel send logic
store.js        Upstash Redis on Vercel; JSON file locally
config.js       env-driven config
```

Each channel fails independently — one bad token won't stop the others.

## Deploy

Any always-on host works (Railway, Render, Fly.io, a VPS with `pm2`). Set the
`.env` values as environment variables and expose port `3000`.
