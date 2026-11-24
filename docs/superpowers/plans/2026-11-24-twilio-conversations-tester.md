# Twilio Conversations Tester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Express + plain-HTML/JS "tester" app. It walks beginners step by step through Twilio Conversation Orchestrator, Conversation Memory and Conversation Intelligence over SMS, WhatsApp and Voice. Every step shows the real request, the response, and copyable code.

**Architecture:**
- Express server (CommonJS). One route module per product calls the official `twilio` SDK (≥ 6.3.1).
- A custom SDK `httpClient` (`CapturingRequestClient`) records every real HTTP exchange through `AsyncLocalStorage`. `record()` wraps each step and returns a uniform result envelope: data, exchanges, curl + Node snippets, error + beginner hint, and state.
- Created IDs persist in `state.json`.
- Twilio webhooks are pushed to the browser over Server-Sent Events.
- The browser UI is vanilla ES modules: a progress rail, one module per step, and Rendered / JSON / Code result tabs.

**Tech Stack:** Node.js ≥ 20, Express 4, twilio 6.3.1+, dotenv, `node:test`. No build step, no frontend framework.

**Spec:** `docs/superpowers/specs/2026-11-24-twilio-conversations-tester-design.md`

**Refinements vs. spec (decided while verifying the SDK):**
1. `createApp()` lives in `lib/app.js` so tests can boot it. `server.js` only loads config and listens.
2. The result envelope carries `exchanges[]`: every real HTTP call, including operation polls, captured from the SDK's HTTP client. It replaces the spec's separately built `polls[]`/`request`. `request`/`response` remain as the first exchange.
3. The Simulate endpoint is `POST /api/orchestrator/simulate`, because it is an Orchestrator API call. `routes/channels.js` only serves TwiML.
4. Step 5 also requires the Profile (step 2), because passive capture only links to profiles that already exist.
5. State gains `conversationClosed` (boolean) so the rail can mark step 7 done.
6. Run buttons stay enabled on blocked steps. The step shows a 🔒 banner, and running returns a prerequisite envelope whose hint names the missing step. This teaches the dependency instead of silently disabling the button.

## Global Constraints

- Node.js `>=20` (`"engines": { "node": ">=20" }`). Runtime dependencies are exactly `express`, `twilio` (`^6.3.1`) and `dotenv`. There are no other runtime or dev dependencies.
- The server is CommonJS (`require`). Browser code is ES modules under `public/` (`public/package.json` has `{"type":"module"}`).
- All Twilio calls go through the SDK client created in `lib/twilio.js` and injected via `deps.client`. Routes never `require('twilio')` for REST calls.
- Never return or log `TWILIO_API_SECRET` or `TWILIO_AUTH_TOKEN`. curl snippets use `-u "$TWILIO_API_KEY:$TWILIO_API_SECRET"`.
- Every `/api/*` step endpoint responds HTTP 200 with the result envelope (`ok` true/false). The exceptions are `GET /api/state` and `GET /api/setup/config`, which return plain JSON, and unknown `/api` routes, which return 404 JSON.
- `/webhooks/*` routes always answer 200, even for malformed bodies.
- Server data goes into the DOM only via `textContent`/`append(string)`. The only `innerHTML` input is static `learn` copy written in step modules.
- `.env` and `state.json` are git-ignored. Do not commit the licensed Twilio Sans fonts or the Twilio logo, because the repo is public. Use the Twilio color tokens with the font stack `"Twilio Sans Text", "Source Sans Pro", system-ui, sans-serif`.
- Env var names, exactly: `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_AUTH_TOKEN` (optional), `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER` (optional), `MY_PHONE_NUMBER`, `PUBLIC_URL`, `PORT`.
- Twilio-authored operator IDs, exactly:
  - Summary: `intelligence_operator_01kcv35pnkeysaf6z6cqtbpegn`
  - Sentiment: `intelligence_operator_01kcrvw16kfa88qvgrfmr7y151`
- Orchestrator configuration defaults:
  - `conversationGroupingType: 'GROUP_BY_PROFILE'`
  - `memoryExtractionEnabled: true`
  - SMS/WhatsApp `statusTimeouts { inactive: 5, closed: 30 }`
  - Voice capture rules carry `metadata: { callType: 'PSTN' }` and no `statusTimeouts`.
- Run tests with `npm test` (`node --test`).
- Commit after each task, ending each commit message with: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **Browser reconnects to SSE, or the server restarts.** No event is shown twice and none is swallowed. Event IDs are `<bootId>-<n>`, and the client dedupes by ID (Task 2 test: ids differ across buses).
2. **A Twilio webhook arrives with a non-JSON or empty body.** It still gets 200 and is logged as `INVALID_JSON` instead of crashing or making Twilio retry (Task 6 test).
3. **`state.json` is missing, empty or corrupt** (e.g. edited by hand). The app starts with default state instead of crashing (Task 2 test).
4. **An ID in `state.json` was deleted in the Console.** Calls fail with a 404 hint that suggests Reset. Reset treats 404 as "already deleted" and still clears state (Task 4 and Task 13 tests).
5. **Message text contains quotes or HTML** (e.g. `it's <b>late</b>`). curl snippets stay valid shell (Task 3 test), and the UI shows the text literally because of the DOM constraint above.

---

### Task 1: Project scaffold and config loader

**Files:**
- Create: `package.json`, `.env.example`, `lib/config.js`
- Modify: `.gitignore` (already contains `node_modules/`, `.env`, `state.json`, `.DS_Store`; verify only)
- Test: `test/config.test.js`

**Interfaces:**
- Produces:
  - `loadConfig(env = process.env) → Config`, where `Config = { accountSid, apiKey, apiSecret, authToken, phoneNumber, whatsappNumber, myPhoneNumber, publicUrl, port, problems: string[], hasCredentials: boolean, channels: { sms, voice, whatsapp } }`
  - `publicConfig(config) → { accountSid, phoneNumber, whatsappNumber, myPhoneNumber, publicUrl, channels, problems, hasCredentials }`
  - `E164: RegExp`

- [ ] **Step 1: Create `package.json`, `.env.example`, and install**

`package.json`:
```json
{
  "name": "twilio-conversations-tester",
  "version": "1.0.0",
  "private": true,
  "description": "Step-by-step tester UI for Twilio Conversation Orchestrator, Conversation Memory and Conversation Intelligence",
  "main": "server.js",
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node --test"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.21.2",
    "twilio": "^6.3.1"
  }
}
```

`.env.example`:
```
# Twilio credentials: use an API Key (Console → Account → API keys & tokens)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_key_secret
# Optional: enables signature validation of inbound /channels/* webhooks
TWILIO_AUTH_TOKEN=

# A Twilio number you own with SMS + Voice capability (E.164)
TWILIO_PHONE_NUMBER=+15551234567
# Optional: your registered WhatsApp sender (E.164, no "whatsapp:" prefix needed)
TWILIO_WHATSAPP_NUMBER=
# Your own mobile number; the tester creates a Memory profile for it
MY_PHONE_NUMBER=+15557654321

# Public HTTPS URL that reaches this app (e.g. from `ngrok http 3000`)
PUBLIC_URL=https://xxxx.ngrok-free.app
PORT=3000
```

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json` with no errors.

- [ ] **Step 2: Write the failing test** `test/config.test.js`

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../lib/config'`

- [ ] **Step 4: Implement `lib/config.js`**

```js
// Reads .env values, normalizes them, and lists anything a beginner still needs to fix.
const E164 = /^\+[1-9]\d{6,14}$/;

function loadConfig(env = process.env) {
  const clean = (value) => (value || '').trim();
  const config = {
    accountSid: clean(env.TWILIO_ACCOUNT_SID),
    apiKey: clean(env.TWILIO_API_KEY),
    apiSecret: clean(env.TWILIO_API_SECRET),
    authToken: clean(env.TWILIO_AUTH_TOKEN),
    phoneNumber: clean(env.TWILIO_PHONE_NUMBER),
    whatsappNumber: clean(env.TWILIO_WHATSAPP_NUMBER).replace(/^whatsapp:/, ''),
    myPhoneNumber: clean(env.MY_PHONE_NUMBER),
    publicUrl: clean(env.PUBLIC_URL).replace(/\/+$/, ''),
    port: Number(env.PORT) || 3000,
  };

  const problems = [];
  const sidOk = /^AC[0-9a-f]{32}$/i.test(config.accountSid);
  const keyOk = /^SK[0-9a-f]{32}$/i.test(config.apiKey);
  if (!sidOk) problems.push('TWILIO_ACCOUNT_SID is missing or is not an AC… Account SID');
  if (!keyOk) problems.push('TWILIO_API_KEY is missing or is not an SK… API Key SID');
  if (!config.apiSecret) problems.push('TWILIO_API_SECRET is missing');
  if (!E164.test(config.phoneNumber)) problems.push('TWILIO_PHONE_NUMBER is missing or not in E.164 format (e.g. +15551234567)');
  if (!E164.test(config.myPhoneNumber)) problems.push('MY_PHONE_NUMBER is missing or not in E.164 format (e.g. +15551234567)');
  if (config.whatsappNumber && !E164.test(config.whatsappNumber)) problems.push('TWILIO_WHATSAPP_NUMBER is not in E.164 format');
  if (!/^https:\/\//.test(config.publicUrl)) problems.push('PUBLIC_URL is missing or not https:// (start ngrok and paste its URL)');

  config.problems = problems;
  config.hasCredentials = sidOk && keyOk && Boolean(config.apiSecret);
  config.channels = {
    sms: E164.test(config.phoneNumber),
    voice: E164.test(config.phoneNumber),
    whatsapp: E164.test(config.whatsappNumber),
  };
  return config;
}

// The subset of config that is safe to send to the browser.
function publicConfig(config) {
  const { accountSid, phoneNumber, whatsappNumber, myPhoneNumber, publicUrl, channels, problems, hasCredentials } = config;
  return { accountSid, phoneNumber, whatsappNumber, myPhoneNumber, publicUrl, channels, problems, hasCredentials };
}

module.exports = { loadConfig, publicConfig, E164 };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example lib/config.js test/config.test.js
git commit -m "feat: scaffold project and config loader

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: State store and event bus

**Files:**
- Create: `lib/state.js`, `lib/events.js`
- Test: `test/state.test.js`, `test/events.test.js`

**Interfaces:**
- Produces:
  - `DEFAULT_STATE = { storeId: null, profileId: null, operatorId: null, intelligenceConfigId: null, intelligenceRuleIds: [], orchestratorConfigId: null, conversationId: null, conversationClosed: false, createdAt: {} }`
  - `createState(filePath) → { get(): State, set(patch): State, reset(): State }`. `set` records `createdAt[key] = ISO` for each non-null key in the patch.
  - `createEventBus({ size = 200 } = {}) → { publish(source, type, payload) → Event, recent(filter?) → Event[], subscribe(fn) → unsubscribe, clear() }`, where `Event = { id: '<bootId>-<n>', at: ISO, source, type, payload }`.

- [ ] **Step 1: Write the failing tests**

`test/state.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createState, DEFAULT_STATE } = require('../lib/state');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'state-')), 'state.json');

test('starts from defaults when the file does not exist', () => {
  assert.deepEqual(createState(tmpFile()).get(), DEFAULT_STATE);
});

test('set merges, persists to disk, and stamps createdAt', () => {
  const file = tmpFile();
  const state = createState(file);
  state.set({ storeId: 'mem_store_1' });
  const reloaded = createState(file).get();
  assert.equal(reloaded.storeId, 'mem_store_1');
  assert.ok(reloaded.createdAt.storeId);
  assert.equal(reloaded.profileId, null);
});

test('get returns a copy that callers cannot mutate', () => {
  const state = createState(tmpFile());
  state.get().intelligenceRuleIds.push('x');
  assert.deepEqual(state.get().intelligenceRuleIds, []);
});

test('reset restores defaults', () => {
  const state = createState(tmpFile());
  state.set({ storeId: 'a', conversationClosed: true });
  assert.deepEqual(state.reset(), DEFAULT_STATE);
});

test('a corrupt or empty state file falls back to defaults', () => {
  for (const contents of ['{not json', '']) {
    const file = tmpFile();
    fs.writeFileSync(file, contents);
    assert.deepEqual(createState(file).get(), DEFAULT_STATE);
  }
});
```

`test/events.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventBus } = require('../lib/events');

test('publish stores events and notifies subscribers', () => {
  const bus = createEventBus();
  const seen = [];
  const unsubscribe = bus.subscribe((e) => seen.push(e));
  const event = bus.publish('orchestrator', 'COMMUNICATION_CREATED', { a: 1 });
  assert.equal(event.source, 'orchestrator');
  assert.equal(seen.length, 1);
  unsubscribe();
  bus.publish('orchestrator', 'X', {});
  assert.equal(seen.length, 1);
  assert.equal(bus.recent().length, 2);
});

test('ring buffer keeps only the newest events', () => {
  const bus = createEventBus({ size: 3 });
  for (let i = 0; i < 5; i += 1) bus.publish('channels', `E${i}`, {});
  assert.deepEqual(bus.recent().map((e) => e.type), ['E2', 'E3', 'E4']);
});

test('recent accepts a filter and clear empties the buffer', () => {
  const bus = createEventBus();
  bus.publish('intelligence', 'A', {});
  bus.publish('channels', 'B', {});
  assert.equal(bus.recent((e) => e.source === 'intelligence').length, 1);
  bus.clear();
  assert.equal(bus.recent().length, 0);
});

test('event ids are unique across server restarts (new buses)', () => {
  const a = createEventBus().publish('x', 'y', {});
  const b = createEventBus().publish('x', 'y', {});
  assert.notEqual(a.id, b.id);
});

