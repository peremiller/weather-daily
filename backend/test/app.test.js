import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
delete process.env.TELEGRAM_BOT_TOKEN;

const { default: app } = await import('../src/app.js');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
});

test('health endpoint reports the runtime and storage backend', async () => {
  const response = await fetch(`${baseUrl}/`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.runtime, 'server');
  assert.equal(body.storage, 'local-file');
  assert.equal(body.telegramWebhook, 'disabled');
});

test('Telegram webhook rejects a forged secret', async () => {
  const response = await fetch(`${baseUrl}/webhook/telegram`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'wrong-secret',
    },
    body: JSON.stringify({ update_id: 1 }),
  });

  assert.equal(response.status, 401);
});

test('Telegram webhook accepts an authenticated empty update', async () => {
  const response = await fetch(`${baseUrl}/webhook/telegram`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-webhook-secret',
    },
    body: JSON.stringify({ update_id: 1 }),
  });

  assert.equal(response.status, 200);
});

test('daily cron requires authorization and runs when authorized', async () => {
  const denied = await fetch(`${baseUrl}/cron/daily`);
  assert.equal(denied.status, 401);

  const allowed = await fetch(`${baseUrl}/cron/daily`, {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
  const body = await allowed.json();

  assert.equal(allowed.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.results, []);
});
