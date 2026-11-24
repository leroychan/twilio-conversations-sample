const test = require('node:test');
const assert = require('node:assert/strict');
const { record } = require('../lib/recorder');
const { recordExchange } = require('../lib/capture');
const { PrereqError } = require('../lib/errors');

const fakeState = (value) => ({ get: () => value });
const exchange = { request: { method: 'POST', url: 'https://memory.twilio.com/v1/ControlPlane/Stores', body: { displayName: 'A' }, contentType: 'application/json' }, response: { status: 202, headers: {}, body: {} }, durationMs: 3 };

test('success envelope carries data, exchanges, snippets and state', async () => {
  const env = await record({ step: 'memory.createStore', code: ['line 1', 'line 2'], state: fakeState({ storeId: 's1' }) }, async () => {
    recordExchange(exchange);
    return { hello: 'world' };
  });
  assert.equal(env.ok, true);
  assert.equal(env.step, 'memory.createStore');
  assert.deepEqual(env.data, { hello: 'world' });
  assert.deepEqual(env.exchanges, [exchange]);
  assert.deepEqual(env.request, exchange.request);
  assert.equal(env.snippet.node, 'line 1\nline 2');
  assert.match(env.snippet.curl, /curl -X POST/);
  assert.deepEqual(env.state, { storeId: 's1' });
  assert.equal(env.error, null);
  assert.equal(typeof env.durationMs, 'number');
});

test('Twilio errors become ok:false with a hint', async () => {
  const env = await record({ step: 's', state: fakeState({}) }, async () => {
    throw Object.assign(new Error('Forbidden'), { status: 403, code: 20403 });
  });
  assert.equal(env.ok, false);
  assert.equal(env.error.status, 403);
  assert.match(env.hint, /new Twilio Console/);
  assert.equal(env.data, null);
});

test('prerequisite errors use their message as the hint', async () => {
  const env = await record({ step: 's', state: fakeState({}) }, async () => {
    throw new PrereqError('Complete Step 1 first.');
  });
  assert.equal(env.ok, false);
  assert.equal(env.error.code, 'PREREQUISITE');
  assert.equal(env.hint, 'Complete Step 1 first.');
});
