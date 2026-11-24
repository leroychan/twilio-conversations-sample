const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./_support/harness');

const postRaw = (app, path, body, type = 'application/json') =>
  fetch(app.url + path, { method: 'POST', headers: { 'Content-Type': type }, body });

test('orchestrator webhook publishes the event and remembers the first conversation', async (t) => {
  const app = await startApp();
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'conv_configuration_1' });
  const res = await postRaw(app, '/webhooks/orchestrator', JSON.stringify({ eventType: 'CONVERSATION_CREATED', timestamp: 'now', data: { id: 'conv_conversation_1', configurationId: 'conv_configuration_1' } }));
  assert.equal(res.status, 200);
  const [event] = app.events.recent();
  assert.equal(event.source, 'orchestrator');
  assert.equal(event.type, 'CONVERSATION_CREATED');
  assert.equal(app.state.get().conversationId, 'conv_conversation_1');
});

test('does not replace an existing conversationId or adopt other configurations', async (t) => {
  const app = await startApp();
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'cfg_mine' });
  await postRaw(app, '/webhooks/orchestrator', JSON.stringify({ eventType: 'CONVERSATION_CREATED', data: { id: 'conv_other', configurationId: 'cfg_other' } }));
  assert.equal(app.state.get().conversationId, null);
  app.state.set({ conversationId: 'conv_keep' });
  await postRaw(app, '/webhooks/orchestrator', JSON.stringify({ eventType: 'CONVERSATION_CREATED', data: { id: 'conv_new', configurationId: 'cfg_mine' } }));
  assert.equal(app.state.get().conversationId, 'conv_keep');
});

test('malformed or empty bodies still get 200 and are logged', async (t) => {
  const app = await startApp();
  t.after(app.close);
  assert.equal((await postRaw(app, '/webhooks/orchestrator', '{oops')).status, 200);
  assert.equal((await postRaw(app, '/webhooks/intelligence', '', 'text/plain')).status, 200);
  const types = app.events.recent().map((e) => e.type);
  assert.deepEqual(types, ['INVALID_JSON', 'INVALID_JSON']);
});

test('intelligence webhook publishes operator results', async (t) => {
  const app = await startApp();
  t.after(app.close);
  await postRaw(app, '/webhooks/intelligence', JSON.stringify({ conversationId: 'conv_1', operatorResults: [{ id: 'r1' }] }));
  const [event] = app.events.recent();
  assert.equal(event.source, 'intelligence');
  assert.equal(event.type, 'OPERATOR_RESULTS');
  assert.equal(event.payload.conversationId, 'conv_1');
});
