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
- A **Standard API Key + Secret** (Console → API keys & tokens → Create API key → type *Standard*). Step 0 checks the key by listing your phone numbers.
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

Open the tester at `http://localhost:3000`, not at the ngrok URL: the UI only answers on localhost (see Security notes).

**Free ngrok URLs change every time ngrok restarts.** When that happens: update `PUBLIC_URL` in `.env`, restart `npm start`, and re-run Step 0's **Point my number's webhooks at this app**. Re-create the Step 4 and Step 5 configurations too (their webhook URLs include `PUBLIC_URL`), or use Reset. With `TWILIO_AUTH_TOKEN` set, a stale `PUBLIC_URL` makes every SMS/Voice webhook fail signature validation with 403; the server log names the URL it checked.

Before trying it on a real account, walk through [docs/MANUAL_TEST.md](docs/MANUAL_TEST.md).

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

- Credentials stay on the server. The browser never sees your API secret or Auth Token, and secret-looking fields in recorded Twilio responses are shown as `[redacted]`.
- The UI, `/api/*` and `/events` only answer on `localhost` / `127.0.0.1` / `[::1]`. Requests that arrive through the tunnel get 403, so someone who finds your ngrok URL can't create or delete resources. The tunnel only serves Twilio's webhooks (`/webhooks/*`, `/channels/*`) and `/health`.
- If you set `TWILIO_AUTH_TOKEN`, inbound `/channels/*` webhooks are checked for a valid Twilio signature. The Orchestrator and Intelligence webhooks are not signature-checked in this sample.
- This is a local learning tool. Don't deploy it as-is.

## Troubleshooting

| Symptom | Fix |
|---|---|
| 401 on every step | Check `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY` and `TWILIO_API_SECRET`. The key must belong to that account (a Standard API key is enough). |
| 403 "only answer on localhost" | Open `http://localhost:3000` instead of the ngrok URL. |
| SMS/Voice webhooks get 403 after restarting ngrok | `PUBLIC_URL` is stale. Update it, restart, and re-run Step 0's "Point my number's webhooks". |
| 403 / 404 on Memory, Orchestrator or Intelligence | The account must be on the new Console with the product enabled and the AI addendum accepted. |
| Messages don't show up in Step 6 | Run Step 0. `PUBLIC_URL` must reach this app, and the number's webhooks must point at `/channels/*`. Check that no other conversation configuration captures the same number. |
| Participant has no `profileId` | Create the profile (Step 2) **before** you text or call, using the same number. |
| Steps 8 and 9 stay empty | Close the conversation in Step 7. Extraction runs after a conversation goes inactive or closes. |
| "Configuration limit" | An account can have 10 conversation configurations and 15 memory stores. Use Reset or delete old ones in the Console. |

Run the tests with `npm test`.
