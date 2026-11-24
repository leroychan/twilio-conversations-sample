const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./_support/harness');

test('health, state and unknown API routes', async (t) => {
  const app = await startApp();
  t.after(app.close);
  assert.deepEqual(await app.get('/health'), { status: 200, ok: true, app: 'conversations-tester' });
  const state = await app.get('/api/state');
  assert.equal(state.status, 200);
  assert.equal(state.storeId, null);
  const missing = await app.get('/api/nope');
  assert.equal(missing.status, 404);
  assert.equal(missing.ok, false);
});

test('GET /events replays buffered events as SSE', async (t) => {
  const app = await startApp();
  t.after(app.close);
  app.events.publish('orchestrator', 'CONVERSATION_CREATED', { data: { id: 'conv_1' } });
  const controller = new AbortController();
  const res = await fetch(`${app.url}/events`, { signal: controller.signal });
  assert.match(res.headers.get('content-type'), /^text\/event-stream/);
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  controller.abort();
  assert.match(text, /data: .*"CONVERSATION_CREATED"/);
});

test('serves the UI shell from public/', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const res = await fetch(`${app.url}/`);
  assert.equal(res.status, 200);
});
