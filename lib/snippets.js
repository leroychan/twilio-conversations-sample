// Turns captured requests into copy-pasteable curl commands and SDK calls.
const shellQuote = (text) => text.replace(/'/g, `'\\''`);

function toCurl({ method, url, body, contentType }) {
  const lines = [`curl -X ${method} '${shellQuote(url)}'`, `  -u "$TWILIO_API_KEY:$TWILIO_API_SECRET"`];
  if (body != null && method !== 'GET') {
    if (contentType === 'application/x-www-form-urlencoded') {
      for (const [key, value] of Object.entries(body)) lines.push(`  --data-urlencode '${shellQuote(`${key}=${value}`)}'`);
    } else {
      lines.push(`  -H 'Content-Type: application/json'`);
      lines.push(`  -d '${shellQuote(JSON.stringify(body, null, 2))}'`);
    }
  }
  return lines.join(' \\\n');
}

function curlForExchanges(exchanges = []) {
  const seen = new Set();
  const commands = [];
  for (const { request } of exchanges) {
    if (!request) continue;
    const key = `${request.method} ${request.url} ${JSON.stringify(request.body ?? null)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    commands.push(toCurl(request));
  }
  return commands.join('\n\n');
}

function call(path, ...args) {
  return `${path}(${args.map((arg) => JSON.stringify(arg, null, 2)).join(', ')})`;
}

module.exports = { toCurl, curlForExchanges, call };
