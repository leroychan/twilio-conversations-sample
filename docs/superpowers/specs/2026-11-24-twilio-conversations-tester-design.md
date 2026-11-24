# Twilio Conversations Tester — Design

**Date:** 2026-11-24
**Status:** Draft for review

## 1. Purpose

A beginner-friendly Node.js sample that teaches how **Conversation Orchestrator**, **Conversation Memory**, and **Conversation Intelligence** work together. A step-by-step "tester" UI explains each concept, runs the real API call against the learner's own Twilio account, and shows the output.

### Audience
Developers new to these three products. They know basic Node.js and have a Twilio account.

### Success criteria
- A learner goes from an empty account to a conversation that spans SMS, WhatsApp, and Voice. That conversation is linked to a Memory profile with observations and a summary, and has Intelligence operator results (sentiment, summary, custom operator), all through the UI.
- For every step, the learner can see:
  1. What the resource is and why it exists.
  2. The exact request and response JSON.
  3. An equivalent copyable `curl` and Node SDK snippet.
  4. A friendly rendered view.
- Webhooks (Orchestrator status callbacks, Intelligence rule executions) appear live in an event log.
- The route code is short and readable, with the SDK call visible in each handler, so learners can lift it into their own projects.

### What the user decided (from brainstorming)
- Runs **locally** with the learner's **real Twilio number**; **ngrok** (or similar) exposes webhooks.
- Stack: **Express + plain HTML/JS**, no build step.
- Output: raw JSON, curl/Node snippet, rendered view, live webhook log.
- UI shape: **guided wizard with a progress rail** (approach A).
- Channels: **SMS, WhatsApp, and Voice**.
- WhatsApp: assume a **registered WhatsApp sender** (WABA). The Sandbox is not supported.

### Non-goals
- Production hardening (auth, multi-user, persistence beyond a local JSON file).
- Chat channel / Conversations API (classic) bridge.
- AI voice agents via `<ConversationRelay>`. Voice uses passive capture plus a simple `<Gather>` loop.
- Enterprise Knowledge, Agent Connect.
- Hosted / shared deployment.

## 2. Product background (from Twilio docs, Nov 2026)

| Product | Base URL | Key resources |
|---|---|---|
| Orchestrator | `https://conversations.twilio.com/v2` | Configuration (capture rules, grouping, links to Memory Store + Intelligence configs) → Conversation → Participants, Communications, Actions |
| Memory | `https://memory.twilio.com/v1` | Store → Profile → Traits, Identifiers, Observations, ConversationSummaries; Recall; Lookup |
| Intelligence | `https://intelligence.twilio.com/v3` | Operators (Twilio-authored or custom) → Configuration → Rules (operators + triggers + webhook actions) → OperatorResults |

Facts that shape the design:
- **Auth:** HTTP Basic with API Key SID/Secret. The `twilio` npm package (≥ 6.3) has typed clients: `client.conversations.v2`, `client.memory.v1`, `client.intelligence.v3`.
- **Async operations:**
  - These return `202` with a `statusUrl`, which must be polled until `COMPLETED` or `FAILED`: Memory Store create/delete, and Orchestrator Configuration create/update/delete.
  - Some docs say the Orchestrator config create response carries no ID. In that case we fall back to listing configurations by `displayName`.
- **Memory extraction:**
  - Observations and summaries are produced only when `memoryExtractionEnabled: true` is set on the Orchestrator configuration.
  - They are produced only after a conversation goes **inactive or closed**, never mid-conversation.
- **Profile linking:** passive SMS/WhatsApp/Voice capture links only to profiles that **already exist**. The learner must create a profile for their own phone number before sending traffic.
- **Grouping:** `GROUP_BY_PROFILE` merges a person's traffic across channels into one conversation. It cannot be changed after creation.
- **Voice:**
  - Saving voice capture rules (`metadata.callType: "PSTN"`) auto-provisions real-time transcription, which costs extra.
  - Each utterance or TTS fragment becomes its own `TRANSCRIPTION` communication.
  - Voice timeouts behave differently from messaging timeouts.
