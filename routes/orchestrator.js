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
