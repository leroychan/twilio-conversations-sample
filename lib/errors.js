// Friendly errors for beginners: missing prerequisites, and hints for common Twilio failures.
class PrereqError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrereqError';
    this.code = 'PREREQUISITE';
  }
}

const STATE_LABELS = {
  storeId: 'Step 1 (create a Memory Store)',
  profileId: 'Step 2 (create your Profile)',
  intelligenceConfigId: 'Step 4 (create an Intelligence Configuration)',
  orchestratorConfigId: 'Step 5 (create a Conversation Configuration)',
  conversationId: 'Step 6 (start a conversation)',
};

function requireState(state, keys) {
  const missing = keys.filter((key) => !state[key]);
  if (missing.length) throw new PrereqError(`Complete ${missing.map((key) => STATE_LABELS[key] || key).join(' and ')} first.`);
}

function requireValue(value, message) {
  if (!value) throw new PrereqError(message);
  return value;
}

function requireClient(client) {
  return requireValue(client, 'Twilio credentials are missing. Fill in TWILIO_ACCOUNT_SID, TWILIO_API_KEY and TWILIO_API_SECRET in .env, then restart the server.');
}

function toErrorInfo(err) {
  return {
    name: err.name,
    status: err.status ?? null,
    code: err.code ?? null,
    message: err.message,
    moreInfo: err.moreInfo ?? null,
    details: err.details ?? null,
  };
}

function hintFor(error) {
  const message = String(error.message || '');
  if (error.code === 'PREREQUISITE') return error.message;
  if (error.code === 'OPERATION_TIMEOUT') return 'Twilio is still processing this request. Wait a minute, then refresh or run the step again.';
  if (error.code === 'OPERATION_FAILED') return 'Twilio accepted the request, but the async operation failed. The error details explain why.';
  if (error.status === 401 || error.code === 20003) return 'Authentication failed. Check TWILIO_ACCOUNT_SID, TWILIO_API_KEY and TWILIO_API_SECRET in .env (the API key must belong to this account).';
  if (/limit|maximum|quota/i.test(message)) return 'You hit an account limit (10 conversation configurations, 15 memory stores). Use Reset, or delete old resources in the Twilio Console.';
  if (/capture rule|overlap|conflict/i.test(message)) return 'Another conversation configuration already captures this number. Delete it in the Twilio Console or remove its capture rules.';
  if (error.status === 403) return 'Access denied. These APIs need an account on the new Twilio Console (1console.twilio.com) with the product enabled and the AI/ML Features Addendum accepted.';
  if (error.status === 404) return 'Not found. The ID saved in state.json may have been deleted (use Reset), or the product is not enabled on this account (new Console only).';
  if (error.status === 400 || error.status === 422) return 'Twilio rejected the request body. Compare the JSON tab with the API reference linked in this step.';
  return null;
}

module.exports = { PrereqError, requireState, requireValue, requireClient, toErrorInfo, hintFor };
