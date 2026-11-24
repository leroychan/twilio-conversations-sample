const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, publicConfig } = require('../lib/config');

const VALID = {
  TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32),
  TWILIO_API_KEY: 'SK' + 'b'.repeat(32),
  TWILIO_API_SECRET: 'S3CR3T-VALUE',
  TWILIO_PHONE_NUMBER: '+15550001111',
  TWILIO_WHATSAPP_NUMBER: 'whatsapp:+15550002222',
  MY_PHONE_NUMBER: '+15559998888',
  PUBLIC_URL: 'https://tester.example.ngrok.app/',
};

test('valid env has no problems and enables every channel', () => {
  const config = loadConfig(VALID);
  assert.deepEqual(config.problems, []);
  assert.equal(config.hasCredentials, true);
  assert.deepEqual(config.channels, { sms: true, voice: true, whatsapp: true });
  assert.equal(config.port, 3000);
});

test('normalizes the whatsapp: prefix and trailing slash on PUBLIC_URL', () => {
  const config = loadConfig(VALID);
  assert.equal(config.whatsappNumber, '+15550002222');
  assert.equal(config.publicUrl, 'https://tester.example.ngrok.app');
});

test('reports bad values but treats WhatsApp as optional', () => {
  const config = loadConfig({ ...VALID, TWILIO_WHATSAPP_NUMBER: '', PUBLIC_URL: 'http://insecure', MY_PHONE_NUMBER: '555' });
  assert.equal(config.channels.whatsapp, false);
  assert.ok(config.problems.some((p) => p.includes('PUBLIC_URL')));
  assert.ok(config.problems.some((p) => p.includes('MY_PHONE_NUMBER')));
  assert.ok(!config.problems.some((p) => p.includes('WHATSAPP')));
});

test('missing credentials set hasCredentials=false', () => {
  const config = loadConfig({ ...VALID, TWILIO_API_SECRET: '' });
  assert.equal(config.hasCredentials, false);
  assert.ok(config.problems.some((p) => p.includes('TWILIO_API_SECRET')));
});

test('publicConfig never exposes secrets', () => {
  const pub = publicConfig(loadConfig({ ...VALID, TWILIO_AUTH_TOKEN: 'AUTH-TOKEN-VALUE' }));
  const text = JSON.stringify(pub);
  assert.ok(!text.includes('S3CR3T-VALUE'));
  assert.ok(!text.includes('AUTH-TOKEN-VALUE'));
  assert.ok(!('apiKey' in pub) && !('apiSecret' in pub) && !('authToken' in pub));
});
