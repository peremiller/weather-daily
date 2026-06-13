# Deploying the backend (always-on)

Your daily message only sends while the backend process is **running and awake**.
Your laptop won't do for a reliable 7 AM send — host it somewhere always-on.

> ⚠️ **The #1 gotcha:** free tiers that "sleep on inactivity" (Render Free,
> some others) will **not fire the cron** while asleep. Use a plan/host that
> stays running 24/7. Options below note this.

The repo already includes: `Dockerfile`, `.dockerignore`, `render.yaml`, `Procfile`.

---

## Option A — Railway (easiest, stays awake)

1. Push this project to GitHub.
2. https://railway.app → **New Project → Deploy from GitHub repo**.
3. Set the **root directory** to `backend`.
4. Add the env vars from your `.env` (at minimum `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_IDS`, `TZ_NAME`, `DAILY_CRON`).
5. Deploy. Railway gives you a public URL — use it as `PUBLIC_URL` if you add
   Viber/Messenger webhooks.

Railway doesn't sleep; you pay for usage (small for this app).

## Option B — Render (use the *starter* plan, not free)

1. Push to GitHub.
2. https://render.com → **New → Blueprint**, select the repo. It reads
   `backend/render.yaml`.
3. Fill the secret env vars (marked `sync: false`) in the dashboard.
4. Deploy.

> The `render.yaml` sets `plan: starter` on purpose — the **free** web plan
> sleeps and the 7 AM cron would silently not run.

## Option C — Fly.io

```bash
cd backend
fly launch --no-deploy           # generates fly.toml from the Dockerfile
fly secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_IDS=...
fly deploy
```
Set `min_machines_running = 1` in `fly.toml` so it never scales to zero.

## Option D — Any VPS (full control)

```bash
# on the server
git clone <your-repo> && cd weather-daily/backend
npm install
cp .env.example .env && nano .env      # fill in tokens
npm install -g pm2
pm2 start src/index.js --name weather-daily
pm2 save && pm2 startup                # survive reboots
```

## Option E — Docker (anywhere)

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
