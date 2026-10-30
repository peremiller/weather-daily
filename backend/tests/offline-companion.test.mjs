import test from 'node:test';
import assert from 'node:assert/strict';
import { readState, saveState, addReport, fetchForecast } from '../offline-src/store.mjs';
test('public forecasts and local plans survive reload with explicit retrieval times', () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let state = { reports: [], notes: [{ id: 'a', text: 'Local plan', done: false }] };
  state = addReport(state, { weather: { date: '2026-10-30' }, message: 'A public forecast snapshot' }, 1234);
  assert.equal(saveState(storage, state), true);
  const reloaded = readState(storage);
  assert.equal(reloaded.reports[0].savedAt, 1234);
  assert.equal(reloaded.notes[0].text, 'Local plan');
  assert.throws(() => addReport(state, { message: 'Incomplete' }));
});
test('forecast retrieval is read-only without credentials; failed requests do not manufacture reports', async () => {
  const response = { weather: {}, message: 'Saved public forecast' };
  assert.deepEqual(await fetchForecast(async (url, options) => {
    assert.equal(url, '/weather'); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => response };
  }), response);
  await assert.rejects(fetchForecast(async () => { throw Error('Offline'); }));
  assert.equal(saveState({ setItem() { throw Error('Quota'); } }, { reports: [], notes: [] }), false);
});
