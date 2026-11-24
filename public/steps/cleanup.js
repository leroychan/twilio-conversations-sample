import { h, empty } from '../lib/dom.js';

// One highlighted section of the plan: what will be restored, deleted, or left for you.
function section(kind, title, items, describe) {
  return h('section', { class: `plan plan-${kind}` },
    h('h4', {}, title),
    items.length ? h('ul', { class: 'checklist' }, items.map(describe)) : empty('Nothing to do here.'));
}

const manualItem = (m) => h('li', { class: 'warn' }, h('strong', {}, `✋ ${m.label}`), h('div', { class: 'muted' }, m.detail));

function renderPlan(data) {
  return h('div', {},
    section('restore', '🔁 Will be restored to your original settings', data.restore, (r) => h('li', {},
      h('strong', {}, r.label),
      h('div', { class: 'change' }, h('span', { class: 'from' }, r.from), ' → ', h('span', { class: 'to' }, r.to)))),
    section('delete', '🗑 Will be deleted from your Twilio account', data.delete, (d) => h('li', {},
      h('strong', {}, `${d.label} `), h('code', {}, d.id),
      d.detail && h('div', { class: 'muted' }, d.detail))),
    section('manual', '✋ You need to do these yourself', data.manual, manualItem));
}

const resultItem = (r) => h('li', { class: r.ok ? 'ok' : 'fail' },
  h('strong', {}, `${r.ok ? '✓' : '✕'} ${r.label}`),
  h('div', { class: 'muted' }, `${r.id || ''}${r.note ? ` (${r.note})` : ''}${r.error ? `: ${r.error}` : ''}`));

function renderResult(data) {
  const failed = [...data.restored, ...data.deleted].filter((r) => !r.ok).length;
  return h('div', {},
    failed && h('p', { class: 'blocked-banner' }, `${failed} item(s) could not be cleaned up. Their IDs are kept, so you can run this step again.`),
    section('restore', '🔁 Restored', data.restored, resultItem),
    section('delete', '🗑 Deleted', data.deleted, resultItem),
    section('manual', '✋ Still to do by hand', data.manual, manualItem));
}

export default {
  id: 10,
  docs: 'https://www.twilio.com/docs/conversations/orchestrator/concepts/core',
  learn: `
    <p>When you're done experimenting, put your account back the way it was. This step:</p>
    <ul>
      <li><strong>Restores</strong> your phone number's original SMS and Voice webhooks. Step 0 saved them to <code>.tester-backup.json</code> before pointing the number at this app.</li>
      <li><strong>Deletes</strong> what the tester created, newest first: conversations, the Conversation Configuration (so Twilio stops capturing your traffic), the Intelligence Configuration, your custom operator, and the Memory Store with your profile.</li>
      <li><strong>Lists</strong> what only you can undo, such as the WhatsApp sender webhook you set in the Console.</li>
    </ul>
    <p>Check the plan below first. Nothing changes until you click <em>Restore &amp; delete everything</em>.</p>`,
  render: renderResult,
  mount(el, ctx) {
    const planOut = h('div', {});
    const resultOut = h('div', {});
    const refresh = h('button', { type: 'button' }, 'Refresh plan');
    const go = h('button', { type: 'button', class: 'primary danger-fill' }, 'Restore & delete everything');
    const loadPlan = () => ctx.run({ button: refresh, into: planOut, call: () => ctx.api.get('/api/reset/preview'), render: renderPlan });
    refresh.addEventListener('click', loadPlan);
    go.addEventListener('click', async () => {
      if (!confirm('Restore your number and permanently delete everything listed under "Will be deleted"?')) return;
      await ctx.run({ button: go, into: resultOut, call: () => ctx.api.post('/api/reset'), render: renderResult });
      loadPlan();
    });
    el.append(h('h3', {}, 'The plan'), h('div', { class: 'actions' }, refresh), planOut,
      h('div', { class: 'actions' }, go), resultOut);
    loadPlan();
  },
};
