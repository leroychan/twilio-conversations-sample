// "Conversation Intelligence" panel for Steps 6 and 7: operator results drawn as readable cards
// instead of raw JSON. Results come from GET /api/intelligence/results, then live from the
// Intelligence webhook (SSE events with source "intelligence").
import { h, badge, empty } from './dom.js';

// Twilio's Sentiment operator answers with one of these labels.
const TONES = { positive: 'success', negative: 'danger', mixed: 'warning', neutral: 'neutral' };

const humanize = (key) => key
  .replace(/[_-]+/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .toLowerCase()
  .replace(/^./, (c) => c.toUpperCase());

const onlyKey = (object, key) => typeof object[key] === 'string' && Object.keys(object).length === 1;

function describeField(key, value) {
  const label = humanize(key);
  if (typeof value === 'boolean') return { label, kind: 'boolean', value };
  if (typeof value === 'number' && value >= 0 && value <= 1 && /confidence|score|probability/i.test(key)) {
    return { label, kind: 'percent', value: Math.round(value * 100) };
  }
  if (value == null || value === '') return { label, kind: 'text', value: '—' };
  if (typeof value === 'string') return { label, kind: /evidence|quote/i.test(key) ? 'quote' : 'text', value };
  if (typeof value === 'object') return { label, kind: 'json', value: JSON.stringify(value) };
  return { label, kind: 'text', value: String(value) };
}

// Turns one operator result into a plain description the panel can draw.
// Summary returns { text }, Sentiment returns { label }, JSON operators return their own fields.
export function describeResult(r, { names = {}, customOperatorId } = {}) {
  const operatorId = r.operator?.id;
  const base = {
    id: r.id,
    name: names[operatorId] || (operatorId && operatorId === customOperatorId ? 'Your custom operator' : operatorId || 'Unknown operator'),
    trigger: r.executionDetails?.trigger?.on || r.executionDetails?.trigger?.type,
    at: r.dateCreated || r.executionDetails?.trigger?.timestamp,
  };
  const value = r.result;
  if (value == null) return { ...base, kind: 'empty' };
  if (typeof value !== 'object') return { ...base, kind: 'text', text: String(value) };
  if (onlyKey(value, 'label')) return { ...base, kind: 'label', label: value.label, tone: TONES[value.label.toLowerCase()] || 'info' };
  if (onlyKey(value, 'text')) return { ...base, kind: 'text', text: value.text };
  return { ...base, kind: 'fields', fields: Object.entries(value).map(([key, v]) => describeField(key, v)) };
}

// The same result can arrive from the API and from the webhook: keep one of each, oldest first.
export function mergeResults(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const r of incoming || []) if (r?.id) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => String(a.dateCreated || '').localeCompare(String(b.dateCreated || '')));
}

// One group per operator, in order of first appearance; newest result first inside each group.
export function groupByOperator(described) {
  const groups = new Map();
  for (const d of described) {
    if (!groups.has(d.name)) groups.set(d.name, { name: d.name, items: [] });
    groups.get(d.name).items.unshift(d);
  }
  return [...groups.values()];
}

function drawField(f) {
  let value;
  if (f.kind === 'boolean') value = badge(f.value ? '✓ Yes' : '✕ No', f.value ? 'success' : 'neutral');
  else if (f.kind === 'percent') {
    value = h('span', { class: 'meter-row' },
      h('span', { class: 'meter' }, h('span', { class: 'meter-fill', style: `width: ${f.value}%` })),
      `${f.value}%`);
  } else if (f.kind === 'quote') value = h('q', { class: 'quote' }, f.value);
  else if (f.kind === 'json') value = h('code', {}, f.value);
  else value = f.value;
  return [h('dt', {}, f.label), h('dd', {}, value)];
}

function drawBody(d) {
  if (d.kind === 'label') return badge(d.label, d.tone);
  if (d.kind === 'text') return h('p', { class: 'insight-text' }, d.text);
  if (d.kind === 'fields') return h('dl', { class: 'kv' }, d.fields.flatMap(drawField));
  return empty('No result body.');
}

const when = (at) => (at ? new Date(at).toLocaleTimeString() : '');

function drawGroup(group) {
  const [latest, ...earlier] = group.items;
  return h('section', { class: 'insight' },
    h('div', { class: 'insight-head' },
      h('strong', {}, group.name),
      h('span', { class: 'muted small' }, [latest.trigger === 'CONVERSATION_END' ? 'at conversation end' : 'latest message', when(latest.at)].filter(Boolean).join(' · '))),
    drawBody(latest),
    earlier.length > 0 && h('div', { class: 'insight-history muted small' },
      `Earlier (${earlier.length}): `,
      earlier.slice(0, 10).map((d) => (d.kind === 'label' ? badge(d.label, d.tone) : badge(when(d.at) || 'earlier', 'neutral')))));
}

export function drawInsights(results, opts) {
  if (!results.length) {
    return empty('No operator results yet. Sentiment and your custom operator run on each new message; the Summary runs when the conversation closes.');
  }
  return h('div', { class: 'insights' }, groupByOperator(results.map((r) => describeResult(r, opts))).map(drawGroup));
}

// The live panel. Returns { el, refresh, stop }; call stop() when the step unmounts.
export function insightsPanel(ctx) {
  let results = [];
  let loadedFor = null;
  let timer = null;
  const body = h('div', {});
  const note = h('p', { class: 'muted small' });
  const refreshButton = h('button', { type: 'button', class: 'small-button' }, 'Refresh');
  const opts = () => ({ names: ctx.defaults?.operatorNames || {}, customOperatorId: ctx.state().operatorId });
  const draw = () => body.replaceChildren(drawInsights(results, opts()));

  async function refresh() {
    const conversationId = ctx.state().conversationId;
    if (conversationId !== loadedFor) results = [];
    loadedFor = conversationId;
    if (!conversationId) {
      note.textContent = '';
      body.replaceChildren(empty('Operator results appear here once a conversation exists.'));
      return;
    }
    refreshButton.disabled = true;
    const envelope = await ctx.api.get('/api/intelligence/results');
    refreshButton.disabled = false;
    if (conversationId !== ctx.state().conversationId) return;
    if (!envelope.ok) {
      note.textContent = `Could not load results: ${envelope.error?.message || 'unknown error'}`;
    } else {
      results = mergeResults(results, [...(envelope.data.results || []), ...(envelope.data.webhooks || []).flatMap((w) => w.operatorResults || [])]);
      note.textContent = `Conversation ${conversationId}. Updates live from the Intelligence webhook. Raw JSON is in Step 9.`;
    }
    draw();
  }
  refreshButton.addEventListener('click', refresh);

  const unsubscribe = ctx.onEvent((event) => {
    if (event.source === 'intelligence') {
      if (event.payload?.conversationId !== ctx.state().conversationId) return;
      results = mergeResults(results, event.payload.operatorResults);
      draw();
    } else if (event.source === 'orchestrator') {
      // A new conversation may have started; the app refreshes its state shortly after this event.
      clearTimeout(timer);
      timer = setTimeout(() => { if (ctx.state().conversationId !== loadedFor) refresh(); }, 1500);
    }
  });

  const el = h('section', { class: 'card insights-card' },
    h('div', { class: 'insight-head' }, h('h4', {}, '🧠 Conversation Intelligence'), refreshButton),
    body, note);
  refresh();
  return {
    el,
    refresh,
    stop: () => {
      clearTimeout(timer);
      unsubscribe();
    },
  };
}
