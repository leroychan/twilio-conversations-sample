const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp, callable } = require('./_support/harness');

function fakeOrchestrator({ related = { configurationId: 'conv_configuration_1' }, actionStatuses = ['PENDING', 'COMPLETED'] } = {}) {
  const fns = {
    configCreate: mock.fn(async () => ({ statusUrl: 'https://conversations.twilio.com/v2/ControlPlane/Operations/op1' })),
    configList: mock.fn(async () => [
      { id: 'cfg_old', displayName: 'Conversations Tester', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'cfg_new', displayName: 'Conversations Tester', createdAt: '2026-06-01T00:00:00Z' },
    ]),
    configFetch: mock.fn(async () => ({ id: 'conv_configuration_1', displayName: 'Conversations Tester' })),
    opFetch: mock.fn(async () => ({ body: { status: 'COMPLETED', related }, headers: {} })),
    convList: mock.fn(async () => [
      { id: 'conv_a', configurationId: 'conv_configuration_1', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'conv_b', configurationId: 'conv_configuration_1', createdAt: '2026-02-01T00:00:00Z' },
      { id: 'conv_x', configurationId: 'other', createdAt: '2026-03-01T00:00:00Z' },
    ]),
    convFetch: mock.fn(async () => ({ id: 'conv_b', status: 'ACTIVE' })),
    convUpdate: mock.fn(async (p) => ({ id: 'conv_b', ...p })),
    convCreate: mock.fn(async () => ({ id: 'conv_sim', status: 'ACTIVE' })),
    participantsList: mock.fn(async () => [{ id: 'p1', type: 'CUSTOMER', profileId: 'mem_profile_1' }]),
    communicationsList: mock.fn(async () => [
      { id: 'c2', occurredAt: '2026-02-01T00:02:00Z', content: { text: 'second' } },
      { id: 'c1', occurredAt: '2026-02-01T00:01:00Z', content: { text: 'first' } },
    ]),
    communicationsCreate: mock.fn(async (p) => ({ id: 'c_sim', ...p })),
    actionCreate: mock.fn(async () => ({ id: 'action_1', status: 'PENDING' })),
    actionFetch: mock.fn(async () => ({ id: 'action_1', status: actionStatuses.shift() ?? 'COMPLETED', related: { messageSid: 'SM1' } })),
  };
  const client = {
    conversations: {
      v2: {
        configurations: callable(() => ({ fetch: fns.configFetch }), { create: fns.configCreate, list: fns.configList }),
        operations: () => ({ fetchWithHttpInfo: fns.opFetch }),
        conversations: callable(() => ({ fetch: fns.convFetch, update: fns.convUpdate }), { list: fns.convList, create: fns.convCreate }),
        participants: () => ({ list: fns.participantsList }),
        communications: () => ({ list: fns.communicationsList, create: fns.communicationsCreate }),
        actions: (conversationId, actionId) => (actionId ? { fetch: fns.actionFetch } : { create: fns.actionCreate }),
      },
    },
  };
  return { client, fns };
}

const READY = { storeId: 'mem_store_1', profileId: 'mem_profile_1', intelligenceConfigId: 'intelligence_configuration_1' };

test('step 5 requires store, profile and intelligence config', async (t) => {
  const { client } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.post('/api/orchestrator/configurations', {});
  assert.equal(env.ok, false);
  assert.match(env.hint, /Step 1.*Step 2.*Step 4/);
});

test('step 5 creates the configuration, polls, and saves the id from the operation', async (t) => {
  const { client, fns } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ ...READY, conversationId: 'old', conversationClosed: true });
  const env = await app.post('/api/orchestrator/configurations', { inactiveMinutes: '2' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  const body = fns.configCreate.mock.calls[0].arguments[0];
  assert.equal(body.memoryStoreId, 'mem_store_1');
  assert.deepEqual(body.channelSettings.SMS.statusTimeouts, { inactive: 2, closed: 30 });
  assert.equal(env.state.orchestratorConfigId, 'conv_configuration_1');
  assert.equal(env.state.conversationId, null);
  assert.equal(env.state.conversationClosed, false);
});

test('step 5 falls back to the newest configuration with the same displayName', async (t) => {
  const { client } = fakeOrchestrator({ related: {} });
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set(READY);
  const env = await app.post('/api/orchestrator/configurations', {});
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.equal(env.state.orchestratorConfigId, 'cfg_new');
});

test('step 7 picks the newest conversation for our configuration and sorts the timeline', async (t) => {
  const { client } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'conv_configuration_1' });
  const env = await app.get('/api/orchestrator/conversation');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(env.data.conversations.map((c) => c.id), ['conv_b', 'conv_a']);
  assert.equal(env.state.conversationId, 'conv_b');
  assert.deepEqual(env.data.communications.map((c) => c.id), ['c1', 'c2']);
  assert.equal(env.data.participants[0].profileId, 'mem_profile_1');
});

test('step 7 reports clearly when no conversation exists yet', async (t) => {
  const { client, fns } = fakeOrchestrator();
  fns.convList.mock.mockImplementation(async () => []);
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'conv_configuration_1' });
  const env = await app.get('/api/orchestrator/conversation');
  assert.equal(env.ok, false);
  assert.match(env.hint, /No conversations yet/);
});

test('close sets status CLOSED and marks state', async (t) => {
  const { client, fns } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ conversationId: 'conv_b' });
  const env = await app.post('/api/orchestrator/conversation/close');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.convUpdate.mock.calls[0].arguments[0], { status: 'CLOSED' });
  assert.equal(env.state.conversationClosed, true);
});

test('reply sends a SEND_MESSAGE action and polls until it completes', async (t) => {
  const { client, fns } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ conversationId: 'conv_b' });
  const env = await app.post('/api/orchestrator/reply', { channel: 'SMS', text: 'Hello from the agent' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.equal(fns.actionCreate.mock.calls[0].arguments[0].type, 'SEND_MESSAGE');
  assert.equal(env.data.action.status, 'COMPLETED');
  assert.equal(fns.actionFetch.mock.callCount(), 2);
});

test('reply rejects WhatsApp when no sender is configured', async (t) => {
  const { client } = fakeOrchestrator();
  const app = await startApp({ client, env: { TWILIO_WHATSAPP_NUMBER: '' } });
  t.after(app.close);
  app.state.set({ conversationId: 'conv_b' });
  const env = await app.post('/api/orchestrator/reply', { channel: 'WHATSAPP', text: 'x' });
  assert.equal(env.ok, false);
  assert.match(env.hint, /TWILIO_WHATSAPP_NUMBER/);
});

test('simulate creates a conversation first when none exists', async (t) => {
  const { client, fns } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'conv_configuration_1', profileId: 'mem_profile_1' });
  const env = await app.post('/api/orchestrator/simulate', { channel: 'SMS', author: 'CUSTOMER', text: 'I want to upgrade' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.equal(fns.convCreate.mock.callCount(), 1);
  assert.equal(env.state.conversationId, 'conv_sim');
  assert.equal(fns.communicationsCreate.mock.calls[0].arguments[0].content.text, 'I want to upgrade');
  assert.equal(env.data.simulated, true);
});

test('simulate rejects unknown channels', async (t) => {
  const { client } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'conv_configuration_1', conversationId: 'conv_b' });
  const env = await app.post('/api/orchestrator/simulate', { channel: 'FAX', text: 'x' });
  assert.equal(env.ok, false);
  assert.match(env.hint, /SMS, WHATSAPP or VOICE/);
});
