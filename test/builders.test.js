const test = require('node:test');
const assert = require('node:assert/strict');
const b = require('../lib/builders');
const { loadConfig } = require('../lib/config');
const { TEST_ENV } = require('./_support/harness');

const config = loadConfig(TEST_ENV);
const noWhatsapp = loadConfig({ ...TEST_ENV, TWILIO_WHATSAPP_NUMBER: '' });

test('channel settings have bidirectional capture rules per enabled channel', () => {
  const s = b.buildChannelSettings(config, { inactiveMinutes: 5, closedMinutes: 30 });
  assert.deepEqual(Object.keys(s).sort(), ['SMS', 'VOICE', 'WHATSAPP']);
  assert.deepEqual(s.SMS.captureRules, [{ from: '*', to: '+15550001111' }, { from: '+15550001111', to: '*' }]);
  assert.deepEqual(s.SMS.statusTimeouts, { inactive: 5, closed: 30 });
  assert.deepEqual(s.WHATSAPP.captureRules, [{ from: '*', to: '+15550002222' }, { from: '+15550002222', to: '*' }]);
  assert.deepEqual(s.VOICE.captureRules, [
    { from: '*', to: '+15550001111', metadata: { callType: 'PSTN' } },
    { from: '+15550001111', to: '*', metadata: { callType: 'PSTN' } },
  ]);
  assert.equal(s.VOICE.statusTimeouts, undefined);
  assert.equal(b.buildChannelSettings(noWhatsapp).WHATSAPP, undefined);
});

test('orchestrator configuration links memory, intelligence and webhooks', () => {
  const body = b.buildOrchestratorConfiguration({ config, state: { storeId: 'mem_store_1', intelligenceConfigId: 'intelligence_configuration_1' }, displayName: 'Tester', inactiveMinutes: 5, closedMinutes: 30 });
  assert.equal(body.conversationGroupingType, 'GROUP_BY_PROFILE');
  assert.equal(body.memoryStoreId, 'mem_store_1');
  assert.deepEqual(body.intelligenceConfigurationIds, ['intelligence_configuration_1']);
  assert.equal(body.memoryExtractionEnabled, true);
  assert.deepEqual(body.statusCallbacks, [{ url: 'https://tester.example.ngrok.app/webhooks/orchestrator', method: 'POST' }]);
  assert.ok(body.channelSettings.SMS);
  assert.equal(typeof body.description, 'string');
});

test('intelligence configuration has a per-message rule and an end-of-conversation rule', () => {
  const body = b.buildIntelligenceConfiguration({ displayName: 'Tester', publicUrl: 'https://p.test', customOperatorId: 'intelligence_operator_custom' });
  assert.equal(body.rules.length, 2);
  const [perMessage, atEnd] = body.rules;
  assert.deepEqual(perMessage.triggers, [{ on: 'COMMUNICATION' }]);
  assert.deepEqual(perMessage.operators.map((o) => o.id), [b.TWILIO_OPERATORS.SENTIMENT, 'intelligence_operator_custom']);
  assert.deepEqual(atEnd.triggers, [{ on: 'CONVERSATION_END' }]);
  assert.deepEqual(atEnd.operators, [{ id: b.TWILIO_OPERATORS.SUMMARY }]);
  for (const rule of body.rules) {
    assert.deepEqual(rule.actions, [{ type: 'WEBHOOK', method: 'POST', url: 'https://p.test/webhooks/intelligence' }]);
    assert.deepEqual(rule.context, { memory: { enabled: true } });
  }
  const withoutCustom = b.buildIntelligenceConfiguration({ displayName: 'T', publicUrl: 'https://p.test', customOperatorId: null });
  assert.equal(withoutCustom.rules[0].operators.length, 1);
});

test('custom operator is a SELF-authored JSON operator with a schema', () => {
  const op = b.buildCustomOperator({ displayName: 'Upsell', description: 'd', prompt: 'p' });
  assert.equal(op.author, 'SELF');
  assert.equal(op.outputFormat, 'JSON');
  assert.equal(op.outputSchema.type, 'object');
});

test('send-message action goes from the channel address to the learner', () => {
  assert.deepEqual(b.buildSendMessageAction({ config, channel: 'WHATSAPP', text: 'Hi' }), {
    type: 'SEND_MESSAGE',
    payload: { from: { address: '+15550002222', channel: 'WHATSAPP' }, to: [{ address: '+15559998888', channel: 'WHATSAPP' }], content: { text: 'Hi' } },
  });
  assert.equal(b.buildSendMessageAction({ config, channel: 'SMS', text: 'x' }).payload.from.address, '+15550001111');
});

test('simulated communications set author and recipient by role; voice is a transcription', () => {
  const customer = b.buildSimulatedCommunication({ config, channel: 'SMS', author: 'CUSTOMER', text: 'Hello' });
  assert.deepEqual(customer, { author: { address: '+15559998888', channel: 'SMS' }, content: { type: 'TEXT', text: 'Hello' }, recipients: [{ address: '+15550001111', channel: 'SMS' }] });
  const agent = b.buildSimulatedCommunication({ config, channel: 'VOICE', author: 'AGENT', text: 'Hi' });
  assert.equal(agent.author.address, '+15550001111');
  assert.equal(agent.content.type, 'TRANSCRIPTION');
});

test('simulated conversation has explicit CUSTOMER and AI_AGENT participants', () => {
  const body = b.buildSimulatedConversation({ config, state: { orchestratorConfigId: 'cfg', profileId: 'mem_profile_1' }, channel: 'SMS' });
  assert.equal(body.configurationId, 'cfg');
  assert.deepEqual(body.participants.map((p) => p.type), ['CUSTOMER', 'AI_AGENT']);
  assert.equal(body.participants[0].profileId, 'mem_profile_1');
  assert.deepEqual(body.participants[1].addresses, [{ channel: 'SMS', address: '+15550001111' }]);
});

test('uiDefaults exposes the starter operator and operator names', () => {
  const d = b.uiDefaults(config);
  assert.equal(d.operator.displayName, b.UPSELL_OPERATOR.displayName);
  assert.equal(d.operatorNames[b.TWILIO_OPERATORS.SUMMARY], 'Summary (Twilio)');
});
