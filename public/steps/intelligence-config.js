import { h, card, kv } from '../lib/dom.js';

function operatorName(ctx, id) {
  if (ctx.defaults.operatorNames?.[id]) return ctx.defaults.operatorNames[id];
  if (id && id === ctx.state().operatorId) return 'Your custom operator';
  return id;
}

const makeRender = (ctx) => (data) => {
  const c = data.configuration || {};
  return h('div', {},
    card('Intelligence Configuration', kv({ id: c.id, displayName: c.displayName, version: c.version })),
    (c.rules || []).map((rule, i) => card(`Rule ${i + 1}${rule.id ? ` (${rule.id})` : ''}`,
      h('div', { class: 'flow' },
        h('span', { class: 'node' }, `Trigger: ${(rule.triggers || []).map((t) => t.on).join(', ') || 'on demand'}`),
        h('span', { class: 'arrow' }, '→'),
        h('span', { class: 'node' }, `Operators: ${(rule.operators || []).map((o) => operatorName(ctx, o.id)).join(', ')}`),
        h('span', { class: 'arrow' }, '→'),
        h('span', { class: 'node' }, `Webhook: ${(rule.actions || []).map((a) => a.url).join(', ')}`)))));
};

export default {
  id: 4,
  docs: 'https://www.twilio.com/docs/conversations/intelligence/create-intelligence-configuration',
  learn: `
    <p>An <strong>Intelligence Configuration</strong> decides <em>when</em> operators run and <em>where</em> results go. It is made of <strong>rules</strong>, and each rule has:</p>
    <ul>
      <li><strong>Triggers</strong>: <code>COMMUNICATION</code> (every new message or voice utterance) or <code>CONVERSATION_END</code>.</li>
      <li><strong>Operators</strong>: up to 5 per rule.</li>
      <li><strong>Actions</strong>: a webhook that receives the results (this app's <code>/webhooks/intelligence</code>).</li>
      <li><strong>Context</strong>: with Memory enabled, operators also see the customer's profile.</li>
    </ul>
    <p>This tester creates two rules: <em>Sentiment</em> (plus your custom operator) on every message, and <em>Summary</em> when the conversation ends. The configuration does nothing until Step 5 attaches it to a Conversation Configuration.</p>`,
  mount(el, ctx) {
    const hasCustom = Boolean(ctx.state().operatorId);
    ctx.formStep(el, {
      fields: [
        { name: 'displayName', label: 'Display name', value: 'Conversations Tester' },
        {
          name: 'includeCustomOperator',
          label: 'Include your custom operator (Step 3)?',
          value: hasCustom ? 'yes' : 'no',
          options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
          disabled: !hasCustom,
          help: hasCustom ? 'Runs on every message, next to Sentiment.' : 'You did not create a custom operator in Step 3.',
        },
      ],
      submitLabel: 'Create Intelligence Configuration',
      call: (values) => ctx.api.post('/api/intelligence/configurations', { displayName: values.displayName, includeCustomOperator: values.includeCustomOperator === 'yes' }),
      render: makeRender(ctx),
    });
  },
};
