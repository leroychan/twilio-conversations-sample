const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp, callable } = require('./_support/harness');

const PUBLIC = 'https://tester.example.ngrok.app';

function fakeClient({ number }) {
  const update = mock.fn(async (params) => ({ sid: number?.sid, ...params }));
  const client = {
    // No `api.v2010.accounts`: Step 0 must work with a Standard API key, which cannot read /Accounts.
    incomingPhoneNumbers: callable(() => ({ update }), { list: mock.fn(async () => (number ? [number] : [])) }),
  };
  return { client, update };
}

const healthyFetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, app: 'conversations-tester' }) });

test('config endpoint returns safe config, state and defaults', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const res = await app.get('/api/setup/config');
  assert.equal(res.config.phoneNumber, '+15550001111');
  assert.ok(!('apiSecret' in res.config));
  assert.equal(res.state.storeId, null);
  assert.ok('defaults' in res);
});

test('check reports every item as ok for a fully set-up account', async (t) => {
  const number = { sid: 'PN1', phoneNumber: '+15550001111', capabilities: { sms: true, voice: true }, smsUrl: `${PUBLIC}/channels/sms`, voiceUrl: `${PUBLIC}/channels/voice` };
  const { client } = fakeClient({ number });
  const app = await startApp({ client, fetchImpl: healthyFetch });
  t.after(app.close);
  const env = await app.post('/api/setup/check');
  assert.equal(env.ok, true);
  const byId = Object.fromEntries(env.data.checks.map((c) => [c.id, c]));
  for (const id of ['env', 'credentials', 'number', 'webhooks', 'whatsapp', 'publicUrl']) assert.equal(byId[id].ok, true, id);
  assert.match(byId.credentials.detail, /list this account's phone numbers/);
  assert.match(env.snippet.node, /incomingPhoneNumbers\.list/);
  assert.doesNotMatch(env.snippet.node, /accounts/);
});

test('check still verifies the API key when TWILIO_PHONE_NUMBER is not set', async (t) => {
  const { client } = fakeClient({ number: null });
  const app = await startApp({ client, env: { TWILIO_PHONE_NUMBER: '' }, fetchImpl: healthyFetch });
  t.after(app.close);
  const env = await app.post('/api/setup/check');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  const byId = Object.fromEntries(env.data.checks.map((c) => [c.id, c]));
  assert.equal(byId.credentials.ok, true);
  assert.equal(byId.number.ok, false);
  assert.deepEqual(client.incomingPhoneNumbers.list.mock.calls[0].arguments[0], { limit: 1 });
});

test('check flags wrong webhooks, unreachable PUBLIC_URL and missing WhatsApp', async (t) => {
  const number = { sid: 'PN1', phoneNumber: '+15550001111', capabilities: { sms: true, voice: true }, smsUrl: 'https://old.example/sms', voiceUrl: '' };
  const { client } = fakeClient({ number });
  const app = await startApp({ client, env: { TWILIO_WHATSAPP_NUMBER: '' }, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  t.after(app.close);
  const env = await app.post('/api/setup/check');
  const byId = Object.fromEntries(env.data.checks.map((c) => [c.id, c]));
  assert.equal(byId.webhooks.ok, false);
  assert.equal(byId.webhooks.fix, 'point-number');
  assert.equal(byId.publicUrl.ok, false);
  assert.match(byId.publicUrl.detail, /ngrok/);
  assert.equal(byId.whatsapp.ok, false);
  assert.equal(byId.whatsapp.optional, true);
});

test('check without credentials explains what to fill in', async (t) => {
  const app = await startApp({ client: null });
  t.after(app.close);
  const env = await app.post('/api/setup/check');
  assert.equal(env.ok, false);
  assert.match(env.hint, /TWILIO_API_KEY/);
});

test('point-number sets SMS and Voice webhooks to this app', async (t) => {
  const { client, update } = fakeClient({ number: { sid: 'PN1', phoneNumber: '+15550001111', capabilities: {} } });
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.post('/api/setup/point-number');
  assert.equal(env.ok, true);
  assert.deepEqual(update.mock.calls[0].arguments[0], { smsUrl: `${PUBLIC}/channels/sms`, smsMethod: 'POST', voiceUrl: `${PUBLIC}/channels/voice`, voiceMethod: 'POST' });
});

test('point-number refuses to run without TWILIO_PHONE_NUMBER', async (t) => {
  const { client, update } = fakeClient({ number: { sid: 'PN1', phoneNumber: '+15550001111', capabilities: {} } });
  const app = await startApp({ client, env: { TWILIO_PHONE_NUMBER: '' } });
  t.after(app.close);
  const env = await app.post('/api/setup/point-number');
  assert.equal(env.ok, false);
  assert.match(env.hint, /TWILIO_PHONE_NUMBER/);
  assert.equal(update.mock.calls.length, 0);
});
