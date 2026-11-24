// Builds the JSON request bodies each step sends to Twilio. These are pure functions, so the
// interesting part of every API call is easy to read (and test) in one place.
const CHANNELS = ['SMS', 'WHATSAPP', 'VOICE'];

// Twilio-authored language operators (IDs from the Conversation Intelligence docs).
const TWILIO_OPERATORS = {
  SUMMARY: 'intelligence_operator_01kcv35pnkeysaf6z6cqtbpegn',
  SENTIMENT: 'intelligence_operator_01kcrvw16kfa88qvgrfmr7y151',
};

const UPSELL_OPERATOR = {
  displayName: 'Upsell intent detector',
  description: 'Flags when a customer shows interest in upgrading or buying more.',
  prompt: 'Read the conversation and decide whether the customer shows interest in upgrading, buying more, or a premium option. Quote the customer sentence that shows it, if any.',
  outputSchema: {
    type: 'object',
    properties: {
      upsellIntent: { type: 'boolean', description: 'True if the customer shows upsell interest' },
      evidence: { type: 'string', description: 'The customer sentence that shows the intent, or an empty string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['upsellIntent', 'evidence', 'confidence'],
  },
};

const DESCRIPTION = 'Created by the Twilio Conversations Tester sample';

function buildCustomOperator({ displayName, description, prompt }) {
  return { displayName, description, author: 'SELF', prompt, outputFormat: 'JSON', outputSchema: UPSELL_OPERATOR.outputSchema };
}

function buildIntelligenceConfiguration({ displayName, publicUrl, customOperatorId }) {
  const actions = [{ type: 'WEBHOOK', method: 'POST', url: `${publicUrl}/webhooks/intelligence` }];
  const context = { memory: { enabled: true } };
  const perMessage = [{ id: TWILIO_OPERATORS.SENTIMENT }];
  if (customOperatorId) perMessage.push({ id: customOperatorId });
  return {
    displayName,
    description: DESCRIPTION,
    rules: [
      { operators: perMessage, triggers: [{ on: 'COMMUNICATION' }], actions, context },
      { operators: [{ id: TWILIO_OPERATORS.SUMMARY }], triggers: [{ on: 'CONVERSATION_END' }], actions, context },
    ],
  };
}

// One rule for traffic to your number, one for traffic from it, so both sides are captured.
function captureRules(address, metadata) {
  const rule = (from, to) => (metadata ? { from, to, metadata } : { from, to });
  return [rule('*', address), rule(address, '*')];
}

function buildChannelSettings(config, { inactiveMinutes = 5, closedMinutes = 30 } = {}) {
  const statusTimeouts = { inactive: inactiveMinutes, closed: closedMinutes };
  const settings = {};
  if (config.channels.sms) settings.SMS = { captureRules: captureRules(config.phoneNumber), statusTimeouts };
  if (config.channels.whatsapp) settings.WHATSAPP = { captureRules: captureRules(config.whatsappNumber), statusTimeouts };
  // Voice timeouts behave differently (calls end on hang-up), so we keep Twilio's defaults.
  if (config.channels.voice) settings.VOICE = { captureRules: captureRules(config.phoneNumber, { callType: 'PSTN' }) };
  return settings;
}

function buildOrchestratorConfiguration({ config, state, displayName, inactiveMinutes, closedMinutes }) {
  return {
    displayName,
    description: DESCRIPTION,
    conversationGroupingType: 'GROUP_BY_PROFILE',
    memoryStoreId: state.storeId,
    intelligenceConfigurationIds: state.intelligenceConfigId ? [state.intelligenceConfigId] : [],
    memoryExtractionEnabled: true,
    statusCallbacks: [{ url: `${config.publicUrl}/webhooks/orchestrator`, method: 'POST' }],
    channelSettings: buildChannelSettings(config, { inactiveMinutes, closedMinutes }),
  };
}

const channelAddress = (config, channel) => (channel === 'WHATSAPP' ? config.whatsappNumber : config.phoneNumber);

function buildSendMessageAction({ config, channel, text }) {
  return {
    type: 'SEND_MESSAGE',
    payload: {
      from: { address: channelAddress(config, channel), channel },
      to: [{ address: config.myPhoneNumber, channel }],
      content: { text },
    },
  };
}

function buildSimulatedConversation({ config, state, channel }) {
  return {
    configurationId: state.orchestratorConfigId,
    name: 'Simulated conversation (Conversations Tester)',
    participants: [
      { name: 'You (customer)', type: 'CUSTOMER', ...(state.profileId && { profileId: state.profileId }), addresses: [{ channel, address: config.myPhoneNumber }] },
      { name: 'Tester agent', type: 'AI_AGENT', addresses: [{ channel, address: channelAddress(config, channel) }] },
    ],
  };
}

function buildSimulatedCommunication({ config, channel, author, text }) {
  const customer = config.myPhoneNumber;
  const agent = channelAddress(config, channel);
  const [from, to] = author === 'AGENT' ? [agent, customer] : [customer, agent];
  return {
    author: { address: from, channel },
    content: { type: channel === 'VOICE' ? 'TRANSCRIPTION' : 'TEXT', text },
    recipients: [{ address: to, channel }],
  };
}

function uiDefaults() {
  return {
    operator: UPSELL_OPERATOR,
    operatorNames: {
      [TWILIO_OPERATORS.SUMMARY]: 'Summary (Twilio)',
      [TWILIO_OPERATORS.SENTIMENT]: 'Sentiment (Twilio)',
    },
  };
}

module.exports = {
  CHANNELS,
  TWILIO_OPERATORS,
  UPSELL_OPERATOR,
  buildCustomOperator,
  buildIntelligenceConfiguration,
  buildChannelSettings,
  buildOrchestratorConfiguration,
  channelAddress,
  buildSendMessageAction,
  buildSimulatedConversation,
  buildSimulatedCommunication,
  uiDefaults,
};
