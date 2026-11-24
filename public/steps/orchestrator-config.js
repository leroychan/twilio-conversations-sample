import { h, card, kv } from '../lib/dom.js';

function render(data) {
  const c = data.configuration || {};
  const channels = Object.entries(c.channelSettings || {});
  return h('div', {},
    card('How this configuration wires everything together',
      h('div', { class: 'flow' },
        h('span', { class: 'node' }, `Channels: ${channels.map(([name]) => name).join(', ') || '—'}`),
        h('span', { class: 'arrow' }, '→'),
        h('span', { class: 'node' }, `Conversations (grouped ${c.conversationGroupingType || ''})`),
        h('span', { class: 'arrow' }, '→'),
        h('span', { class: 'node' }, `Memory store ${c.memoryStoreId || ''}`),
        h('span', { class: 'arrow' }, '+'),
        h('span', { class: 'node' }, `Intelligence ${(c.intelligenceConfigurationIds || []).join(', ')}`))),
    card('Configuration', kv({ id: c.id, displayName: c.displayName, memoryExtractionEnabled: c.memoryExtractionEnabled, statusCallbacks: (c.statusCallbacks || []).map((s) => s.url).join(', ') })),
    card('Capture rules', channels.length
      ? h('ul', {}, channels.flatMap(([name, settings]) => (settings.captureRules || []).map((r) => h('li', {}, `${name}: from ${r.from} → to ${r.to}${r.metadata?.callType ? ` (${r.metadata.callType})` : ''}`))))
      : h('p', { class: 'muted' }, 'No capture rules returned.')));
}

export default {
  id: 5,
  docs: 'https://www.twilio.com/docs/conversations/orchestrator/concepts/ingestion',
  learn: `
    <p>The <strong>Conversation Configuration</strong> ties the three products together:</p>
    <ul>
      <li><strong>Capture rules</strong> per channel (SMS, WhatsApp, Voice) tell Orchestrator which traffic to observe. There is one rule <em>to</em> your number and one <em>from</em> it, so both sides are captured. Voice rules also switch on real-time transcription (extra cost).</li>
      <li><strong>Grouping</strong> <code>GROUP_BY_PROFILE</code>: a text, a WhatsApp message and a call from the same person become <em>one</em> conversation. This cannot be changed later.</li>
      <li><strong>Memory</strong>: the store from Step 1. With <code>memoryExtractionEnabled</code>, Twilio writes observations and summaries after the conversation goes inactive or closes.</li>
      <li><strong>Intelligence</strong>: the configuration from Step 4.</li>
      <li><strong>Status callbacks</strong>: this app's <code>/webhooks/orchestrator</code>, which feeds the live event log.</li>
    </ul>
    <p>Like the Memory Store, this is async (202 + Operation). Short timeouts help you see results quickly; production defaults are longer.</p>`,
  render,
  mount(el, ctx) {
    ctx.formStep(el, {
      fields: [
        { name: 'displayName', label: 'Display name', value: 'Conversations Tester' },
        { name: 'inactiveMinutes', label: 'Mark inactive after (minutes)', type: 'number', value: '5', help: 'SMS/WhatsApp only. Inactive also triggers memory extraction.' },
        { name: 'closedMinutes', label: 'Close after (minutes)', type: 'number', value: '30' },
      ],
      submitLabel: 'Create Conversation Configuration',
      call: (values) => ctx.api.post('/api/orchestrator/configurations', values),
      render,
    });
  },
};
