// Conversation Memory: a Store holds Profiles; each Profile collects Traits (facts),
// Observations and Summaries (learned from conversations), and can be searched with Recall.
const express = require('express');
const { record, respond } = require('../lib/recorder');
const { requireClient, requireState, requireValue } = require('../lib/errors');
const { waitForOperation } = require('../lib/operations');
const { call } = require('../lib/snippets');
const { E164 } = require('../lib/config');

function memoryRoutes({ client, config, state, sleep }) {
  const router = express.Router();

  // Step 1: create a Memory Store (async: 202 + Operation to poll).
  router.post('/stores', respond((req) => {
    const params = {
      displayName: req.body.displayName || 'ConversationsTester',
      description: req.body.description || 'Memory store created by the Conversations Tester sample',
    };
    return record({
      step: 'memory.createStore',
      state,
      code: [
        `const store = await ${call('client.memory.v1.stores.create', params)};`,
        '// Twilio answers 202 Accepted. Poll the Operation in store.statusUrl until it is COMPLETED:',
        "const operationId = store.statusUrl.split('/').pop();",
        'const operation = await client.memory.v1.operations(operationId).fetch(); // repeat while PENDING/RUNNING',
        'const storeId = operation.result.id;',
      ],
    }, async () => {
      requireClient(client);
      const created = await client.memory.v1.stores.create(params);
      const operation = created.statusUrl ? await waitForOperation(client, created.statusUrl, { sleep }) : null;
      const storeId = operation?.result?.id || created.id;
      requireValue(storeId, 'The store was accepted, but Twilio did not return its ID. Check the JSON tab.');
      state.set({ storeId, profileId: null });
      const store = await client.memory.v1.stores(storeId).fetch();
      return { store, operation };
    });
  }));

  // Step 2: create a Profile for the learner, so their messages and calls link to it.
  router.post('/profiles', respond((req) => {
    const current = state.get();
    const phone = req.body.phone || config.myPhoneNumber;
    const whatsapp = req.body.whatsapp ?? (config.channels.whatsapp ? phone : '');
    const contact = {
      firstName: req.body.firstName || 'Alex',
      ...(req.body.lastName && { lastName: req.body.lastName }),
      phone,
      ...(whatsapp && { whatsapp }),
    };
    const params = { traits: { Contact: contact } };
    return record({
      step: 'memory.createProfile',
      state,
      code: [
        `const profile = await ${call(`client.memory.v1.profiles('${current.storeId}').create`, params)};`,
        '// Check that identity resolution can find the profile by phone number:',
        `const lookup = await ${call(`client.memory.v1.lookup('${current.storeId}').create`, { idType: 'phone', value: phone })};`,
      ],
    }, async () => {
      requireClient(client);
      requireState(current, ['storeId']);
      requireValue(E164.test(phone), `Phone "${phone}" must be in E.164 format, e.g. +15551234567.`);
      if (whatsapp) requireValue(E164.test(whatsapp), `WhatsApp number "${whatsapp}" must be in E.164 format.`);
      const profile = await client.memory.v1.profiles(current.storeId).create(params);
      state.set({ profileId: profile.id });
      const lookup = await client.memory.v1.lookup(current.storeId).create({ idType: 'phone', value: phone });
      return { profile, lookup, traits: contact };
    });
  }));

  // Step 8: what Memory learned after the conversation went inactive or closed.
  router.get('/results', respond(() => {
    const current = state.get();
    const summaryFilter = { ...(current.conversationId && { conversationId: current.conversationId }), limit: 10 };
    const profilePath = `'${current.storeId}', '${current.profileId}'`;
    // A raw request, because the SDK's list() crashes when a profile has no observations yet:
    // Twilio then answers "observations": null instead of [].
    const observationsRequest = {
      method: 'get',
      uri: `https://memory.twilio.com/v1/Stores/${current.storeId}/Profiles/${current.profileId}/Observations`,
      params: { pageSize: 20 },
    };
    return record({
      step: 'memory.results',
      state,
      code: [
        `const profile = await client.memory.v1.profiles(${profilePath}).fetch();`,
        `const response = await ${call('client.request', observationsRequest)};`,
        '// Empty lists come back as null, not [].',
        'const observations = response.body.observations || [];',
        `const summaries = await ${call(`client.memory.v1.conversationSummaries(${profilePath}).list`, summaryFilter)};`,
      ],
    }, async () => {
      requireClient(client);
      requireState(current, ['storeId', 'profileId']);
      const listObservations = async () => {
        const response = await client.request(observationsRequest);
        if (response.statusCode < 200 || response.statusCode >= 300) client.memory.v1.throwException(response);
        const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
        return body?.[body?.meta?.key || 'observations'] || [];
      };
      const [profile, observations, summaries] = await Promise.all([
        client.memory.v1.profiles(current.storeId, current.profileId).fetch(),
        listObservations(),
        client.memory.v1.conversationSummaries(current.storeId, current.profileId).list(summaryFilter),
      ]);
      return { profile, observations, summaries };
    });
  }));

  // Step 8: Recall, the semantic + keyword search an AI agent would run on each turn.
  router.post('/recall', respond((req) => {
    const current = state.get();
    const query = req.body.query || 'What does this customer care about?';
    const params = { query, observationsLimit: 10, summariesLimit: 5, communicationsLimit: 5 };
    return record({
      step: 'memory.recall',
      state,
      code: [`const recall = await ${call(`client.memory.v1.recall('${current.storeId}', '${current.profileId}').create`, params)};`],
    }, async () => {
      requireClient(client);
      requireState(current, ['storeId', 'profileId']);
      const recall = await client.memory.v1.recall(current.storeId, current.profileId).create(params);
      return { recall, query };
    });
  }));

  return router;
}

module.exports = { memoryRoutes };