test('a throwing subscriber does not break publishing', () => {
  const bus = createEventBus();
  bus.subscribe(() => { throw new Error('boom'); });
  assert.doesNotThrow(() => bus.publish('x', 'y', {}));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../lib/state'` and `'../lib/events'`

- [ ] **Step 3: Implement `lib/state.js`**

```js
// Remembers the IDs each step creates (store, profile, configs, conversation) in state.json,
// so later steps can pre-fill their forms. Delete state.json (or use Reset) to start over.
const fs = require('node:fs');

const DEFAULT_STATE = Object.freeze({
  storeId: null,
  profileId: null,
  operatorId: null,
  intelligenceConfigId: null,
  intelligenceRuleIds: [],
  orchestratorConfigId: null,
  conversationId: null,
  conversationClosed: false,
  createdAt: {},
});

const defaults = () => structuredClone(DEFAULT_STATE);

function createState(filePath) {
  let data = load();

  function load() {
    try {
      return { ...defaults(), ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
    } catch {
      return defaults();
    }
  }

  function save() {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  return {
    get: () => structuredClone(data),
    set(patch) {
      const now = new Date().toISOString();
      data = { ...data, ...patch, createdAt: { ...data.createdAt } };
      for (const [key, value] of Object.entries(patch)) {
        if (value != null && value !== false && key !== 'createdAt') data.createdAt[key] = now;
      }
      save();
      return structuredClone(data);
    },
    reset() {
      data = defaults();
      save();
      return structuredClone(data);
    },
  };
}

module.exports = { createState, DEFAULT_STATE };
```

- [ ] **Step 4: Implement `lib/events.js`**

```js
// In-memory event bus. Webhooks publish here; GET /events streams events to the browser (SSE).
// Event ids include a boot id so a browser that reconnects after a server restart never
// mistakes new events for ones it has already shown.
function createEventBus({ size = 200 } = {}) {
  const bootId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const buffer = [];
  const listeners = new Set();
  let counter = 0;

  return {
    publish(source, type, payload) {
      counter += 1;
      const event = { id: `${bootId}-${counter}`, at: new Date().toISOString(), source, type, payload };
      buffer.push(event);
      if (buffer.length > size) buffer.shift();
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error('Event listener failed:', err.message);
        }
      }
      return event;
    },
    recent: (filter = () => true) => buffer.filter(filter),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      buffer.length = 0;
    },
  };
}

module.exports = { createEventBus };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all config, state and events tests)

- [ ] **Step 6: Commit**

```bash
git add lib/state.js lib/events.js test/state.test.js test/events.test.js
git commit -m "feat: add state store and event bus

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: HTTP capture, Twilio client, and snippets

**Files:**
- Create: `lib/capture.js`, `lib/twilio.js`, `lib/snippets.js`
- Test: `test/capture.test.js`, `test/snippets.test.js`

**Interfaces:**
- Consumes: `Config` (Task 1).
- Produces:
  - `captureExchanges(fn) → Promise<{ exchanges: Exchange[], value?, error? }>`. It never rejects.
  - `recordExchange(exchange)`: pushes to the current capture, or is a no-op outside one.
  - `CapturingRequestClient` (extends `twilio.RequestClient`).
  - `Exchange = { request: { method, url, body, contentType }, response: { status, headers, body } | null, networkError?, durationMs }`
  - `createTwilioClient(config) → TwilioClient | null` (null when `!config.hasCredentials`).
  - `toCurl(request) → string`, `curlForExchanges(exchanges) → string`, and `call(path, ...args) → string`. `call` returns a JS expression without `await`, e.g. `client.memory.v1.stores.create({...})`.

- [ ] **Step 1: Write the failing tests**

`test/capture.test.js`:
```js
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
    password: 'secret',
    data: { displayName: 'Demo' },
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(exchanges.length, 1);
  const [x] = exchanges;
  assert.deepEqual(x.request, { method: 'POST', url: 'https://memory.twilio.com/v1/ControlPlane/Stores', body: { displayName: 'Demo' }, contentType: 'application/json' });
  assert.equal(x.response.status, 202);
  assert.deepEqual(x.response.headers, { 'retry-after': '2' });
  assert.ok(!JSON.stringify(x).includes('secret'));
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
```

`test/snippets.test.js`:
```js
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

test('call renders an SDK expression with pretty JSON args', () => {
  assert.equal(call('client.memory.v1.stores.create', { displayName: 'A' }), 'client.memory.v1.stores.create({\n  "displayName": "A"\n})');
  assert.equal(call('client.memory.v1.stores("x").fetch'), 'client.memory.v1.stores("x").fetch()');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../lib/capture'` and `'../lib/snippets'`

- [ ] **Step 3: Implement `lib/capture.js`**

```js
// Records every HTTP call the Twilio SDK makes during a step, so the UI can show the exact
// request/response (including each async-operation poll). AsyncLocalStorage keeps
// concurrent steps from mixing their calls.
const { AsyncLocalStorage } = require('node:async_hooks');
const twilio = require('twilio');

const storage = new AsyncLocalStorage();
const KEPT_HEADERS = ['retry-after', 'location', 'twilio-request-id', 'content-type'];

async function captureExchanges(fn) {
  const exchanges = [];
  try {
    const value = await storage.run(exchanges, fn);
    return { exchanges, value };
  } catch (error) {
    return { exchanges, error };
  }
}

function recordExchange(exchange) {
  const store = storage.getStore();
  if (store) store.push(exchange);
}

function buildUrl(uri, params) {
  if (!params || Object.keys(params).length === 0) return uri;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    for (const item of [].concat(value)) query.append(key, item instanceof Date ? item.toISOString() : String(item));
  }
  const qs = query.toString();
  return qs ? `${uri}?${qs}` : uri;
}

function pickHeaders(headers = {}) {
  const kept = {};
  for (const name of KEPT_HEADERS) {
    const value = headers[name];
    if (value !== undefined && value !== null) kept[name] = String(value);
  }
  return kept;
}

function parseBody(body) {
  if (typeof body !== 'string') return body ?? null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

class CapturingRequestClient extends twilio.RequestClient {
  async request(opts) {
    const startedAt = Date.now();
    const request = {
      method: String(opts.method).toUpperCase(),
      url: buildUrl(opts.uri, opts.params),
      body: opts.data ?? null,
      contentType: opts.headers?.['Content-Type'] ?? null,
    };
    try {
      const res = await super.request(opts);
      recordExchange({
        request,
        response: { status: res.statusCode, headers: pickHeaders(res.headers), body: parseBody(res.body) },
        durationMs: Date.now() - startedAt,
      });
      return res;
    } catch (err) {
      recordExchange({ request, response: null, networkError: err.message, durationMs: Date.now() - startedAt });
      throw err;
    }
  }
}

module.exports = { captureExchanges, recordExchange, CapturingRequestClient };
```

- [ ] **Step 4: Implement `lib/twilio.js`**

```js
// The one Twilio client the whole app shares. It authenticates with an API Key + Secret
// (recommended over the Auth Token) and records HTTP traffic for the UI.
const twilio = require('twilio');
const { CapturingRequestClient } = require('./capture');

function createTwilioClient(config) {
  if (!config.hasCredentials) return null;
  return twilio(config.apiKey, config.apiSecret, {
    accountSid: config.accountSid,
    httpClient: new CapturingRequestClient(),
  });
}

module.exports = { createTwilioClient };
```

- [ ] **Step 5: Implement `lib/snippets.js`**

```js
// Turns captured requests into copy-pasteable curl commands and SDK calls.
const shellQuote = (text) => text.replace(/'/g, `'\\''`);

function toCurl({ method, url, body, contentType }) {
  const lines = [`curl -X ${method} '${shellQuote(url)}'`, `  -u "$TWILIO_API_KEY:$TWILIO_API_SECRET"`];
  if (body != null && method !== 'GET') {
    if (contentType === 'application/x-www-form-urlencoded') {
      for (const [key, value] of Object.entries(body)) lines.push(`  --data-urlencode '${shellQuote(`${key}=${value}`)}'`);
    } else {
      lines.push(`  -H 'Content-Type: application/json'`);
      lines.push(`  -d '${shellQuote(JSON.stringify(body, null, 2))}'`);
    }
  }
  return lines.join(' \\\n');
}

function curlForExchanges(exchanges = []) {
  const seen = new Set();
  const commands = [];
  for (const { request } of exchanges) {
    if (!request) continue;
    const key = `${request.method} ${request.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    commands.push(toCurl(request));
  }
  return commands.join('\n\n');
}

function call(path, ...args) {
  return `${path}(${args.map((arg) => JSON.stringify(arg, null, 2)).join(', ')})`;
}

module.exports = { toCurl, curlForExchanges, call };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. If the `CapturingRequestClient` test fails because `twilio.RequestClient` internals changed (for example, it no longer calls `this.axios(options)`), stub at whatever method `RequestClient.request` delegates to. Check this in `node_modules/twilio/lib/base/RequestClient.js`; it calls `this.axios(options)` in 6.3.1.

- [ ] **Step 7: Commit**

```bash
git add lib/capture.js lib/twilio.js lib/snippets.js test/capture.test.js test/snippets.test.js
git commit -m "feat: capture SDK HTTP traffic and generate curl/Node snippets

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Errors, hints and the result recorder

**Files:**
- Create: `lib/errors.js`, `lib/recorder.js`
- Test: `test/errors.test.js`, `test/recorder.test.js`

**Interfaces:**
- Consumes: `captureExchanges` (Task 3), `curlForExchanges` (Task 3).
- Produces:
  - `PrereqError` (`code === 'PREREQUISITE'`)
  - `requireState(state, keys)`, `requireClient(client) → client`, `requireValue(value, message) → value`
  - `toErrorInfo(err) → { name, status, code, message, moreInfo, details }`
  - `hintFor(errorInfo) → string | null`
  - `record({ step, code = [], state }, fn) → Promise<Envelope>`, where `Envelope = { ok, step, durationMs, request, response, exchanges, snippet: { node, curl }, data, state, error, hint }`
  - `respond(handler)`: an Express handler that awaits `handler(req)` and `res.json`s the result.

- [ ] **Step 1: Write the failing tests**

`test/errors.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { PrereqError, requireState, requireValue, requireClient, toErrorInfo, hintFor } = require('../lib/errors');

test('requireState names the step that creates each missing value', () => {
  assert.throws(() => requireState({ storeId: null, profileId: null }, ['storeId', 'profileId']), (err) => {
    assert.ok(err instanceof PrereqError);
    assert.match(err.message, /Step 1.*Step 2/);
    return true;
  });
  assert.doesNotThrow(() => requireState({ storeId: 'x' }, ['storeId']));
});

test('requireValue and requireClient throw PrereqError', () => {
  assert.throws(() => requireValue('', 'need it'), /need it/);
  assert.throws(() => requireClient(null), /credentials/);
  assert.equal(requireValue('ok', 'x'), 'ok');
});

test('toErrorInfo copies Twilio RestException fields', () => {
  const err = Object.assign(new Error('Forbidden'), { status: 403, code: 20403, moreInfo: 'https://twilio.com/docs/errors/20403', details: { a: 1 } });
  assert.deepEqual(toErrorInfo(err), { name: 'Error', status: 403, code: 20403, message: 'Forbidden', moreInfo: 'https://twilio.com/docs/errors/20403', details: { a: 1 } });
});

test('hints cover the common beginner failures', () => {
  assert.match(hintFor({ status: 401, message: 'Authenticate' }), /TWILIO_API_KEY/);
  assert.match(hintFor({ status: 403, message: 'Forbidden' }), /new Twilio Console/);
  assert.match(hintFor({ status: 404, message: 'Not found' }), /Reset/);
  assert.match(hintFor({ status: 400, message: 'Configuration limit exceeded' }), /limit/);
  assert.match(hintFor({ code: 'OPERATION_TIMEOUT', message: 'x' }), /still processing/);
  assert.equal(hintFor({ code: 'PREREQUISITE', message: 'Do step 1' }), 'Do step 1');
  assert.equal(hintFor({ status: 500, message: 'oops' }), null);
});
```

`test/recorder.test.js`:
```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../lib/errors'` and `'../lib/recorder'`

- [ ] **Step 3: Implement `lib/errors.js`**

```js
// Friendly errors for beginners: missing prerequisites, and hints for common Twilio failures.
class PrereqError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrereqError';
    this.code = 'PREREQUISITE';
  }
}

const STATE_LABELS = {
  storeId: 'Step 1 (create a Memory Store)',
  profileId: 'Step 2 (create your Profile)',
  intelligenceConfigId: 'Step 4 (create an Intelligence Configuration)',
  orchestratorConfigId: 'Step 5 (create a Conversation Configuration)',
  conversationId: 'Step 6 (start a conversation)',
};

function requireState(state, keys) {
  const missing = keys.filter((key) => !state[key]);
  if (missing.length) throw new PrereqError(`Complete ${missing.map((key) => STATE_LABELS[key] || key).join(' and ')} first.`);
}

function requireValue(value, message) {
  if (!value) throw new PrereqError(message);
  return value;
}

function requireClient(client) {
  return requireValue(client, 'Twilio credentials are missing. Fill in TWILIO_ACCOUNT_SID, TWILIO_API_KEY and TWILIO_API_SECRET in .env, then restart the server.');
}

function toErrorInfo(err) {
  return {
    name: err.name,
    status: err.status ?? null,
    code: err.code ?? null,
    message: err.message,
    moreInfo: err.moreInfo ?? null,
    details: err.details ?? null,
  };
}

function hintFor(error) {
  const message = String(error.message || '');
  if (error.code === 'PREREQUISITE') return error.message;
  if (error.code === 'OPERATION_TIMEOUT') return 'Twilio is still processing this request. Wait a minute, then refresh or run the step again.';
  if (error.code === 'OPERATION_FAILED') return 'Twilio accepted the request, but the async operation failed. The error details explain why.';
  if (error.status === 401 || error.code === 20003) return 'Authentication failed. Check TWILIO_ACCOUNT_SID, TWILIO_API_KEY and TWILIO_API_SECRET in .env (the API key must belong to this account).';
  if (/limit|maximum|quota/i.test(message)) return 'You hit an account limit (10 conversation configurations, 15 memory stores). Use Reset, or delete old resources in the Twilio Console.';
  if (/capture rule|overlap|conflict/i.test(message)) return 'Another conversation configuration already captures this number. Delete it in the Twilio Console or remove its capture rules.';
  if (error.status === 403) return 'Access denied. These APIs need an account on the new Twilio Console (1console.twilio.com) with the product enabled and the AI/ML Features Addendum accepted.';
  if (error.status === 404) return 'Not found. The ID saved in state.json may have been deleted (use Reset), or the product is not enabled on this account (new Console only).';
  if (error.status === 400 || error.status === 422) return 'Twilio rejected the request body. Compare the JSON tab with the API reference linked in this step.';
  return null;
}

module.exports = { PrereqError, requireState, requireValue, requireClient, toErrorInfo, hintFor };
```

- [ ] **Step 4: Implement `lib/recorder.js`**

```js
// Wraps one tester step: runs it, captures every HTTP call, and returns the uniform
// envelope the UI renders (Rendered / JSON / Code tabs).
const { captureExchanges } = require('./capture');
const { curlForExchanges } = require('./snippets');
const { toErrorInfo, hintFor } = require('./errors');

const EXPECTED_ERROR_CODES = new Set(['PREREQUISITE', 'OPERATION_TIMEOUT', 'OPERATION_FAILED']);

async function record({ step, code = [], state }, fn) {
  const startedAt = Date.now();
  const { exchanges, value, error } = await captureExchanges(fn);
  const errorInfo = error ? toErrorInfo(error) : null;
  if (error && !error.status && !EXPECTED_ERROR_CODES.has(error.code)) console.error(`[${step}]`, error);

  return {
    ok: !error,
    step,
    durationMs: Date.now() - startedAt,
    request: exchanges[0]?.request ?? null,
    response: exchanges[0]?.response ?? null,
    exchanges,
    snippet: { node: code.join('\n'), curl: curlForExchanges(exchanges) },
    data: error ? null : value ?? null,
    state: state ? state.get() : null,
    error: errorInfo,
    hint: errorInfo ? hintFor(errorInfo) : null,
  };
}

const respond = (handler) => async (req, res, next) => {
  try {
    res.json(await handler(req));
  } catch (err) {
    next(err);
  }
};

module.exports = { record, respond };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/errors.js lib/recorder.js test/errors.test.js test/recorder.test.js
git commit -m "feat: add result recorder with beginner-friendly error hints

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Async operation polling

**Files:**
- Create: `lib/operations.js`
- Test: `test/operations.test.js`

**Interfaces:**
- Consumes: the Twilio client shape, which has `client.memory.v1.operations(id).fetchWithHttpInfo()` and `client.conversations.v2.operations(id).fetchWithHttpInfo()`. Each returns `{ body, headers, statusCode }`.
- Produces:
  - `pollUntil(fetchOnce, isDone, { timeoutMs = 60000, initialDelayMs = 1000, maxDelayMs = 5000, sleep, now }) → value`, where `fetchOnce: () => Promise<{ value, retryAfterMs? }>`
  - `waitForOperation(client, statusUrl, options) → OperationInstance` (status `COMPLETED`)
  - `OperationError` (`code`: `'OPERATION_TIMEOUT' | 'OPERATION_FAILED'`, `details`: last operation)

- [ ] **Step 1: Write the failing test** `test/operations.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { waitForOperation, pollUntil } = require('../lib/operations');

function fakeClient(responses) {
  const fetchWithHttpInfo = mock.fn(async () => responses.shift());
  const operations = mock.fn(() => ({ fetchWithHttpInfo }));
  return { client: { memory: { v1: { operations } }, conversations: { v2: { operations } } }, operations, fetchWithHttpInfo };
}
const noSleep = mock.fn(async () => {});

test('polls a memory operation until COMPLETED', async () => {
  const { client, operations, fetchWithHttpInfo } = fakeClient([
    { body: { status: 'PENDING' }, headers: {} },
    { body: { status: 'RUNNING' }, headers: {} },
    { body: { status: 'COMPLETED', result: { id: 'mem_store_1' } }, headers: {} },
  ]);
  const op = await waitForOperation(client, 'https://memory.twilio.com/v1/ControlPlane/Operations/op_123', { sleep: noSleep });
  assert.equal(op.result.id, 'mem_store_1');
  assert.equal(operations.mock.calls[0].arguments[0], 'op_123');
  assert.equal(fetchWithHttpInfo.mock.callCount(), 3);
});

test('routes conversations.twilio.com URLs to the Orchestrator operations API', async () => {
  const memoryOps = mock.fn();
  const convOps = mock.fn(() => ({ fetchWithHttpInfo: async () => ({ body: { status: 'COMPLETED' }, headers: {} }) }));
  const client = { memory: { v1: { operations: memoryOps } }, conversations: { v2: { operations: convOps } } };
  await waitForOperation(client, 'https://conversations.twilio.com/v2/ControlPlane/Operations/op_9', { sleep: noSleep });
  assert.equal(convOps.mock.calls[0].arguments[0], 'op_9');
  assert.equal(memoryOps.mock.callCount(), 0);
});

test('FAILED operations throw OPERATION_FAILED with the operation error message', async () => {
  const { client } = fakeClient([{ body: { status: 'FAILED', error: { message: 'Display name taken' } }, headers: {} }]);
  await assert.rejects(waitForOperation(client, 'https://memory.twilio.com/v1/ControlPlane/Operations/x', { sleep: noSleep }), (err) => {
    assert.equal(err.code, 'OPERATION_FAILED');
    assert.match(err.message, /Display name taken/);
    return true;
  });
});

test('times out with OPERATION_TIMEOUT', async () => {
  let clock = 0;
  const pending = { body: { status: 'PENDING' }, headers: {} };
  const { client } = fakeClient(Array.from({ length: 50 }, () => pending));
  await assert.rejects(
    waitForOperation(client, 'https://memory.twilio.com/v1/ControlPlane/Operations/x', { sleep: async () => {}, now: () => (clock += 10000), timeoutMs: 30000 }),
    (err) => err.code === 'OPERATION_TIMEOUT',
  );
});

test('honors Retry-After (seconds) and backs off otherwise', async () => {
  const sleep = mock.fn(async () => {});
  const { client } = fakeClient([
    { body: { status: 'PENDING' }, headers: { 'retry-after': '2' } },
    { body: { status: 'PENDING' }, headers: {} },
    { body: { status: 'COMPLETED' }, headers: {} },
  ]);
  await waitForOperation(client, 'https://memory.twilio.com/v1/ControlPlane/Operations/x', { sleep });
  assert.deepEqual(sleep.mock.calls.map((c) => c.arguments[0]), [2000, 1500]);
});

test('missing statusUrl is an OPERATION_FAILED error', async () => {
  await assert.rejects(waitForOperation({}, undefined), (err) => err.code === 'OPERATION_FAILED');
});

test('pollUntil returns the first value that satisfies isDone', async () => {
  const values = [1, 2, 3];
  const result = await pollUntil(async () => ({ value: values.shift() }), (v) => v === 2, { sleep: async () => {} });
  assert.equal(result, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../lib/operations'`

- [ ] **Step 3: Implement `lib/operations.js`**

```js
// Some Twilio calls (creating a Memory Store or a Conversation Configuration) are async:
// Twilio replies 202 Accepted with a statusUrl, and you poll that Operation until it is done.
class OperationError extends Error {
  constructor(code, message, operation) {
    super(message);
    this.name = 'OperationError';
    this.code = code;
    this.details = operation ?? null;
  }
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntil(fetchOnce, isDone, { timeoutMs = 60000, initialDelayMs = 1000, maxDelayMs = 5000, sleep = defaultSleep, now = Date.now } = {}) {
  const startedAt = now();
  let delay = initialDelayMs;
  for (;;) {
    const { value, retryAfterMs } = await fetchOnce();
    if (isDone(value)) return value;
    if (now() - startedAt >= timeoutMs) {
      throw new OperationError('OPERATION_TIMEOUT', `Still not finished after ${Math.round(timeoutMs / 1000)}s`, value);
    }
    await sleep(retryAfterMs ?? delay);
    delay = Math.min(Math.round(delay * 1.5), maxDelayMs);
  }
}

function operationContext(client, statusUrl) {
  const url = new URL(statusUrl);
  const operationId = url.pathname.split('/').filter(Boolean).pop();
  if (url.hostname.startsWith('memory.')) return client.memory.v1.operations(operationId);
  if (url.hostname.startsWith('conversations.')) return client.conversations.v2.operations(operationId);
  throw new OperationError('OPERATION_FAILED', `Don't know how to poll ${statusUrl}`);
}

function retryAfterMs(headers = {}) {
  const seconds = Number(headers['retry-after']);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 10) * 1000 : undefined;
}

async function waitForOperation(client, statusUrl, options = {}) {
  if (!statusUrl) throw new OperationError('OPERATION_FAILED', 'Twilio did not return a statusUrl to poll.');
  const operation = operationContext(client, statusUrl);
  const result = await pollUntil(
    async () => {
      const res = await operation.fetchWithHttpInfo();
      return { value: res.body, retryAfterMs: retryAfterMs(res.headers) };
    },
    (op) => TERMINAL.has(op?.status),
    options,
  );
  if (result.status !== 'COMPLETED') {
    throw new OperationError('OPERATION_FAILED', result.error?.message || `Operation ended with status ${result.status}`, result);
  }
  return result;
}

module.exports = { pollUntil, waitForOperation, OperationError };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/operations.js test/operations.test.js
git commit -m "feat: poll Twilio async operations with backoff and Retry-After

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Express app, SSE stream and webhook receivers

**Files:**
- Create: `lib/app.js`, `server.js`, `routes/webhooks.js`, `test/_support/harness.js`
- Test: `test/app.test.js`, `test/webhooks.test.js`

**Interfaces:**
- Consumes: `createState`, `createEventBus`, `loadConfig`, `createTwilioClient`.
- Produces:
  - `createApp({ config, client, state, events, sleep?, fetchImpl? }) → express.Application`. It mounts:
    - `GET /health` → `{ ok: true, app: 'conversations-tester' }`
    - `GET /events` (SSE)
    - `GET /api/state`
    - `/webhooks`, `/channels`, `/api/setup`, `/api/memory`, `/api/intelligence`, `/api/orchestrator`, `/api/reset`
    - a 404 JSON fallback for `/api/*`
    - static files from `public/`
  - Route modules are factories `xxxRoutes(deps) → express.Router`. Until each product task creates its module, `lib/app.js` mounts only what exists (see Step 3).
  - Test harness: `startApp({ client?, config?, env?, fetchImpl? }) → { url, state, events, config, get(path), post(path, body), postForm(path, form, headers?), close() }`, `TEST_ENV`, `callable(fn, props)`.

- [ ] **Step 1: Create the test harness** `test/_support/harness.js`

```js
// Boots the real Express app on a random port with a fake Twilio client.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../../lib/app');
const { createState } = require('../../lib/state');
const { createEventBus } = require('../../lib/events');
const { loadConfig } = require('../../lib/config');

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
  const appConfig = config || loadConfig({ ...TEST_ENV, ...env });
  const app = createApp({ config: appConfig, client, state, events, sleep: async () => {}, fetchImpl });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const asJson = async (res) => ({ status: res.status, ...(await res.json()) });
  return {
    url,
    state,
    events,
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
```

- [ ] **Step 2: Write the failing tests**

`test/app.test.js`:
```js
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
```

`test/webhooks.test.js`:
```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../../lib/app'`

- [ ] **Step 4: Implement `routes/webhooks.js`**

```js
// Twilio calls these URLs. Orchestrator sends status callbacks (conversation, participant and
// communication events). Intelligence sends operator results from the rule's WEBHOOK action.
// We always answer 200 quickly so Twilio does not retry, and forward everything to the live log.
const express = require('express');

function parse(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, raw: raw || '' };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, raw };
  }
}

function webhookRoutes({ state, events }) {
  const router = express.Router();
  router.use(express.text({ type: '*/*', limit: '1mb' }));

  router.post('/orchestrator', (req, res) => {
    try {
      const parsed = parse(req.body);
      if (!parsed.ok) {
        events.publish('orchestrator', 'INVALID_JSON', { raw: parsed.raw });
      } else {
        const body = parsed.body;
        events.publish('orchestrator', body.eventType || 'UNKNOWN', body);
        const current = state.get();
        const isOurs = !current.orchestratorConfigId || body.data?.configurationId === current.orchestratorConfigId;
        if (body.eventType === 'CONVERSATION_CREATED' && body.data?.id && !current.conversationId && isOurs) {
          state.set({ conversationId: body.data.id, conversationClosed: false });
        }
      }
    } catch (err) {
      console.error('Orchestrator webhook handling failed:', err);
    }
    res.sendStatus(200);
  });

  router.post('/intelligence', (req, res) => {
    try {
      const parsed = parse(req.body);
      if (parsed.ok) events.publish('intelligence', 'OPERATOR_RESULTS', parsed.body);
      else events.publish('intelligence', 'INVALID_JSON', { raw: parsed.raw });
    } catch (err) {
      console.error('Intelligence webhook handling failed:', err);
    }
    res.sendStatus(200);
  });

  return router;
}

module.exports = { webhookRoutes };
```

- [ ] **Step 5: Implement `lib/app.js`**

Later tasks create route modules. To keep this task self-contained, `lib/app.js` mounts each product router through `optionalRoutes`, which skips modules that don't exist yet. Task 13 replaces it with direct requires.

```js
// Builds the Express app. server.js starts it; tests boot it with a fake Twilio client.
const path = require('node:path');
const express = require('express');
const { webhookRoutes } = require('../routes/webhooks');

function optionalRoutes(modulePath, exportName, deps) {
  try {
    return require(modulePath)[exportName](deps);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes(modulePath.replace('../', ''))) return null;
    throw err;
  }
}

function sse(events) {
  return (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (event) => res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    events.recent().forEach(send);
    const unsubscribe = events.subscribe(send);
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  };
}

function createApp({ config, client, state, events, sleep, fetchImpl = fetch }) {
  const deps = { config, client, state, events, sleep, fetchImpl };
  const app = express();

  app.get('/health', (req, res) => res.json({ ok: true, app: 'conversations-tester' }));
  app.get('/events', sse(events));
  app.use('/webhooks', webhookRoutes(deps));

  const channels = optionalRoutes('../routes/channels', 'channelRoutes', deps);
  if (channels) app.use('/channels', channels);

  app.use('/api', express.json({ limit: '1mb' }));
  app.get('/api/state', (req, res) => res.json(state.get()));
  const apiRoutes = [
    ['/api/setup', '../routes/setup', 'setupRoutes'],
    ['/api/memory', '../routes/memory', 'memoryRoutes'],
    ['/api/intelligence', '../routes/intelligence', 'intelligenceRoutes'],
    ['/api/orchestrator', '../routes/orchestrator', 'orchestratorRoutes'],
    ['/api/reset', '../routes/reset', 'resetRoutes'],
  ];
  for (const [mount, modulePath, exportName] of apiRoutes) {
    const router = optionalRoutes(modulePath, exportName, deps);
    if (router) app.use(mount, router);
  }
  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: { message: `No route ${req.method} /api${req.path}` } }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ ok: false, error: { message: err.message } });
  });
  return app;
}

module.exports = { createApp };
```

- [ ] **Step 6: Implement `server.js` and a placeholder UI shell**

`server.js`:
```js
// Entry point: `npm start`. Loads .env, wires dependencies, and starts the tester UI.
require('dotenv').config();
const path = require('node:path');
const { loadConfig } = require('./lib/config');
const { createTwilioClient } = require('./lib/twilio');
const { createState } = require('./lib/state');
const { createEventBus } = require('./lib/events');
const { createApp } = require('./lib/app');

const config = loadConfig();
const app = createApp({
  config,
  client: createTwilioClient(config),
  state: createState(path.join(__dirname, 'state.json')),
  events: createEventBus(),
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
```

`public/index.html` (temporary shell; Task 14 replaces it):
```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Twilio Conversations Tester</title></head>
<body><p>Conversations Tester is starting…</p></body></html>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (app and webhooks tests plus all earlier tests)

- [ ] **Step 8: Smoke-test the server**

Run: `PORT=3999 node server.js & sleep 1; curl -s localhost:3999/health; kill %1`
Expected: prints `{"ok":true,"app":"conversations-tester"}`, plus setup warnings, because `.env` is not set.

- [ ] **Step 9: Commit**

```bash
git add lib/app.js server.js routes/webhooks.js public/index.html test/_support/harness.js test/app.test.js test/webhooks.test.js
git commit -m "feat: add Express app, SSE event stream and webhook receivers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Step 0 setup routes

**Files:**
- Create: `routes/setup.js`
- Test: `test/setup.test.js`

**Interfaces:**
- Consumes: `record`, `respond`, `requireClient`, `requireValue`, `call`, `publicConfig`, and `deps.fetchImpl`.
- Produces:
  - `setupRoutes(deps)`
  - `GET /api/setup/config` → `{ config: publicConfig, state, defaults }`. `defaults` comes from `lib/builders.js` in Task 8. Until then, Task 7 returns `defaults: {}`, and Task 8 Step 6 wires it in.
  - `POST /api/setup/check` → envelope with `data = { checks: Check[], number }`, where `Check = { id, label, ok, optional?, detail, fix? }`
  - `POST /api/setup/point-number` → envelope with `data = { sid, smsUrl, voiceUrl }`

- [ ] **Step 1: Write the failing test** `test/setup.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp, callable } = require('./_support/harness');

const PUBLIC = 'https://tester.example.ngrok.app';

function fakeClient({ number }) {
  const update = mock.fn(async (params) => ({ sid: number?.sid, ...params }));
  const client = {
    api: { v2010: { accounts: () => ({ fetch: async () => ({ friendlyName: 'My Account', status: 'active' }) }) } },
    incomingPhoneNumbers: callable(() => ({ update }), { list: mock.fn(async () => (number ? [number] : [])) }),
  };
  return { client, update };
}

const healthyFetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, app: 'conversations-tester' }) });

test('config endpoint returns safe config, state and defaults', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const res = await app.get('/api/setup/config');
  assert.equal(res.config.phoneNumber, '+15550001111');
  assert.ok(!('apiSecret' in res.config));
  assert.equal(res.state.storeId, null);
  assert.ok('defaults' in res);
});

test('check reports every item as ok for a fully set-up account', async (t) => {
  const number = { sid: 'PN1', phoneNumber: '+15550001111', capabilities: { sms: true, voice: true }, smsUrl: `${PUBLIC}/channels/sms`, voiceUrl: `${PUBLIC}/channels/voice` };
  const { client } = fakeClient({ number });
  const app = await startApp({ client, fetchImpl: healthyFetch });
  t.after(app.close);
  const env = await app.post('/api/setup/check');
  assert.equal(env.ok, true);
  const byId = Object.fromEntries(env.data.checks.map((c) => [c.id, c]));
  for (const id of ['env', 'credentials', 'number', 'webhooks', 'whatsapp', 'publicUrl']) assert.equal(byId[id].ok, true, id);
  assert.match(env.snippet.node, /incomingPhoneNumbers\.list/);
});

test('check flags wrong webhooks, unreachable PUBLIC_URL and missing WhatsApp', async (t) => {
  const number = { sid: 'PN1', phoneNumber: '+15550001111', capabilities: { sms: true, voice: true }, smsUrl: 'https://old.example/sms', voiceUrl: '' };
  const { client } = fakeClient({ number });
  const app = await startApp({ client, env: { TWILIO_WHATSAPP_NUMBER: '' }, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  t.after(app.close);
  const env = await app.post('/api/setup/check');
  const byId = Object.fromEntries(env.data.checks.map((c) => [c.id, c]));
  assert.equal(byId.webhooks.ok, false);
  assert.equal(byId.webhooks.fix, 'point-number');
  assert.equal(byId.publicUrl.ok, false);
  assert.match(byId.publicUrl.detail, /ngrok/);
  assert.equal(byId.whatsapp.ok, false);
  assert.equal(byId.whatsapp.optional, true);
});

test('check without credentials explains what to fill in', async (t) => {
  const app = await startApp({ client: null });
  t.after(app.close);
  const env = await app.post('/api/setup/check');
  assert.equal(env.ok, false);
  assert.match(env.hint, /TWILIO_API_KEY/);
});

test('point-number sets SMS and Voice webhooks to this app', async (t) => {
  const { client, update } = fakeClient({ number: { sid: 'PN1', phoneNumber: '+15550001111', capabilities: {} } });
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.post('/api/setup/point-number');
  assert.equal(env.ok, true);
  assert.deepEqual(update.mock.calls[0].arguments[0], { smsUrl: `${PUBLIC}/channels/sms`, smsMethod: 'POST', voiceUrl: `${PUBLIC}/channels/voice`, voiceMethod: 'POST' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL. `/api/setup/config` returns 404, because the module doesn't exist yet.

- [ ] **Step 3: Implement `routes/setup.js`**

```js
// Step 0: check that credentials, the phone number, its webhooks and the public URL are ready.
const express = require('express');
const { record, respond } = require('../lib/recorder');
const { requireClient, requireValue } = require('../lib/errors');
const { publicConfig } = require('../lib/config');
const { call } = require('../lib/snippets');

let defaultsProvider = () => ({});
try {
  defaultsProvider = require('../lib/builders').uiDefaults;
} catch {
  // lib/builders.js arrives in Task 8.
}

async function checkPublicUrl(publicUrl, fetchImpl) {
  const base = { id: 'publicUrl', label: 'Public URL reaches this app' };
  if (!publicUrl) return { ...base, ok: false, detail: 'PUBLIC_URL is not set. Run `ngrok http 3000` and paste the https URL into .env.' };
  try {
    const res = await fetchImpl(`${publicUrl}/health`, { signal: AbortSignal.timeout(5000), headers: { 'ngrok-skip-browser-warning': '1' } });
    const body = await res.json().catch(() => null);
    const ok = res.ok && body?.app === 'conversations-tester';
    return { ...base, ok, detail: ok ? `${publicUrl} reaches this app` : `${publicUrl}/health answered ${res.status}, but not from this app` };
  } catch (err) {
    return { ...base, ok: false, detail: `Could not reach ${publicUrl}/health (${err.message}). Is ngrok running and pointing at this port?` };
  }
}

function setupRoutes({ client, config, state, fetchImpl }) {
  const router = express.Router();
  const yesNo = (value) => (value ? 'yes' : 'no');
  const webhookUrls = {
    smsUrl: `${config.publicUrl}/channels/sms`,
    smsMethod: 'POST',
    voiceUrl: `${config.publicUrl}/channels/voice`,
    voiceMethod: 'POST',
  };

  router.get('/config', (req, res) => res.json({ config: publicConfig(config), state: state.get(), defaults: defaultsProvider(config) }));

  router.post('/check', respond(() => record({
    step: 'setup.check',
    state,
    code: [
      `const account = await ${call(`client.api.v2010.accounts('${config.accountSid}').fetch`)};`,
      `const [number] = await ${call('client.incomingPhoneNumbers.list', { phoneNumber: config.phoneNumber, limit: 1 })};`,
    ],
  }, async () => {
    const checks = [{ id: 'env', label: '.env values', ok: config.problems.length === 0, detail: config.problems.join(' · ') || 'All required values are set' }];
    requireClient(client);

    const account = await client.api.v2010.accounts(config.accountSid).fetch();
    checks.push({ id: 'credentials', label: 'API key works', ok: true, detail: `Account "${account.friendlyName}" (${account.status})` });

    const [number] = config.phoneNumber ? await client.incomingPhoneNumbers.list({ phoneNumber: config.phoneNumber, limit: 1 }) : [];
    const caps = number?.capabilities || {};
    checks.push({
      id: 'number',
      label: 'Twilio phone number (SMS + Voice)',
      ok: Boolean(number && caps.sms && caps.voice),
      detail: number ? `${number.phoneNumber}: SMS ${yesNo(caps.sms)}, Voice ${yesNo(caps.voice)}` : `${config.phoneNumber || 'TWILIO_PHONE_NUMBER'} was not found on this account`,
    });
    checks.push({
      id: 'webhooks',
      label: "Number's webhooks point at this app",
      ok: Boolean(number && number.smsUrl === webhookUrls.smsUrl && number.voiceUrl === webhookUrls.voiceUrl),
      detail: number ? `SMS → ${number.smsUrl || '(none)'} · Voice → ${number.voiceUrl || '(none)'}` : 'Number not found',
      fix: 'point-number',
    });
    checks.push({
      id: 'whatsapp',
      label: 'WhatsApp sender (optional)',
      ok: config.channels.whatsapp,
      optional: true,
      detail: config.channels.whatsapp
        ? `${config.whatsappNumber}. In the Console, set this sender's incoming-message webhook to ${config.publicUrl}/channels/whatsapp`
        : 'TWILIO_WHATSAPP_NUMBER is not set, so the WhatsApp tab is disabled. Register a WhatsApp sender to enable it.',
    });
    checks.push(await checkPublicUrl(config.publicUrl, fetchImpl));

    return {
      checks,
      number: number ? { sid: number.sid, phoneNumber: number.phoneNumber, capabilities: caps, smsUrl: number.smsUrl, voiceUrl: number.voiceUrl } : null,
    };
  })));

  router.post('/point-number', respond(() => record({
    step: 'setup.pointNumber',
    state,
    code: [
      `const [number] = await ${call('client.incomingPhoneNumbers.list', { phoneNumber: config.phoneNumber, limit: 1 })};`,
      `await ${call('client.incomingPhoneNumbers(number.sid).update', webhookUrls)};`,
    ],
  }, async () => {
    requireClient(client);
    requireValue(config.publicUrl, 'Set PUBLIC_URL in .env first (run `ngrok http 3000`).');
    const [number] = await client.incomingPhoneNumbers.list({ phoneNumber: config.phoneNumber, limit: 1 });
    requireValue(number, `${config.phoneNumber} was not found on this account.`);
    const updated = await client.incomingPhoneNumbers(number.sid).update(webhookUrls);
    return { sid: updated.sid, smsUrl: updated.smsUrl, voiceUrl: updated.voiceUrl };
  })));

  return router;
}

module.exports = { setupRoutes };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/setup.js test/setup.test.js
git commit -m "feat: add step 0 setup check and number webhook helper

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Request builders (pure functions)

**Files:**
- Create: `lib/builders.js`
- Modify: `routes/setup.js` (replace the `try/require` around `uiDefaults` with a direct require)
- Test: `test/builders.test.js`

**Interfaces:**
- Consumes: `Config`, `State`.
- Produces:
  - `TWILIO_OPERATORS = { SUMMARY, SENTIMENT }`
  - `UPSELL_OPERATOR = { displayName, description, prompt, outputSchema }`
  - `buildCustomOperator({ displayName, description, prompt })`
  - `buildIntelligenceConfiguration({ displayName, publicUrl, customOperatorId })`
  - `buildChannelSettings(config, { inactiveMinutes, closedMinutes })`
  - `buildOrchestratorConfiguration({ config, state, displayName, inactiveMinutes, closedMinutes })`
  - `channelAddress(config, channel)`
  - `buildSendMessageAction({ config, channel, text })`
  - `buildSimulatedConversation({ config, state, channel })`
  - `buildSimulatedCommunication({ config, channel, author, text })`
  - `uiDefaults(config) → { operator: UPSELL_OPERATOR, operatorNames: { [id]: name } }`
  - `CHANNELS = ['SMS', 'WHATSAPP', 'VOICE']`

- [ ] **Step 1: Write the failing test** `test/builders.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const b = require('../lib/builders');
const { loadConfig } = require('../lib/config');
const { TEST_ENV } = require('./_support/harness');

const config = loadConfig(TEST_ENV);
const noWhatsapp = loadConfig({ ...TEST_ENV, TWILIO_WHATSAPP_NUMBER: '' });

test('channel settings have bidirectional capture rules per enabled channel', () => {
  const s = b.buildChannelSettings(config, { inactiveMinutes: 5, closedMinutes: 30 });
  assert.deepEqual(Object.keys(s).sort(), ['SMS', 'VOICE', 'WHATSAPP']);
  assert.deepEqual(s.SMS.captureRules, [{ from: '*', to: '+15550001111' }, { from: '+15550001111', to: '*' }]);
  assert.deepEqual(s.SMS.statusTimeouts, { inactive: 5, closed: 30 });
  assert.deepEqual(s.WHATSAPP.captureRules, [{ from: '*', to: '+15550002222' }, { from: '+15550002222', to: '*' }]);
  assert.deepEqual(s.VOICE.captureRules, [
    { from: '*', to: '+15550001111', metadata: { callType: 'PSTN' } },
    { from: '+15550001111', to: '*', metadata: { callType: 'PSTN' } },
  ]);
  assert.equal(s.VOICE.statusTimeouts, undefined);
  assert.equal(b.buildChannelSettings(noWhatsapp).WHATSAPP, undefined);
});

test('orchestrator configuration links memory, intelligence and webhooks', () => {
  const body = b.buildOrchestratorConfiguration({ config, state: { storeId: 'mem_store_1', intelligenceConfigId: 'intelligence_configuration_1' }, displayName: 'Tester', inactiveMinutes: 5, closedMinutes: 30 });
  assert.equal(body.conversationGroupingType, 'GROUP_BY_PROFILE');
  assert.equal(body.memoryStoreId, 'mem_store_1');
  assert.deepEqual(body.intelligenceConfigurationIds, ['intelligence_configuration_1']);
  assert.equal(body.memoryExtractionEnabled, true);
  assert.deepEqual(body.statusCallbacks, [{ url: 'https://tester.example.ngrok.app/webhooks/orchestrator', method: 'POST' }]);
  assert.ok(body.channelSettings.SMS);
  assert.equal(typeof body.description, 'string');
});

test('intelligence configuration has a per-message rule and an end-of-conversation rule', () => {
  const body = b.buildIntelligenceConfiguration({ displayName: 'Tester', publicUrl: 'https://p.test', customOperatorId: 'intelligence_operator_custom' });
  assert.equal(body.rules.length, 2);
  const [perMessage, atEnd] = body.rules;
  assert.deepEqual(perMessage.triggers, [{ on: 'COMMUNICATION' }]);
  assert.deepEqual(perMessage.operators.map((o) => o.id), [b.TWILIO_OPERATORS.SENTIMENT, 'intelligence_operator_custom']);
  assert.deepEqual(atEnd.triggers, [{ on: 'CONVERSATION_END' }]);
  assert.deepEqual(atEnd.operators, [{ id: b.TWILIO_OPERATORS.SUMMARY }]);
  for (const rule of body.rules) {
    assert.deepEqual(rule.actions, [{ type: 'WEBHOOK', method: 'POST', url: 'https://p.test/webhooks/intelligence' }]);
    assert.deepEqual(rule.context, { memory: { enabled: true } });
  }
  const withoutCustom = b.buildIntelligenceConfiguration({ displayName: 'T', publicUrl: 'https://p.test', customOperatorId: null });
  assert.equal(withoutCustom.rules[0].operators.length, 1);
});

test('custom operator is a SELF-authored JSON operator with a schema', () => {
  const op = b.buildCustomOperator({ displayName: 'Upsell', description: 'd', prompt: 'p' });
  assert.equal(op.author, 'SELF');
  assert.equal(op.outputFormat, 'JSON');
  assert.equal(op.outputSchema.type, 'object');
});

test('send-message action goes from the channel address to the learner', () => {
  assert.deepEqual(b.buildSendMessageAction({ config, channel: 'WHATSAPP', text: 'Hi' }), {
    type: 'SEND_MESSAGE',
    payload: { from: { address: '+15550002222', channel: 'WHATSAPP' }, to: [{ address: '+15559998888', channel: 'WHATSAPP' }], content: { text: 'Hi' } },
  });
  assert.equal(b.buildSendMessageAction({ config, channel: 'SMS', text: 'x' }).payload.from.address, '+15550001111');
});

test('simulated communications set author and recipient by role; voice is a transcription', () => {
  const customer = b.buildSimulatedCommunication({ config, channel: 'SMS', author: 'CUSTOMER', text: 'Hello' });
  assert.deepEqual(customer, { author: { address: '+15559998888', channel: 'SMS' }, content: { type: 'TEXT', text: 'Hello' }, recipients: [{ address: '+15550001111', channel: 'SMS' }] });
  const agent = b.buildSimulatedCommunication({ config, channel: 'VOICE', author: 'AGENT', text: 'Hi' });
  assert.equal(agent.author.address, '+15550001111');
  assert.equal(agent.content.type, 'TRANSCRIPTION');
});

test('simulated conversation has explicit CUSTOMER and AI_AGENT participants', () => {
  const body = b.buildSimulatedConversation({ config, state: { orchestratorConfigId: 'cfg', profileId: 'mem_profile_1' }, channel: 'SMS' });
  assert.equal(body.configurationId, 'cfg');
  assert.deepEqual(body.participants.map((p) => p.type), ['CUSTOMER', 'AI_AGENT']);
  assert.equal(body.participants[0].profileId, 'mem_profile_1');
  assert.deepEqual(body.participants[1].addresses, [{ channel: 'SMS', address: '+15550001111' }]);
});

test('uiDefaults exposes the starter operator and operator names', () => {
  const d = b.uiDefaults(config);
  assert.equal(d.operator.displayName, b.UPSELL_OPERATOR.displayName);
  assert.equal(d.operatorNames[b.TWILIO_OPERATORS.SUMMARY], 'Summary (Twilio)');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../lib/builders'`

- [ ] **Step 3: Implement `lib/builders.js`**

```js
// Builds the JSON request bodies each step sends to Twilio. These are pure functions, so the
// interesting part of every API call is easy to read (and test) in one place.
const CHANNELS = ['SMS', 'WHATSAPP', 'VOICE'];

// Twilio-authored language operators (IDs from the Conversation Intelligence docs).
const TWILIO_OPERATORS = {
  SUMMARY: 'intelligence_operator_01kcv35pnkeysaf6z6cqtbpegn',
  SENTIMENT: 'intelligence_operator_01kcrvw16kfa88qvgrfmr7y151',
};

const UPSELL_OPERATOR = {
  displayName: 'Upsell intent detector',
  description: 'Flags when a customer shows interest in upgrading or buying more.',
  prompt: 'Read the conversation and decide whether the customer shows interest in upgrading, buying more, or a premium option. Quote the customer sentence that shows it, if any.',
  outputSchema: {
    type: 'object',
    properties: {
      upsellIntent: { type: 'boolean', description: 'True if the customer shows upsell interest' },
      evidence: { type: 'string', description: 'The customer sentence that shows the intent, or an empty string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['upsellIntent', 'evidence', 'confidence'],
  },
};

const DESCRIPTION = 'Created by the Twilio Conversations Tester sample';

function buildCustomOperator({ displayName, description, prompt }) {
  return { displayName, description, author: 'SELF', prompt, outputFormat: 'JSON', outputSchema: UPSELL_OPERATOR.outputSchema };
}

function buildIntelligenceConfiguration({ displayName, publicUrl, customOperatorId }) {
  const actions = [{ type: 'WEBHOOK', method: 'POST', url: `${publicUrl}/webhooks/intelligence` }];
  const context = { memory: { enabled: true } };
  const perMessage = [{ id: TWILIO_OPERATORS.SENTIMENT }];
  if (customOperatorId) perMessage.push({ id: customOperatorId });
  return {
    displayName,
    description: DESCRIPTION,
    rules: [
      { operators: perMessage, triggers: [{ on: 'COMMUNICATION' }], actions, context },
      { operators: [{ id: TWILIO_OPERATORS.SUMMARY }], triggers: [{ on: 'CONVERSATION_END' }], actions, context },
    ],
  };
}

// One rule for traffic to your number, one for traffic from it, so both sides are captured.
function captureRules(address, metadata) {
  const rule = (from, to) => (metadata ? { from, to, metadata } : { from, to });
  return [rule('*', address), rule(address, '*')];
}

function buildChannelSettings(config, { inactiveMinutes = 5, closedMinutes = 30 } = {}) {
  const statusTimeouts = { inactive: inactiveMinutes, closed: closedMinutes };
  const settings = {};
  if (config.channels.sms) settings.SMS = { captureRules: captureRules(config.phoneNumber), statusTimeouts };
  if (config.channels.whatsapp) settings.WHATSAPP = { captureRules: captureRules(config.whatsappNumber), statusTimeouts };
  // Voice timeouts behave differently (calls end on hang-up), so we keep Twilio's defaults.
  if (config.channels.voice) settings.VOICE = { captureRules: captureRules(config.phoneNumber, { callType: 'PSTN' }) };
  return settings;
}

function buildOrchestratorConfiguration({ config, state, displayName, inactiveMinutes, closedMinutes }) {
  return {
    displayName,
    description: DESCRIPTION,
    conversationGroupingType: 'GROUP_BY_PROFILE',
    memoryStoreId: state.storeId,
    intelligenceConfigurationIds: state.intelligenceConfigId ? [state.intelligenceConfigId] : [],
    memoryExtractionEnabled: true,
    statusCallbacks: [{ url: `${config.publicUrl}/webhooks/orchestrator`, method: 'POST' }],
    channelSettings: buildChannelSettings(config, { inactiveMinutes, closedMinutes }),
  };
}

const channelAddress = (config, channel) => (channel === 'WHATSAPP' ? config.whatsappNumber : config.phoneNumber);

function buildSendMessageAction({ config, channel, text }) {
  return {
    type: 'SEND_MESSAGE',
    payload: {
      from: { address: channelAddress(config, channel), channel },
      to: [{ address: config.myPhoneNumber, channel }],
      content: { text },
    },
  };
}

function buildSimulatedConversation({ config, state, channel }) {
  return {
    configurationId: state.orchestratorConfigId,
    name: 'Simulated conversation (Conversations Tester)',
    participants: [
      { name: 'You (customer)', type: 'CUSTOMER', ...(state.profileId && { profileId: state.profileId }), addresses: [{ channel, address: config.myPhoneNumber }] },
      { name: 'Tester agent', type: 'AI_AGENT', addresses: [{ channel, address: channelAddress(config, channel) }] },
    ],
  };
}

function buildSimulatedCommunication({ config, channel, author, text }) {
  const customer = config.myPhoneNumber;
  const agent = channelAddress(config, channel);
  const [from, to] = author === 'AGENT' ? [agent, customer] : [customer, agent];
  return {
    author: { address: from, channel },
    content: { type: channel === 'VOICE' ? 'TRANSCRIPTION' : 'TEXT', text },
    recipients: [{ address: to, channel }],
  };
}

function uiDefaults() {
  return {
    operator: UPSELL_OPERATOR,
    operatorNames: {
      [TWILIO_OPERATORS.SUMMARY]: 'Summary (Twilio)',
      [TWILIO_OPERATORS.SENTIMENT]: 'Sentiment (Twilio)',
    },
  };
}

module.exports = {
  CHANNELS,
  TWILIO_OPERATORS,
  UPSELL_OPERATOR,
  buildCustomOperator,
  buildIntelligenceConfiguration,
  buildChannelSettings,
  buildOrchestratorConfiguration,
  channelAddress,
  buildSendMessageAction,
  buildSimulatedConversation,
  buildSimulatedCommunication,
  uiDefaults,
};
```

- [ ] **Step 4: Replace the optional require in `routes/setup.js`**

Delete these lines:
```js
let defaultsProvider = () => ({});
try {
  defaultsProvider = require('../lib/builders').uiDefaults;
} catch {
  // lib/builders.js arrives in Task 8.
}
```
Then add `const { uiDefaults } = require('../lib/builders');` with the other requires, and change the config route to:
```js
  router.get('/config', (req, res) => res.json({ config: publicConfig(config), state: state.get(), defaults: uiDefaults(config) }));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/builders.js routes/setup.js test/builders.test.js
git commit -m "feat: add request builders for configs, operators and messages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Memory routes (steps 1, 2, 8)

**Files:**
- Create: `routes/memory.js`
- Test: `test/memory.test.js`

**Interfaces:**
- Consumes: `record`, `respond`, `requireClient`, `requireState`, `requireValue`, `waitForOperation`, `call`, `E164`.
- Produces: `memoryRoutes(deps)` with these endpoints:

| Endpoint | Body | Envelope `data` |
|---|---|---|
| `POST /api/memory/stores` | `{ displayName?, description? }` | `{ store, operation }`; sets `storeId`, clears `profileId` |
| `POST /api/memory/profiles` | `{ firstName?, lastName?, phone?, whatsapp? }` | `{ profile, lookup, traits }`; sets `profileId` |
| `GET /api/memory/results` | none | `{ profile, observations, summaries }` |
| `POST /api/memory/recall` | `{ query? }` | `{ recall, query }` |

- [ ] **Step 1: Write the failing test** `test/memory.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp, callable } = require('./_support/harness');

function fakeMemory() {
  const fns = {
    storesCreate: mock.fn(async () => ({ statusUrl: 'https://memory.twilio.com/v1/ControlPlane/Operations/op1' })),
    storeFetch: mock.fn(async () => ({ id: 'mem_store_1', displayName: 'ConversationsTester', status: 'ACTIVE' })),
    opFetch: mock.fn(async () => ({ body: { operationId: 'op1', status: 'COMPLETED', result: { type: 'RESOURCE_ID', id: 'mem_store_1' } }, headers: {} })),
    profileCreate: mock.fn(async () => ({ id: 'mem_profile_1', message: 'accepted' })),
    profileFetch: mock.fn(async () => ({ id: 'mem_profile_1', traits: { Contact: { firstName: 'Alex' } } })),
    lookupCreate: mock.fn(async () => ({ normalizedValue: '+15559998888', profiles: ['mem_profile_1'] })),
    observationsList: mock.fn(async () => [{ id: 'obs1', content: 'Prefers SMS' }]),
    summariesList: mock.fn(async () => [{ id: 'sum1', content: 'Asked about an upgrade' }]),
    recallCreate: mock.fn(async () => ({ observations: [{ content: 'Prefers SMS', score: 0.9 }], summaries: [], communications: [] })),
  };
  const client = {
    memory: {
      v1: {
        stores: callable(() => ({ fetch: fns.storeFetch }), { create: fns.storesCreate }),
        operations: () => ({ fetchWithHttpInfo: fns.opFetch }),
        profiles: (storeId, profileId) => (profileId ? { fetch: fns.profileFetch } : { create: fns.profileCreate }),
        lookup: () => ({ create: fns.lookupCreate }),
        observations: () => ({ list: fns.observationsList }),
        conversationSummaries: () => ({ list: fns.summariesList }),
        recall: () => ({ create: fns.recallCreate }),
      },
    },
  };
  return { client, fns };
}

test('step 1 creates a store, waits for the operation, and saves storeId', async (t) => {
  const { client, fns } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ profileId: 'old_profile' });
  const env = await app.post('/api/memory/stores', { displayName: 'MyStore' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.storesCreate.mock.calls[0].arguments[0], { displayName: 'MyStore', description: 'Memory store created by the Conversations Tester sample' });
  assert.equal(env.data.store.id, 'mem_store_1');
  assert.equal(env.state.storeId, 'mem_store_1');
  assert.equal(env.state.profileId, null);
  assert.match(env.snippet.node, /client\.memory\.v1\.stores\.create/);
});

test('step 2 requires a store first', async (t) => {
  const { client } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.post('/api/memory/profiles', {});
  assert.equal(env.ok, false);
  assert.match(env.hint, /Step 1/);
});

test('step 2 creates a profile with Contact traits (WhatsApp defaults to the phone)', async (t) => {
  const { client, fns } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 'mem_store_1' });
  const env = await app.post('/api/memory/profiles', { firstName: 'Alex' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.profileCreate.mock.calls[0].arguments[0], { traits: { Contact: { firstName: 'Alex', phone: '+15559998888', whatsapp: '+15559998888' } } });
  assert.deepEqual(fns.lookupCreate.mock.calls[0].arguments[0], { idType: 'phone', value: '+15559998888' });
  assert.equal(env.state.profileId, 'mem_profile_1');
});

test('step 2 rejects a phone number that is not E.164', async (t) => {
  const { client } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 'mem_store_1' });
  const env = await app.post('/api/memory/profiles', { phone: '555-1234' });
  assert.equal(env.ok, false);
  assert.match(env.hint, /E\.164/);
});

