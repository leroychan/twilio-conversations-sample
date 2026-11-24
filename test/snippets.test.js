const test = require('node:test');
const assert = require('node:assert/strict');
const { toCurl, curlForExchanges, call } = require('../lib/snippets');

test('JSON POST uses env-var credentials and a JSON body', () => {
  const curl = toCurl({ method: 'POST', url: 'https://memory.twilio.com/v1/ControlPlane/Stores', body: { displayName: 'Demo' }, contentType: 'application/json' });
  assert.match(curl, /^curl -X POST 'https:\/\/memory\.twilio\.com\/v1\/ControlPlane\/Stores'/);
  assert.match(curl, /-u "\$TWILIO_API_KEY:\$TWILIO_API_SECRET"/);
  assert.match(curl, /-H 'Content-Type: application\/json'/);
  assert.match(curl, /"displayName": "Demo"/);
});

test('single quotes and HTML in bodies stay valid shell', () => {
  const curl = toCurl({ method: 'POST', url: 'https://x.test', body: { text: "it's <b>late</b>" }, contentType: 'application/json' });
  assert.ok(curl.includes(`it'\\''s <b>late</b>`));
});

test('form-encoded bodies use --data-urlencode', () => {
  const curl = toCurl({ method: 'POST', url: 'https://api.twilio.com/x.json', body: { SmsUrl: 'https://a.test/sms' }, contentType: 'application/x-www-form-urlencoded' });
  assert.match(curl, /--data-urlencode 'SmsUrl=https:\/\/a\.test\/sms'/);
});

test('GET requests have no body flags', () => {
  const curl = toCurl({ method: 'GET', url: 'https://x.test/a?b=1', body: null });
  assert.ok(!curl.includes('-d '));
});

test('curlForExchanges dedupes repeated identical polls', () => {
  const poll = { request: { method: 'GET', url: 'https://memory.twilio.com/v1/ControlPlane/Operations/op1', body: null } };
  const create = { request: { method: 'POST', url: 'https://memory.twilio.com/v1/ControlPlane/Stores', body: {}, contentType: 'application/json' } };
  const out = curlForExchanges([create, poll, poll, poll]);
  assert.equal(out.split('curl -X').length - 1, 2);
});

test('curlForExchanges keeps POSTs to the same URL with different bodies', () => {
  const first = { request: { method: 'POST', url: 'https://memory.twilio.com/v1/ControlPlane/Stores', body: { displayName: 'A' }, contentType: 'application/json' } };
  const second = { request: { method: 'POST', url: 'https://memory.twilio.com/v1/ControlPlane/Stores', body: { displayName: 'B' }, contentType: 'application/json' } };
  const out = curlForExchanges([first, second]);
  assert.equal(out.split('curl -X').length - 1, 2);
  assert.ok(out.includes('"displayName": "A"'));
  assert.ok(out.includes('"displayName": "B"'));
});

test('call renders an SDK expression with pretty JSON args', () => {
  assert.equal(call('client.memory.v1.stores.create', { displayName: 'A' }), 'client.memory.v1.stores.create({\n  "displayName": "A"\n})');
  assert.equal(call('client.memory.v1.stores("x").fetch'), 'client.memory.v1.stores("x").fetch()');
});
