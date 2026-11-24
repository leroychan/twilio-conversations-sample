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
| 10a | Before Step 0's "Point my number's webhooks", note the number's SMS/Voice URLs in the Console. Run it, then open Step 10 | `.tester-backup.json` exists; the plan shows each webhook going from the tunnel URL back to the values you noted, and lists the conversations, configurations, operator and store to delete | |
| 10b | Click "Restore & delete everything" | The number's webhooks in the Console match your notes again; every resource ✓ (or "already deleted"); `.tester-backup.json` is gone; state cleared; rail back to step 1 | |

**Open questions to record from this run** (spec §11):
- Do API-created (simulated) communications trigger `COMMUNICATION` rules and memory extraction?
- Does the Orchestrator configuration 202 response include `related.configurationId`?
- Which trait key does Memory accept for WhatsApp in the `Contact` group (`whatsapp`)?
- What is the exact shape of Sentiment and Summary `result` values? Step 9 reads the raw JSON from `GET https://intelligence.twilio.com/v3/OperatorResults` with `client.request`, because the twilio 6.3.1 `operatorResults.list()` model keeps only `result.entities` (TEXT, CLASSIFICATION and JSON results would show `{}`). Confirm the list array key (`meta.key`, expected `operatorResults`) in the JSON tab, and adjust `public/steps/intelligence-results.js` rendering if needed.
