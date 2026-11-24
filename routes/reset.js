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