- **WhatsApp:** E.164 addresses, with or without the `whatsapp:` prefix. The registered WABA number is treated as the agent. Media is not captured.
- **Twilio-authored operators** (documented IDs):
  - Summary: `intelligence_operator_01kcv35pnkeysaf6z6cqtbpegn`
  - Sentiment: `intelligence_operator_01kcrvw16kfa88qvgrfmr7y151`
  - Next Best Response: `intelligence_operator_01kea27sy7ffsafmtsfp17nzx4`
  - The UI also lists operators live via `operators.list()` rather than relying only on hard-coded IDs.
- **Prerequisites:**
  - The account must be on the new Console (1console.twilio.com).
  - The AI/ML Features Addendum must be accepted.
  - None of the products are HIPAA/PCI eligible. The UI shows this notice.

## 3. Architecture

```
twilio-conversations-sample/
├─ .env.example
├─ package.json            # deps: express, twilio, dotenv. scripts: start, dev (node --watch), test (node --test)
├─ server.js               # loads config and listens
├─ lib/
│  ├─ app.js               # createApp(); server.js only loads config and listens
│  ├─ config.js            # loads + validates env; exposes which channels are enabled
│  ├─ twilio.js            # shared client: twilio(API_KEY, API_SECRET, { accountSid })
│  ├─ state.js             # read/write state.json (IDs created by each step)
│  ├─ operations.js        # waitForOperation(statusUrl): polls, records each poll, timeout + backoff
│  ├─ events.js            # in-memory EventEmitter + ring buffer (last 200 events) → SSE
│  ├─ recorder.js          # record(stepId, { method, url, body }, fn): runs fn, captures response/error/timing,
│  │                       #   builds curl + Node snippet, returns uniform result envelope
│  ├─ capture.js           # CapturingRequestClient: records every real HTTP exchange from the SDK
│  ├─ snippets.js          # builds the curl and Node snippets shown in the Code tab
│  ├─ builders.js          # JSON bodies for capture rules, Intelligence rules and actions
│  └─ errors.js            # maps Twilio errors to beginner hints
├─ routes/
│  ├─ setup.js             # step 0
│  ├─ memory.js            # steps 1, 2, 8
│  ├─ intelligence.js      # steps 3, 4, 9
│  ├─ orchestrator.js      # steps 5, 7 + agent reply (Actions) + close conversation
│  ├─ channels.js          # inbound TwiML for SMS, WhatsApp, Voice
│  ├─ webhooks.js          # POST /webhooks/orchestrator, POST /webhooks/intelligence → events bus
│  └─ reset.js             # delete created resources in reverse order, clear state.json
├─ public/
│  ├─ index.html           # layout: progress rail (left), step panel (center), event log (right/bottom)
│  ├─ app.js               # step router, Run handling, result tabs, SSE client, state hydration
│  ├─ steps/               # one module per step: { id, title, product, learn (HTML), form(state), render(result) }
│  └─ styles.css           # Twilio design guidelines (colors, Twilio Sans)
├─ test/                   # node --test unit tests with a mocked Twilio client
├─ docs/MANUAL_TEST.md     # real-account walkthrough checklist
└─ README.md
```

### Result envelope (every `/api/*` response)
```json
{
  "ok": true,
  "step": "memory.createStore",
  "durationMs": 1830,
  "request":  { "method": "POST", "url": "https://memory.twilio.com/v1/ControlPlane/Stores", "body": { } },
  "response": { "status": 202, "body": { } },
  "exchanges": [ { "request": {…}, "response": {…}, "durationMs": 0 } ],  // every real HTTP call, incl. polls
  "snippet":  { "curl": "curl -X POST ...", "node": "await client.memory.v1.stores.create({...})" },
  "data":     { "store": { } },                      // the step's result (null on failure)
  "state":    { "storeId": "mem_store_..." },
  "error":    null,
  "hint":     null
}
```
On failure: `ok: false` and `data: null`. `error` holds `{ status, code, message, moreInfo }` and `hint` holds a beginner-friendly explanation.

`exchanges` are captured from the SDK's HTTP client (`CapturingRequestClient`), so they are the real wire requests; `request`/`response` are the first exchange. Captured bodies are copies with secret-looking fields (`auth_token`, `*secret*`, `*password*`) replaced by `[redacted]`.

