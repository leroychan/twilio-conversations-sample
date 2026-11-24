import { h, card, kv, json, badge } from '../lib/dom.js';

function renderList(data) {
  return h('table', { class: 'operators' },
    h('thead', {}, h('tr', {}, ['Name', 'Author', 'Output', 'ID'].map((t) => h('th', {}, t)))),
    h('tbody', {}, data.operators.map((o) => h('tr', {},
      h('td', {}, o.displayName),
      h('td', {}, badge(o.author || '?', o.author === 'SELF' ? 'info' : 'neutral')),
      h('td', {}, o.outputFormat),
      h('td', {}, h('code', {}, o.id))))));
}

function renderOperator(data) {
  const o = data.operator || {};
  return card(o.displayName, kv({ id: o.id, author: o.author, outputFormat: o.outputFormat }), h('h5', {}, 'Prompt'), h('p', {}, o.prompt), h('h5', {}, 'Output schema'), json(o.outputSchema));
}

export default {
  id: 3,
  docs: 'https://www.twilio.com/docs/conversations/intelligence/create-custom-language-operators',
  learn: `
    <p>A <strong>Language Operator</strong> is an AI task that turns conversation text into structured output. Twilio provides ready-made operators (Summary, Sentiment, Next Best Response…), and you can write your own with a prompt and an output schema.</p>
    <p>This step is optional. If you create the starter <em>Upsell intent detector</em>, Step 4 adds it next to Sentiment so it runs on every message.</p>`,
  render: renderOperator,
  mount(el, ctx) {
    const listOut = h('div', { class: 'result-slot' });
    const listButton = h('button', { type: 'button' }, 'List available operators');
    listButton.addEventListener('click', () => ctx.run({ button: listButton, into: listOut, call: () => ctx.api.get('/api/intelligence/operators'), render: renderList }));
    el.append(h('div', { class: 'actions' }, listButton), listOut);

    const starter = ctx.defaults.operator || {};
    ctx.formStep(el, {
      fields: [
        { name: 'displayName', label: 'Operator name', value: starter.displayName },
        { name: 'description', label: 'Description', value: starter.description },
        { name: 'prompt', label: 'Prompt', type: 'textarea', value: starter.prompt, help: 'Output format is JSON with the schema shown after you create it (upsellIntent, evidence, confidence).' },
      ],
      submitLabel: 'Create custom operator',
      call: (values) => ctx.api.post('/api/intelligence/operators', values),
      render: renderOperator,
    });
  },
};
