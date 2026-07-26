import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Redis } from '@upstash/redis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.VERCEL
  ? join('/tmp', 'weather-daily')
  : join(__dirname, '..', 'data');
const FILE = process.env.WEATHER_STORE_FILE || join(DATA_DIR, 'subscribers.json');
const KEY_PREFIX = process.env.WEATHER_REDIS_PREFIX || 'weather-daily';

const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

let cache = null;

const key = (suffix) => `${KEY_PREFIX}:${suffix}`;
const subscriberKey = (channel) => key(`subscribers:${channel}`);
const locationKey = (userId) => key(`locations:${String(userId)}`);
const locationUsersKey = key('location-users');
const awaitingLocationKey = (userId) =>
  key(`awaiting-location:${String(userId)}`);

export function storageBackend() {
  if (redis) return 'upstash-redis';
  return process.env.VERCEL ? 'ephemeral-file' : 'local-file';
}

async function loadLocal() {
  if (cache) return cache;
  try {
    const raw = await readFile(FILE, 'utf8');
    cache = JSON.parse(raw);
  } catch {
    cache = { viber: [], messenger: [], locations: {} };
  }
  return cache;
}

async function persistLocal() {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(cache, null, 2));
}

function parseStoredObject(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

/** Add a subscriber id to a channel if not already present. */
export async function addSubscriber(channel, id) {
  if (redis) {
    return (await redis.sadd(subscriberKey(channel), String(id))) === 1;
  }

  const data = await loadLocal();
  if (!data[channel]) data[channel] = [];
  if (!data[channel].includes(id)) {
    data[channel].push(id);
    await persistLocal();
    return true;
  }
  return false;
}

export async function removeSubscriber(channel, id) {
  if (redis) {
    return (await redis.srem(subscriberKey(channel), String(id))) > 0;
  }

  const data = await loadLocal();
  if (!data[channel]) return false;
  const before = data[channel].length;
  data[channel] = data[channel].filter((x) => x !== id);
  if (data[channel].length !== before) {
    await persistLocal();
    return true;
  }
  return false;
}

export async function getSubscribers(channel) {
  if (redis) {
    return redis.smembers(subscriberKey(channel));
  }

  const data = await loadLocal();
  return data[channel] || [];
}

/** Remember a user's shared location, keyed by their chat/user id. */
export async function setUserLocation(userId, loc) {
  if (redis) {
    const id = String(userId);
    await Promise.all([
      redis.set(locationKey(id), JSON.stringify(loc)),
      redis.sadd(locationUsersKey, id),
    ]);
    return;
  }

  const data = await loadLocal();
  if (!data.locations) data.locations = {};
  data.locations[String(userId)] = loc;
  await persistLocal();
}

/** Get a user's last shared location, or null if none. */
export async function getUserLocation(userId) {
  if (redis) {
    return parseStoredObject(await redis.get(locationKey(userId)));
  }

  const data = await loadLocal();
  return data.locations?.[String(userId)] || null;
}

/** All saved user locations, as a { chatId: location } map. */
export async function getAllUserLocations() {
  if (redis) {
    const userIds = await redis.smembers(locationUsersKey);
    const values = await Promise.all(
      userIds.map((id) => redis.get(locationKey(id)))
    );
    return Object.fromEntries(
      userIds
        .map((id, index) => [id, parseStoredObject(values[index])])
        .filter(([, loc]) => loc)
    );
  }

  const data = await loadLocal();
  return data.locations || {};
}

/**
 * Persist the short-lived "waiting for a city" conversation state. This must
 * live outside process memory on Vercel because consecutive messages can land
 * on different function instances.
 */
export async function setAwaitingLocation(userId, awaiting) {
  const id = String(userId);
  if (redis) {
    if (awaiting) {
      await redis.set(awaitingLocationKey(id), '1', { ex: 15 * 60 });
    } else {
      await redis.del(awaitingLocationKey(id));
    }
    return;
  }

  const data = await loadLocal();
  if (!data.awaitingLocations) data.awaitingLocations = [];
  data.awaitingLocations = data.awaitingLocations.filter(
    (value) => String(value) !== id
  );
  if (awaiting) data.awaitingLocations.push(id);
  await persistLocal();
}

export async function isAwaitingLocation(userId) {
  const id = String(userId);
  if (redis) {
    return (await redis.exists(awaitingLocationKey(id))) === 1;
  }

  const data = await loadLocal();
  return (data.awaitingLocations || []).some(
    (value) => String(value) === id
  );
}
