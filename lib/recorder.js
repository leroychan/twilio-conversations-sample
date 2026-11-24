// Wraps one tester step: runs it, captures every HTTP call, and returns the uniform
// envelope the UI renders (Rendered / JSON / Code tabs).
const { captureExchanges } = require('./capture');
const { curlForExchanges } = require('./snippets');
const { toErrorInfo, hintFor } = require('./errors');

// Log only safe fields. Network errors can carry the request config (including Basic-auth
// credentials), so the error object itself must never be passed to console.error.
function logUnexpected(step, error) {
  const code = error.code ? ` (code ${error.code})` : '';
  console.error(`[${step}] ${error.name}: ${error.message}${code}${error.stack ? `\n${error.stack}` : ''}`);
}

const EXPECTED_ERROR_CODES = new Set(['PREREQUISITE', 'OPERATION_TIMEOUT', 'OPERATION_FAILED']);

async function record({ step, code = [], state }, fn) {
  const startedAt = Date.now();
  const { exchanges, value, error } = await captureExchanges(fn);
  const errorInfo = error ? toErrorInfo(error) : null;
  if (error && !error.status && !EXPECTED_ERROR_CODES.has(error.code)) logUnexpected(step, error);

  return {
    ok: !error,
    step,
    durationMs: Date.now() - startedAt,
    request: exchanges[0]?.request ?? null,
    response: exchanges[0]?.response ?? null,
    exchanges,
    snippet: { node: code.join('\n'), curl: curlForExchanges(exchanges) },
    data: error ? null : value ?? null,
    state: state ? state.get() : null,
    error: errorInfo,
    hint: errorInfo ? hintFor(errorInfo) : null,
  };
}

const respond = (handler) => async (req, res, next) => {
  try {
    res.json(await handler(req));
  } catch (err) {
    next(err);
  }
};

module.exports = { record, respond };
