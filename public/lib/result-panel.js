// Shows a step's result envelope in three tabs: Rendered (friendly view), JSON (every HTTP
// call, including async polls), and Code (copy-paste Node.js + curl).
import { h, json } from './dom.js';

const NODE_PREAMBLE = `// npm install twilio dotenv
require('dotenv').config();
const client = require('twilio')(
  process.env.TWILIO_API_KEY,
  process.env.TWILIO_API_SECRET,
  { accountSid: process.env.TWILIO_ACCOUNT_SID }
);

`;

const statusTone = (status) => (status < 300 ? 'success' : status < 400 ? 'info' : 'danger');

function safeRender(render, data) {
  try {
    return render ? render(data) : json(data);
  } catch (err) {
    return h('div', {}, h('p', { class: 'muted' }, `Could not render this result (${err.message}). Raw data:`), json(data));
  }
}

function errorView(envelope) {
  const error = envelope.error || {};
  return h('div', { class: 'error-view' },
    h('p', {}, h('strong', {}, error.message || 'Unknown error')),
    error.status && h('p', {}, `HTTP ${error.status}${error.code ? ` · Twilio error ${error.code}` : ''}`),
    error.moreInfo && h('p', {}, h('a', { href: error.moreInfo, target: '_blank', rel: 'noopener' }, 'Twilio error reference ↗')),
    error.details && json(error.details));
}

function exchangesView(envelope) {
  if (!envelope.exchanges?.length) {
    return h('div', {}, h('p', { class: 'muted' }, 'No HTTP calls were made to Twilio.'), envelope.error && json(envelope.error));
  }
  return h('div', { class: 'exchanges' }, envelope.exchanges.map((x, i) => {
    const isPoll = x.request.method === 'GET' && /\/(Operations|Actions)\//.test(x.request.url);
    return h('details', { class: 'exchange', open: i === 0 },
      h('summary', {},
        h('code', {}, `${x.request.method} ${x.request.url}`), ' ',
        x.response ? h('span', { class: `badge badge-${statusTone(x.response.status)}` }, String(x.response.status)) : h('span', { class: 'badge badge-danger' }, 'network error'),
        isPoll && h('span', { class: 'badge badge-neutral' }, 'poll'),
        h('span', { class: 'muted' }, ` ${x.durationMs} ms`)),
      x.request.body != null && [h('h5', {}, 'Request body'), json(x.request.body)],
      h('h5', {}, 'Response'),
      json(x.response ? { status: x.response.status, headers: x.response.headers, body: x.response.body } : x.networkError));
  }));
}

function copyable(text) {
  const button = h('button', { type: 'button', class: 'copy' }, 'Copy');
  button.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(text);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1500);
  });
  return h('div', { class: 'copyable' }, button, h('pre', { class: 'code' }, text));
}

function codeView(snippet = {}) {
  return h('div', {},
    h('h5', {}, 'Node.js (twilio SDK)'), copyable(NODE_PREAMBLE + (snippet.node || '')),
    h('h5', {}, 'curl'), copyable(snippet.curl || '# No HTTP calls were made'));
}

export function resultPanel(envelope, render) {
  const tabs = [
    ['Rendered', () => (envelope.ok ? safeRender(render, envelope.data) : errorView(envelope))],
    ['JSON', () => exchangesView(envelope)],
    ['Code', () => codeView(envelope.snippet)],
  ];
  const body = h('div', { class: 'tab-body' });
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  const select = (index) => {
    [...bar.children].forEach((button, i) => button.setAttribute('aria-selected', String(i === index)));
    body.replaceChildren(tabs[index][1]());
  };
  tabs.forEach(([label], i) => bar.append(h('button', { type: 'button', role: 'tab', onClick: () => select(i) }, label)));
  const calls = envelope.exchanges?.length ?? 0;
  const header = h('div', { class: `result-header ${envelope.ok ? 'ok' : 'fail'}` },
    h('strong', {}, envelope.ok ? '✓ Success' : '✕ Failed'),
    h('span', { class: 'muted' }, ` · ${calls} HTTP call${calls === 1 ? '' : 's'} · ${envelope.durationMs ?? 0} ms`));
  const panel = h('section', { class: 'result' }, header, envelope.hint && h('div', { class: 'hint' }, '💡 ', envelope.hint), bar, body);
  select(0);
  return panel;
}