test('step 8 lists observations and summaries for the current conversation', async (t) => {
  const { client, fns } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 'mem_store_1', profileId: 'mem_profile_1', conversationId: 'conv_1' });
  const env = await app.get('/api/memory/results');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.equal(env.data.observations.length, 1);
  assert.equal(env.data.summaries.length, 1);
  assert.deepEqual(fns.summariesList.mock.calls[0].arguments[0], { conversationId: 'conv_1', limit: 10 });
});

test('recall sends the query and limits', async (t) => {
  const { client, fns } = fakeMemory();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 'mem_store_1', profileId: 'mem_profile_1' });
  const env = await app.post('/api/memory/recall', { query: 'preferences?' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.recallCreate.mock.calls[0].arguments[0], { query: 'preferences?', observationsLimit: 10, summariesLimit: 5, communicationsLimit: 5 });
  assert.equal(env.data.recall.observations[0].score, 0.9);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL (404s from `/api/memory/*`)

- [ ] **Step 3: Implement `routes/memory.js`**

```js
// Conversation Memory: a Store holds Profiles; each Profile collects Traits (facts),
// Observations and Summaries (learned from conversations), and can be searched with Recall.
const express = require('express');
const { record, respond } = require('../lib/recorder');
const { requireClient, requireState, requireValue } = require('../lib/errors');
const { waitForOperation } = require('../lib/operations');
const { call } = require('../lib/snippets');
const { E164 } = require('../lib/config');

function memoryRoutes({ client, config, state, sleep }) {
  const router = express.Router();

  // Step 1: create a Memory Store (async: 202 + Operation to poll).
  router.post('/stores', respond((req) => {
    const params = {
      displayName: req.body.displayName || 'ConversationsTester',
      description: req.body.description || 'Memory store created by the Conversations Tester sample',
    };
    return record({
      step: 'memory.createStore',
      state,
      code: [
        `const store = await ${call('client.memory.v1.stores.create', params)};`,
        '// Twilio answers 202 Accepted. Poll the Operation in store.statusUrl until it is COMPLETED:',
        "const operationId = store.statusUrl.split('/').pop();",
        'const operation = await client.memory.v1.operations(operationId).fetch(); // repeat while PENDING/RUNNING',
        'const storeId = operation.result.id;',
      ],
    }, async () => {
      requireClient(client);
      const created = await client.memory.v1.stores.create(params);
      const operation = created.statusUrl ? await waitForOperation(client, created.statusUrl, { sleep }) : null;
      const storeId = operation?.result?.id || created.id;
      requireValue(storeId, 'The store was accepted, but Twilio did not return its ID. Check the JSON tab.');
      state.set({ storeId, profileId: null });
      const store = await client.memory.v1.stores(storeId).fetch();
      return { store, operation };
    });
  }));

  // Step 2: create a Profile for the learner, so their messages and calls link to it.
  router.post('/profiles', respond((req) => {
    const current = state.get();
    const phone = req.body.phone || config.myPhoneNumber;
    const whatsapp = req.body.whatsapp ?? (config.channels.whatsapp ? phone : '');
    const contact = {
      firstName: req.body.firstName || 'Alex',
      ...(req.body.lastName && { lastName: req.body.lastName }),
      phone,
      ...(whatsapp && { whatsapp }),
    };
    const params = { traits: { Contact: contact } };
    return record({
      step: 'memory.createProfile',
      state,
      code: [
        `const profile = await ${call(`client.memory.v1.profiles('${current.storeId}').create`, params)};`,
        '// Check that identity resolution can find the profile by phone number:',
        `const lookup = await ${call(`client.memory.v1.lookup('${current.storeId}').create`, { idType: 'phone', value: phone })};`,
      ],
    }, async () => {
      requireClient(client);
      requireState(current, ['storeId']);
      requireValue(E164.test(phone), `Phone "${phone}" must be in E.164 format, e.g. +15551234567.`);
      if (whatsapp) requireValue(E164.test(whatsapp), `WhatsApp number "${whatsapp}" must be in E.164 format.`);
      const profile = await client.memory.v1.profiles(current.storeId).create(params);
      state.set({ profileId: profile.id });
      const lookup = await client.memory.v1.lookup(current.storeId).create({ idType: 'phone', value: phone });
      return { profile, lookup, traits: contact };
    });
  }));

  // Step 8: what Memory learned after the conversation went inactive or closed.
  router.get('/results', respond(() => {
    const current = state.get();
    const summaryFilter = { ...(current.conversationId && { conversationId: current.conversationId }), limit: 10 };
    const profilePath = `'${current.storeId}', '${current.profileId}'`;
    return record({
      step: 'memory.results',
      state,
      code: [
        `const profile = await client.memory.v1.profiles(${profilePath}).fetch();`,
        `const observations = await ${call(`client.memory.v1.observations(${profilePath}).list`, { limit: 20 })};`,
        `const summaries = await ${call(`client.memory.v1.conversationSummaries(${profilePath}).list`, summaryFilter)};`,
      ],
    }, async () => {
      requireClient(client);
      requireState(current, ['storeId', 'profileId']);
      const [profile, observations, summaries] = await Promise.all([
        client.memory.v1.profiles(current.storeId, current.profileId).fetch(),
        client.memory.v1.observations(current.storeId, current.profileId).list({ limit: 20 }),
        client.memory.v1.conversationSummaries(current.storeId, current.profileId).list(summaryFilter),
      ]);
      return { profile, observations, summaries };
    });
  }));

  // Step 8: Recall, the semantic + keyword search an AI agent would run on each turn.
  router.post('/recall', respond((req) => {
    const current = state.get();
    const query = req.body.query || 'What does this customer care about?';
    const params = { query, observationsLimit: 10, summariesLimit: 5, communicationsLimit: 5 };
    return record({
      step: 'memory.recall',
      state,
      code: [`const recall = await ${call(`client.memory.v1.recall('${current.storeId}', '${current.profileId}').create`, params)};`],
    }, async () => {
      requireClient(client);
      requireState(current, ['storeId', 'profileId']);
      const recall = await client.memory.v1.recall(current.storeId, current.profileId).create(params);
      return { recall, query };
    });
  }));

  return router;
}

module.exports = { memoryRoutes };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/memory.js test/memory.test.js
git commit -m "feat: add Memory store, profile, results and recall routes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Intelligence routes (steps 3, 4, 9)

**Files:**
- Create: `routes/intelligence.js`
- Test: `test/intelligence.test.js`

**Interfaces:**
- Consumes: `buildCustomOperator`, `buildIntelligenceConfiguration`, `UPSELL_OPERATOR`, `record`, `respond`, `require*`, `call`.
- Produces: `intelligenceRoutes(deps)` with these endpoints:

| Endpoint | Body | Envelope `data` |
|---|---|---|
| `GET /api/intelligence/operators` | none | `{ operators: [{ id, displayName, description, author, outputFormat, version }] }` |
| `POST /api/intelligence/operators` | `{ displayName?, description?, prompt? }` | `{ operator }`; sets `operatorId` |
| `POST /api/intelligence/configurations` | `{ displayName?, includeCustomOperator? }` (boolean, default true) | `{ configuration }`; sets `intelligenceConfigId` and `intelligenceRuleIds` |
| `GET /api/intelligence/results` | none | `{ results, webhooks }` |

- [ ] **Step 1: Write the failing test** `test/intelligence.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp } = require('./_support/harness');
const { TWILIO_OPERATORS } = require('../lib/builders');

