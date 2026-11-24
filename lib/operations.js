// Some Twilio calls (creating a Memory Store or a Conversation Configuration) are async:
// Twilio replies 202 Accepted with a statusUrl, and you poll that Operation until it is done.
class OperationError extends Error {
  constructor(code, message, operation) {
    super(message);
    this.name = 'OperationError';
    this.code = code;
    this.details = operation ?? null;
  }
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntil(fetchOnce, isDone, { timeoutMs = 60000, initialDelayMs = 1000, maxDelayMs = 5000, sleep = defaultSleep, now = Date.now } = {}) {
  const startedAt = now();
  let delay = initialDelayMs;
  for (;;) {
    const { value, retryAfterMs } = await fetchOnce();
    if (isDone(value)) return value;
    if (now() - startedAt >= timeoutMs) {
      throw new OperationError('OPERATION_TIMEOUT', `Still not finished after ${Math.round(timeoutMs / 1000)}s`, value);
    }
    await sleep(retryAfterMs ?? delay);
    delay = Math.min(Math.round(delay * 1.5), maxDelayMs);
  }
}

function operationContext(client, statusUrl) {
  const url = new URL(statusUrl);
  const operationId = url.pathname.split('/').filter(Boolean).pop();
  if (url.hostname.startsWith('memory.')) return client.memory.v1.operations(operationId);
  if (url.hostname.startsWith('conversations.')) return client.conversations.v2.operations(operationId);
  throw new OperationError('OPERATION_FAILED', `Don't know how to poll ${statusUrl}`);
}

function retryAfterMs(headers = {}) {
  const seconds = Number(headers['retry-after']);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 10) * 1000 : undefined;
}

async function waitForOperation(client, statusUrl, options = {}) {
  if (!statusUrl) throw new OperationError('OPERATION_FAILED', 'Twilio did not return a statusUrl to poll.');
  const operation = operationContext(client, statusUrl);
  const result = await pollUntil(
    async () => {
      const res = await operation.fetchWithHttpInfo();
      return { value: res.body, retryAfterMs: retryAfterMs(res.headers) };
    },
    (op) => TERMINAL.has(op?.status),
    options,
  );
  if (result.status !== 'COMPLETED') {
    const reason = result.error?.detail || result.error?.title || result.error?.message;
    throw new OperationError('OPERATION_FAILED', reason || `Operation ended with status ${result.status}`, result);
  }
  return result;
}

module.exports = { pollUntil, waitForOperation, OperationError };
