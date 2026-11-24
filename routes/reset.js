// Deletes everything the tester created, newest dependency first, then clears state.json
// (except the IDs of resources that failed to delete).
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
      const kept = {};
      // keys: the state.json values that belong to this resource, kept if it could not be deleted.
      const attempt = async (label, id, remove, keys) => {
        if (!id) return;
        try {
          const result = await remove();
          if (result?.statusUrl) await waitForOperation(client, result.statusUrl, { sleep });
          deleted.push({ label, id, ok: true });
        } catch (err) {
          if (err.status === 404) deleted.push({ label, id, ok: true, note: 'already deleted' });
          else {
            deleted.push({ label, id, ok: false, error: err.message });
            for (const key of keys) kept[key] = current[key];
          }
        }
      };
      await attempt('Conversation configuration', current.orchestratorConfigId, () => client.conversations.v2.configurations(current.orchestratorConfigId).remove(), ['orchestratorConfigId']);
      await attempt('Intelligence configuration', current.intelligenceConfigId, () => client.intelligence.v3.configurations(current.intelligenceConfigId).remove(), ['intelligenceConfigId', 'intelligenceRuleIds']);
      await attempt('Custom operator', current.operatorId, () => client.intelligence.v3.operators(current.operatorId).remove(), ['operatorId']);
      await attempt('Memory store', current.storeId, () => client.memory.v1.stores(current.storeId).remove(), ['storeId', 'profileId']);
      state.reset();
      // Keep IDs of anything still on Twilio, so Reset can be run again (or the step reused).
      if (Object.keys(kept).length) state.set(kept);
      events.clear();
      return { deleted };
    });
  }));

  return router;
}

module.exports = { resetRoutes };