function fakeIntelligence() {
  const fns = {
    operatorsList: mock.fn(async () => [{ id: TWILIO_OPERATORS.SUMMARY, displayName: 'Summary', author: 'TWILIO', outputFormat: 'TEXT', version: 1, prompt: 'hidden' }]),
    operatorsCreate: mock.fn(async (p) => ({ id: 'intelligence_operator_custom', ...p })),
    configurationsCreate: mock.fn(async (p) => ({ id: 'intelligence_configuration_1', ...p, rules: p.rules.map((r, i) => ({ id: `rule_${i}`, ...r })) })),
    resultsList: mock.fn(async () => [{ id: 'r1', outputFormat: 'TEXT', result: 'Customer wants an upgrade', operator: { id: TWILIO_OPERATORS.SUMMARY } }]),
  };
  const client = {
    intelligence: {
      v3: {
        operators: { list: fns.operatorsList, create: fns.operatorsCreate },
        configurations: { create: fns.configurationsCreate },
        operatorResults: { list: fns.resultsList },
      },
    },
  };
  return { client, fns };
}

test('lists operators with a summary of each', async (t) => {
  const { client } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.get('/api/intelligence/operators');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(env.data.operators[0], { id: TWILIO_OPERATORS.SUMMARY, displayName: 'Summary', description: null, author: 'TWILIO', outputFormat: 'TEXT', version: 1 });
});

test('creates the default custom operator and saves operatorId', async (t) => {
  const { client, fns } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.post('/api/intelligence/operators', {});
  assert.equal(env.ok, true, JSON.stringify(env.error));
  const body = fns.operatorsCreate.mock.calls[0].arguments[0];
  assert.equal(body.displayName, 'Upsell intent detector');
  assert.equal(body.author, 'SELF');
  assert.equal(env.state.operatorId, 'intelligence_operator_custom');
});

test('creates an intelligence configuration that includes the custom operator', async (t) => {
  const { client, fns } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ operatorId: 'intelligence_operator_custom' });
  const env = await app.post('/api/intelligence/configurations', {});
  assert.equal(env.ok, true, JSON.stringify(env.error));
  const body = fns.configurationsCreate.mock.calls[0].arguments[0];
  assert.deepEqual(body.rules[0].operators.map((o) => o.id), [TWILIO_OPERATORS.SENTIMENT, 'intelligence_operator_custom']);
  assert.equal(body.rules[0].actions[0].url, 'https://tester.example.ngrok.app/webhooks/intelligence');
  assert.equal(env.state.intelligenceConfigId, 'intelligence_configuration_1');
  assert.deepEqual(env.state.intelligenceRuleIds, ['rule_0', 'rule_1']);
});

test('can leave the custom operator out', async (t) => {
  const { client, fns } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ operatorId: 'intelligence_operator_custom' });
  await app.post('/api/intelligence/configurations', { includeCustomOperator: false });
  assert.equal(fns.configurationsCreate.mock.calls[0].arguments[0].rules[0].operators.length, 1);
});

test('requires PUBLIC_URL for the webhook action', async (t) => {
  const { client } = fakeIntelligence();
  const app = await startApp({ client, env: { PUBLIC_URL: '' } });
  t.after(app.close);
  const env = await app.post('/api/intelligence/configurations', {});
  assert.equal(env.ok, false);
  assert.match(env.hint, /PUBLIC_URL/);
});

test('results combine the API list with webhooks for this conversation', async (t) => {
  const { client, fns } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ conversationId: 'conv_1' });
  app.events.publish('intelligence', 'OPERATOR_RESULTS', { conversationId: 'conv_1', operatorResults: [] });
  app.events.publish('intelligence', 'OPERATOR_RESULTS', { conversationId: 'conv_other', operatorResults: [] });
  const env = await app.get('/api/intelligence/results');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.resultsList.mock.calls[0].arguments[0], { conversationId: 'conv_1', limit: 50 });
  assert.equal(env.data.results.length, 1);
  assert.equal(env.data.webhooks.length, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL (404s from `/api/intelligence/*`)

- [ ] **Step 3: Implement `routes/intelligence.js`**

```js
// Conversation Intelligence: Language Operators (Twilio-authored or your own prompt) run inside
// Rules of an Intelligence Configuration. Triggers decide when; actions (webhooks) deliver results.
const express = require('express');
const { record, respond } = require('../lib/recorder');
const { requireClient, requireState, requireValue } = require('../lib/errors');
const { call } = require('../lib/snippets');
const { buildCustomOperator, buildIntelligenceConfiguration, UPSELL_OPERATOR } = require('../lib/builders');

function intelligenceRoutes({ client, config, state, events }) {
  const router = express.Router();

  // Step 3a: browse the operators available on the account.
  router.get('/operators', respond(() => record({
    step: 'intelligence.listOperators',
    state,
    code: [`const operators = await ${call('client.intelligence.v3.operators.list', { limit: 100 })};`],
  }, async () => {
    requireClient(client);
    const operators = await client.intelligence.v3.operators.list({ limit: 100 });
    return {
      operators: operators.map((o) => ({
        id: o.id,
        displayName: o.displayName,
        description: o.description ?? null,
        author: o.author,
        outputFormat: o.outputFormat,
        version: o.version,
      })),
    };
  })));

  // Step 3b: create your own operator from a prompt and a JSON output schema.
  router.post('/operators', respond((req) => {
    const params = buildCustomOperator({
      displayName: req.body.displayName || UPSELL_OPERATOR.displayName,
      description: req.body.description || UPSELL_OPERATOR.description,
      prompt: req.body.prompt || UPSELL_OPERATOR.prompt,
    });
    return record({
      step: 'intelligence.createOperator',
      state,
      code: [`const operator = await ${call('client.intelligence.v3.operators.create', params)};`],
    }, async () => {
      requireClient(client);
      const operator = await client.intelligence.v3.operators.create(params);
      state.set({ operatorId: operator.id });
      return { operator };
    });
  }));

  // Step 4: an Intelligence Configuration with two rules (per message, and at conversation end).
  router.post('/configurations', respond((req) => {
    const current = state.get();
    const params = buildIntelligenceConfiguration({
      displayName: req.body.displayName || 'Conversations Tester',
      publicUrl: config.publicUrl,
      customOperatorId: req.body.includeCustomOperator === false ? null : current.operatorId,
    });
    return record({
      step: 'intelligence.createConfiguration',
      state,
      code: [`const configuration = await ${call('client.intelligence.v3.configurations.create', params)};`],
    }, async () => {
      requireClient(client);
      requireValue(config.publicUrl, 'Set PUBLIC_URL in .env first: Intelligence delivers results to your webhook.');
      const configuration = await client.intelligence.v3.configurations.create(params);
      state.set({
        intelligenceConfigId: configuration.id,
        intelligenceRuleIds: (configuration.rules || []).map((rule) => rule.id).filter(Boolean),
      });
      return { configuration };
    });
  }));

  // Step 9: operator results for the current conversation, plus any webhooks we received.
  router.get('/results', respond(() => {
    const current = state.get();
    const params = { conversationId: current.conversationId, limit: 50 };
    return record({
      step: 'intelligence.results',
      state,
      code: [`const results = await ${call('client.intelligence.v3.operatorResults.list', params)};`],
    }, async () => {
      requireClient(client);
      requireState(current, ['conversationId']);
      const results = await client.intelligence.v3.operatorResults.list(params);
      const webhooks = events
        .recent((e) => e.source === 'intelligence' && e.payload?.conversationId === current.conversationId)
        .map((e) => ({ receivedAt: e.at, ...e.payload }));
      return { results, webhooks };
    });
  }));

  return router;
}

module.exports = { intelligenceRoutes };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/intelligence.js test/intelligence.test.js
git commit -m "feat: add Intelligence operator, configuration and results routes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Orchestrator routes (steps 5, 6 reply/simulate, 7)

**Files:**
- Create: `routes/orchestrator.js`
- Test: `test/orchestrator.test.js`

**Interfaces:**
- Consumes: the builders from Task 8, `waitForOperation`, `pollUntil`, `record`, `respond`, `require*`, `call`.
- Produces: `orchestratorRoutes(deps)` with these endpoints:

| Endpoint | Body / query | Envelope `data` |
|---|---|---|
| `POST /api/orchestrator/configurations` | `{ displayName?, inactiveMinutes?, closedMinutes? }` | `{ configuration, operation }`; sets `orchestratorConfigId`, clears `conversationId`/`conversationClosed` |
| `GET /api/orchestrator/conversation?id=` | optional `id` | `{ conversations, conversation, participants, communications }`. Selects `id`, or the current one, or the newest for our configuration; sets `conversationId` |
| `POST /api/orchestrator/conversation/close` | none | `{ conversation }`; sets `conversationClosed: true` |
| `POST /api/orchestrator/reply` | `{ channel: 'SMS'\|'WHATSAPP', text }` | `{ action }` |
| `POST /api/orchestrator/simulate` | `{ channel: 'SMS'\|'WHATSAPP'\|'VOICE', author: 'CUSTOMER'\|'AGENT', text }` | `{ conversation, communication, simulated: true }` |

- [ ] **Step 1: Write the failing test** `test/orchestrator.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp, callable } = require('./_support/harness');

function fakeOrchestrator({ related = { configurationId: 'conv_configuration_1' }, actionStatuses = ['PENDING', 'COMPLETED'] } = {}) {
  const fns = {
    configCreate: mock.fn(async () => ({ statusUrl: 'https://conversations.twilio.com/v2/ControlPlane/Operations/op1' })),
    configList: mock.fn(async () => [
      { id: 'cfg_old', displayName: 'Conversations Tester', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'cfg_new', displayName: 'Conversations Tester', createdAt: '2026-06-01T00:00:00Z' },
    ]),
    configFetch: mock.fn(async () => ({ id: 'conv_configuration_1', displayName: 'Conversations Tester' })),
    opFetch: mock.fn(async () => ({ body: { status: 'COMPLETED', related }, headers: {} })),
    convList: mock.fn(async () => [
      { id: 'conv_a', configurationId: 'conv_configuration_1', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'conv_b', configurationId: 'conv_configuration_1', createdAt: '2026-02-01T00:00:00Z' },
      { id: 'conv_x', configurationId: 'other', createdAt: '2026-03-01T00:00:00Z' },
    ]),
    convFetch: mock.fn(async () => ({ id: 'conv_b', status: 'ACTIVE' })),
    convUpdate: mock.fn(async (p) => ({ id: 'conv_b', ...p })),
    convCreate: mock.fn(async () => ({ id: 'conv_sim', status: 'ACTIVE' })),
    participantsList: mock.fn(async () => [{ id: 'p1', type: 'CUSTOMER', profileId: 'mem_profile_1' }]),
    communicationsList: mock.fn(async () => [
      { id: 'c2', occurredAt: '2026-02-01T00:02:00Z', content: { text: 'second' } },
      { id: 'c1', occurredAt: '2026-02-01T00:01:00Z', content: { text: 'first' } },
    ]),
    communicationsCreate: mock.fn(async (p) => ({ id: 'c_sim', ...p })),
    actionCreate: mock.fn(async () => ({ id: 'action_1', status: 'PENDING' })),
    actionFetch: mock.fn(async () => ({ id: 'action_1', status: actionStatuses.shift() ?? 'COMPLETED', related: { messageSid: 'SM1' } })),
  };
  const client = {
    conversations: {
      v2: {
        configurations: callable(() => ({ fetch: fns.configFetch }), { create: fns.configCreate, list: fns.configList }),
        operations: () => ({ fetchWithHttpInfo: fns.opFetch }),
        conversations: callable(() => ({ fetch: fns.convFetch, update: fns.convUpdate }), { list: fns.convList, create: fns.convCreate }),
        participants: () => ({ list: fns.participantsList }),
        communications: () => ({ list: fns.communicationsList, create: fns.communicationsCreate }),
        actions: (conversationId, actionId) => (actionId ? { fetch: fns.actionFetch } : { create: fns.actionCreate }),
      },
    },
  };
  return { client, fns };
}

const READY = { storeId: 'mem_store_1', profileId: 'mem_profile_1', intelligenceConfigId: 'intelligence_configuration_1' };

test('step 5 requires store, profile and intelligence config', async (t) => {
  const { client } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.post('/api/orchestrator/configurations', {});
  assert.equal(env.ok, false);
  assert.match(env.hint, /Step 1.*Step 2.*Step 4/);
});

test('step 5 creates the configuration, polls, and saves the id from the operation', async (t) => {
  const { client, fns } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ ...READY, conversationId: 'old', conversationClosed: true });
  const env = await app.post('/api/orchestrator/configurations', { inactiveMinutes: '2' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  const body = fns.configCreate.mock.calls[0].arguments[0];
  assert.equal(body.memoryStoreId, 'mem_store_1');
  assert.deepEqual(body.channelSettings.SMS.statusTimeouts, { inactive: 2, closed: 30 });
  assert.equal(env.state.orchestratorConfigId, 'conv_configuration_1');
  assert.equal(env.state.conversationId, null);
  assert.equal(env.state.conversationClosed, false);
});

test('step 5 falls back to the newest configuration with the same displayName', async (t) => {
  const { client } = fakeOrchestrator({ related: {} });
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set(READY);
  const env = await app.post('/api/orchestrator/configurations', {});
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.equal(env.state.orchestratorConfigId, 'cfg_new');
});

test('step 7 picks the newest conversation for our configuration and sorts the timeline', async (t) => {
  const { client } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'conv_configuration_1' });
  const env = await app.get('/api/orchestrator/conversation');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(env.data.conversations.map((c) => c.id), ['conv_b', 'conv_a']);
  assert.equal(env.state.conversationId, 'conv_b');
  assert.deepEqual(env.data.communications.map((c) => c.id), ['c1', 'c2']);
  assert.equal(env.data.participants[0].profileId, 'mem_profile_1');
});

test('step 7 reports clearly when no conversation exists yet', async (t) => {
  const { client, fns } = fakeOrchestrator();
  fns.convList.mock.mockImplementation(async () => []);
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'conv_configuration_1' });
  const env = await app.get('/api/orchestrator/conversation');
  assert.equal(env.ok, false);
  assert.match(env.hint, /No conversations yet/);
});

test('close sets status CLOSED and marks state', async (t) => {
  const { client, fns } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ conversationId: 'conv_b' });
  const env = await app.post('/api/orchestrator/conversation/close');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.convUpdate.mock.calls[0].arguments[0], { status: 'CLOSED' });
  assert.equal(env.state.conversationClosed, true);
});

test('reply sends a SEND_MESSAGE action and polls until it completes', async (t) => {
  const { client, fns } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ conversationId: 'conv_b' });
  const env = await app.post('/api/orchestrator/reply', { channel: 'SMS', text: 'Hello from the agent' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.equal(fns.actionCreate.mock.calls[0].arguments[0].type, 'SEND_MESSAGE');
  assert.equal(env.data.action.status, 'COMPLETED');
  assert.equal(fns.actionFetch.mock.callCount(), 2);
});

test('reply rejects WhatsApp when no sender is configured', async (t) => {
  const { client } = fakeOrchestrator();
  const app = await startApp({ client, env: { TWILIO_WHATSAPP_NUMBER: '' } });
  t.after(app.close);
  app.state.set({ conversationId: 'conv_b' });
  const env = await app.post('/api/orchestrator/reply', { channel: 'WHATSAPP', text: 'x' });
  assert.equal(env.ok, false);
  assert.match(env.hint, /TWILIO_WHATSAPP_NUMBER/);
});

test('simulate creates a conversation first when none exists', async (t) => {
  const { client, fns } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'conv_configuration_1', profileId: 'mem_profile_1' });
  const env = await app.post('/api/orchestrator/simulate', { channel: 'SMS', author: 'CUSTOMER', text: 'I want to upgrade' });
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.equal(fns.convCreate.mock.callCount(), 1);
  assert.equal(env.state.conversationId, 'conv_sim');
  assert.equal(fns.communicationsCreate.mock.calls[0].arguments[0].content.text, 'I want to upgrade');
  assert.equal(env.data.simulated, true);
});

