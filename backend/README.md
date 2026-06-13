# Weather Daily — Backend

Fetches the daily weather from Open-Meteo and broadcasts it to Telegram, Viber,
and Messenger on a schedule.

## Run

```bash
cp .env.example .env     # fill in tokens — see ../docs/BOTS.md
npm install
npm run send-now         # one-off test broadcast
npm start                # server + daily cron
```

## Endpoints

| Method | Path                  | Purpose |
|--------|-----------------------|---------|
| GET    | `/`                   | Health + current config. |
| GET    | `/weather`            | Today's forecast as JSON + formatted message. |
| POST   | `/broadcast`          | Trigger a broadcast now (protect in prod!). |
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
| `VIBER_BOT_TOKEN`, `VIBER_SENDER_NAME` | – | See docs/BOTS.md. |
| `MESSENGER_PAGE_TOKEN`, `MESSENGER_VERIFY_TOKEN` | – | See docs/BOTS.md. |
| `PUBLIC_URL` | – | HTTPS base URL for webhooks. |

## Architecture

```
index.js        Express server + webhook handlers, starts the scheduler
scheduler.js    node-cron job -> broadcastDaily()
broadcast.js    fetch weather once, fan out to all channels
weather.js      Open-Meteo client + message formatter
bots/*.js       per-channel send logic
store.js        JSON file of webhook-captured subscribers
config.js       env-driven config
```

Each channel fails independently — one bad token won't stop the others.

## Deploy

Any always-on host works (Railway, Render, Fly.io, a VPS with `pm2`). Set the
`.env` values as environment variables and expose port `3000`.
