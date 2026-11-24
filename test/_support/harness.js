// Boots the real Express app on a random port with a fake Twilio client.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../../lib/app');
const { createState } = require('../../lib/state');
const { createEventBus } = require('../../lib/events');
const { loadConfig } = require('../../lib/config');
const { createBackup } = require('../../lib/backup');

const TEST_ENV = {
  TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32),
  TWILIO_API_KEY: 'SK' + 'b'.repeat(32),
  TWILIO_API_SECRET: 'secret',
  TWILIO_PHONE_NUMBER: '+15550001111',
  TWILIO_WHATSAPP_NUMBER: '+15550002222',
  MY_PHONE_NUMBER: '+15559998888',
  PUBLIC_URL: 'https://tester.example.ngrok.app',
};

// Builds a function that also has properties, like the SDK's `client.memory.v1.stores`.
const callable = (fn, props) => Object.assign(fn, props);

async function startApp({ client = null, env = {}, config, fetchImpl } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-'));
  const state = createState(path.join(dir, 'state.json'));
  const events = createEventBus();
  const backup = createBackup(path.join(dir, '.tester-backup.json'));
  const appConfig = config || loadConfig({ ...TEST_ENV, ...env });
  const app = createApp({ config: appConfig, client, state, events, backup, sleep: async () => {}, fetchImpl });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const asJson = async (res) => ({ status: res.status, ...(await res.json()) });
  return {
    url,
    state,
    events,
    backup,
    config: appConfig,
    get: (p) => fetch(url + p).then(asJson),
    post: (p, body = {}) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(asJson),
    postForm: (p, form, headers = {}) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(form) }),
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

module.exports = { startApp, TEST_ENV, callable };
