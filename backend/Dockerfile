# Always-on container for the Weather Daily backend.
# Debian (slim), not Alpine — the @napi-rs/canvas native binary is reliable on
# glibc; Alpine/musl was crashing the bot at startup.
FROM node:20-slim

WORKDIR /app

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
