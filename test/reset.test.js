const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp } = require('./_support/harness');

function fakeClient({ storeRemoveError } = {}) {
  const order = [];
  const remove = (label, result = true, error) => mock.fn(async () => {
    order.push(label);
    if (error) throw error;
    return result;
  });
  const client = {
    conversations: { v2: {
      configurations: () => ({ remove: remove('orchestrator', { statusUrl: 'https://conversations.twilio.com/v2/ControlPlane/Operations/op1' }) }),
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
  return { client, order };
}

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
