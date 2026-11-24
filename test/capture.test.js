const test = require('node:test');
const assert = require('node:assert/strict');
const { captureExchanges, recordExchange, CapturingRequestClient } = require('../lib/capture');

test('collects only exchanges recorded inside the callback, across awaits', async () => {
  recordExchange({ outside: true });
  const { exchanges, value } = await captureExchanges(async () => {
    recordExchange({ n: 1 });
    await new Promise((r) => setTimeout(r, 5));
    recordExchange({ n: 2 });
    return 'done';
  });
  assert.equal(value, 'done');
  assert.deepEqual(exchanges, [{ n: 1 }, { n: 2 }]);
});

test('returns the error together with exchanges made before it', async () => {
  const { exchanges, error } = await captureExchanges(async () => {
    recordExchange({ n: 1 });
    throw new Error('nope');
  });
  assert.equal(error.message, 'nope');
  assert.equal(exchanges.length, 1);
});

test('concurrent captures stay isolated', async () => {
  const run = (tag) => captureExchanges(async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 10));
    recordExchange({ tag });
  });
  const [a, b] = await Promise.all([run('a'), run('b')]);
  assert.deepEqual(a.exchanges, [{ tag: 'a' }]);
  assert.deepEqual(b.exchanges, [{ tag: 'b' }]);
});

test('CapturingRequestClient records the wire request and response', async () => {
  const http = new CapturingRequestClient();
  http.axios = async () => ({ status: 202, data: { statusUrl: 'https://memory.twilio.com/v1/ControlPlane/Operations/op1' }, headers: { 'retry-after': '2', 'set-cookie': 'drop-me' } });
  const { exchanges } = await captureExchanges(() => http.request({
    method: 'post',
    uri: 'https://memory.twilio.com/v1/ControlPlane/Stores',
    username: 'SKtest',
    password: '{PASSWORD}',
    data: { displayName: 'Demo' },
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(exchanges.length, 1);
  const [x] = exchanges;
  assert.deepEqual(x.request, { method: 'POST', url: 'https://memory.twilio.com/v1/ControlPlane/Stores', body: { displayName: 'Demo' }, contentType: 'application/json' });
  assert.equal(x.response.status, 202);
  assert.deepEqual(x.response.headers, { 'retry-after': '2' });
  const recorded = JSON.stringify(x);
  assert.ok(!recorded.includes('{PASSWORD}'), 'password must not be recorded');
  assert.ok(!recorded.includes('SKtest'), 'username must not be recorded');
  assert.ok(!recorded.includes('Authorization'), 'auth header must not be recorded');
});

test('query params are rendered into the recorded URL', async () => {
  const http = new CapturingRequestClient();
  http.axios = async () => ({ status: 200, data: '{"items":[]}', headers: {} });
  const { exchanges } = await captureExchanges(() => http.request({
    method: 'get', uri: 'https://intelligence.twilio.com/v3/OperatorResults', username: 'SK', password: 'p',
    params: { conversationId: 'conv_1', PageSize: 50 },
  }));
  assert.equal(exchanges[0].request.url, 'https://intelligence.twilio.com/v3/OperatorResults?conversationId=conv_1&PageSize=50');
  assert.deepEqual(exchanges[0].response.body, { items: [] });
});