test('simulate rejects unknown channels', async (t) => {
  const { client } = fakeOrchestrator();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ orchestratorConfigId: 'conv_configuration_1', conversationId: 'conv_b' });
  const env = await app.post('/api/orchestrator/simulate', { channel: 'FAX', text: 'x' });
  assert.equal(env.ok, false);
  assert.match(env.hint, /SMS, WHATSAPP or VOICE/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL (404s from `/api/orchestrator/*`)

- [ ] **Step 3: Implement `routes/orchestrator.js`**

```js
// Conversation Orchestrator: a Configuration tells Twilio which traffic to capture (capture rules),
// how to group it into Conversations, and which Memory Store + Intelligence Configuration to use.
const express = require('express');
const { record, respond } = require('../lib/recorder');
const { requireClient, requireState, requireValue } = require('../lib/errors');
const { waitForOperation, pollUntil } = require('../lib/operations');
const { call } = require('../lib/snippets');
const {
  CHANNELS,
  buildOrchestratorConfiguration,
  buildSendMessageAction,
  buildSimulatedConversation,
  buildSimulatedCommunication,
} = require('../lib/builders');

const newestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
const oldestFirst = (a, b) => new Date(a.occurredAt || a.createdAt) - new Date(b.occurredAt || b.createdAt);

// Some API versions return the new configuration's ID on the Operation, others don't;
// in that case, find it by displayName.
async function resolveConfigurationId(client, { created, operation, displayName }) {
  const direct = operation?.related?.configurationId || created?.related?.configurationId || created?.id;
  if (direct) return direct;
  const configurations = await client.conversations.v2.configurations.list({ limit: 50 });
  const match = configurations.filter((c) => c.displayName === displayName).sort(newestFirst)[0];
  requireValue(match, `Configuration "${displayName}" was created, but could not be found by name.`);
  return match.id;
}

function requireChannel(config, channel, allowed) {
  requireValue(allowed.includes(channel), `Channel must be ${allowed.join(', ').replace(/, ([^,]*)$/, ' or $1')}.`);
  if (channel === 'WHATSAPP') requireValue(config.channels.whatsapp, 'Set TWILIO_WHATSAPP_NUMBER in .env to use WhatsApp.');
}

function orchestratorRoutes({ client, config, state, sleep }) {
  const router = express.Router();

  // Step 5: the Conversation Configuration that wires everything together (async: 202 + Operation).
  router.post('/configurations', respond((req) => {
    const current = state.get();
    const params = buildOrchestratorConfiguration({
      config,
      state: current,
      displayName: req.body.displayName || 'Conversations Tester',
      inactiveMinutes: Number(req.body.inactiveMinutes) || 5,
      closedMinutes: Number(req.body.closedMinutes) || 30,
    });
    return record({
      step: 'orchestrator.createConfiguration',
      state,
      code: [
        `const created = await ${call('client.conversations.v2.configurations.create', params)};`,
        '// 202 Accepted: poll the Operation until COMPLETED. Its `related.configurationId` is the new ID.',
        "const operation = await client.conversations.v2.operations(created.statusUrl.split('/').pop()).fetch();",
      ],
    }, async () => {
      requireClient(client);
      requireState(current, ['storeId', 'profileId', 'intelligenceConfigId']);
      requireValue(config.publicUrl, 'Set PUBLIC_URL in .env first: Orchestrator sends status callbacks to your webhook.');
      requireValue(Object.keys(params.channelSettings).length, 'No channels are enabled. Set TWILIO_PHONE_NUMBER in .env.');
      const created = await client.conversations.v2.configurations.create(params);
      const operation = created.statusUrl ? await waitForOperation(client, created.statusUrl, { sleep }) : null;
      const configurationId = await resolveConfigurationId(client, { created, operation, displayName: params.displayName });
      state.set({ orchestratorConfigId: configurationId, conversationId: null, conversationClosed: false });
      const configuration = await client.conversations.v2.configurations(configurationId).fetch();
      return { configuration, operation };
    });
  }));

  // Step 7: list our conversations and load one with its participants and communications.
  router.get('/conversation', respond((req) => {
    const current = state.get();
    return record({
      step: 'orchestrator.inspectConversation',
      state,
      code: [
        `const conversations = await ${call('client.conversations.v2.conversations.list', { limit: 20 })};`,
        "const conversation = await client.conversations.v2.conversations(conversationId).fetch();",
        "const participants = await client.conversations.v2.participants(conversationId).list();",
        `const communications = await ${call('client.conversations.v2.communications(conversationId).list', { limit: 100 })};`,
      ],
    }, async () => {
      requireClient(client);
      requireState(current, ['orchestratorConfigId']);
      const all = await client.conversations.v2.conversations.list({ limit: 20 });
      const conversations = all.filter((c) => c.configurationId === current.orchestratorConfigId).sort(newestFirst);
      const conversationId = req.query.id || current.conversationId || conversations[0]?.id;
      requireValue(conversationId, 'No conversations yet. Send a message or call your number (Step 6), then refresh.');
      if (conversationId !== current.conversationId) state.set({ conversationId, conversationClosed: false });
      const [conversation, participants, communications] = await Promise.all([
        client.conversations.v2.conversations(conversationId).fetch(),
        client.conversations.v2.participants(conversationId).list(),
        client.conversations.v2.communications(conversationId).list({ limit: 100 }),
      ]);
      if (conversation.status === 'CLOSED') state.set({ conversationClosed: true });
      return { conversations, conversation, participants, communications: [...communications].sort(oldestFirst) };
    });
  }));

  // Step 7: closing the conversation triggers CONVERSATION_END rules and memory extraction.
  router.post('/conversation/close', respond(() => {
    const current = state.get();
    return record({
      step: 'orchestrator.closeConversation',
      state,
      code: [`const conversation = await ${call(`client.conversations.v2.conversations('${current.conversationId}').update`, { status: 'CLOSED' })};`],
    }, async () => {
      requireClient(client);
      requireState(current, ['conversationId']);
      const conversation = await client.conversations.v2.conversations(current.conversationId).update({ status: 'CLOSED' });
      state.set({ conversationClosed: true });
      return { conversation };
    });
  }));

  // Step 6: reply as the agent. Orchestrator sends the message and adds it to the conversation.
  router.post('/reply', respond((req) => {
    const current = state.get();
    const channel = req.body.channel || 'SMS';
    const params = buildSendMessageAction({ config, channel, text: req.body.text || 'Hi! This is an agent reply from the Conversations Tester.' });
    return record({
      step: 'orchestrator.reply',
      state,
      code: [
        `const action = await ${call(`client.conversations.v2.actions('${current.conversationId}').create`, params)};`,
        '// Actions are async: fetch until status is no longer PENDING.',
        `const result = await client.conversations.v2.actions('${current.conversationId}', action.id).fetch();`,
      ],
    }, async () => {
      requireClient(client);
      requireState(current, ['conversationId']);
      requireChannel(config, channel, ['SMS', 'WHATSAPP']);
      const created = await client.conversations.v2.actions(current.conversationId).create(params);
      const action = await pollUntil(
        async () => ({ value: await client.conversations.v2.actions(current.conversationId, created.id).fetch() }),
        (a) => !['PENDING', 'QUEUED', 'IN_PROGRESS'].includes(a.status),
        { timeoutMs: 20000, sleep },
      );
      return { action };
    });
  }));

  // Step 6: add a communication through the API, for learners without a phone handy.
  router.post('/simulate', respond((req) => {
    const current = state.get();
    const channel = req.body.channel || 'SMS';
    const author = req.body.author === 'AGENT' ? 'AGENT' : 'CUSTOMER';
    const text = req.body.text || 'Hi, my last order arrived late. Also, can I upgrade to the premium plan?';
    const conversationParams = buildSimulatedConversation({ config, state: current, channel });
    const communicationParams = buildSimulatedCommunication({ config, channel, author, text });
    const target = current.conversationId || '<conversation.id>';
    return record({
      step: 'orchestrator.simulate',
      state,
      code: [
        ...(current.conversationId ? [] : [`const conversation = await ${call('client.conversations.v2.conversations.create', conversationParams)};`]),
        `const communication = await ${call(`client.conversations.v2.communications('${target}').create`, communicationParams)};`,
      ],
    }, async () => {
      requireClient(client);
      requireState(current, ['orchestratorConfigId']);
      requireChannel(config, channel, CHANNELS);
      let conversationId = current.conversationId;
      let conversation = null;
      if (!conversationId) {
        conversation = await client.conversations.v2.conversations.create(conversationParams);
        conversationId = conversation.id;
        state.set({ conversationId, conversationClosed: false });
      }
      const communication = await client.conversations.v2.communications(conversationId).create(communicationParams);
      return { conversation, communication, simulated: true };
    });
  }));

  return router;
}

module.exports = { orchestratorRoutes };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. The `requireChannel` message for `CHANNELS` reads `Channel must be SMS, WHATSAPP or VOICE.`

- [ ] **Step 5: Commit**

```bash
git add routes/orchestrator.js test/orchestrator.test.js
git commit -m "feat: add Orchestrator configuration, conversation, reply and simulate routes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Channel TwiML (SMS, WhatsApp, Voice) with signature validation

**Files:**
- Create: `routes/channels.js`
- Test: `test/channels.test.js`

**Interfaces:**
- Consumes: `deps.config`, `deps.events`, and `twilio.twiml`, `twilio.validateRequest`.
- Produces:
  - `channelRoutes(deps)` with `POST /channels/sms`, `POST /channels/whatsapp`, `POST /channels/voice`, and `POST /channels/voice/turn?turn=N`. Each returns TwiML and publishes `channels` events (`SMS_INBOUND`, `WHATSAPP_INBOUND`, `VOICE_CALL`, `VOICE_TURN`).
  - `MAX_VOICE_TURNS = 3`

- [ ] **Step 1: Write the failing test** `test/channels.test.js`

```js
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
  const params = { From: '+15559998888', Body: 'Hi' };
  const bad = await app.postForm('/channels/sms', params, { 'X-Twilio-Signature': 'nope' });
  assert.equal(bad.status, 403);
  const signature = twilio.getExpectedTwilioSignature('test-auth-token', 'https://tester.example.ngrok.app/channels/sms', params);
  const good = await app.postForm('/channels/sms', params, { 'X-Twilio-Signature': signature });
  assert.equal(good.status, 200);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL (404s from `/channels/*`)

- [ ] **Step 3: Implement `routes/channels.js`**

```js
// Twilio calls these when someone texts, WhatsApps or calls your number. The replies are
// deliberately simple: the point is that Orchestrator captures both sides of the conversation
// through the capture rules from Step 5, without changing this code.
const express = require('express');
const twilio = require('twilio');

const { MessagingResponse, VoiceResponse } = twilio.twiml;
const MAX_VOICE_TURNS = 3;

// Only accept requests signed by Twilio (when TWILIO_AUTH_TOKEN is set). The URL must be the
// public one Twilio called (ngrok), not localhost.
function twilioSignature(config) {
  return (req, res, next) => {
    if (!config.authToken) return next();
    const url = `${config.publicUrl}${req.originalUrl}`;
    const valid = twilio.validateRequest(config.authToken, req.header('X-Twilio-Signature') || '', url, req.body || {});
    if (valid) return next();
    res.status(403).type('text/plain').send('Invalid Twilio signature');
  };
}

const truncate = (text = '', max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function channelRoutes({ config, events }) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(twilioSignature(config));

  const messagingReply = (channel) => (req, res) => {
    const { From: from, To: to, Body: body = '', MessageSid: messageSid } = req.body;
    events.publish('channels', `${channel}_INBOUND`, { from, to, body, messageSid });
    const twiml = new MessagingResponse();
    twiml.message(`Auto-reply from the Conversations Tester: got "${truncate(body)}". Keep chatting, then open Step 7 to see this conversation.`);
    res.type('text/xml').send(twiml.toString());
  };

  const gatherTurn = (twiml, turn) => {
    twiml.gather({ input: 'speech', speechTimeout: 'auto', action: `/channels/voice/turn?turn=${turn}`, method: 'POST' });
    twiml.say("I didn't hear anything. Goodbye!");
  };

  router.post('/sms', messagingReply('SMS'));
  router.post('/whatsapp', messagingReply('WHATSAPP'));

  router.post('/voice', (req, res) => {
    events.publish('channels', 'VOICE_CALL', { from: req.body.From, to: req.body.To, callSid: req.body.CallSid });
    const twiml = new VoiceResponse();
    twiml.say('Hi! You reached the Twilio Conversations Tester. Tell me how I can help you today.');
    gatherTurn(twiml, 1);
    res.type('text/xml').send(twiml.toString());
  });

  router.post('/voice/turn', (req, res) => {
    const turn = Number(req.query.turn) || 1;
    const speech = (req.body.SpeechResult || '').trim();
    events.publish('channels', 'VOICE_TURN', { turn, speech, callSid: req.body.CallSid });
    const twiml = new VoiceResponse();
    if (!speech) {
      twiml.say("Sorry, I didn't catch that. Goodbye!");
      twiml.hangup();
    } else if (turn >= MAX_VOICE_TURNS) {
      twiml.say('Thanks! Your conversation has been captured. Check the tester to see what Memory and Intelligence learned. Goodbye!');
      twiml.hangup();
    } else {
      twiml.say(`Got it. You said: ${speech}. Tell me more.`);
      gatherTurn(twiml, turn + 1);
    }
    res.type('text/xml').send(twiml.toString());
  });

  return router;
}

module.exports = { channelRoutes, MAX_VOICE_TURNS };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/channels.js test/channels.test.js
git commit -m "feat: add SMS, WhatsApp and Voice TwiML with signature validation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Reset route and final app wiring

**Files:**
- Create: `routes/reset.js`
- Modify: `lib/app.js` (replace `optionalRoutes` with direct requires)
- Test: `test/reset.test.js`

**Interfaces:**
- Consumes: `waitForOperation`, `record`, `respond`, `requireClient`.
- Produces: `resetRoutes(deps)` with `POST /api/reset`, which returns an envelope with `data = { deleted: [{ label, id, ok, note?, error? }] }`. It resets state and clears events.

- [ ] **Step 1: Write the failing test** `test/reset.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp } = require('./_support/harness');

function fakeClient({ storeRemoveError } = {}) {
  const order = [];
  const remove = (label, result = true, error) => mock.fn(async () => {
    order.push(label);
    if (error) throw error;
    return result;
  });
  const client = {
    conversations: { v2: {
      configurations: () => ({ remove: remove('orchestrator', { statusUrl: 'https://conversations.twilio.com/v2/ControlPlane/Operations/op1' }) }),
      operations: () => ({ fetchWithHttpInfo: async () => ({ body: { status: 'COMPLETED' }, headers: {} }) }),
    } },
    intelligence: { v3: {
      configurations: () => ({ remove: remove('intelligence') }),
      operators: () => ({ remove: remove('operator') }),
    } },
    memory: { v1: {
      stores: () => ({ remove: remove('store', true, storeRemoveError) }),
      operations: () => ({ fetchWithHttpInfo: async () => ({ body: { status: 'COMPLETED' }, headers: {} }) }),
    } },
  };
  return { client, order };
}

const FULL = { storeId: 's', profileId: 'p', operatorId: 'o', intelligenceConfigId: 'i', orchestratorConfigId: 'c', conversationId: 'conv' };

test('deletes resources in dependency order and clears state and events', async (t) => {
  const { client, order } = fakeClient();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set(FULL);
  app.events.publish('channels', 'X', {});
  const env = await app.post('/api/reset');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(order, ['orchestrator', 'intelligence', 'operator', 'store']);
  assert.ok(env.data.deleted.every((d) => d.ok));
  assert.equal(env.state.storeId, null);
  assert.equal(app.events.recent().length, 0);
});

test('a 404 counts as already deleted; other failures are reported but state still resets', async (t) => {
  const notFound = Object.assign(new Error('Not found'), { status: 404 });
  const { client } = fakeClient({ storeRemoveError: notFound });
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set(FULL);
  const env = await app.post('/api/reset');
  const store = env.data.deleted.find((d) => d.label === 'Memory store');
  assert.equal(store.ok, true);
  assert.match(store.note, /already deleted/);
  assert.equal(env.state.orchestratorConfigId, null);
});

test('skips resources that were never created', async (t) => {
  const { client, order } = fakeClient();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ storeId: 's' });
  const env = await app.post('/api/reset');
  assert.deepEqual(order, ['store']);
  assert.equal(env.data.deleted.length, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL (`/api/reset` 404)

- [ ] **Step 3: Implement `routes/reset.js`**

```js
// Deletes everything the tester created, newest dependency first, then clears state.json.
// Conversations themselves are not deleted; they are removed with their configuration.
const express = require('express');
const { record, respond } = require('../lib/recorder');
const { requireClient } = require('../lib/errors');
const { waitForOperation } = require('../lib/operations');

function resetRoutes({ client, state, events, sleep }) {
  const router = express.Router();

  router.post('/', respond(() => {
    const current = state.get();
    return record({
      step: 'reset',
      state,
      code: [
        `await client.conversations.v2.configurations('${current.orchestratorConfigId}').remove();`,
        `await client.intelligence.v3.configurations('${current.intelligenceConfigId}').remove();`,
        `await client.intelligence.v3.operators('${current.operatorId}').remove();`,
        `await client.memory.v1.stores('${current.storeId}').remove();`,
      ],
    }, async () => {
      requireClient(client);
      const deleted = [];
      const attempt = async (label, id, remove) => {
        if (!id) return;
        try {
          const result = await remove();
          if (result?.statusUrl) await waitForOperation(client, result.statusUrl, { sleep });
          deleted.push({ label, id, ok: true });
        } catch (err) {
          if (err.status === 404) deleted.push({ label, id, ok: true, note: 'already deleted' });
          else deleted.push({ label, id, ok: false, error: err.message });
        }
      };
      await attempt('Conversation configuration', current.orchestratorConfigId, () => client.conversations.v2.configurations(current.orchestratorConfigId).remove());
      await attempt('Intelligence configuration', current.intelligenceConfigId, () => client.intelligence.v3.configurations(current.intelligenceConfigId).remove());
      await attempt('Custom operator', current.operatorId, () => client.intelligence.v3.operators(current.operatorId).remove());
      await attempt('Memory store', current.storeId, () => client.memory.v1.stores(current.storeId).remove());
      state.reset();
      events.clear();
      return { deleted };
    });
  }));

  return router;
}

module.exports = { resetRoutes };
```

- [ ] **Step 4: Replace `optionalRoutes` in `lib/app.js` with direct requires**

Replace the top of `lib/app.js`, through the end of the `optionalRoutes` function, with:
```js
// Builds the Express app. server.js starts it; tests boot it with a fake Twilio client.
const path = require('node:path');
const express = require('express');
const { webhookRoutes } = require('../routes/webhooks');
const { channelRoutes } = require('../routes/channels');
const { setupRoutes } = require('../routes/setup');
const { memoryRoutes } = require('../routes/memory');
const { intelligenceRoutes } = require('../routes/intelligence');
const { orchestratorRoutes } = require('../routes/orchestrator');
const { resetRoutes } = require('../routes/reset');
```
Then replace the body section between `app.use('/webhooks', webhookRoutes(deps));` and the `/api` 404 fallback with:
```js
  app.use('/webhooks', webhookRoutes(deps));
  app.use('/channels', channelRoutes(deps));

  app.use('/api', express.json({ limit: '1mb' }));
  app.get('/api/state', (req, res) => res.json(state.get()));
  app.use('/api/setup', setupRoutes(deps));
  app.use('/api/memory', memoryRoutes(deps));
  app.use('/api/intelligence', intelligenceRoutes(deps));
  app.use('/api/orchestrator', orchestratorRoutes(deps));
  app.use('/api/reset', resetRoutes(deps));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (every test file)

- [ ] **Step 6: Commit**

```bash
git add routes/reset.js lib/app.js test/reset.test.js
git commit -m "feat: add reset route and wire all routes directly

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: UI shell: layout, rail, result panel, event log, step 0

**Files:**
- Create: `public/package.json`, `public/index.html` (replace the placeholder), `public/styles.css`, `public/app.js`, `public/lib/dom.js`, `public/lib/api.js`, `public/lib/progress.js`, `public/lib/result-panel.js`, `public/lib/event-log.js`, `public/lib/timeline.js`, `public/steps/index.js`, `public/steps/setup.js`
- Test: `test/progress.test.js`, `test/frontend-modules.test.js`

**Interfaces:**
- Consumes: the HTTP API from Tasks 6–13.
- Produces (browser):
  - `h(tag, attrs, ...children)`, `json(value)`, `field(spec)`, `formValues(form)`, `badge(text, tone)`, `card(title, ...children)`, `kv(object)`
  - `api.get(path)` and `api.post(path, body)`, which return an envelope and never throw
  - `STEPS`, `stepStatus(step, state)`, `nextStepId(state)`
  - `resultPanel(envelope, render)`
  - `createEventLog(container) → { onEvent(fn) → unsubscribe }`
  - `timeline(communications, { customerAddress })`
  - Step module contract: `export default { id, docs, learn, render?, mount(el, ctx) → cleanup? }`
  - `ctx = { config, defaults, state(), api, run({ button, call, render, into }), formStep(el, { fields, submitLabel, call, render, extra }), poll({ call, isDone, onResult, every, times }) → stop, onEvent(fn), goTo(id) }`

- [ ] **Step 1: Write the failing tests**

`test/progress.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_STATE } = require('../lib/state');

test('steps unlock in dependency order', async () => {
  const { STEPS, stepStatus, nextStepId } = await import('../public/lib/progress.js');
  const byId = (id) => STEPS.find((s) => s.id === id);
  const empty = structuredClone(DEFAULT_STATE);
  assert.equal(stepStatus(byId(1), empty).status, 'ready');
  assert.equal(stepStatus(byId(3), empty).status, 'optional');
  const blocked = stepStatus(byId(5), empty);
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.reason, /Step 1, Step 2, Step 4/);
  assert.equal(nextStepId(empty), 1);

  const ready = { ...empty, storeId: 's', profileId: 'p', intelligenceConfigId: 'i' };
  assert.equal(stepStatus(byId(2), ready).status, 'done');
  assert.equal(nextStepId(ready), 5);
  assert.equal(stepStatus(byId(7), { ...ready, conversationId: 'c', conversationClosed: true }).status, 'done');
});

test('every step has a unique id from 0 to 9', async () => {
  const { STEPS } = await import('../public/lib/progress.js');
  assert.deepEqual(STEPS.map((s) => s.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
```

`test/frontend-modules.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('step modules match the progress rail and implement mount()', async () => {
  const { STEPS } = await import('../public/lib/progress.js');
  const { default: modules } = await import('../public/steps/index.js');
  const ids = modules.map((m) => m.id).sort((a, b) => a - b);
  for (const mod of modules) {
    assert.equal(typeof mod.mount, 'function', `step ${mod.id} mount`);
    assert.equal(typeof mod.learn, 'string', `step ${mod.id} learn`);
    assert.ok(STEPS.some((s) => s.id === mod.id), `step ${mod.id} in STEPS`);
  }
  assert.equal(new Set(ids).size, ids.length);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module .../public/lib/progress.js`

- [ ] **Step 3: Create `public/package.json`**

```json
{ "type": "module" }
```

- [ ] **Step 4: Create `public/lib/progress.js`**

```js
// The learning path. Each step lists the state it needs, so the rail can show what is
// done, ready, or blocked (and why).
export const STEPS = [
  { id: 0, product: 'Setup', title: 'Setup check', requires: [], done: () => false },
  { id: 1, product: 'Memory', title: 'Create a Memory Store', requires: [], done: (s) => Boolean(s.storeId) },
  { id: 2, product: 'Memory', title: 'Create your Profile', requires: ['storeId'], done: (s) => Boolean(s.profileId) },
  { id: 3, product: 'Intelligence', title: 'Explore & create operators', requires: [], optional: true, done: (s) => Boolean(s.operatorId) },
  { id: 4, product: 'Intelligence', title: 'Create an Intelligence Configuration', requires: [], done: (s) => Boolean(s.intelligenceConfigId) },
  { id: 5, product: 'Orchestrator', title: 'Create a Conversation Configuration', requires: ['storeId', 'profileId', 'intelligenceConfigId'], done: (s) => Boolean(s.orchestratorConfigId) },
  { id: 6, product: 'Orchestrator', title: 'Talk on any channel', requires: ['orchestratorConfigId'], done: (s) => Boolean(s.conversationId) },
  { id: 7, product: 'Orchestrator', title: 'Inspect & close the conversation', requires: ['conversationId'], done: (s) => Boolean(s.conversationClosed) },
  { id: 8, product: 'Memory', title: 'See what Memory learned', requires: ['profileId', 'conversationId'], done: () => false },
  { id: 9, product: 'Intelligence', title: 'See Intelligence results', requires: ['conversationId'], done: () => false },
];

const CREATED_BY = { storeId: 'Step 1', profileId: 'Step 2', intelligenceConfigId: 'Step 4', orchestratorConfigId: 'Step 5', conversationId: 'Step 6' };

export function stepStatus(step, state) {
  if (step.done(state)) return { status: 'done' };
  const missing = step.requires.filter((key) => !state[key]);
  if (missing.length) return { status: 'blocked', reason: `Needs ${[...new Set(missing.map((key) => CREATED_BY[key]))].join(', ')}` };
  return { status: step.optional ? 'optional' : 'ready' };
}

export function nextStepId(state) {
  const next = STEPS.find((step) => step.id > 0 && !step.optional && stepStatus(step, state).status === 'ready');
  return next ? next.id : 9;
}
```

- [ ] **Step 5: Create `public/lib/dom.js`**

```js
// Tiny DOM helpers. Server data is always added as text (never innerHTML), so message content
// such as "<b>" shows up literally instead of being interpreted as HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value; // static, trusted copy only
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export const json = (value) => h('pre', { class: 'json' }, JSON.stringify(value, null, 2));

export function field({ name, label, value = '', help, type = 'text', options, disabled }) {
  let input;
  if (options) input = h('select', { name, disabled }, options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  else if (type === 'textarea') input = h('textarea', { name, rows: 4, disabled }, value);
  else input = h('input', { name, type, value, disabled });
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, help && h('small', { class: 'muted' }, help));
}

export const formValues = (form) => Object.fromEntries(new FormData(form).entries());

export const badge = (text, tone = 'neutral') => h('span', { class: `badge badge-${tone}` }, text);

export const card = (title, ...children) => h('div', { class: 'card' }, title && h('h4', {}, title), ...children);

export function kv(object) {
  const show = (v) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return h('dl', { class: 'kv' }, Object.entries(object).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, show(v))]));
}

export const empty = (text) => h('p', { class: 'muted empty' }, text);
```

- [ ] **Step 6: Create `public/lib/api.js`**

```js
// Calls this app's own /api routes. Always resolves to a result envelope, even on network errors.
async function request(method, path, body) {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return data ?? { ok: false, error: { message: `Server answered ${res.status} without JSON` }, hint: 'Check the terminal running npm start.' };
  } catch (err) {
    return { ok: false, error: { message: err.message }, hint: 'Could not reach the local server. Is `npm start` still running?' };
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
};
```

- [ ] **Step 7: Create `public/lib/result-panel.js`**

```js
// Shows a step's result envelope in three tabs: Rendered (friendly view), JSON (every HTTP
// call, including async polls), and Code (copy-paste Node.js + curl).
import { h, json } from './dom.js';

const NODE_PREAMBLE = `// npm install twilio dotenv
require('dotenv').config();
const client = require('twilio')(
  process.env.TWILIO_API_KEY,
  process.env.TWILIO_API_SECRET,
  { accountSid: process.env.TWILIO_ACCOUNT_SID }
);

`;

const statusTone = (status) => (status < 300 ? 'success' : status < 400 ? 'info' : 'danger');

function safeRender(render, data) {
  try {
    return render ? render(data) : json(data);
  } catch (err) {
    return h('div', {}, h('p', { class: 'muted' }, `Could not render this result (${err.message}). Raw data:`), json(data));
  }
}

function errorView(envelope) {
  const error = envelope.error || {};
  return h('div', { class: 'error-view' },
    h('p', {}, h('strong', {}, error.message || 'Unknown error')),
    error.status && h('p', {}, `HTTP ${error.status}${error.code ? ` · Twilio error ${error.code}` : ''}`),
    error.moreInfo && h('p', {}, h('a', { href: error.moreInfo, target: '_blank', rel: 'noopener' }, 'Twilio error reference ↗')),
    error.details && json(error.details));
}

function exchangesView(envelope) {
  if (!envelope.exchanges?.length) {
    return h('div', {}, h('p', { class: 'muted' }, 'No HTTP calls were made to Twilio.'), envelope.error && json(envelope.error));
  }
  return h('div', { class: 'exchanges' }, envelope.exchanges.map((x, i) => {
    const isPoll = x.request.method === 'GET' && /\/(Operations|Actions)\//.test(x.request.url);
    return h('details', { class: 'exchange', open: i === 0 },
      h('summary', {},
        h('code', {}, `${x.request.method} ${x.request.url}`), ' ',
        x.response ? h('span', { class: `badge badge-${statusTone(x.response.status)}` }, String(x.response.status)) : h('span', { class: 'badge badge-danger' }, 'network error'),
        isPoll && h('span', { class: 'badge badge-neutral' }, 'poll'),
        h('span', { class: 'muted' }, ` ${x.durationMs} ms`)),
      x.request.body != null && [h('h5', {}, 'Request body'), json(x.request.body)],
      h('h5', {}, 'Response'),
      json(x.response ? { status: x.response.status, headers: x.response.headers, body: x.response.body } : x.networkError));
  }));
}

function copyable(text) {
  const button = h('button', { type: 'button', class: 'copy' }, 'Copy');
  button.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(text);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1500);
  });
  return h('div', { class: 'copyable' }, button, h('pre', { class: 'code' }, text));
}

function codeView(snippet = {}) {
  return h('div', {},
    h('h5', {}, 'Node.js (twilio SDK)'), copyable(NODE_PREAMBLE + (snippet.node || '')),
    h('h5', {}, 'curl'), copyable(snippet.curl || '# No HTTP calls were made'));
}

export function resultPanel(envelope, render) {
  const tabs = [
    ['Rendered', () => (envelope.ok ? safeRender(render, envelope.data) : errorView(envelope))],
    ['JSON', () => exchangesView(envelope)],
    ['Code', () => codeView(envelope.snippet)],
  ];
  const body = h('div', { class: 'tab-body' });
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  const select = (index) => {
    [...bar.children].forEach((button, i) => button.setAttribute('aria-selected', String(i === index)));
    body.replaceChildren(tabs[index][1]());
  };
  tabs.forEach(([label], i) => bar.append(h('button', { type: 'button', role: 'tab', onClick: () => select(i) }, label)));
  const calls = envelope.exchanges?.length ?? 0;
  const header = h('div', { class: `result-header ${envelope.ok ? 'ok' : 'fail'}` },
    h('strong', {}, envelope.ok ? '✓ Success' : '✕ Failed'),
    h('span', { class: 'muted' }, ` · ${calls} HTTP call${calls === 1 ? '' : 's'} · ${envelope.durationMs ?? 0} ms`));
  const panel = h('section', { class: 'result' }, header, envelope.hint && h('div', { class: 'hint' }, '💡 ', envelope.hint), bar, body);
  select(0);
  return panel;
}
```

- [ ] **Step 8: Create `public/lib/event-log.js`**

```js
// Live log of webhooks (Server-Sent Events from GET /events). Deduped by event id, so a
// reconnect, which replays recent events, never shows duplicates.
import { h, json } from './dom.js';

const FILTERS = ['all', 'orchestrator', 'intelligence', 'channels'];

export function createEventLog(container) {
  const seen = new Set();
  const listeners = new Set();
  let filter = 'all';
  const list = h('ol', { class: 'event-list' });
  const status = h('span', { class: 'muted small' }, 'connecting…');

  const chips = FILTERS.map((name) => h('button', {
    type: 'button',
    class: 'chip',
    'aria-pressed': String(name === 'all'),
    onClick: () => {
      filter = name;
      chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.textContent === name)));
      applyFilter();
    },
  }, name));

  function applyFilter() {
    for (const item of list.children) item.hidden = filter !== 'all' && item.dataset.source !== filter;
  }

  function add(event) {
    if (seen.has(event.id)) return;
    seen.add(event.id);
    const item = h('li', { 'data-source': event.source },
      h('details', {},
        h('summary', {},
          h('span', { class: `src src-${event.source}` }, event.source), ' ',
          h('strong', {}, event.type), ' ',
          h('time', { class: 'muted' }, new Date(event.at).toLocaleTimeString())),
        json(event.payload)));
    list.prepend(item);
    applyFilter();
    listeners.forEach((fn) => fn(event));
  }

  container.append(
    h('div', { class: 'event-head' }, h('h3', {}, 'Live events'), status,
      h('button', { type: 'button', class: 'link', onClick: () => list.replaceChildren() }, 'Clear')),
    h('div', { class: 'chips' }, chips),
    list,
    h('p', { class: 'muted small' }, 'Webhooks from Twilio (and calls to your number) appear here in real time.'));

  const source = new EventSource('/events');
  source.onopen = () => { status.textContent = '● live'; };
  source.onerror = () => { status.textContent = 'reconnecting…'; };
  source.onmessage = (message) => {
    try {
      add(JSON.parse(message.data));
    } catch {
      // ignore malformed events
    }
  };

  return { onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
}
```

- [ ] **Step 9: Create `public/lib/timeline.js`**

```js
// Renders Orchestrator communications as a chat-style timeline with a channel label on each.
import { h, empty } from './dom.js';

const CHANNEL_LABEL = { SMS: '💬 SMS', WHATSAPP: '🟢 WhatsApp', VOICE: '📞 Voice', RCS: '💬 RCS', EMAIL: '✉️ Email', CHAT: '💭 Chat' };
const normalize = (address = '') => String(address).replace(/^whatsapp:/, '');

export function timeline(communications, { customerAddress } = {}) {
  if (!communications?.length) return empty('No communications yet.');
  return h('ol', { class: 'timeline' }, communications.map((c) => {
    const channel = c.author?.channel || c.channelId || '';
    const fromCustomer = normalize(c.author?.address) === normalize(customerAddress);
    const when = c.occurredAt || c.createdAt;
    return h('li', { class: `bubble ${fromCustomer ? 'customer' : 'agent'}` },
      h('div', { class: 'bubble-meta' },
        `${CHANNEL_LABEL[channel] || channel} · ${fromCustomer ? 'Customer' : 'Agent'}${when ? ` · ${new Date(when).toLocaleTimeString()}` : ''}`),
      h('div', { class: 'bubble-text' }, c.content?.text ?? JSON.stringify(c.content)),
      c.content?.type === 'TRANSCRIPTION' && h('small', { class: 'muted' }, 'voice transcription'));
  }));
}
```

- [ ] **Step 10: Create `public/steps/setup.js` and `public/steps/index.js`**

`public/steps/setup.js`:
```js
import { h, kv } from '../lib/dom.js';

function renderChecks(data) {
  return h('ul', { class: 'checklist' }, data.checks.map((check) => {
    const tone = check.ok ? 'ok' : check.optional ? 'warn' : 'fail';
    const icon = check.ok ? '✓' : check.optional ? '⚠' : '✕';
    return h('li', { class: tone }, h('strong', {}, `${icon} ${check.label}`), h('div', { class: 'muted' }, check.detail));
  }));
}

export default {
  id: 0,
  docs: 'https://www.twilio.com/docs/conversations/orchestrator/quickstart',
  learn: `
    <p>This tester walks through three products that work together:</p>
    <ul>
      <li><strong>Conversation Orchestrator</strong> captures your SMS, WhatsApp and Voice traffic and groups it into <em>conversations</em>.</li>
      <li><strong>Conversation Memory</strong> keeps a <em>profile</em> per customer and learns from each conversation.</li>
      <li><strong>Conversation Intelligence</strong> runs AI <em>language operators</em> (sentiment, summary, your own prompts) on conversations.</li>
    </ul>
    <p>First, check that your <code>.env</code> is filled in, your API key works, your number's webhooks point here, and Twilio can reach this app through your public URL (ngrok).</p>
    <p class="note">These products only appear in the <strong>new Twilio Console</strong> (1console.twilio.com), and they need the AI/ML Features Addendum accepted. They are not HIPAA eligible or PCI compliant, so use test data only.</p>`,
  render: renderChecks,
  mount(el, ctx) {
    const out = h('div', { class: 'result-slot' });
    const check = h('button', { type: 'button', class: 'primary' }, 'Run setup check');
    const point = h('button', { type: 'button' }, "Point my number's webhooks at this app");
    check.addEventListener('click', () => ctx.run({ button: check, into: out, call: () => ctx.api.post('/api/setup/check'), render: renderChecks }));
    point.addEventListener('click', () => ctx.run({
      button: point,
      into: out,
      call: () => ctx.api.post('/api/setup/point-number'),
      render: (d) => kv({ 'Number SID': d.sid, 'SMS webhook': d.smsUrl, 'Voice webhook': d.voiceUrl }),
    }));
    el.append(h('div', { class: 'actions' }, check, point), out);
    check.click();
  },
};
```

`public/steps/index.js` (Tasks 15 and 16 add the other steps):
```js
import setup from './setup.js';

export default [setup];
```

- [ ] **Step 11: Create `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Twilio Conversations Tester</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">Conversations Tester</span>
      <span class="muted">Orchestrator · Memory · Intelligence</span>
    </div>
    <div class="top-actions">
      <button id="run-all" type="button">Run setup steps 1–5</button>
      <button id="reset" type="button" class="danger">Reset</button>
    </div>
  </header>
  <div class="layout">
    <nav id="rail" class="rail" aria-label="Steps"></nav>
    <main id="main" class="main" tabindex="-1"></main>
    <aside id="events" class="events" aria-label="Live events"></aside>
  </div>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 12: Create `public/styles.css`**

```css
/* Twilio brand tokens (from the Twilio design guidelines). Blue = actions, red = brand accent. */
:root {
  --red-50:#FFF1F1; --red-500:#DD1020; --brand-red:#F22F46;
  --blue-50:#E4F7FF; --blue-400:#0E8CDF; --blue-500:#1866EE; --blue-600:#1953B9;
  --neutral-50:#F3F4F7; --neutral-100:#DDE0E6; --neutral-300:#99A2B0; --neutral-500:#676E88;
  --neutral-700:#3F4062; --neutral-800:#282A48; --neutral-900:#000D25; --white:#FFFFFF;
  --green-success:#14804A; --amber-warning:#F0B429;

  --color-bg: var(--neutral-50);
  --color-surface: var(--white);
  --color-border: var(--neutral-100);
  --color-text: var(--neutral-900);
  --color-text-muted: var(--neutral-500);
  --color-brand: var(--brand-red);
  --color-primary: var(--blue-500);
  --color-primary-hover: var(--blue-600);
  --color-danger: var(--red-500);
  --color-success: var(--green-success);
  --color-warning: var(--amber-warning);
  --color-info: var(--blue-400);

  --product-memory: #7B61FF;
  --product-intelligence: var(--blue-400);
  --product-orchestrator: var(--brand-red);
  --product-setup: var(--neutral-500);

  --font-text: "Twilio Sans Text", "Source Sans Pro", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: "Twilio Sans Display", "Source Sans Pro", system-ui, sans-serif;
  --font-mono: "Twilio Sans Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --radius: 8px;
}

* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font-text); color: var(--color-text); background: var(--color-bg); line-height: 1.5; }
h1, h2, h3, h4 { font-family: var(--font-display); line-height: 1.2; }
code, pre { font-family: var(--font-mono); font-size: 0.85rem; }
a { color: var(--color-primary); }
button { font: inherit; cursor: pointer; border-radius: var(--radius); border: 1px solid var(--color-border); background: var(--color-surface); padding: 0.45rem 0.9rem; color: var(--color-text); }
button:hover { border-color: var(--color-primary); }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
button.primary { background: var(--color-primary); border-color: var(--color-primary); color: var(--white); font-weight: 600; }
button.primary:hover { background: var(--color-primary-hover); }
button.danger { color: var(--color-danger); }
button.link { border: none; background: none; color: var(--color-primary); padding: 0; }
button[disabled] { opacity: 0.6; cursor: progress; }
button.busy::after { content: " …"; }

