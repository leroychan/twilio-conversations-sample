// Step 10: undo everything the tester did to your account.
//   1. Restore your phone number's original SMS/Voice webhooks (saved in .tester-backup.json by Step 0).
//   2. Delete what the tester created, newest dependency first: conversations, the Conversation
//      Configuration, the Intelligence Configuration, the custom operator, and the Memory Store.
//   3. List what you must undo by hand (things the tester never changed itself).
// GET /preview shows the plan without changing anything; POST / carries it out.
const express = require('express');
const { record, respond } = require('../lib/recorder');
const { requireClient } = require('../lib/errors');
const { waitForOperation } = require('../lib/operations');
const { call } = require('../lib/snippets');
const { isTesterWebhook } = require('../lib/builders');

const shown = (url, method) => (url ? `${url}${method && method !== 'POST' ? ` (${method})` : ''}` : '(empty)');

// A backup is only worth restoring if its "original" wasn't already a tester URL.
const restorable = (original) => Boolean(original && !original.pointedAtTester);

function manualSteps({ config, original, numberPointsHere }) {
  const steps = [];
  if (numberPointsHere && !restorable(original)) {
    steps.push({
      label: `Your phone number ${config.phoneNumber}`,
      detail: "Its SMS and Voice webhooks still point at a tester URL, and the original values weren't saved "
        + '(they were changed before backups existed, or by hand). Set them back in the Twilio Console → Phone Numbers → '
        + `${config.phoneNumber} → Configure.`,
    });
  }
  if (config.channels.whatsapp) {
    steps.push({
      label: `WhatsApp sender ${config.whatsappNumber}`,
      detail: `You set its incoming-message webhook to ${config.publicUrl}/channels/whatsapp in the Console. `
        + 'Set it back in the Twilio Console → Messaging → Senders → WhatsApp senders.',
    });
  }
  steps.push({ label: 'Stop ngrok', detail: 'Press Ctrl+C in the ngrok terminal. The PUBLIC_URL in .env stops working once the tunnel closes.' });
  steps.push({ label: 'API key (optional)', detail: 'If you created an API key just for this tester, delete it in the Twilio Console → API keys & tokens.' });
  steps.push({ label: 'Local files', detail: 'This step clears state.json and removes .tester-backup.json once your number is restored. Your .env stays; delete it if you no longer need it.' });
  return steps;
}

