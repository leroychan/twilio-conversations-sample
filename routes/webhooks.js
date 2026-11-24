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
        const needsConversation = !current.conversationId || current.conversationClosed;
        if (body.eventType === 'CONVERSATION_CREATED' && body.data?.id && needsConversation && isOurs) {
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
