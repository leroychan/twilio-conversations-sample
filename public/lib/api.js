// Calls this app's own /api routes. Always resolves to a result envelope, even on network errors.
async function request(method, path, body) {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return data ?? { ok: false, error: { message: `Server answered ${res.status} without JSON` }, hint: 'Check the terminal running npm start.' };
  } catch (err) {
    return { ok: false, error: { message: err.message }, hint: 'Could not reach the local server. Is `npm start` still running?' };
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
};