.topbar { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1.25rem; background: var(--color-surface); border-bottom: 1px solid var(--color-border); position: sticky; top: 0; z-index: 2; }
.brand { display: flex; align-items: center; gap: 0.6rem; }
.brand-mark { width: 14px; height: 14px; border-radius: 50%; background: var(--color-brand); box-shadow: 0 0 0 4px var(--red-50); }
.brand-name { font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; }
.top-actions { display: flex; gap: 0.5rem; }

.layout { display: grid; grid-template-columns: 270px minmax(0, 1fr) 340px; min-height: calc(100vh - 58px); }
@media (max-width: 1100px) { .layout { grid-template-columns: 230px minmax(0, 1fr); } .events { grid-column: 1 / -1; } }
@media (max-width: 720px) { .layout { grid-template-columns: 1fr; } }

.rail { padding: 1rem; border-right: 1px solid var(--color-border); background: var(--color-surface); }
.rail h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin: 1rem 0 0.4rem; }
.rail ol { list-style: none; margin: 0; padding: 0; }
.rail a { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.45rem 0.5rem; border-radius: var(--radius); color: var(--color-text); text-decoration: none; }
.rail a:hover { background: var(--color-bg); }
.rail a[aria-current="page"] { background: var(--blue-50); font-weight: 600; }
.rail .status { width: 1.2rem; flex: none; text-align: center; }
.rail .done .status { color: var(--color-success); }
.rail .blocked { color: var(--color-text-muted); }
.rail .next .status { color: var(--color-primary); }
.rail small { display: block; color: var(--color-text-muted); font-weight: 400; }

.main { padding: 1.5rem 2rem 4rem; max-width: 960px; }
.step-header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.step-header h2 { margin: 0.25rem 0; font-size: 1.6rem; }
.product { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.15rem 0.5rem; border-radius: 999px; color: var(--white); }
.product-Memory { background: var(--product-memory); }
.product-Intelligence { background: var(--product-intelligence); }
.product-Orchestrator { background: var(--product-orchestrator); }
.product-Setup { background: var(--product-setup); }
.learn { background: var(--color-surface); border: 1px solid var(--color-border); border-left: 4px solid var(--color-primary); border-radius: var(--radius); padding: 0.5rem 1.25rem; margin: 1rem 0; }
.learn .note { color: var(--color-text-muted); font-size: 0.9rem; }
.blocked-banner { background: #FFF8E6; border: 1px solid var(--color-warning); border-radius: var(--radius); padding: 0.6rem 1rem; }

.step-form { display: grid; gap: 0.75rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1rem 1.25rem; margin: 1rem 0; }
.field { display: grid; gap: 0.25rem; }
.field-label { font-weight: 600; font-size: 0.9rem; }
.field input, .field select, .field textarea { font: inherit; padding: 0.45rem 0.6rem; border: 1px solid var(--neutral-300); border-radius: 6px; background: var(--color-surface); color: var(--color-text); }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin: 0.5rem 0; }