### State (`state.json`, git-ignored)
```json
{ "storeId": null, "profileId": null, "operatorId": null, "intelligenceConfigId": null,
  "intelligenceRuleIds": [], "orchestratorConfigId": null, "conversationId": null,
  "conversationClosed": false, "createdAt": {} }
```
Each step reads its prerequisites from the state, and the forms come pre-filled from it. The progress rail derives each step's status from the state: done / ready / blocked (with the missing prerequisite named).

## 4. Steps

Each step panel has three parts:
1. **Learn:** 3–6 sentences plus a small diagram where helpful, with a link to the relevant Twilio doc.
2. **Do:** a form with sensible defaults and a **Run** button.
3. **See:** the output in **Rendered**, **JSON** (every HTTP exchange) and **Code** (curl, Node) tabs.

| # | Product | Step | SDK calls | Rendered view |
|---|---|---|---|---|
| 0 | — | **Setup check** | `incomingPhoneNumbers.list({ phoneNumber })` (also the "API key works" check: a Standard API key can list numbers but cannot fetch the Account, and the Account JSON contains the auth token); GET `PUBLIC_URL/health` | Checklist: credentials, phone number + capabilities (SMS/Voice), WhatsApp sender configured, public URL reachable, new-Console reminder. Optional button "Point my number's webhooks at this app" → `incomingPhoneNumbers(sid).update({ smsUrl, voiceUrl })` |
| 1 | Memory | **Create a Memory Store** | `memory.v1.stores.create({ displayName, description })` → `waitForOperation` | Store card + poll timeline |
| 2 | Memory | **Create your Profile** | `memory.v1.profiles(storeId).create({ traits: { Contact: { firstName, phone, whatsapp? } } })`; then `lookup(storeId).create({ idType: 'phone', value })` to confirm | Profile card; explains why the profile must exist before traffic |
| 3 | Intelligence | **Explore operators / create a custom one** (optional) | `intelligence.v3.operators.list()`; `operators.create({ displayName, description, author: 'SELF', prompt, outputFormat: 'JSON', outputSchema })` (default: "Upsell intent detector") | Operator list (Twilio-authored vs custom); custom operator card with prompt + schema |
| 4 | Intelligence | **Create an Intelligence Configuration** | `intelligence.v3.configurations.create({ displayName, rules })`. Rule A: Sentiment (+ custom operator if created), trigger `COMMUNICATION`. Rule B: Summary, trigger `CONVERSATION_END`. Both: action `WEBHOOK POST PUBLIC_URL/webhooks/intelligence`, `context.memory.enabled: true` | Rules diagram (trigger → operators → webhook) |
| 5 | Orchestrator | **Create a Conversation Configuration** (requires the Profile from step 2 as well) | `conversations.v2.configurations.create({ displayName, description, conversationGroupingType: 'GROUP_BY_PROFILE', memoryStoreId, intelligenceConfigurationIds: [id], memoryExtractionEnabled: true, statusCallbacks: [{ url: PUBLIC_URL/webhooks/orchestrator, method: 'POST' }], channelSettings })` → `waitForOperation` | "Wiring" diagram: Configuration ↔ Store, ↔ Intelligence config, ↔ channels with capture rules |
| 6 | Orchestrator | **Talk on any channel** | See section 5 | Live chat-style timeline (SSE-driven), with a tab per channel |
| 7 | Orchestrator | **Inspect & close the conversation** | `conversations.v2.conversations.list()`; `participants(id).list()`; `communications(id).list()`; `conversations(id).update({ status: 'CLOSED' })` | Conversation card; participant chips (type, address, `profileId`); timeline with channel icons; Close button |
| 8 | Memory | **See what Memory learned** | `observations(storeId, profileId).list()`; `conversationSummaries(storeId, profileId).list({ conversationId })`; `recall(storeId, profileId).create({ query, conversationId })` | Observations list; summary; Recall search box with ranked, scored results |
| 9 | Intelligence | **See Intelligence results** | `client.request({ method: 'get', uri: 'https://intelligence.twilio.com/v3/OperatorResults', params: { conversationId, pageSize } })` (raw JSON: the twilio 6.3.1 `operatorResults` model keeps only `result.entities`) + received intelligence webhooks | Sentiment badge, summary text, custom-operator JSON, trigger info |

