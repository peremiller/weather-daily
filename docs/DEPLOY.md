# Deploying the backend

Your daily message only sends while the backend process is **running and awake**.
Your laptop won't do for a reliable 7 AM send — host it somewhere always-on.

## Option A — Vercel (recommended for this bot)

Vercel does not keep a polling process alive. This repository therefore uses
Telegram's HTTPS webhook on Vercel and a Vercel Cron Job for the daily message.

1. Import the GitHub repository into Vercel.
2. Set **Root Directory** to `backend`.
3. Add the Telegram secrets from `backend/.env.example`, including a random
   `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET`.
4. Add Upstash Redis from Vercel's Storage marketplace so saved user locations
   persist across function instances.
5. Deploy production, then open the production `/` health endpoint. It
   automatically registers the Telegram webhook.

The included `vercel.json` runs the daily forecast at 23:00 UTC (07:00 in the
Philippines). On Vercel Hobby, a daily cron can run within the following hour.

> ⚠️ **The #1 gotcha:** free tiers that "sleep on inactivity" (Render Free,
> some others) will **not fire the cron** while asleep. Use a plan/host that
> stays running 24/7. Options below note this.

The repo already includes: `Dockerfile`, `.dockerignore`, `render.yaml`, `Procfile`.

---

## Option B — Railway (always-on, paid)

1. Push this project to GitHub.
2. https://railway.app → **New Project → Deploy from GitHub repo**.
3. Set the **root directory** to `backend`.
4. Add the env vars from your `.env` (at minimum `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_IDS`, `TZ_NAME`, `DAILY_CRON`).
5. Deploy. Railway gives you a public URL — use it as `PUBLIC_URL` if you add
   Viber/Messenger webhooks.

Railway doesn't sleep; you pay for usage (small for this app).

## Option C — Render (use the *starter* plan, not free)

1. Push to GitHub.
2. https://render.com → **New → Blueprint**, select the repo. It reads
   `backend/render.yaml`.
3. Fill the secret env vars (marked `sync: false`) in the dashboard.
4. Deploy.

> The `render.yaml` sets `plan: starter` on purpose — the **free** web plan
> sleeps and the 7 AM cron would silently not run.

## Option D — Fly.io

```bash
cd backend
fly launch --no-deploy           # generates fly.toml from the Dockerfile
fly secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_IDS=...
fly deploy
```
Set `min_machines_running = 1` in `fly.toml` so it never scales to zero.

## Option E — Any VPS (full control)

```bash
# on the server
git clone <your-repo> && cd weather-daily/backend
npm install
cp .env.example .env && nano .env      # fill in tokens
npm install -g pm2
pm2 start src/index.js --name weather-daily
pm2 save && pm2 startup                # survive reboots
```

## Option F — Docker (anywhere)

```bash
cd backend
docker build -t weather-daily .
docker run -d --restart unless-stopped -p 3000:3000 \
  --env-file .env \
  -v weather-daily-data:/app/data \
  --name weather-daily weather-daily
```

---

## After deploying

- **Verify:** open `https://YOUR_URL/` → should return JSON with
  `"channels":["telegram"]`.
- **Test a send:** `curl -X POST https://YOUR_URL/broadcast`
  (consider protecting this endpoint before going public).
- **Set webhooks** (only if using Viber/Messenger): use your new public URL as
  `PUBLIC_URL` and follow `docs/BOTS.md`.

## Never commit secrets

`.env` is gitignored. On hosts, set tokens as **environment variables / secrets**
in their dashboard — never bake them into the image or repo.
