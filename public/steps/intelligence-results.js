import { h, card, kv, json, badge, empty } from '../lib/dom.js';

function resultBody(r) {
  if (r.result == null) return empty('No result body.');
  if (typeof r.result === 'string') return h('p', {}, r.result);
  if (r.outputFormat === 'CLASSIFICATION' && r.result.label) return badge(r.result.label, 'info');
  return json(r.result);
}

const makeRender = (ctx) => (data) => h('div', {},
  data.results?.length
    ? data.results.map((r) => card(ctx.defaults.operatorNames?.[r.operator?.id] || (r.operator?.id === ctx.state().operatorId ? 'Your custom operator' : r.operator?.id),
      kv({ trigger: r.executionDetails?.trigger?.on || r.executionDetails?.trigger?.type, format: r.outputFormat, created: r.dateCreated }),
      resultBody(r)))
    : empty('No operator results yet.'),
  h('p', { class: 'muted small' }, `${data.webhooks?.length || 0} Intelligence webhook(s) received for this conversation. See the Live events panel.`));

export default {
  id: 9,
  docs: 'https://www.twilio.com/docs/conversations/intelligence/explore-language-operator-results',
  learn: `
    <p>Each time a rule fires, its operators produce <strong>operator results</strong>: <em>Sentiment</em> per message, your <em>custom operator's</em> JSON, and a <em>Summary</em> when the conversation ends. They are delivered to your webhook and can also be listed through the API.</p>
    <p>In production, you would use these to update a CRM, alert a supervisor, or guide an agent's next reply.</p>`,
  mount(el, ctx) {
    const status = h('p', { class: 'waiting' }, 'Checking Intelligence…');
    const out = h('div', {});
    const refresh = h('button', { type: 'button' }, 'Refresh now');
    const render = makeRender(ctx);
    let stop = () => {};
    const start = () => {
      stop();
      stop = ctx.poll({
        call: () => ctx.api.get('/api/intelligence/results'),
        isDone: (env) => !env.ok || (env.data.results?.length && (!ctx.state().conversationClosed || env.data.results.some((r) => r.executionDetails?.trigger?.on === 'CONVERSATION_END'))),
        onResult: (env, { done, exhausted }) => {
          out.replaceChildren(ctx.resultPanelFor(env, render));
          status.hidden = done || exhausted;
        },
      });
    };
    refresh.addEventListener('click', start);
    const unsubscribe = ctx.onEvent((event) => {
      if (event.source === 'intelligence') start();
    });
    el.append(h('div', { class: 'actions' }, refresh), status, out);
    start();
    return () => {
      stop();
      unsubscribe();
    };
  },
};