`channelSettings` in step 5 is built from the enabled channels. Rules for each channel are bidirectional (Twilio address as `from` in one rule, as `to` in the other):
```json
{
  "SMS":      { "captureRules": [ { "from": "*", "to": "+1TWILIO" }, { "from": "+1TWILIO", "to": "*" } ],
                "statusTimeouts": { "inactive": 5, "closed": 30 } },
  "WHATSAPP": { "captureRules": [ { "from": "*", "to": "+1WABA" },   { "from": "+1WABA",   "to": "*" } ],
                "statusTimeouts": { "inactive": 5, "closed": 30 } },
  "VOICE":    { "captureRules": [ { "from": "*", "to": "+1TWILIO", "metadata": { "callType": "PSTN" } },
                                  { "from": "+1TWILIO", "to": "*", "metadata": { "callType": "PSTN" } } ] }
}
```
Short timeouts are used so learners see extraction quickly. The UI explains that the defaults are longer in production.

Steps 8 and 9 auto-poll every 5 s for up to 2 min after the conversation is closed, showing "Waiting for extraction…" until results arrive or the poll times out (with a "Refresh" button).

**Blocked steps (refinement):** a step whose prerequisites are missing keeps its Run button enabled. Pressing it returns a prerequisite hint naming the missing step, instead of running the call.

**Run all remaining steps:** runs steps 1–5 in order with default values. It stops at the first error and at step 6, which needs a human.

**Reset:** deletes the resources in reverse order (Orchestrator config, Intelligence config, custom operator, Memory store) with operation polling, then clears `state.json`. Each deletion is shown as its own result.

## 5. Channels (step 6)

| Tab | Mechanism | Endpoint in app |
|---|---|---|
| **SMS** | Learner texts the Twilio number. Twilio calls `POST /channels/sms`, which replies with a TwiML `<Message>` auto-response ("Thanks! An agent will reply shortly." on the first message, then a short echo). Orchestrator captures both directions passively. | `POST /channels/sms` |
| **WhatsApp** | Same as SMS but on the registered WhatsApp sender. The sender's inbound webhook points at `POST /channels/whatsapp`. Disabled with an explanation and a registration-guide link if `TWILIO_WHATSAPP_NUMBER` is unset. | `POST /channels/whatsapp` |
| **Voice** | Learner calls the Twilio number. `POST /channels/voice` returns `<Say>` greeting + `<Gather input="speech" action="/channels/voice/turn">`. Each turn `<Say>`s a short acknowledgement and gathers again. After 3 turns (or silence) it says goodbye and hangs up. Capture rules provide the transcription automatically, so the app does not add `<Transcription>`. | `POST /channels/voice`, `POST /channels/voice/turn` |
| **Reply as agent** | A text box sends an outbound message into the active conversation via `conversations.v2.conversations(id).actions.create({ type: 'SEND_MESSAGE', payload: { from, to, content: { text } } })`, then polls the Action until it completes. Channel selector: SMS / WhatsApp. | `POST /api/orchestrator/reply` |
| **Simulate** | Posts a communication through the API (`communications(id).create`) for a chosen channel/author, for learners without a phone handy. Requires an existing conversation. If none exists, it first creates one actively with explicit `CUSTOMER` + `AI_AGENT` participants. The UI labels these as "simulated" and notes that the docs do not guarantee API-created communications trigger Intelligence rules. | `POST /api/orchestrator/simulate` |

The timeline is fed by Orchestrator `COMMUNICATION_CREATED` webhooks from the SSE stream. A "Refresh from API" button re-lists communications.

## 6. Webhooks and live events

- `POST /webhooks/orchestrator`: payload `{ eventType, timestamp, data }` (e.g., `CONVERSATION_CREATED`, `COMMUNICATION_CREATED`, `PARTICIPANT_ADDED`, `CONVERSATION_UPDATED`). When a conversation for our configuration appears, the handler stores `conversationId` in state if none is set or the stored one is closed.
- `POST /webhooks/intelligence`: payload `{ accountId, conversationId, intelligenceConfiguration, operatorResults[] }`.
- Both always return `200` quickly, push to the event bus, and never throw.
- Inbound channel requests (`/channels/*`) are also logged as events.
- `GET /events` is the SSE stream. On connect it replays the ring buffer.
- Only `/health`, `/webhooks/*` and `/channels/*` answer through the tunnel. The UI, `/api/*` and `/events` answer only when the Host is `localhost`, `127.0.0.1` or `[::1]` (403 otherwise), so a public ngrok URL can't drive the tester.
- The UI event log has filter chips (Orchestrator / Intelligence / Channels), expandable JSON, and a clear button.
- Twilio request-signature validation is applied to the `/channels/*` routes (`twilio.webhook()` middleware, using `TWILIO_AUTH_TOKEN` when provided; skipped with a startup warning otherwise). The docs reviewed did not specify a signature scheme for the Orchestrator/Intelligence webhooks, so those are not validated. The README says so.

