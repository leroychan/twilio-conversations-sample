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
