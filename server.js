// Entry point: `npm start`. Loads .env, wires dependencies, and starts the tester UI.
require('dotenv').config();
const path = require('node:path');
const { loadConfig } = require('./lib/config');
const { createTwilioClient } = require('./lib/twilio');
const { createState } = require('./lib/state');
const { createEventBus } = require('./lib/events');
const { createBackup } = require('./lib/backup');
const { createApp } = require('./lib/app');

const config = loadConfig();
const app = createApp({
  config,
  client: createTwilioClient(config),
  state: createState(path.join(__dirname, 'state.json')),
  events: createEventBus(),
  backup: createBackup(path.join(__dirname, '.tester-backup.json')),
});

app.listen(config.port, () => {
  console.log(`\nConversations Tester running at http://localhost:${config.port}\n`);
  const enabled = Object.entries(config.channels).filter(([, on]) => on).map(([name]) => name);
  console.log(`Channels enabled: ${enabled.join(', ') || 'none'}`);
  if (config.problems.length) {
    console.warn('\nSetup problems (Step 0 in the UI shows these too):');
    for (const problem of config.problems) console.warn(`  - ${problem}`);
  }
  if (!config.authToken) console.warn('\nTWILIO_AUTH_TOKEN is not set: inbound /channels/* webhooks will not be signature-validated.');
});
