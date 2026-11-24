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

const http = require('node:http');

// fetch() won't let us set Host, so use node:http to look like a request that came through ngrok.
function requestWithHost(app, { method = 'GET', path, host, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${app.url}${path}`, { method, headers: { Host: host, 'Content-Type': 'application/json' } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const TUNNEL_HOST = 'tester.example.ngrok.app';

test('the UI, /api and /events only answer on localhost', async (t) => {
  const app = await startApp();
  t.after(app.close);
  assert.equal(await requestWithHost(app, { path: '/api/state', host: TUNNEL_HOST }), 403);
  assert.equal(await requestWithHost(app, { method: 'POST', path: '/api/reset', host: TUNNEL_HOST, body: '{}' }), 403);
  assert.equal(await requestWithHost(app, { path: '/events', host: TUNNEL_HOST }), 403);
  assert.equal(await requestWithHost(app, { path: '/', host: TUNNEL_HOST }), 403);
  assert.equal(await requestWithHost(app, { path: '/app.js', host: TUNNEL_HOST }), 403);
  for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) {
    assert.equal(await requestWithHost(app, { path: '/api/state', host }), 200, host);
  }
});

test('health and webhooks stay reachable through the tunnel', async (t) => {
  const app = await startApp();
  t.after(app.close);
  assert.equal(await requestWithHost(app, { path: '/health', host: TUNNEL_HOST }), 200);
  assert.equal(await requestWithHost(app, { method: 'POST', path: '/webhooks/orchestrator', host: TUNNEL_HOST, body: '{"eventType":"X"}' }), 200);
  assert.equal(await requestWithHost(app, { method: 'POST', path: '/channels/sms', host: TUNNEL_HOST }), 200);
});
