// Records every HTTP call the Twilio SDK makes during a step, so the UI can show the exact
// request/response (including each async-operation poll). AsyncLocalStorage keeps
// concurrent steps from mixing their calls.
const { AsyncLocalStorage } = require('node:async_hooks');
const twilio = require('twilio');

const storage = new AsyncLocalStorage();
const KEPT_HEADERS = ['retry-after', 'location', 'twilio-request-id', 'content-type'];

async function captureExchanges(fn) {
  const exchanges = [];
  try {
    const value = await storage.run(exchanges, fn);
    return { exchanges, value };
  } catch (error) {
    return { exchanges, error };
  }
}

function recordExchange(exchange) {
  const store = storage.getStore();
  if (store) store.push(exchange);
}

function buildUrl(uri, params) {
  if (!params || Object.keys(params).length === 0) return uri;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    for (const item of [].concat(value)) query.append(key, item instanceof Date ? item.toISOString() : String(item));
  }
  const qs = query.toString();
  return qs ? `${uri}?${qs}` : uri;
}

function pickHeaders(headers = {}) {
  const kept = {};
  for (const name of KEPT_HEADERS) {
    const value = headers[name];
    if (value !== undefined && value !== null) kept[name] = String(value);
  }
  return kept;
}

function parseBody(body) {
  if (typeof body !== 'string') return body ?? null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

class CapturingRequestClient extends twilio.RequestClient {
  async request(opts) {
    const startedAt = Date.now();
    const request = {
      method: String(opts.method).toUpperCase(),
      url: buildUrl(opts.uri, opts.params),
      body: opts.data ?? null,
      contentType: opts.headers?.['Content-Type'] ?? null,
    };
    try {
      const res = await super.request(opts);
      recordExchange({
        request,
        response: { status: res.statusCode, headers: pickHeaders(res.headers), body: parseBody(res.body) },
        durationMs: Date.now() - startedAt,
      });
      return res;
    } catch (err) {
      recordExchange({ request, response: null, networkError: err.message, durationMs: Date.now() - startedAt });
      throw err;
    }
  }
}

module.exports = { captureExchanges, recordExchange, CapturingRequestClient };
