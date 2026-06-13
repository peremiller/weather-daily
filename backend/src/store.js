import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Dead-simple JSON file store for subscriber IDs captured via webhooks.
 * Good enough for a personal/small bot. Swap for a real DB if it grows.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const FILE = join(DATA_DIR, 'subscribers.json');

let cache = null;

async function load() {
  if (cache) return cache;
  try {
    const raw = await readFile(FILE, 'utf8');
    cache = JSON.parse(raw);
  } catch {
    cache = { viber: [], messenger: [] };
  }
  return cache;
}

async function persist() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(cache, null, 2));
}

/** Add a subscriber id to a channel if not already present. */
export async function addSubscriber(channel, id) {
  const data = await load();
  if (!data[channel]) data[channel] = [];
  if (!data[channel].includes(id)) {
    data[channel].push(id);
    await persist();
    return true;
  }
  return false;
}

export async function removeSubscriber(channel, id) {
  const data = await load();
  if (!data[channel]) return false;
  const before = data[channel].length;
  data[channel] = data[channel].filter((x) => x !== id);
  if (data[channel].length !== before) {
    await persist();
    return true;
  }
  return false;
}

export async function getSubscribers(channel) {
  const data = await load();
  return data[channel] || [];
}
