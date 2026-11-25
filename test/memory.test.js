const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp, callable } = require('./_support/harness');

function fakeMemory() {
  const fns = {
    storesCreate: mock.fn(async () => ({ statusUrl: 'https://memory.twilio.com/v1/ControlPlane/Operations/op1' })),
    storeFetch: mock.fn(async () => ({ id: 'mem_store_1', displayName: 'ConversationsTester', status: 'ACTIVE' })),
    opFetch: mock.fn(async () => ({ body: { operationId: 'op1', status: 'COMPLETED', result: { type: 'RESOURCE_ID', id: 'mem_store_1' } }, headers: {} })),
    profileCreate: mock.fn(async () => ({ id: 'mem_profile_1', message: 'accepted' })),
    profileFetch: mock.fn(async () => ({ id: 'mem_profile_1', traits: { Contact: { firstName: 'Alex' } } })),
    lookupCreate: mock.fn(async () => ({ normalizedValue: '+15559998888', profiles: ['mem_profile_1'] })),
    observationsRequest: mock.fn(async () => ({ statusCode: 200, body: { meta: { key: 'observations' }, observations: [{ id: 'obs1', content: 'Prefers SMS' }] } })),
    summariesList: mock.fn(async () => [{ id: 'sum1', content: 'Asked about an upgrade' }]),
    recallCreate: mock.fn(async () => ({ observations: [{ content: 'Prefers SMS', score: 0.9 }], summaries: [], communications: [] })),
  };
  const client = {
    // Observations are listed with a raw request: the SDK crashes when Twilio returns "observations": null.
    request: fns.observationsRequest,
    memory: {
      v1: {
        stores: callable(() => ({ fetch: fns.storeFetch }), { create: fns.storesCreate }),
        operations: () => ({ fetchWithHttpInfo: fns.opFetch }),
        profiles: (storeId, profileId) => (profileId ? { fetch: fns.profileFetch } : { create: fns.profileCreate }),
        lookup: () => ({ create: fns.lookupCreate }),
        conversationSummaries: () => ({ list: fns.summariesList }),
        recall: () => ({ create: fns.recallCreate }),
      },
    },
  };
  return { client, fns };
}

test('step 1 creates a store, waits for the operation, and saves storeId', async (t) => {
  const { client, fns } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ profileId: 'old_profile' });
  const env = await app.post('/api/memory/stores', { displayName: 'MyStore' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.storesCreate.mock.calls[0].arguments[0], { displayName: 'MyStore', description: 'Memory store created by the Conversations Tester sample' });
  assert.equal(env.data.store.id, 'mem_store_1');
  assert.equal(env.state.storeId, 'mem_store_1');
  assert.equal(env.state.profileId, null);
  assert.match(env.snippet.node, /client\.memory\.v1\.stores\.create/);
});

test('step 2 requires a store first', async (t) => {
  const { client } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.post('/api/memory/profiles', {});
  assert.equal(env.ok, false);
  assert.match(env.hint, /Step 1/);
});

test('step 2 creates a profile with Contact traits (WhatsApp defaults to the phone)', async (t) => {
  const { client, fns } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 'mem_store_1' });
  const env = await app.post('/api/memory/profiles', { firstName: 'Alex' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.profileCreate.mock.calls[0].arguments[0], { traits: { Contact: { firstName: 'Alex', phone: '+15559998888', whatsapp: '+15559998888' } } });
  assert.deepEqual(fns.lookupCreate.mock.calls[0].arguments[0], { idType: 'phone', value: '+15559998888' });
  assert.equal(env.state.profileId, 'mem_profile_1');
});

test('step 2 rejects a phone number that is not E.164', async (t) => {
  const { client } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 'mem_store_1' });
  const env = await app.post('/api/memory/profiles', { phone: '555-1234' });
  assert.equal(env.ok, false);
  assert.match(env.hint, /E\.164/);
});

test('step 8 lists observations and summaries for the current conversation', async (t) => {
  const { client, fns } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 'mem_store_1', profileId: 'mem_profile_1', conversationId: 'conv_1' });
  const env = await app.get('/api/memory/results');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.equal(env.data.observations.length, 1);
  assert.equal(env.data.summaries.length, 1);
  assert.deepEqual(fns.summariesList.mock.calls[0].arguments[0], { conversationId: 'conv_1', limit: 10 });
  assert.deepEqual(fns.observationsRequest.mock.calls[0].arguments[0], {
    method: 'get',
    uri: 'https://memory.twilio.com/v1/Stores/mem_store_1/Profiles/mem_profile_1/Observations',
    params: { pageSize: 20 },
  });
});

test('step 8 treats "observations": null (a profile with no observations yet) as an empty list', async (t) => {
  const { client, fns } = fakeMemory();
  fns.observationsRequest.mock.mockImplementation(async () => ({ statusCode: 200, body: { meta: { key: 'observations', nextToken: null }, observations: null } }));
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 'mem_store_1', profileId: 'mem_profile_1', conversationId: 'conv_1' });
  const env = await app.get('/api/memory/results');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(env.data.observations, []);
});

test('recall sends the query and limits', async (t) => {
  const { client, fns } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 'mem_store_1', profileId: 'mem_profile_1' });
  const env = await app.post('/api/memory/recall', { query: 'preferences?' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.recallCreate.mock.calls[0].arguments[0], { query: 'preferences?', observationsLimit: 10, summariesLimit: 5, communicationsLimit: 5 });
  assert.equal(env.data.recall.observations[0].score, 0.9);
});
