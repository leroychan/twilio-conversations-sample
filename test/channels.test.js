const test = require('node:test');
const assert = require('node:assert/strict');
const twilio = require('twilio');
const { startApp } = require('./_support/harness');

test('SMS gets an auto-reply that echoes the message, and the event is logged', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const res = await app.postForm('/channels/sms', { From: '+15559998888', To: '+15550001111', Body: 'Hello <there>', MessageSid: 'SM1' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/xml/);
  const xml = await res.text();
  assert.match(xml, /<Message>.*Hello &lt;there&gt;.*<\/Message>/s);
  const [event] = app.events.recent();
  assert.equal(event.type, 'SMS_INBOUND');
  assert.equal(event.payload.body, 'Hello <there>');
});

test('WhatsApp uses the same auto-reply flow', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const res = await app.postForm('/channels/whatsapp', { From: 'whatsapp:+15559998888', To: 'whatsapp:+15550002222', Body: 'Hi' });
  assert.match(await res.text(), /<Message>/);
  assert.equal(app.events.recent()[0].type, 'WHATSAPP_INBOUND');
});

test('voice greets and gathers speech for turn 1', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const xml = await (await app.postForm('/channels/voice', { From: '+15559998888', CallSid: 'CA1' })).text();
  assert.match(xml, /<Say>[^<]*Conversations Tester/);
  assert.match(xml, /<Gather input="speech"[^>]*action="\/channels\/voice\/turn\?turn=1"/);
  assert.equal(app.events.recent()[0].type, 'VOICE_CALL');
});

test('voice turns continue, then hang up after the last turn or on silence', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const middle = await (await app.postForm('/channels/voice/turn?turn=1', { SpeechResult: 'I want to upgrade', CallSid: 'CA1' })).text();
  assert.match(middle, /You said: I want to upgrade/);
  assert.match(middle, /turn=2/);
  const last = await (await app.postForm('/channels/voice/turn?turn=3', { SpeechResult: 'Thanks', CallSid: 'CA1' })).text();
  assert.match(last, /<Hangup\/>/);
  const silent = await (await app.postForm('/channels/voice/turn?turn=1', { CallSid: 'CA1' })).text();
  assert.match(silent, /<Hangup\/>/);
});

test('with TWILIO_AUTH_TOKEN set, requests need a valid Twilio signature', async (t) => {
  const app = await startApp({ env: { TWILIO_AUTH_TOKEN: 'test-auth-token' } });
  t.after(app.close);
  const warn = t.mock.method(console, 'warn', () => {});
  const params = { From: '+15559998888', Body: 'Hi' };
  const bad = await app.postForm('/channels/sms', params, { 'X-Twilio-Signature': 'nope' });
  assert.equal(bad.status, 403);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /https:\/\/tester\.example\.ngrok\.app\/channels\/sms/);
  assert.match(warn.mock.calls[0].arguments[0], /PUBLIC_URL/);
  const signature = twilio.getExpectedTwilioSignature('test-auth-token', 'https://tester.example.ngrok.app/channels/sms', params);
  const good = await app.postForm('/channels/sms', params, { 'X-Twilio-Signature': signature });
  assert.equal(good.status, 200);
});
