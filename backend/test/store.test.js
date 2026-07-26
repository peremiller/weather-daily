import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDir = await mkdtemp(join(tmpdir(), 'weather-daily-store-'));
process.env.WEATHER_STORE_FILE = join(testDir, 'subscribers.json');

const {
  getAllUserLocations,
  getUserLocation,
  isAwaitingLocation,
  setAwaitingLocation,
  setUserLocation,
  storageBackend,
} = await import('../src/store.js');

test('local store persists locations and conversation state', async () => {
  const location = {
    name: 'Las Piñas',
    latitude: 14.4445,
    longitude: 120.9939,
  };

  assert.equal(storageBackend(), 'local-file');
  assert.equal(await getUserLocation('42'), null);

  await setUserLocation('42', location);
  assert.deepEqual(await getUserLocation('42'), location);
  assert.deepEqual(await getAllUserLocations(), { 42: location });

  assert.equal(await isAwaitingLocation('42'), false);
  await setAwaitingLocation('42', true);
  assert.equal(await isAwaitingLocation('42'), true);
  await setAwaitingLocation('42', false);
  assert.equal(await isAwaitingLocation('42'), false);
});
