# Weather Daily 🌦️

A weather app with two parts:

1. **`app/`** — a Flutter mobile app (Android + iOS) for viewing current conditions and a 7-day forecast, anywhere in the world.
2. **`backend/`** — a Node.js service that fetches the daily weather and **messages it to you on Telegram, Viber, and Messenger** on a schedule.

Weather data comes from [Open-Meteo](https://open-meteo.com) — free, no API key.

```
weather-daily/
├── app/        Flutter mobile app  (Play Store / App Store)
├── backend/    Node.js bot + scheduler  (runs on a server)
└── docs/       Setup & publishing guides
```

---

## Quick start

### 1. The mobile app
```bash
cd app
flutter pub get
flutter run            # runs on a connected device or emulator
```
See [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md) to build a release and publish to Google Play.

### 2. The daily-message backend
```bash
cd backend
cp .env.example .env   # fill in your bot tokens (start with Telegram)
npm install
npm run send-now       # test: sends today's weather right now
npm start              # runs the server + daily scheduler
```
See [`docs/BOTS.md`](docs/BOTS.md) for how to create each bot and get your tokens.

---

## How the daily message works

```
 ┌──────────────┐   07:00 daily    ┌───────────────┐   Open-Meteo
 │  node-cron   │ ───────────────► │  broadcast()  │ ───────────────► forecast
 └──────────────┘                  └───────┬───────┘
                                           │ fan-out
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
               Telegram bot           Viber bot           Messenger bot
```

The send time, location, and units are all configurable in `backend/.env`.

---

## Status of each messaging channel

| Channel    | Status        | Notes |
|------------|---------------|-------|
| Telegram   | ✅ Fully works | Free, instant. **Start here.** |
| Viber      | ✅ Works       | Needs a public HTTPS webhook + a Viber bot account. |
| Messenger  | ⚠️ Restricted  | Meta blocks unsolicited daily messages. Requires their *Recurring Notifications* opt-in flow / approved message tags. See [`docs/BOTS.md`](docs/BOTS.md). |

---

## What's left to make this "live"

- [ ] Create your bots and fill in `backend/.env` (see `docs/BOTS.md`).
- [ ] Deploy the backend somewhere always-on (Railway, Render, Fly.io, a VPS).
- [ ] Build a signed release and publish the app (see `docs/PLAY_STORE.md`).
- [ ] (Optional) Add app-side push notifications via Firebase if you want alerts without the chat bots.
