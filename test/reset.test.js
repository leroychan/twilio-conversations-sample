const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp, callable } = require('./_support/harness');

const PUBLIC = 'https://tester.example.ngrok.app';

function fakeClient({ storeRemoveError, numberUpdateError, number, conversations = [] } = {}) {
  const order = [];
  const remove = (label, result = true, error) => mock.fn(async () => {
    order.push(label);
    if (error) throw error;
    return result;
  });
  const numberUpdate = mock.fn(async (params) => {
    order.push('number');
    if (numberUpdateError) throw numberUpdateError;
    return { sid: 'PN1', ...params };
  });
  const client = {
    incomingPhoneNumbers: callable(() => ({ update: numberUpdate }), { list: mock.fn(async () => (number ? [number] : [])) }),
    conversations: { v2: {
      configurations: () => ({ remove: remove('orchestrator', { statusUrl: 'https://conversations.twilio.com/v2/ControlPlane/Operations/op1' }) }),
      conversations: callable((id) => ({ remove: remove(`conversation:${id}`) }), { list: mock.fn(async () => conversations) }),
      operations: () => ({ fetchWithHttpInfo: async () => ({ body: { status: 'COMPLETED' }, headers: {} }) }),
    } },
    intelligence: { v3: {
      configurations: () => ({ remove: remove('intelligence') }),
      operators: () => ({ remove: remove('operator') }),
    } },
    memory: { v1: {
      stores: () => ({ remove: remove('store', true, storeRemoveError) }),
      operations: () => ({ fetchWithHttpInfo: async () => ({ body: { status: 'COMPLETED' }, headers: {} }) }),
    } },
  };
  return { client, order, numberUpdate };
}

const ORIGINAL = { sid: 'PN1', phoneNumber: '+15550001111', smsUrl: 'https://my-app.example/sms', smsMethod: 'GET', voiceUrl: '', voiceMethod: 'POST', pointedAtTester: false };
const POINTED = { sid: 'PN1', phoneNumber: '+15550001111', smsUrl: `${PUBLIC}/channels/sms`, voiceUrl: `${PUBLIC}/channels/voice` };

const FULL = { storeId: 's', profileId: 'p', operatorId: 'o', intelligenceConfigId: 'i', orchestratorConfigId: 'c', conversationId: 'conv' };

test('deletes resources in dependency order and clears state and events', async (t) => {
  const { client, order } = fakeClient();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set(FULL);
  app.events.publish('channels', 'X', {});
  const env = await app.post('/api/reset');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(order, ['orchestrator', 'intelligence', 'operator', 'store']);
  assert.ok(env.data.deleted.every((d) => d.ok));
  assert.equal(env.state.storeId, null);
  assert.equal(app.events.recent().length, 0);
});

test('a 404 counts as already deleted; other failures are reported but state still resets', async (t) => {
  const notFound = Object.assign(new Error('Not found'), { status: 404 });
  const { client } = fakeClient({ storeRemoveError: notFound });
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set(FULL);
  const env = await app.post('/api/reset');
  const store = env.data.deleted.find((d) => d.label === 'Memory store');
  assert.equal(store.ok, true);
  assert.match(store.note, /already deleted/);
  assert.equal(env.state.orchestratorConfigId, null);
});

test('keeps the IDs of resources that could not be deleted, clears the rest', async (t) => {
  const busy = Object.assign(new Error('Store is in use'), { status: 409 });
  const { client } = fakeClient({ storeRemoveError: busy });
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set(FULL);
  const env = await app.post('/api/reset');
  const store = env.data.deleted.find((d) => d.label === 'Memory store');
  assert.equal(store.ok, false);
  assert.equal(env.state.storeId, 's');
  assert.equal(env.state.profileId, 'p');
  assert.equal(env.state.orchestratorConfigId, null);
  assert.equal(env.state.intelligenceConfigId, null);
  assert.equal(env.state.operatorId, null);
  assert.equal(env.state.conversationId, null);
});

test('skips resources that were never created', async (t) => {
  const { client, order } = fakeClient();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 's' });
  const env = await app.post('/api/reset');
  assert.deepEqual(order, ['store']);
  assert.equal(env.data.deleted.length, 1);
});

test('restores the backed-up number webhooks first, then removes the backup', async (t) => {
  const { client, order, numberUpdate } = fakeClient({ number: POINTED });
  const app = await startApp({ client });
  t.after(app.close);
  app.backup.saveOnce('phoneNumber', ORIGINAL);
  app.state.set(FULL);
  const env = await app.post('/api/reset');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.equal(order[0], 'number');
  assert.deepEqual(numberUpdate.mock.calls[0].arguments[0], { smsUrl: 'https://my-app.example/sms', smsMethod: 'GET', voiceUrl: '', voiceMethod: 'POST' });
  assert.equal(env.data.restored[0].ok, true);
  assert.deepEqual(app.backup.get(), {});
});

test('keeps the backup when restoring the number fails', async (t) => {
  const { client } = fakeClient({ number: POINTED, numberUpdateError: Object.assign(new Error('Server error'), { status: 500 }) });
  const app = await startApp({ client });
  t.after(app.close);
  app.backup.saveOnce('phoneNumber', ORIGINAL);
  const env = await app.post('/api/reset');
  assert.equal(env.data.restored[0].ok, false);
  assert.equal(app.backup.get().phoneNumber.smsUrl, 'https://my-app.example/sms');
});

test('deletes conversations of our configuration before the configuration itself', async (t) => {
  const conversations = [
    { id: 'conv_1', configurationId: 'c' },
    { id: 'conv_other', configurationId: 'someone-else' },
    { id: 'conv_2', configurationId: 'c' },
  ];
  const { client, order } = fakeClient({ conversations });
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set(FULL);
  const env = await app.post('/api/reset');
  assert.deepEqual(order.slice(0, 3), ['conversation:conv_1', 'conversation:conv_2', 'orchestrator']);
  assert.ok(!order.includes('conversation:conv_other'));
  assert.equal(env.data.deleted.filter((d) => d.label === 'Conversation').length, 2);
});

test('preview lists what will be restored, deleted, and what you must do by hand', async (t) => {
  const { client, order } = fakeClient({ number: POINTED, conversations: [{ id: 'conv_1', configurationId: 'c' }] });
  const app = await startApp({ client });
  t.after(app.close);
  app.backup.saveOnce('phoneNumber', ORIGINAL);
  app.state.set(FULL);
  const env = await app.get('/api/reset/preview');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(env.data.restore.map((r) => [r.label, r.from, r.to]), [
    ['SMS webhook of +15550001111', `${PUBLIC}/channels/sms`, 'https://my-app.example/sms (GET)'],
    ['Voice webhook of +15550001111', `${PUBLIC}/channels/voice`, '(empty)'],
  ]);
  assert.deepEqual(env.data.delete.map((d) => d.label), ['Conversation', 'Conversation configuration', 'Intelligence configuration', 'Custom operator', 'Memory store']);
  assert.ok(env.data.manual.some((m) => /WhatsApp/.test(m.label)));
  assert.ok(env.data.manual.some((m) => /ngrok/.test(m.label)));
  assert.deepEqual(order, [], 'preview must not change anything');
});

test('preview warns when the number points here but no usable backup exists', async (t) => {
  const { client } = fakeClient({ number: POINTED });
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.get('/api/reset/preview');
  assert.equal(env.data.restore.length, 0);
  const warning = env.data.manual.find((m) => /phone number/i.test(m.label));
  assert.ok(warning, JSON.stringify(env.data.manual));
  assert.match(warning.detail, /Console/);
});
