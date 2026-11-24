const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { startApp } = require('./_support/harness');
const { TWILIO_OPERATORS } = require('../lib/builders');

function fakeIntelligence() {
  const fns = {
    operatorsList: mock.fn(async () => [{ id: TWILIO_OPERATORS.SUMMARY, displayName: 'Summary', author: 'TWILIO', outputFormat: 'TEXT', version: 1, prompt: 'hidden' }]),
    operatorsCreate: mock.fn(async (p) => ({ id: 'intelligence_operator_custom', ...p })),
    configurationsCreate: mock.fn(async (p) => ({ id: 'intelligence_configuration_1', ...p, rules: p.rules.map((r, i) => ({ id: `rule_${i}`, ...r })) })),
    resultsList: mock.fn(async () => [{ id: 'r1', outputFormat: 'TEXT', result: 'Customer wants an upgrade', operator: { id: TWILIO_OPERATORS.SUMMARY } }]),
  };
  const client = {
    intelligence: {
      v3: {
        operators: { list: fns.operatorsList, create: fns.operatorsCreate },
        configurations: { create: fns.configurationsCreate },
        operatorResults: { list: fns.resultsList },
      },
    },
  };
  return { client, fns };
}

test('lists operators with a summary of each', async (t) => {
  const { client } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.get('/api/intelligence/operators');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(env.data.operators[0], { id: TWILIO_OPERATORS.SUMMARY, displayName: 'Summary', description: null, author: 'TWILIO', outputFormat: 'TEXT', version: 1 });
});

test('creates the default custom operator and saves operatorId', async (t) => {
  const { client, fns } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  const env = await app.post('/api/intelligence/operators', {});
  assert.equal(env.ok, true, JSON.stringify(env.error));
  const body = fns.operatorsCreate.mock.calls[0].arguments[0];
  assert.equal(body.displayName, 'Upsell intent detector');
  assert.equal(body.author, 'SELF');
  assert.equal(env.state.operatorId, 'intelligence_operator_custom');
});

test('creates an intelligence configuration that includes the custom operator', async (t) => {
  const { client, fns } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ operatorId: 'intelligence_operator_custom' });
  const env = await app.post('/api/intelligence/configurations', {});
  assert.equal(env.ok, true, JSON.stringify(env.error));
  const body = fns.configurationsCreate.mock.calls[0].arguments[0];
  assert.deepEqual(body.rules[0].operators.map((o) => o.id), [TWILIO_OPERATORS.SENTIMENT, 'intelligence_operator_custom']);
  assert.equal(body.rules[0].actions[0].url, 'https://tester.example.ngrok.app/webhooks/intelligence');
  assert.equal(env.state.intelligenceConfigId, 'intelligence_configuration_1');
  assert.deepEqual(env.state.intelligenceRuleIds, ['rule_0', 'rule_1']);
});

test('can leave the custom operator out', async (t) => {
  const { client, fns } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ operatorId: 'intelligence_operator_custom' });
  await app.post('/api/intelligence/configurations', { includeCustomOperator: false });
  assert.equal(fns.configurationsCreate.mock.calls[0].arguments[0].rules[0].operators.length, 1);
});

test('requires PUBLIC_URL for the webhook action', async (t) => {
  const { client } = fakeIntelligence();
  const app = await startApp({ client, env: { PUBLIC_URL: '' } });
  t.after(app.close);
  const env = await app.post('/api/intelligence/configurations', {});
  assert.equal(env.ok, false);
  assert.match(env.hint, /PUBLIC_URL/);
});

test('results combine the API list with webhooks for this conversation', async (t) => {
  const { client, fns } = fakeIntelligence();
  const app = await startApp({ client });
  t.after(app.close);
  app.state.set({ conversationId: 'conv_1' });
  app.events.publish('intelligence', 'OPERATOR_RESULTS', { conversationId: 'conv_1', operatorResults: [] });
  app.events.publish('intelligence', 'OPERATOR_RESULTS', { conversationId: 'conv_other', operatorResults: [] });
  const env = await app.get('/api/intelligence/results');
  assert.equal(env.ok, true, JSON.stringify(env.error));
  assert.deepEqual(fns.resultsList.mock.calls[0].arguments[0], { conversationId: 'conv_1', limit: 50 });
  assert.equal(env.data.results.length, 1);
  assert.equal(env.data.webhooks.length, 1);
});