## 7. Configuration (`.env.example`)

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_API_KEY=SKxxxxxxxx
TWILIO_API_SECRET=xxxxxxxx
TWILIO_AUTH_TOKEN=            # optional, enables webhook signature validation on /channels/*
TWILIO_PHONE_NUMBER=+1...     # SMS + Voice capable number you own
TWILIO_WHATSAPP_NUMBER=       # optional, registered WhatsApp sender (E.164)
MY_PHONE_NUMBER=+1...         # your mobile; used for the Memory profile
PUBLIC_URL=https://xxxx.ngrok-free.app
PORT=3000
```
`lib/config.js` validates these at startup. The server prints which values are missing and which channels are enabled, and still starts, so step 0 can show the problems in the UI.

## 8. Error handling

- `recorder` catches every SDK error and returns `ok: false` with `{ status, code, message, moreInfo }`.
- `errors.js` maps common failures to hints:
  - 401: check API key/secret.
  - 403/404 on these hosts: account not on the new Console, product not enabled, or AI addendum not accepted.
  - Configuration limit (10 per account): use Reset or delete old configs.
  - Store limit (15).
  - Capture-rule overlap with another configuration.
  - Missing `PUBLIC_URL` for webhook-bearing steps.
- `waitForOperation`:
  - Respects `Retry-After`, otherwise polls at 1 s with backoff up to 5 s; 60 s timeout.
  - `FAILED` returns the operation's `error`.
  - If the result has no ID, falls back to listing by `displayName`.
- The UI never hides errors. The JSON tab always shows the raw error body.
- Steps whose prerequisites are missing are shown as blocked. Their Run button stays enabled; pressing it returns a prerequisite hint naming the missing step (see the blocked-steps refinement in §4).

## 9. Testing

- **Unit tests** (`node --test`, no network) inject a fake Twilio client:
  - `recorder`: result envelope shape and curl/Node snippet generation.
  - `operations`: pending→completed, failed, timeout, missing ID fallback.
  - `state`: read/write/reset.
  - `errors`: hint mapping.
  - Each route: correct SDK method + arguments built from state and form (especially `channelSettings`, intelligence `rules`, and the Actions payload).
  - `channels`: TwiML output for SMS, WhatsApp and Voice (including the turn counter).
- **Manual test** (`docs/MANUAL_TEST.md`): the full real-account walkthrough across all three channels, with expected outputs per step.
- **Verification limit:** the implementation will be checked against the SDK's TypeScript types and the API reference. It cannot be run against a live migrated account during development. The first live run may surface API-shape differences, and the manual test doc records where to look.

## 10. README outline

1. What you'll learn (diagram of Orchestrator ↔ Memory ↔ Intelligence).
2. Prerequisites: new-Console account, AI addendum, SMS+Voice number, registered WhatsApp sender (optional), Node 20+, ngrok.
3. Setup: `git clone`, `npm install`, `cp .env.example .env`, `ngrok http 3000`, `npm start`, open `http://localhost:3000`.
4. Walkthrough summary of steps 0–9.
5. Where the code for each step lives (step → route file → SDK call).
6. Costs and compliance notes (voice transcription fees, AI features, not HIPAA/PCI).
7. Troubleshooting + Reset.

## 11. Open questions / risks

- Whether API-created communications (Simulate) trigger Intelligence `COMMUNICATION` rules and memory extraction. This is undocumented, and the UI labels it.
- Whether the Orchestrator config-create `202` includes `related.configurationId`. Both cases are handled.
- Some docs pages disagree with the API reference: store `displayName` rules, and observation body shape. The API reference / SDK types are treated as the source of truth.
