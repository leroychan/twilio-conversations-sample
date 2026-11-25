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
- *(Optional)* A **registered WhatsApp sender** on the same account (see [WhatsApp](#whatsapp)).
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
| 6 | Orchestrator | Talk on SMS, WhatsApp or Voice; reply as agent; simulate. Live timeline + Intelligence results | `routes/channels.js`, `routes/orchestrator.js`, `public/lib/insights.js` |
| 7 | Orchestrator | Inspect participants and the timeline; close the conversation. Intelligence results | `routes/orchestrator.js`, `public/lib/insights.js` |
| 8 | Memory | See observations and summaries; try Recall | `routes/memory.js` |
| 9 | Intelligence | See operator results | `routes/intelligence.js` |
| 10 | Clean up | Restore your number's original webhooks, delete everything the tester created, list what to undo by hand | `routes/reset.js`, `lib/backup.js` |

**Run setup steps 1–5** creates everything with default values. **Reset** (top right) opens Step 10, which shows its plan first. Nothing is deleted until you confirm there.

The ticks in the progress rail come from `state.json` (the IDs this app created), not from a live check of your account. If you delete something in the Console or through the API yourself, run Step 10 so the app forgets it too.

### When do the Intelligence operators run?

Operators never run on their own: a **rule** in the Intelligence Configuration (Step 4) decides when. The tester creates two rules:

| Rule | Operators | Trigger | When |
|---|---|---|---|
| 1 | Sentiment, plus your custom operator if you created one in Step 3 | `COMMUNICATION` | On every new message or voice utterance, a few seconds after it arrives |
| 2 | Summary | `CONVERSATION_END` | When the conversation closes: either **Close conversation** in Step 7, or automatically after the Step 5 timeouts (inactive after 5 minutes, then closed after 30) |

Results are sent to `PUBLIC_URL/webhooks/intelligence`. Steps 6 and 7 show them as a **🧠 Conversation Intelligence** card that updates live: Sentiment as a coloured label with its history, your custom operator's fields (✓/✕, confidence bar, quoted evidence) and the Summary as text. Step 9 shows the raw results.

Your custom operator only runs if it existed when you created the Intelligence Configuration. Create it in Step 3 first, then do Step 4.

### Cleaning up (Step 10)

Before Step 0 points your phone number at this app, it saves the number's original SMS and Voice webhooks to `.tester-backup.json`. The file is git-ignored and is only written the first time, so pointing the number again never replaces the originals. Step 10 first shows a plan, then does it when you click **Restore & delete everything**:

| | What | How |
|---|---|---|
| 🔁 Restored | Your phone number's SMS + Voice webhooks | Set back to the values in `.tester-backup.json` (the file is removed once that works) |
| 🗑 Deleted | Conversations, Conversation Configuration (capture rules), Intelligence Configuration, custom operator, Memory Store (with your profile, observations and summaries) | Twilio API, newest first. Anything that fails is reported and kept in `state.json`, so you can run Step 10 again |
| ✋ By hand | WhatsApp sender webhook, ngrok, the API key (optional), `.env` | The tester never changed these itself, so Step 10 tells you where to undo them |

## WhatsApp

1. Register a WhatsApp sender on the same account and set `TWILIO_WHATSAPP_NUMBER` in `.env` (plain E.164, such as `+15551234567`).
2. In the Console (Messaging → Senders → WhatsApp senders), set the sender's incoming-message webhook to `PUBLIC_URL/channels/whatsapp`.
3. Re-run Step 5 if you created the configuration before adding WhatsApp.

Step 5's WhatsApp capture rules use the `whatsapp:` prefix (`whatsapp:+15551234567`), because that is how WhatsApp addresses appear on messages. A bare number never matches WhatsApp traffic.

Because Step 5 uses `GROUP_BY_PROFILE`, a WhatsApp message joins the same conversation as your SMS when both identifiers are on your profile (Step 2).

## How the code is organized

- `routes/*.js`: one file per product. Each handler is a few SDK calls you can copy.
- `lib/builders.js`: the JSON bodies sent to Twilio (capture rules, rules, actions).
- `lib/operations.js`: polling async Operations (202 Accepted + `statusUrl`).
- `lib/capture.js` + `lib/recorder.js`: record every HTTP exchange for the JSON and Code tabs.
- `routes/webhooks.js`: receives Orchestrator status callbacks and Intelligence results and streams them to the browser (Server-Sent Events).
- `public/`: the UI (plain ES modules, no build step). There is one file per step in `public/steps/`; `public/lib/insights.js` draws the Intelligence card in Steps 6 and 7.

A few calls use `client.request(...)` instead of the SDK's list helpers, because the SDK drops or chokes on part of the response: operator results (the SDK drops `result`) and Memory observations (Twilio returns `"observations": null` for an empty list). The code comments say why at each spot.

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
| SMS never arrives | Check the number's capabilities in Step 0: some numbers (for example, many outside the US) are Voice-only. You need an SMS-capable number for SMS. |
| WhatsApp messages arrive but aren't captured | Re-create the Step 5 configuration (older versions of this sample left out the `whatsapp:` prefix). Also check the Console for a classic Conversations *address configuration* on the same sender: it can take the messages, and Monitor alerts such as 50057 point at its webhook. |
| Steps 1–2 still ticked after deleting the store yourself | The app only knows what's in `state.json`. Run Step 10: a resource that's already gone counts as deleted, and its IDs are cleared. |
| Participant has no `profileId` | Create the profile (Step 2) **before** you text or call, using the same number. |
| Steps 8 and 9 stay empty | Close the conversation in Step 7. Extraction runs after a conversation goes inactive or closes. Sentiment shows up per message; the Summary and Memory only after closing. |
| "Configuration limit" | An account can have 10 conversation configurations and 15 memory stores. Use Reset or delete old ones in the Console. |

Run the tests with `npm test`.
