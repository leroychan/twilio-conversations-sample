import { h, card, kv, empty } from '../lib/dom.js';

const hasResults = (envelope) => envelope.ok && (envelope.data.observations?.length || envelope.data.summaries?.length);

function render(data) {
  const traits = data.profile?.traits || {};
  return h('div', {},
    card('Profile traits', Object.keys(traits).length ? Object.entries(traits).map(([group, values]) => h('div', {}, h('h5', {}, group), kv(values))) : empty('No traits yet.')),
    card(`Observations (${data.observations?.length || 0})`, data.observations?.length
      ? h('ul', {}, data.observations.map((o) => h('li', {}, o.content, h('small', { class: 'muted' }, ` · ${o.source || ''} ${o.occurredAt ? new Date(o.occurredAt).toLocaleString() : ''}`))))
      : empty('None yet.')),
    card(`Conversation summaries (${data.summaries?.length || 0})`, data.summaries?.length
      ? data.summaries.map((s) => h('p', {}, s.content))
      : empty('None yet.')));
}

function renderRecall(data) {
  const r = data.recall || {};
  const scored = (items) => items?.length ? h('ol', {}, items.map((i) => h('li', {}, i.content ?? i.content?.text ?? JSON.stringify(i), i.score != null && h('small', { class: 'muted' }, ` · score ${Number(i.score).toFixed(2)}`)))) : empty('No matches.');
  return h('div', { class: 'cards' },
    card('Observations', scored(r.observations)),
    card('Summaries', scored(r.summaries)),
    card('Recent communications', scored((r.communications || []).map((c) => ({ content: c.content?.text ?? '' })))),
    h('p', { class: 'muted small' }, `Query: "${data.query}" · ${r.meta?.queryTime ?? '?'} ms`));
}

export default {
  id: 8,
  docs: 'https://www.twilio.com/docs/conversations/memory',
  learn: `
    <p>After a conversation goes <em>inactive</em> or <em>closed</em>, Memory extracts <strong>observations</strong> (preferences, behaviors, mood) and a <strong>conversation summary</strong> into the profile. This is asynchronous, so the page refreshes every 5 seconds for up to 2 minutes.</p>
    <p><strong>Recall</strong> is what an AI agent calls on each turn: a semantic + keyword search across the profile's memory, ranked by relevance.</p>`,
  mount(el, ctx) {
    const status = h('p', { class: 'waiting' }, 'Checking Memory…');
    const out = h('div', {});
    const refresh = h('button', { type: 'button' }, 'Refresh now');
    let stop = () => {};
    const start = () => {
      stop();
      stop = ctx.poll({
        call: () => ctx.api.get('/api/memory/results'),
        isDone: (env) => !env.ok || hasResults(env),
        onResult: (env, { done, exhausted }) => {
          out.replaceChildren(ctx.resultPanelFor(env, render));
          status.hidden = done || exhausted;
          if (exhausted) out.prepend(h('p', { class: 'muted' }, 'Still nothing. Make sure the conversation is closed (Step 7) and memory extraction is enabled (Step 5), then refresh.'));
        },
      });
    };
    refresh.addEventListener('click', start);
    el.append(h('div', { class: 'actions' }, refresh), status, out, h('h3', {}, 'Try Recall'));
    ctx.formStep(el, {
      fields: [{ name: 'query', label: 'What would your agent ask Memory?', value: 'What does this customer care about?' }],
      submitLabel: 'Recall',
      call: (values) => ctx.api.post('/api/memory/recall', values),
      render: renderRecall,
    });
    start();
    return () => stop();
  },
};