function resetRoutes({ client, config, state, events, backup, sleep }) {
  const router = express.Router();

  const findNumber = async () => {
    if (!config.phoneNumber) return null;
    const [number] = await client.incomingPhoneNumbers.list({ phoneNumber: config.phoneNumber, limit: 1 });
    return number || null;
  };
  const ourConversations = async (configurationId) => {
    if (!configurationId) return [];
    const all = await client.conversations.v2.conversations.list({ limit: 50 });
    return all.filter((c) => c.configurationId === configurationId);
  };
  const restoreParams = (original) => ({
    smsUrl: original.smsUrl,
    smsMethod: original.smsMethod,
    voiceUrl: original.voiceUrl,
    voiceMethod: original.voiceMethod,
  });

  router.get('/preview', respond(() => {
    const current = state.get();
    return record({
      step: 'reset.preview',
      state,
      code: [
        `const [number] = await ${call('client.incomingPhoneNumbers.list', { phoneNumber: config.phoneNumber, limit: 1 })};`,
        `const conversations = await ${call('client.conversations.v2.conversations.list', { limit: 50 })};`,
      ],
    }, async () => {
      requireClient(client);
      const original = backup.get().phoneNumber;
      const number = await findNumber();
      const restore = [];
      if (restorable(original)) {
        restore.push({ label: `SMS webhook of ${original.phoneNumber}`, id: original.sid, from: shown(number?.smsUrl, number?.smsMethod), to: shown(original.smsUrl, original.smsMethod) });
        restore.push({ label: `Voice webhook of ${original.phoneNumber}`, id: original.sid, from: shown(number?.voiceUrl, number?.voiceMethod), to: shown(original.voiceUrl, original.voiceMethod) });
      }
      const conversations = await ourConversations(current.orchestratorConfigId);
      const del = [
        ...conversations.map((c) => ({ label: 'Conversation', id: c.id, detail: c.status || '' })),
        current.orchestratorConfigId && { label: 'Conversation configuration', id: current.orchestratorConfigId, detail: 'Removes the capture rules, so Twilio stops observing your number' },
        current.intelligenceConfigId && { label: 'Intelligence configuration', id: current.intelligenceConfigId, detail: 'Its rules stop running' },
        current.operatorId && { label: 'Custom operator', id: current.operatorId, detail: '' },
        current.storeId && { label: 'Memory store', id: current.storeId, detail: 'Includes your profile, its traits, observations and summaries' },
      ].filter(Boolean);
      const numberPointsHere = isTesterWebhook(number?.smsUrl) || isTesterWebhook(number?.voiceUrl);
      return { restore, delete: del, manual: manualSteps({ config, original, numberPointsHere }) };
    });
  }));

  router.post('/', respond(() => {
    const current = state.get();
    const original = backup.get().phoneNumber;
    return record({
      step: 'reset',
      state,
      code: [
        ...(restorable(original) ? [`await ${call(`client.incomingPhoneNumbers('${original.sid}').update`, restoreParams(original))};`] : []),
        "for (const conversation of conversations) await client.conversations.v2.conversations(conversation.id).remove();",
        `await client.conversations.v2.configurations('${current.orchestratorConfigId}').remove();`,
        `await client.intelligence.v3.configurations('${current.intelligenceConfigId}').remove();`,
        `await client.intelligence.v3.operators('${current.operatorId}').remove();`,
        `await client.memory.v1.stores('${current.storeId}').remove();`,
      ],
    }, async () => {
      requireClient(client);

      // 1. Put the phone number back first, so traffic stops reaching this app.
      const restored = [];
      if (restorable(original)) {
        try {
          await client.incomingPhoneNumbers(original.sid).update(restoreParams(original));
          restored.push({ label: `Webhooks of ${original.phoneNumber}`, id: original.sid, ok: true, note: `SMS → ${shown(original.smsUrl, original.smsMethod)}, Voice → ${shown(original.voiceUrl, original.voiceMethod)}` });
          backup.remove('phoneNumber');
        } catch (err) {
          if (err.status === 404) {
            restored.push({ label: `Webhooks of ${original.phoneNumber}`, id: original.sid, ok: true, note: 'number no longer on this account' });
            backup.remove('phoneNumber');
          } else {
            restored.push({ label: `Webhooks of ${original.phoneNumber}`, id: original.sid, ok: false, error: err.message });
          }
        }
      } else if (original) {
        // The saved "original" was already a tester URL: nothing useful to restore.
        backup.remove('phoneNumber');
      }

      // 2. Delete what the tester created.
      const deleted = [];
      const kept = {};
      // A delete can report an error (say, its operation timed out) and still finish on Twilio.
      // Fetch the resource: only a 404 proves it is gone.
      const isGone = async (fetch) => {
        try {
          await fetch();
          return false;
        } catch (err) {
          return err.status === 404;
        }
      };
      // keys: the state.json values that belong to this resource, kept if it could not be deleted.
      // resource: an SDK context such as client.memory.v1.stores(id), which has remove() and fetch().
      const attempt = async (label, id, resource, keys = []) => {
        if (!id) return;
        try {
          const result = await resource.remove();
          if (result?.statusUrl) await waitForOperation(client, result.statusUrl, { sleep });
          deleted.push({ label, id, ok: true });
        } catch (err) {
          if (err.status === 404) deleted.push({ label, id, ok: true, note: 'already deleted' });
          else if (await isGone(() => resource.fetch())) deleted.push({ label, id, ok: true, note: `reported "${err.message}", but it no longer exists on Twilio` });
          else {
            deleted.push({ label, id, ok: false, error: err.message });
            for (const key of keys) kept[key] = current[key];
          }
        }
      };
      let conversations = [];
      try {
        conversations = await ourConversations(current.orchestratorConfigId);
      } catch (err) {
        deleted.push({ label: 'Conversations', id: current.orchestratorConfigId, ok: false, error: `Could not list conversations: ${err.message}` });
      }
      for (const conversation of conversations) {
        await attempt('Conversation', conversation.id, client.conversations.v2.conversations(conversation.id));
      }
      // `current.x &&` skips resources that were never created.
      await attempt('Conversation configuration', current.orchestratorConfigId, current.orchestratorConfigId && client.conversations.v2.configurations(current.orchestratorConfigId), ['orchestratorConfigId']);
      await attempt('Intelligence configuration', current.intelligenceConfigId, current.intelligenceConfigId && client.intelligence.v3.configurations(current.intelligenceConfigId), ['intelligenceConfigId', 'intelligenceRuleIds']);
      await attempt('Custom operator', current.operatorId, current.operatorId && client.intelligence.v3.operators(current.operatorId), ['operatorId']);
      await attempt('Memory store', current.storeId, current.storeId && client.memory.v1.stores(current.storeId), ['storeId', 'profileId']);
      state.reset();
      // Keep IDs of anything still on Twilio, so this step can be run again.
      if (Object.keys(kept).length) state.set(kept);
      events.clear();

      // 3. What's left for you to do by hand.
      let numberPointsHere = false;
      if (!restorable(original)) {
        const number = await findNumber().catch(() => null);
        numberPointsHere = isTesterWebhook(number?.smsUrl) || isTesterWebhook(number?.voiceUrl);
      }
      return { restored, deleted, manual: manualSteps({ config, original, numberPointsHere }) };
    });
  }));

  return router;
}

module.exports = { resetRoutes };