.result { margin: 1rem 0; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); overflow: hidden; }
.result-header { padding: 0.6rem 1rem; border-bottom: 1px solid var(--color-border); }
.result-header.ok strong { color: var(--color-success); }
.result-header.fail strong { color: var(--color-danger); }
.hint { padding: 0.6rem 1rem; background: #FFF8E6; border-bottom: 1px solid var(--color-border); }
.tabs { display: flex; gap: 0.25rem; padding: 0.5rem 1rem 0; border-bottom: 1px solid var(--color-border); }
.tabs button { border: none; border-bottom: 2px solid transparent; border-radius: 0; background: none; padding: 0.4rem 0.75rem; }
.tabs button[aria-selected="true"] { border-bottom-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
.tab-body { padding: 1rem; overflow-x: auto; }
pre.json, pre.code { background: var(--neutral-900); color: #E6EDF7; padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 480px; }
.copyable { position: relative; }
.copyable .copy { position: absolute; top: 0.4rem; right: 0.4rem; font-size: 0.75rem; padding: 0.15rem 0.5rem; }
.exchange { border: 1px solid var(--color-border); border-radius: 6px; padding: 0.4rem 0.75rem; margin-bottom: 0.5rem; }
.exchange summary { cursor: pointer; }
.exchange code { word-break: break-all; }

.badge { display: inline-block; font-size: 0.75rem; font-weight: 600; padding: 0.05rem 0.45rem; border-radius: 999px; margin-left: 0.25rem; background: var(--neutral-100); }
.badge-success { background: #E3F5EC; color: var(--color-success); }
.badge-danger { background: var(--red-50); color: var(--color-danger); }
.badge-info { background: var(--blue-50); color: var(--blue-600); }
.badge-warning { background: #FFF8E6; color: #8A6100; }

.card { border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.75rem 1rem; margin-bottom: 0.75rem; background: var(--color-surface); }
.card h4 { margin: 0 0 0.5rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.75rem; }
.kv { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0; }
.kv dt { color: var(--color-text-muted); }
.kv dd { margin: 0; word-break: break-all; }
.checklist { list-style: none; padding: 0; margin: 0; }
.checklist li { padding: 0.5rem 0; border-bottom: 1px solid var(--color-border); }
.checklist .ok strong { color: var(--color-success); }
.checklist .warn strong { color: #8A6100; }
.checklist .fail strong { color: var(--color-danger); }
.flow { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.flow .node { border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.4rem 0.75rem; background: var(--color-bg); }
.flow .arrow { color: var(--color-text-muted); }
.empty { font-style: italic; }
.waiting { color: var(--color-text-muted); }
.waiting::before { content: "⏳ "; }

.subtabs { display: flex; gap: 0.25rem; flex-wrap: wrap; margin: 1rem 0 0; }
.subtabs button[aria-selected="true"] { background: var(--color-primary); color: var(--white); border-color: var(--color-primary); }
.subtab-panel { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1rem 1.25rem; margin-top: 0.5rem; }

.timeline { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.bubble { max-width: 75%; padding: 0.5rem 0.75rem; border-radius: 12px; }
.bubble.customer { background: var(--blue-50); justify-self: end; }
.bubble.agent { background: var(--neutral-100); justify-self: start; }
.bubble-meta { font-size: 0.75rem; color: var(--color-text-muted); }
.bubble-text { white-space: pre-wrap; }

.events { padding: 1rem; border-left: 1px solid var(--color-border); background: var(--color-surface); max-height: calc(100vh - 58px); overflow-y: auto; position: sticky; top: 58px; }
.event-head { display: flex; align-items: center; gap: 0.5rem; justify-content: space-between; }
.event-head h3 { margin: 0; }
.chips { display: flex; gap: 0.25rem; flex-wrap: wrap; margin: 0.5rem 0; }
.chip { font-size: 0.75rem; padding: 0.1rem 0.6rem; border-radius: 999px; }
.chip[aria-pressed="true"] { background: var(--color-primary); color: var(--white); border-color: var(--color-primary); }
.event-list { list-style: none; padding: 0; margin: 0; }
.event-list li { border-bottom: 1px solid var(--color-border); padding: 0.4rem 0; font-size: 0.85rem; }
.event-list summary { cursor: pointer; }
.src { font-size: 0.7rem; text-transform: uppercase; font-weight: 700; padding: 0.05rem 0.4rem; border-radius: 4px; color: var(--white); }
.src-orchestrator { background: var(--product-orchestrator); }
.src-intelligence { background: var(--product-intelligence); }
.src-channels { background: var(--neutral-700); }
.muted { color: var(--color-text-muted); }
.small { font-size: 0.8rem; }
```

- [ ] **Step 13: Create `public/app.js`**

```js
// Boots the tester: loads config + state, draws the progress rail, routes #/step/N to step
// modules, and provides the shared `ctx` helpers every step uses.
import { h, field, formValues } from './lib/dom.js';
import { api } from './lib/api.js';
import { STEPS, stepStatus, nextStepId } from './lib/progress.js';
import { resultPanel } from './lib/result-panel.js';
import { createEventLog } from './lib/event-log.js';
import stepModules from './steps/index.js';

const rail = document.getElementById('rail');
const main = document.getElementById('main');
const eventLog = createEventLog(document.getElementById('events'));

let config = {};
let defaults = {};
let state = {};
let cleanup = null;
let pending = null; // { id, lastRun, lastRender } to show after navigation
const modulesById = new Map(stepModules.map((m) => [m.id, m]));

function setState(next) {
  if (!next) return;
  state = next;
  renderRail();
}

async function refreshState() {
  const next = await fetch('/api/state').then((r) => r.json()).catch(() => null);
  setState(next);
}

// Conversations created by real traffic arrive via webhooks: refresh state when they do.
let refreshTimer = null;
eventLog.onEvent((event) => {
  if (event.source !== 'orchestrator') return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshState, 500);
});

const ctx = {
  get config() { return config; },
  get defaults() { return defaults; },
  state: () => state,
  api,
  onEvent: (fn) => eventLog.onEvent(fn),
  goTo,
  async run({ button, call, render, into }) {
    if (button) {
      button.disabled = true;
      button.classList.add('busy');
    }
    const envelope = await call();
    if (button) {
      button.disabled = false;
      button.classList.remove('busy');
    }
    if (envelope.state) setState(envelope.state);
    if (into) into.replaceChildren(resultPanel(envelope, render));
    return envelope;
  },
  formStep(el, { fields, submitLabel, call, render, extra }) {
    const out = h('div', { class: 'result-slot' });
    const button = h('button', { type: 'submit', class: 'primary' }, submitLabel);
    const form = h('form', { class: 'step-form' }, fields.map(field), h('div', { class: 'actions' }, button, extra));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      ctx.run({ button, into: out, call: () => call(formValues(form)), render });
    });
    el.append(form, out);
    return { form, out, button };
  },
  // Re-runs `call` every `every` ms until isDone(envelope) or `times` attempts. Returns stop().
  poll({ call, isDone, onResult, every = 5000, times = 24 }) {
    let attempts = 0;
    let timer = null;
    let stopped = false;
    const tick = async () => {
      attempts += 1;
      const envelope = await call();
      if (stopped) return;
      if (envelope.state) setState(envelope.state);
      const done = isDone(envelope);
      onResult(envelope, { done, attempts, exhausted: !done && attempts >= times });
      if (!done && attempts < times) timer = setTimeout(tick, every);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  },
};

function renderRail() {
  const current = currentStepId();
  const next = nextStepId(state);
  const groups = [];
  for (const step of STEPS) {
    const last = groups[groups.length - 1];
    if (!last || last.product !== step.product) groups.push({ product: step.product, steps: [step] });
    else last.steps.push(step);
  }
  rail.replaceChildren(...groups.map((group) => h('section', {},
    h('h3', {}, group.product),
    h('ol', {}, group.steps.map((step) => {
      const { status, reason } = stepStatus(step, state);
      const icon = { done: '✓', ready: '●', optional: '○', blocked: '🔒' }[status];
      const classes = [status, step.id === next && status === 'ready' ? 'next' : ''].join(' ');
      return h('li', {}, h('a', { href: `#/step/${step.id}`, class: classes, 'aria-current': step.id === current ? 'page' : null },
        h('span', { class: 'status', 'aria-hidden': 'true' }, icon),
        h('span', {}, `${step.id}. ${step.title}`, reason && h('small', {}, reason), step.optional && status !== 'done' && h('small', {}, 'optional'))));
    })))));
}

function currentStepId() {
  const match = location.hash.match(/^#\/step\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function goTo(id) {
  location.hash = `#/step/${id}`;
}

// Navigate to a step and show a result envelope at the top of it (used by Run all and Reset).
function show(id, lastRun, lastRender) {
  pending = { id, lastRun, lastRender };
  if (currentStepId() === id) renderStep();
  else goTo(id);
}

function renderStep() {
  if (cleanup) cleanup();
  cleanup = null;
  const id = currentStepId();
  const { lastRun, lastRender } = pending && pending.id === id ? pending : {};
  pending = null;
  const meta = STEPS.find((s) => s.id === id) || STEPS[0];
  const mod = modulesById.get(meta.id);
  const { status, reason } = stepStatus(meta, state);
  const body = h('div', { class: 'step-body' });
  main.replaceChildren(
    h('div', { class: 'step-header' }, h('span', { class: `product product-${meta.product}` }, meta.product), h('h2', {}, `${meta.id}. ${meta.title}`)),
    status === 'blocked' && h('p', { class: 'blocked-banner' }, `🔒 ${reason}. You can read this step now; its Run buttons will explain what is missing.`),
    mod && h('div', { class: 'learn', html: mod.learn }),
    mod?.docs && h('p', {}, h('a', { href: mod.docs, target: '_blank', rel: 'noopener' }, 'Twilio docs for this step ↗')),
    lastRun && resultPanel(lastRun, lastRender || mod?.render),
    body,
    h('div', { class: 'actions' },
      meta.id > 0 && h('button', { type: 'button', onClick: () => goTo(meta.id - 1) }, '← Previous'),
      meta.id < 9 && h('button', { type: 'button', onClick: () => goTo(meta.id + 1) }, 'Next →')));
  if (mod) cleanup = mod.mount(body, ctx) || null;
  else body.append(h('p', { class: 'muted' }, 'This step is coming soon.'));
  renderRail();
  main.focus();
}

async function runAll(button) {
  const sequence = [
    { id: 1, needed: () => !state.storeId, call: () => api.post('/api/memory/stores', {}) },
    { id: 2, needed: () => !state.profileId, call: () => api.post('/api/memory/profiles', {}) },
    { id: 4, needed: () => !state.intelligenceConfigId, call: () => api.post('/api/intelligence/configurations', {}) },
    { id: 5, needed: () => !state.orchestratorConfigId, call: () => api.post('/api/orchestrator/configurations', {}) },
  ];
  button.disabled = true;
  let last = null;
  for (const item of sequence) {
    if (!item.needed()) continue;
    button.textContent = `Running step ${item.id}…`;
    const envelope = await item.call();
    if (envelope.state) setState(envelope.state);
    last = { id: item.id, envelope };
    if (!envelope.ok) break;
  }
  button.disabled = false;
  button.textContent = 'Run setup steps 1–5';
  // Show the failing step, or step 5's result when everything succeeded.
  if (last) show(last.id, last.envelope);
  else goTo(6);
}

const renderDeleted = (data) => h('ul', { class: 'checklist' }, (data.deleted || []).map((d) =>
  h('li', { class: d.ok ? 'ok' : 'fail' }, h('strong', {}, `${d.ok ? '✓' : '✕'} ${d.label}`), h('div', { class: 'muted' }, `${d.id}${d.note ? ` (${d.note})` : ''}${d.error ? `: ${d.error}` : ''}`))));

async function reset(button) {
  if (!confirm('Delete the Memory store, configurations and custom operator this tester created, and clear local state?')) return;
  const envelope = await ctx.run({ button, call: () => api.post('/api/reset') });
  show(0, envelope, renderDeleted);
}

document.getElementById('run-all').addEventListener('click', (e) => runAll(e.currentTarget));
document.getElementById('reset').addEventListener('click', (e) => reset(e.currentTarget));
window.addEventListener('hashchange', () => renderStep());

const boot = await fetch('/api/setup/config').then((r) => r.json());
config = boot.config;
defaults = boot.defaults;
state = boot.state;
if (!location.hash) location.hash = '#/step/0';
renderStep();
```

- [ ] **Step 14: Run the tests and a syntax check**

Run: `npm test && for f in public/app.js public/lib/*.js public/steps/*.js; do node --check "$f" || exit 1; done && echo SYNTAX_OK`
Expected: all tests PASS, then `SYNTAX_OK`

- [ ] **Step 15: Manual smoke test in the browser**

Run: `npm start`, then open `http://localhost:3000`.
Expected:
- The rail shows steps 0–9 grouped by product, and step 0 is selected.
- The setup check runs automatically. Without `.env`, it shows ✕ Failed with a hint about credentials.
- The JSON and Code tabs switch.
- The Live events panel shows "● live".

Stop the server.

- [ ] **Step 16: Commit**

```bash
git add public test/progress.test.js test/frontend-modules.test.js
git commit -m "feat: add tester UI shell with progress rail, result tabs and live event log

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: UI steps 1–5 (create resources)

**Files:**
- Create: `public/steps/memory-store.js`, `public/steps/memory-profile.js`, `public/steps/operators.js`, `public/steps/intelligence-config.js`, `public/steps/orchestrator-config.js`
- Modify: `public/steps/index.js`
- Test: `test/frontend-modules.test.js` (already covers the new modules)

**Interfaces:**
- Consumes:
  - `ctx` (Task 14)
  - `defaults.operator` and `defaults.operatorNames` (Task 8)
  - envelope `data` shapes: step 1 `{ store, operation }`, step 2 `{ profile, lookup, traits }`, step 3 `{ operators }` / `{ operator }`, step 4 `{ configuration }`, step 5 `{ configuration, operation }`
- Produces: default-export step modules with ids 1–5.

- [ ] **Step 1: Create `public/steps/memory-store.js`**

```js
import { h, card, kv } from '../lib/dom.js';

function render(data) {
  return h('div', { class: 'cards' },
    card('Memory Store', kv({ id: data.store?.id, displayName: data.store?.displayName, status: data.store?.status })),
    card('Async operation', kv({ operationId: data.operation?.operationId, status: data.operation?.status, completedAt: data.operation?.completedAt }),
      h('p', { class: 'muted small' }, 'Open the JSON tab: the first call returned 202 Accepted, then the app polled the Operation until COMPLETED.')));
}

export default {
  id: 1,
  docs: 'https://www.twilio.com/docs/conversations/memory/api-quickstart',
  learn: `
    <p>A <strong>Memory Store</strong> is the container for all your customer <em>profiles</em>. Orchestrator writes into it, and AI agents read from it.</p>
    <p>Creating a store is <strong>asynchronous</strong>. Twilio answers <code>202 Accepted</code> with a <code>statusUrl</code>, and you poll that <em>Operation</em> until its status is <code>COMPLETED</code>. The finished operation contains the new store ID (<code>mem_store_…</code>).</p>`,
  render,
  mount(el, ctx) {
    ctx.formStep(el, {
      fields: [
        { name: 'displayName', label: 'Display name', value: 'ConversationsTester', help: 'Letters and numbers; must be unique in your account.' },
        { name: 'description', label: 'Description', value: 'Memory store created by the Conversations Tester sample' },
      ],
      submitLabel: 'Create Memory Store',
      call: (values) => ctx.api.post('/api/memory/stores', values),
      render,
    });
  },
};
```

- [ ] **Step 2: Create `public/steps/memory-profile.js`**

```js
import { h, card, kv } from '../lib/dom.js';

function render(data) {
  const found = data.lookup?.profiles?.length;
  return h('div', { class: 'cards' },
    card('Profile', kv({ id: data.profile?.id })),
    card('Traits sent (Contact group)', kv(data.traits || {})),
    card('Lookup by phone', h('p', {}, found
      ? `Identity resolution found ${data.lookup.profiles.join(', ')} for ${data.lookup.normalizedValue}.`
      : 'Not found yet. Trait processing is async, so run the step again in a few seconds.')));
}

export default {
  id: 2,
  docs: 'https://www.twilio.com/docs/conversations/memory/identity-resolution',
  learn: `
    <p>A <strong>Profile</strong> is one customer, across every channel. It holds <em>traits</em> (facts such as name and phone) and, later, <em>observations</em> and <em>summaries</em> learned from conversations.</p>
    <p><strong>Identity resolution</strong> matches incoming addresses (a phone number, a WhatsApp number) to a profile. Messages and calls captured by Orchestrator only link to a profile that <strong>already exists</strong>, so create yours <em>before</em> you text or call.</p>`,
  render,
  mount(el, ctx) {
    const { config } = ctx;
    ctx.formStep(el, {
      fields: [
        { name: 'firstName', label: 'First name', value: 'Alex' },
        { name: 'lastName', label: 'Last name', value: '' },
        { name: 'phone', label: 'Your mobile number (E.164)', value: config.myPhoneNumber, help: 'You will text and call from this number.' },
        { name: 'whatsapp', label: 'Your WhatsApp number (E.164)', value: config.channels?.whatsapp ? config.myPhoneNumber : '', help: config.channels?.whatsapp ? 'Usually the same as your mobile number.' : 'WhatsApp is disabled (TWILIO_WHATSAPP_NUMBER is not set).', disabled: !config.channels?.whatsapp },
      ],
      submitLabel: 'Create Profile',
      call: (values) => ctx.api.post('/api/memory/profiles', values),
      render,
    });
  },
};
```

- [ ] **Step 3: Create `public/steps/operators.js`**

```js
import { h, card, kv, json, badge } from '../lib/dom.js';

function renderList(data) {
  return h('table', { class: 'operators' },
    h('thead', {}, h('tr', {}, ['Name', 'Author', 'Output', 'ID'].map((t) => h('th', {}, t)))),
    h('tbody', {}, data.operators.map((o) => h('tr', {},
      h('td', {}, o.displayName),
      h('td', {}, badge(o.author || '?', o.author === 'SELF' ? 'info' : 'neutral')),
      h('td', {}, o.outputFormat),
      h('td', {}, h('code', {}, o.id))))));
}

function renderOperator(data) {
  const o = data.operator || {};
  return card(o.displayName, kv({ id: o.id, author: o.author, outputFormat: o.outputFormat }), h('h5', {}, 'Prompt'), h('p', {}, o.prompt), h('h5', {}, 'Output schema'), json(o.outputSchema));
}

export default {
  id: 3,
  docs: 'https://www.twilio.com/docs/conversations/intelligence/create-custom-language-operators',
  learn: `
    <p>A <strong>Language Operator</strong> is an AI task that turns conversation text into structured output. Twilio provides ready-made operators (Summary, Sentiment, Next Best Response…), and you can write your own with a prompt and an output schema.</p>
    <p>This step is optional. If you create the starter <em>Upsell intent detector</em>, Step 4 adds it next to Sentiment so it runs on every message.</p>`,
  render: renderOperator,
  mount(el, ctx) {
    const listOut = h('div', { class: 'result-slot' });
    const listButton = h('button', { type: 'button' }, 'List available operators');
    listButton.addEventListener('click', () => ctx.run({ button: listButton, into: listOut, call: () => ctx.api.get('/api/intelligence/operators'), render: renderList }));
    el.append(h('div', { class: 'actions' }, listButton), listOut);

    const starter = ctx.defaults.operator || {};
    ctx.formStep(el, {
      fields: [
        { name: 'displayName', label: 'Operator name', value: starter.displayName },
        { name: 'description', label: 'Description', value: starter.description },
        { name: 'prompt', label: 'Prompt', type: 'textarea', value: starter.prompt, help: 'Output format is JSON with the schema shown after you create it (upsellIntent, evidence, confidence).' },
      ],
      submitLabel: 'Create custom operator',
      call: (values) => ctx.api.post('/api/intelligence/operators', values),
      render: renderOperator,
    });
  },
};
```

- [ ] **Step 4: Create `public/steps/intelligence-config.js`**

```js
import { h, card, kv } from '../lib/dom.js';

function operatorName(ctx, id) {
  if (ctx.defaults.operatorNames?.[id]) return ctx.defaults.operatorNames[id];
  if (id && id === ctx.state().operatorId) return 'Your custom operator';
  return id;
}

const makeRender = (ctx) => (data) => {
  const c = data.configuration || {};
  return h('div', {},
    card('Intelligence Configuration', kv({ id: c.id, displayName: c.displayName, version: c.version })),
    (c.rules || []).map((rule, i) => card(`Rule ${i + 1}${rule.id ? ` (${rule.id})` : ''}`,
      h('div', { class: 'flow' },
        h('span', { class: 'node' }, `Trigger: ${(rule.triggers || []).map((t) => t.on).join(', ') || 'on demand'}`),
        h('span', { class: 'arrow' }, '→'),
        h('span', { class: 'node' }, `Operators: ${(rule.operators || []).map((o) => operatorName(ctx, o.id)).join(', ')}`),
        h('span', { class: 'arrow' }, '→'),
        h('span', { class: 'node' }, `Webhook: ${(rule.actions || []).map((a) => a.url).join(', ')}`)))));
};

export default {
  id: 4,
  docs: 'https://www.twilio.com/docs/conversations/intelligence/create-intelligence-configuration',
  learn: `
    <p>An <strong>Intelligence Configuration</strong> decides <em>when</em> operators run and <em>where</em> results go. It is made of <strong>rules</strong>, and each rule has:</p>
    <ul>
      <li><strong>Triggers</strong>: <code>COMMUNICATION</code> (every new message or voice utterance) or <code>CONVERSATION_END</code>.</li>
      <li><strong>Operators</strong>: up to 5 per rule.</li>
      <li><strong>Actions</strong>: a webhook that receives the results (this app's <code>/webhooks/intelligence</code>).</li>
      <li><strong>Context</strong>: with Memory enabled, operators also see the customer's profile.</li>
    </ul>
    <p>This tester creates two rules: <em>Sentiment</em> (plus your custom operator) on every message, and <em>Summary</em> when the conversation ends. The configuration does nothing until Step 5 attaches it to a Conversation Configuration.</p>`,
  mount(el, ctx) {
    const hasCustom = Boolean(ctx.state().operatorId);
    ctx.formStep(el, {
      fields: [
        { name: 'displayName', label: 'Display name', value: 'Conversations Tester' },
        {
          name: 'includeCustomOperator',
          label: 'Include your custom operator (Step 3)?',
          value: hasCustom ? 'yes' : 'no',
          options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
          disabled: !hasCustom,
          help: hasCustom ? 'Runs on every message, next to Sentiment.' : 'You did not create a custom operator in Step 3.',
        },
      ],
      submitLabel: 'Create Intelligence Configuration',
      call: (values) => ctx.api.post('/api/intelligence/configurations', { displayName: values.displayName, includeCustomOperator: values.includeCustomOperator === 'yes' }),
      render: makeRender(ctx),
    });
  },
};
```

Note: a disabled `<select>` is not included in `FormData`, so `includeCustomOperator` is `undefined`. The comparison `=== 'yes'` yields `false`, which is correct when no custom operator exists.

- [ ] **Step 5: Create `public/steps/orchestrator-config.js`**

```js
import { h, card, kv } from '../lib/dom.js';

function render(data) {
  const c = data.configuration || {};
  const channels = Object.entries(c.channelSettings || {});
  return h('div', {},
    card('How this configuration wires everything together',
      h('div', { class: 'flow' },
        h('span', { class: 'node' }, `Channels: ${channels.map(([name]) => name).join(', ') || '—'}`),
        h('span', { class: 'arrow' }, '→'),
        h('span', { class: 'node' }, `Conversations (grouped ${c.conversationGroupingType || ''})`),
        h('span', { class: 'arrow' }, '→'),
        h('span', { class: 'node' }, `Memory store ${c.memoryStoreId || ''}`),
        h('span', { class: 'arrow' }, '+'),
        h('span', { class: 'node' }, `Intelligence ${(c.intelligenceConfigurationIds || []).join(', ')}`))),
    card('Configuration', kv({ id: c.id, displayName: c.displayName, memoryExtractionEnabled: c.memoryExtractionEnabled, statusCallbacks: (c.statusCallbacks || []).map((s) => s.url).join(', ') })),
    card('Capture rules', channels.length
      ? h('ul', {}, channels.flatMap(([name, settings]) => (settings.captureRules || []).map((r) => h('li', {}, `${name}: from ${r.from} → to ${r.to}${r.metadata?.callType ? ` (${r.metadata.callType})` : ''}`))))
      : h('p', { class: 'muted' }, 'No capture rules returned.')));
}

export default {
  id: 5,
  docs: 'https://www.twilio.com/docs/conversations/orchestrator/concepts/ingestion',
  learn: `
    <p>The <strong>Conversation Configuration</strong> ties the three products together:</p>
    <ul>
      <li><strong>Capture rules</strong> per channel (SMS, WhatsApp, Voice) tell Orchestrator which traffic to observe. There is one rule <em>to</em> your number and one <em>from</em> it, so both sides are captured. Voice rules also switch on real-time transcription (extra cost).</li>
      <li><strong>Grouping</strong> <code>GROUP_BY_PROFILE</code>: a text, a WhatsApp message and a call from the same person become <em>one</em> conversation. This cannot be changed later.</li>
      <li><strong>Memory</strong>: the store from Step 1. With <code>memoryExtractionEnabled</code>, Twilio writes observations and summaries after the conversation goes inactive or closes.</li>
      <li><strong>Intelligence</strong>: the configuration from Step 4.</li>
      <li><strong>Status callbacks</strong>: this app's <code>/webhooks/orchestrator</code>, which feeds the live event log.</li>
    </ul>
    <p>Like the Memory Store, this is async (202 + Operation). Short timeouts help you see results quickly; production defaults are longer.</p>`,
  render,
  mount(el, ctx) {
    ctx.formStep(el, {
      fields: [
        { name: 'displayName', label: 'Display name', value: 'Conversations Tester' },
        { name: 'inactiveMinutes', label: 'Mark inactive after (minutes)', type: 'number', value: '5', help: 'SMS/WhatsApp only. Inactive also triggers memory extraction.' },
        { name: 'closedMinutes', label: 'Close after (minutes)', type: 'number', value: '30' },
      ],
      submitLabel: 'Create Conversation Configuration',
      call: (values) => ctx.api.post('/api/orchestrator/configurations', values),
      render,
    });
  },
};
```

- [ ] **Step 6: Register the steps in `public/steps/index.js`**

```js
import setup from './setup.js';
import memoryStore from './memory-store.js';
import memoryProfile from './memory-profile.js';
import operators from './operators.js';
import intelligenceConfig from './intelligence-config.js';
import orchestratorConfig from './orchestrator-config.js';

export default [setup, memoryStore, memoryProfile, operators, intelligenceConfig, orchestratorConfig];
```

- [ ] **Step 7: Add table styles to the end of `public/styles.css`**

```css
.operators { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.operators th, .operators td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--color-border); }
.operators code { font-size: 0.75rem; }
```

- [ ] **Step 8: Run the tests and a syntax check**

Run: `npm test && for f in public/steps/*.js; do node --check "$f" || exit 1; done && echo SYNTAX_OK`
Expected: PASS and `SYNTAX_OK`

- [ ] **Step 9: Manual check**

Run: `npm start`, open `http://localhost:3000/#/step/1`, and walk through steps 1–5.
Expected:
- Each form renders with defaults.
- Without credentials, Run shows ✕ Failed with the credentials hint.
- Steps 2 and 5 show the 🔒 banner while their prerequisites are missing.

- [ ] **Step 10: Commit**

```bash
git add public/steps public/styles.css
git commit -m "feat: add UI steps 1-5 for Memory, Intelligence and Orchestrator setup

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: UI steps 6–9 (talk, inspect, results)

**Files:**
- Create: `public/steps/talk.js`, `public/steps/inspect.js`, `public/steps/memory-results.js`, `public/steps/intelligence-results.js`
- Modify: `public/steps/index.js`
- Test: `test/frontend-modules.test.js` (already covers the new modules)

**Interfaces:**
- Consumes:
  - `ctx`, `timeline()`
  - `GET /api/orchestrator/conversation` → `{ conversations, conversation, participants, communications }`
  - `POST /api/orchestrator/conversation/close`
  - `POST /api/orchestrator/reply`
  - `POST /api/orchestrator/simulate`
  - `GET /api/memory/results` → `{ profile, observations, summaries }`
  - `POST /api/memory/recall` → `{ recall: { observations[], summaries[], communications[] }, query }`
  - `GET /api/intelligence/results` → `{ results, webhooks }`
- Produces: step modules with ids 6–9.

- [ ] **Step 1: Create `public/steps/talk.js`**

```js
import { h, kv, card, empty } from '../lib/dom.js';
import { timeline } from '../lib/timeline.js';

function instructions(config) {
  const wa = config.channels?.whatsapp;
  return {
    SMS: h('div', {},
      h('p', {}, 'From your phone (', h('code', {}, config.myPhoneNumber || 'MY_PHONE_NUMBER'), '), text your Twilio number:'),
      h('p', { class: 'big' }, h('strong', {}, config.phoneNumber || 'TWILIO_PHONE_NUMBER')),
      h('p', { class: 'muted' }, 'Try: "Hi, my order arrived late. Also, can I upgrade to premium?" The app auto-replies, and Orchestrator captures both messages.')),
    WhatsApp: wa
      ? h('div', {},
        h('p', {}, 'Send a WhatsApp message to your sender:'),
        h('p', { class: 'big' }, h('strong', {}, config.whatsappNumber)),
        h('p', { class: 'muted' }, `Make sure the sender's incoming-message webhook is ${config.publicUrl}/channels/whatsapp. Because of GROUP_BY_PROFILE, it joins the same conversation as your SMS.`))
      : h('p', { class: 'muted' }, 'WhatsApp is disabled. Register a WhatsApp sender, set TWILIO_WHATSAPP_NUMBER in .env, and restart.'),
    Voice: h('div', {},
      h('p', {}, 'Call your Twilio number and talk for up to three turns:'),
      h('p', { class: 'big' }, h('strong', {}, config.phoneNumber || 'TWILIO_PHONE_NUMBER')),
      h('p', { class: 'muted' }, 'Voice capture rules turn on real-time transcription, so each utterance becomes a TRANSCRIPTION communication (transcription fees apply).')),
  };
}

export default {
  id: 6,
  docs: 'https://www.twilio.com/docs/conversations/orchestrator/concepts/channels',
  learn: `
    <p>Now create some real traffic. Orchestrator observes it through the capture rules from Step 5. Your app code doesn't change: the SMS, WhatsApp and Voice webhooks here only send simple auto-replies.</p>
    <p>Watch the timeline below and the <strong>Live events</strong> panel. You will see <code>CONVERSATION_CREATED</code>, <code>PARTICIPANT_ADDED</code> and <code>COMMUNICATION_CREATED</code> callbacks arrive.</p>
    <p>You can also <strong>reply as the agent</strong> through the Orchestrator <em>Actions</em> API, or <strong>simulate</strong> messages through the API if you don't have a phone handy. Simulated messages may not trigger Intelligence rules the way real traffic does.</p>`,
  mount(el, ctx) {
    const { config } = ctx;
    const live = [];
    const timelineSlot = h('div', {});
    const status = h('p', { class: 'muted' });
    const drawTimeline = () => {
      status.textContent = ctx.state().conversationId ? `Conversation: ${ctx.state().conversationId}` : 'Waiting for your first message or call…';
      timelineSlot.replaceChildren(live.length ? timeline(live, { customerAddress: config.myPhoneNumber }) : empty('Nothing captured yet.'));
    };
    const unsubscribe = ctx.onEvent((event) => {
      if (event.source === 'orchestrator' && event.type === 'COMMUNICATION_CREATED' && event.payload?.data) {
        live.push(event.payload.data);
        drawTimeline();
      } else if (event.source === 'orchestrator') {
        drawTimeline();
      }
    });

    const refreshOut = h('div', {});
    const refresh = h('button', { type: 'button' }, 'Refresh from API');
    refresh.addEventListener('click', async () => {
      const envelope = await ctx.run({ button: refresh, into: refreshOut, call: () => ctx.api.get('/api/orchestrator/conversation'), render: (d) => timeline(d.communications, { customerAddress: config.myPhoneNumber }) });
      if (envelope.ok) {
        live.splice(0, live.length, ...envelope.data.communications);
        drawTimeline();
      }
    });

    const panels = instructions(config);
    const replyPanel = h('div', {});
    const channelOptions = [{ value: 'SMS', label: 'SMS' }, ...(config.channels?.whatsapp ? [{ value: 'WHATSAPP', label: 'WhatsApp' }] : [])];
    ctx.formStep(replyPanel, {
      fields: [
        { name: 'channel', label: 'Channel', value: 'SMS', options: channelOptions },
        { name: 'text', label: 'Message to send to your phone', value: 'Hi! This is the agent. How can I help?' },
      ],
      submitLabel: 'Send as agent',
      call: (values) => ctx.api.post('/api/orchestrator/reply', values),
      render: (d) => card('Action', kv({ id: d.action?.id, type: d.action?.type, status: d.action?.status, failureReason: d.action?.failureReason, messageSid: d.action?.related?.messageSid })),
    });
    const simulatePanel = h('div', {});
    ctx.formStep(simulatePanel, {
      fields: [
        { name: 'channel', label: 'Channel', value: 'SMS', options: [{ value: 'SMS', label: 'SMS' }, ...(config.channels?.whatsapp ? [{ value: 'WHATSAPP', label: 'WhatsApp' }] : []), { value: 'VOICE', label: 'Voice (transcription)' }] },
        { name: 'author', label: 'Who is speaking?', value: 'CUSTOMER', options: [{ value: 'CUSTOMER', label: 'Customer (you)' }, { value: 'AGENT', label: 'Agent' }] },
        { name: 'text', label: 'Text', type: 'textarea', value: 'Hi, my last order arrived late. Also, can I upgrade to the premium plan?' },
      ],
      submitLabel: 'Add simulated communication',
      call: (values) => ctx.api.post('/api/orchestrator/simulate', values),
      render: (d) => card('Simulated communication', kv({ conversationId: d.communication?.conversationId || ctx.state().conversationId, communicationId: d.communication?.id, text: d.communication?.content?.text })),
    });

    const tabs = { ...panels, 'Reply as agent': replyPanel, Simulate: simulatePanel };
    const panel = h('div', { class: 'subtab-panel' });
    const bar = h('div', { class: 'subtabs', role: 'tablist' });
    const select = (name) => {
      [...bar.children].forEach((b) => b.setAttribute('aria-selected', String(b.textContent === name)));
      panel.replaceChildren(tabs[name]);
    };
    Object.keys(tabs).forEach((name) => bar.append(h('button', { type: 'button', role: 'tab', onClick: () => select(name) }, name)));
    select('SMS');

    el.append(bar, panel, h('h3', {}, 'Live timeline'), status, timelineSlot, h('div', { class: 'actions' }, refresh, h('button', { type: 'button', onClick: () => ctx.goTo(7) }, 'Inspect conversation →')), refreshOut);
    drawTimeline();
    return unsubscribe;
  },
};
```

- [ ] **Step 2: Create `public/steps/inspect.js`**

```js
import { h, card, kv, badge, empty } from '../lib/dom.js';
import { timeline } from '../lib/timeline.js';

export default {
  id: 7,
  docs: 'https://www.twilio.com/docs/conversations/orchestrator/concepts/lifecycle',
  learn: `
    <p>A <strong>Conversation</strong> has <strong>participants</strong> (customer, agents) and <strong>communications</strong> (messages, voice transcriptions) from any channel. Check that your participant has a <code>profileId</code>: that is the link into Memory.</p>
    <p>Conversations move <code>ACTIVE → INACTIVE → CLOSED</code> on the timeouts from Step 5. <strong>Closing</strong> fires the Intelligence <code>CONVERSATION_END</code> rule (Summary) and starts memory extraction. A closed conversation can't be reopened; new messages start a new one.</p>`,
  mount(el, ctx) {
    const out = h('div', {});
    const load = (id) => ctx.run({ button: loadButton, into: out, call: () => ctx.api.get(`/api/orchestrator/conversation${id ? `?id=${encodeURIComponent(id)}` : ''}`), render });
    const loadButton = h('button', { type: 'button', class: 'primary' }, 'Load conversation');
    loadButton.addEventListener('click', () => load());

    const closeOut = h('div', {});
    const closeButton = h('button', { type: 'button', class: 'danger' }, 'Close conversation');
    closeButton.addEventListener('click', async () => {
      const envelope = await ctx.run({ button: closeButton, into: closeOut, call: () => ctx.api.post('/api/orchestrator/conversation/close'), render: (d) => card('Conversation closed', kv({ id: d.conversation?.id, status: d.conversation?.status }), h('p', {}, 'Next: Steps 8 and 9 wait for Memory and Intelligence to process it.')) });
      if (envelope.ok) load();
    });

    function render(data) {
      const profileId = ctx.state().profileId;
      const c = data.conversation || {};
      const picker = data.conversations?.length > 1 && h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Conversation'),
        h('select', { onChange: (e) => load(e.target.value) }, data.conversations.map((conv) => h('option', { value: conv.id, selected: conv.id === c.id }, `${conv.id} · ${conv.status} · ${new Date(conv.createdAt).toLocaleString()}`))));
      return h('div', {},
        picker,
        card('Conversation', kv({ id: c.id, status: c.status, configurationId: c.configurationId, createdAt: c.createdAt })),
        card('Participants', data.participants?.length
          ? h('ul', {}, data.participants.map((p) => h('li', {},
            badge(p.type || 'UNKNOWN', p.type === 'CUSTOMER' ? 'info' : 'neutral'), ' ',
            p.name || '', ' ', (p.addresses || []).map((a) => `${a.channel}:${a.address}`).join(', '), ' ',
            p.profileId ? badge(p.profileId === profileId ? `profile ✓ ${p.profileId}` : `profile ${p.profileId}`, p.profileId === profileId ? 'success' : 'warning') : badge('no profile yet', 'warning'))))
          : empty('No participants.')),
        card('Timeline', timeline(data.communications, { customerAddress: ctx.config.myPhoneNumber })));
    }

    el.append(h('div', { class: 'actions' }, loadButton, closeButton), out, closeOut);
    if (ctx.state().orchestratorConfigId) load();
  },
};
```

- [ ] **Step 3: Create `public/steps/memory-results.js`**

```js
import { h, card, kv, empty } from '../lib/dom.js';

const hasResults = (envelope) => envelope.ok && (envelope.data.observations?.length || envelope.data.summaries?.length);

function render(data) {
  const traits = data.profile?.traits || {};
  return h('div', {},
    card('Profile traits', Object.keys(traits).length ? Object.entries(traits).map(([group, values]) => h('div', {}, h('h5', {}, group), kv(values))) : empty('No traits yet.')),
    card(`Observations (${data.observations?.length || 0})`, data.observations?.length
      ? h('ul', {}, data.observations.map((o) => h('li', {}, o.content, h('small', { class: 'muted' }, ` · ${o.source || ''} ${o.occurredAt ? new Date(o.occurredAt).toLocaleString() : ''}`))))
      : empty('None yet.')),
    card(`Conversation summaries (${data.summaries?.length || 0})`, data.summaries?.length
      ? data.summaries.map((s) => h('p', {}, s.content))
      : empty('None yet.')));
}

function renderRecall(data) {
  const r = data.recall || {};
  const scored = (items) => items?.length ? h('ol', {}, items.map((i) => h('li', {}, i.content ?? i.content?.text ?? JSON.stringify(i), i.score != null && h('small', { class: 'muted' }, ` · score ${Number(i.score).toFixed(2)}`)))) : empty('No matches.');
  return h('div', { class: 'cards' },
    card('Observations', scored(r.observations)),
    card('Summaries', scored(r.summaries)),
    card('Recent communications', scored((r.communications || []).map((c) => ({ content: c.content?.text ?? '' })))),
    h('p', { class: 'muted small' }, `Query: "${data.query}" · ${r.meta?.queryTime ?? '?'} ms`));
}

export default {
  id: 8,
  docs: 'https://www.twilio.com/docs/conversations/memory',
  learn: `
    <p>After a conversation goes <em>inactive</em> or <em>closed</em>, Memory extracts <strong>observations</strong> (preferences, behaviors, mood) and a <strong>conversation summary</strong> into the profile. This is asynchronous, so the page refreshes every 5 seconds for up to 2 minutes.</p>
    <p><strong>Recall</strong> is what an AI agent calls on each turn: a semantic + keyword search across the profile's memory, ranked by relevance.</p>`,
  mount(el, ctx) {
    const status = h('p', { class: 'waiting' }, 'Checking Memory…');
    const out = h('div', {});
    const refresh = h('button', { type: 'button' }, 'Refresh now');
    let stop = () => {};
    const start = () => {
      stop();
      stop = ctx.poll({
        call: () => ctx.api.get('/api/memory/results'),
        isDone: (env) => !env.ok || hasResults(env),
        onResult: (env, { done, exhausted }) => {
          out.replaceChildren(ctx.resultPanelFor(env, render));
          status.hidden = done || exhausted;
          if (exhausted) out.prepend(h('p', { class: 'muted' }, 'Still nothing. Make sure the conversation is closed (Step 7) and memory extraction is enabled (Step 5), then refresh.'));
        },
      });
    };
    refresh.addEventListener('click', start);
    el.append(h('div', { class: 'actions' }, refresh), status, out, h('h3', {}, 'Try Recall'));
    ctx.formStep(el, {
      fields: [{ name: 'query', label: 'What would your agent ask Memory?', value: 'What does this customer care about?' }],
      submitLabel: 'Recall',
      call: (values) => ctx.api.post('/api/memory/recall', values),
      render: renderRecall,
    });
    start();
    return () => stop();
  },
};
```

- [ ] **Step 4: Create `public/steps/intelligence-results.js`**

```js
import { h, card, kv, json, badge, empty } from '../lib/dom.js';

function resultBody(r) {
  if (r.result == null) return empty('No result body.');
  if (typeof r.result === 'string') return h('p', {}, r.result);
  if (r.outputFormat === 'CLASSIFICATION' && r.result.label) return badge(r.result.label, 'info');
  return json(r.result);
}

const makeRender = (ctx) => (data) => h('div', {},
  data.results?.length
    ? data.results.map((r) => card(ctx.defaults.operatorNames?.[r.operator?.id] || (r.operator?.id === ctx.state().operatorId ? 'Your custom operator' : r.operator?.id),
      kv({ trigger: r.executionDetails?.trigger?.on || r.executionDetails?.trigger?.type, format: r.outputFormat, created: r.dateCreated }),
      resultBody(r)))
    : empty('No operator results yet.'),
  h('p', { class: 'muted small' }, `${data.webhooks?.length || 0} Intelligence webhook(s) received for this conversation. See the Live events panel.`));

export default {
  id: 9,
  docs: 'https://www.twilio.com/docs/conversations/intelligence/explore-language-operator-results',
  learn: `
    <p>Each time a rule fires, its operators produce <strong>operator results</strong>: <em>Sentiment</em> per message, your <em>custom operator's</em> JSON, and a <em>Summary</em> when the conversation ends. They are delivered to your webhook and can also be listed through the API.</p>
    <p>In production, you would use these to update a CRM, alert a supervisor, or guide an agent's next reply.</p>`,
  mount(el, ctx) {
    const status = h('p', { class: 'waiting' }, 'Checking Intelligence…');
    const out = h('div', {});
    const refresh = h('button', { type: 'button' }, 'Refresh now');
    const render = makeRender(ctx);
    let stop = () => {};
    const start = () => {
      stop();
      stop = ctx.poll({
        call: () => ctx.api.get('/api/intelligence/results'),
        isDone: (env) => !env.ok || (env.data.results?.length && (!ctx.state().conversationClosed || env.data.results.some((r) => r.executionDetails?.trigger?.on === 'CONVERSATION_END'))),
        onResult: (env, { done, exhausted }) => {
          out.replaceChildren(ctx.resultPanelFor(env, render));
          status.hidden = done || exhausted;
        },
      });
    };
    refresh.addEventListener('click', start);
    const unsubscribe = ctx.onEvent((event) => {
      if (event.source === 'intelligence') start();
    });
    el.append(h('div', { class: 'actions' }, refresh), status, out);
    start();
    return () => {
      stop();
      unsubscribe();
    };
  },
};
```

- [ ] **Step 5: Add `resultPanelFor` to `ctx` in `public/app.js`**

In `public/app.js`, add this property to the `ctx` object, after `goTo,`:
```js
  resultPanelFor: (envelope, render) => resultPanel(envelope, render),
```

- [ ] **Step 6: Register the steps in `public/steps/index.js`**

```js
import setup from './setup.js';
import memoryStore from './memory-store.js';
import memoryProfile from './memory-profile.js';
import operators from './operators.js';
import intelligenceConfig from './intelligence-config.js';
import orchestratorConfig from './orchestrator-config.js';
import talk from './talk.js';
import inspect from './inspect.js';
import memoryResults from './memory-results.js';
import intelligenceResults from './intelligence-results.js';

export default [setup, memoryStore, memoryProfile, operators, intelligenceConfig, orchestratorConfig, talk, inspect, memoryResults, intelligenceResults];
```

- [ ] **Step 7: Add a style for the big number text at the end of `public/styles.css`**

```css
.big { font-size: 1.4rem; margin: 0.25rem 0; }
```

- [ ] **Step 8: Run the tests and a syntax check**

Run: `npm test && for f in public/app.js public/steps/*.js; do node --check "$f" || exit 1; done && echo SYNTAX_OK`
Expected: PASS and `SYNTAX_OK`

- [ ] **Step 9: Manual check**

Run: `npm start`, then visit `#/step/6` through `#/step/9`.
Expected:
- Step 6 shows the SMS / WhatsApp / Voice / Reply as agent / Simulate tabs.
- Step 7 shows 🔒 until there is a conversation.
- Steps 8 and 9 show a failure envelope with a prerequisite hint (not a blank page) when state is empty.
- Sending a fake webhook with `curl -X POST localhost:3000/webhooks/orchestrator -H 'Content-Type: application/json' -d '{"eventType":"COMMUNICATION_CREATED","data":{"author":{"address":"+15557654321","channel":"SMS"},"content":{"type":"TEXT","text":"hi"}}}'` makes the step 6 timeline show the bubble live.

- [ ] **Step 10: Commit**

```bash
git add public
git commit -m "feat: add UI steps 6-9 for live conversations, Memory and Intelligence results

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: README, manual test guide, final verification, push

**Files:**
- Create: `README.md`, `docs/MANUAL_TEST.md`
- Modify: `docs/superpowers/specs/2026-11-24-twilio-conversations-tester-design.md` (sync the 5 refinements listed at the top of this plan)

- [ ] **Step 1: Write `README.md`**

````markdown
# Twilio Conversations Tester

A beginner-friendly, step-by-step tester for three Twilio products that work together:

| Product | What it does in this sample |
|---|---|
| **Conversation Orchestrator** | Captures your SMS, WhatsApp and Voice traffic and groups it into one conversation per customer |
| **Conversation Memory** | Keeps a profile for you, and learns observations + summaries from each conversation |
| **Conversation Intelligence** | Runs AI language operators (Sentiment, Summary, your own prompt) and sends the results to a webhook |

```
 SMS / WhatsApp / Voice ──► Orchestrator ──► Conversation ──► Memory (profile, observations, summary)
                                   │                     └──► Intelligence (operator results → webhook)
                                   └── status callbacks ──► this app's live event log
```

Each step explains a concept, runs the real API call against **your** Twilio account, and shows the result three ways:
- **Rendered:** a friendly view.
- **JSON:** every HTTP request and response, including async polling.
- **Code:** copy-paste Node.js and curl.

## Prerequisites

- An account on the **new Twilio Console** ([1console.twilio.com](https://1console.twilio.com)) with Conversation Orchestrator, Memory and Intelligence available, and the AI/ML Features Addendum accepted.
- A Twilio phone number with **SMS and Voice**.
- *(Optional)* A **registered WhatsApp sender** on the same account.
- An **API Key + Secret** (Console → API keys & tokens).
- **Node.js 20+** and **[ngrok](https://ngrok.com/)** (or any HTTPS tunnel).

> These products are not HIPAA eligible or PCI compliant. Use test data only. Voice capture adds transcription fees.

## Setup

```bash
git clone https://github.com/leroychan/twilio-conversations-sample.git
cd twilio-conversations-sample
npm install
cp .env.example .env        # fill in your values
ngrok http 3000             # in a second terminal; copy the https URL into PUBLIC_URL
npm start                   # open http://localhost:3000
```

## The steps

| # | Product | Step | Code |
|---|---|---|---|
| 0 | Setup | Check credentials, number, webhooks, public URL | `routes/setup.js` |
| 1 | Memory | Create a Memory Store (async operation) | `routes/memory.js` |
| 2 | Memory | Create your Profile (phone + WhatsApp identifiers) | `routes/memory.js` |
| 3 | Intelligence | Explore operators, create a custom one (optional) | `routes/intelligence.js` |
| 4 | Intelligence | Create an Intelligence Configuration (rules, triggers, webhook) | `routes/intelligence.js`, `lib/builders.js` |
| 5 | Orchestrator | Create a Conversation Configuration that links everything | `routes/orchestrator.js`, `lib/builders.js` |
| 6 | Orchestrator | Talk on SMS, WhatsApp or Voice; reply as agent; simulate | `routes/channels.js`, `routes/orchestrator.js` |
| 7 | Orchestrator | Inspect participants and the timeline; close the conversation | `routes/orchestrator.js` |
| 8 | Memory | See observations and summaries; try Recall | `routes/memory.js` |
| 9 | Intelligence | See operator results | `routes/intelligence.js` |

**Run setup steps 1–5** creates everything with default values. **Reset** deletes what the tester created and clears `state.json`.

## How the code is organized

- `routes/*.js`: one file per product. Each handler is a few SDK calls you can copy.
- `lib/builders.js`: the JSON bodies sent to Twilio (capture rules, rules, actions).
- `lib/operations.js`: polling async Operations (202 Accepted + `statusUrl`).
- `lib/capture.js` + `lib/recorder.js`: record every HTTP exchange for the JSON and Code tabs.
- `routes/webhooks.js`: receives Orchestrator status callbacks and Intelligence results and streams them to the browser (Server-Sent Events).
- `public/`: the UI (plain ES modules, no build step). There is one file per step in `public/steps/`.

## Security notes

- Credentials stay on the server. The browser never sees your API secret.
- If you set `TWILIO_AUTH_TOKEN`, inbound `/channels/*` webhooks are checked for a valid Twilio signature. The Orchestrator and Intelligence webhooks are not signature-checked in this sample.
- This is a local learning tool. Don't deploy it as-is.

## Troubleshooting

| Symptom | Fix |
|---|---|
| 401 on every step | Check `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY` and `TWILIO_API_SECRET`. The key must belong to that account. |
| 403 / 404 on Memory, Orchestrator or Intelligence | The account must be on the new Console with the product enabled and the AI addendum accepted. |
| Messages don't show up in Step 6 | Run Step 0. `PUBLIC_URL` must reach this app, and the number's webhooks must point at `/channels/*`. Check that no other conversation configuration captures the same number. |
| Participant has no `profileId` | Create the profile (Step 2) **before** you text or call, using the same number. |
| Steps 8 and 9 stay empty | Close the conversation in Step 7. Extraction runs after a conversation goes inactive or closes. |
| "Configuration limit" | An account can have 10 conversation configurations and 15 memory stores. Use Reset or delete old ones in the Console. |

Run the tests with `npm test`.
````

- [ ] **Step 2: Write `docs/MANUAL_TEST.md`**

```markdown
# Manual test: real account walkthrough

Use this checklist on a migrated (new Console) account. The automated tests use a fake Twilio client, so this is where API-shape surprises show up. Note anything that differs in the "Observed" column.

| # | Action | Expected | Observed |
|---|---|---|---|
| 0 | `npm start`, open the UI, run Setup check | All checks ✓ (WhatsApp ⚠ if not configured). If Webhooks is ✕, click "Point my number's webhooks" and re-run. | |
| 1 | Create Memory Store | JSON tab shows POST → 202, then one or more GET `/Operations/…` polls → COMPLETED; store ID `mem_store_…` | |
| 2 | Create Profile (your mobile) | Profile `mem_profile_…`; Lookup finds it (re-run once if not) | |
| 3 | List operators; create custom operator | Twilio operators listed, including Summary and Sentiment; custom operator `intelligence_operator_…` | |
| 4 | Create Intelligence Configuration | 201; two rules with IDs | |
| 5 | Create Conversation Configuration | 202 → poll → COMPLETED; configuration ID resolved (from `related.configurationId` or by name). Capture rules listed for SMS, WhatsApp, Voice | |
| 6a | Text the number from your mobile | Auto-reply arrives; Live events: `SMS_INBOUND`, `CONVERSATION_CREATED`, `PARTICIPANT_ADDED`, `COMMUNICATION_CREATED` ×2; timeline shows both | |
| 6b | WhatsApp the sender | Same conversation (GROUP_BY_PROFILE); WhatsApp bubble in the timeline | |
| 6c | Call the number, talk 3 turns | `VOICE_CALL`/`VOICE_TURN` events; TRANSCRIPTION communications in the same conversation | |
| 6d | Reply as agent (SMS) | Action reaches COMPLETED; the message arrives on your phone and appears in the timeline | |
| 6e | Simulate a customer message | Communication created. Note whether a Sentiment result follows in Step 9 (undocumented) | |
| 7 | Load conversation; close it | Customer participant has `profileId` matching Step 2 (✓ badge); status becomes CLOSED | |
| 8 | Wait on Memory results | Observations and a summary appear within ~2 minutes; Recall returns scored matches | |
| 9 | Wait on Intelligence results | Sentiment results per message, custom operator JSON, and a Summary after close; Intelligence webhooks in Live events | |
| R | Reset | All resources deleted (or "already deleted"); state cleared; rail back to step 1 | |

**Open questions to record from this run** (spec §11):
- Do API-created (simulated) communications trigger `COMMUNICATION` rules and memory extraction?
- Does the Orchestrator configuration 202 response include `related.configurationId`?
- Which trait key does Memory accept for WhatsApp in the `Contact` group (`whatsapp`)?
- What is the exact shape of Sentiment and Summary `result` values? Adjust `public/steps/intelligence-results.js` rendering if needed.
```

- [ ] **Step 3: Sync the spec with the plan's refinements**

In `docs/superpowers/specs/2026-11-24-twilio-conversations-tester-design.md`, make these edits:
- **Section 3 (tree):** add `lib/app.js  # createApp(); server.js only loads config and listens`, `lib/capture.js`, `lib/snippets.js` and `lib/builders.js`. Remove `simulate communication` from the `channels.js` comment.
- **Section 3 (Result envelope):** replace the `"polls"` line with `"exchanges": [ { "request": {…}, "response": {…}, "durationMs": 0 } ],  // every real HTTP call, incl. polls`. Replace the paragraph starting "The `request` shown is the logical REST request…" with "`exchanges` are captured from the SDK's HTTP client (`CapturingRequestClient`), so they are the real wire requests; `request`/`response` are the first exchange."
- **Section 3 (State):** add `"conversationClosed": false`.
- **Section 4 (table, row 5):** note that step 5 also requires the Profile (step 2).
- **Section 5 (Simulate row):** change the endpoint to `POST /api/orchestrator/simulate`.

- [ ] **Step 4: Final verification**

Run: `npm test`
Expected: all test files PASS, 0 failures. Paste the summary line.

Run: `PORT=3999 node server.js & sleep 1; curl -s localhost:3999/health; curl -s -o /dev/null -w '%{http_code}\n' localhost:3999/; kill %1`
Expected: `{"ok":true,"app":"conversations-tester"}` then `200`

Run: `git status --short`
Expected: only the files from this task are listed, and there is no `.env` or `state.json`.

- [ ] **Step 5: Commit and push**

```bash
git add README.md docs/MANUAL_TEST.md docs/superpowers/specs/2026-11-24-twilio-conversations-tester-design.md
git commit -m "docs: add README and manual test guide; sync spec with plan

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin main
```
