import { h, card, kv } from '../lib/dom.js';

function render(data) {
  return h('div', { class: 'cards' },
    card('Memory Store', kv({ id: data.store?.id, displayName: data.store?.displayName, status: data.store?.status })),
    card('Async operation', kv({ operationId: data.operation?.operationId, status: data.operation?.status, completedAt: data.operation?.completedAt }),
      h('p', { class: 'muted small' }, 'Open the JSON tab: the first call returned 202 Accepted, then the app polled the Operation until COMPLETED.')));
}

export default {
  id: 1,
  docs: 'https://www.twilio.com/docs/conversations/memory/api-quickstart',
  learn: `
    <p>A <strong>Memory Store</strong> is the container for all your customer <em>profiles</em>. Orchestrator writes into it, and AI agents read from it.</p>
    <p>Creating a store is <strong>asynchronous</strong>. Twilio answers <code>202 Accepted</code> with a <code>statusUrl</code>, and you poll that <em>Operation</em> until its status is <code>COMPLETED</code>. The finished operation contains the new store ID (<code>mem_store_…</code>).</p>`,
  render,
  mount(el, ctx) {
    ctx.formStep(el, {
      fields: [
        { name: 'displayName', label: 'Display name', value: 'ConversationsTester', help: 'Letters and numbers; must be unique in your account.' },
        { name: 'description', label: 'Description', value: 'Memory store created by the Conversations Tester sample' },
      ],
      submitLabel: 'Create Memory Store',
      call: (values) => ctx.api.post('/api/memory/stores', values),
      render,
    });
  },
};
