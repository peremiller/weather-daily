# Always-on container for the Weather Daily backend.
# Debian (slim), not Alpine — the @napi-rs/canvas native binary is reliable on
# glibc; Alpine/musl was crashing the bot at startup.
FROM node:20-slim

WORKDIR /app

# Chromium (+ color-emoji and CJK fonts) so the rich HTML "postcard" can be
# rendered to a PNG server-side. renderPostcardPNG() reads CHROME_PATH; without
# these the bot silently falls back to the lightweight canvas card.
# NOTE: made non-fatal (|| true) on purpose — the postcard is an OPTIONAL
# enhancement with a runtime fallback, so a failed/slow apt step must never
# break the whole deploy. If Chromium isn't present, findChrome() returns null
# and the bot serves the canvas card instead.
RUN (apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-noto-color-emoji fonts-noto-cjk) || true \
    && rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/usr/bin/chromium

# Install production deps first (better layer caching).
COPY package*.json ./
RUN npm install --omit=dev

# Copy source.
COPY . .

# Persist webhook-captured subscribers across restarts (mount a volume here).
# VOLUME ["/app/data"]

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
