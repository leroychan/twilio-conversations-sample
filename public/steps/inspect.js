import { h, card, kv, badge, empty } from '../lib/dom.js';
import { timeline } from '../lib/timeline.js';

export default {
  id: 7,
  docs: 'https://www.twilio.com/docs/conversations/orchestrator/concepts/lifecycle',
  learn: `
    <p>A <strong>Conversation</strong> has <strong>participants</strong> (customer, agents) and <strong>communications</strong> (messages, voice transcriptions) from any channel. Check that your participant has a <code>profileId</code>: that is the link into Memory.</p>
    <p>Conversations move <code>ACTIVE → INACTIVE → CLOSED</code> on the timeouts from Step 5. <strong>Closing</strong> fires the Intelligence <code>CONVERSATION_END</code> rule (Summary) and starts memory extraction. A closed conversation can't be reopened; new messages start a new one.</p>`,
  mount(el, ctx) {
    const out = h('div', {});
    const load = (id) => ctx.run({ button: loadButton, into: out, call: () => ctx.api.get(`/api/orchestrator/conversation${id ? `?id=${encodeURIComponent(id)}` : ''}`), render });
    const loadButton = h('button', { type: 'button', class: 'primary' }, 'Load conversation');
    loadButton.addEventListener('click', () => load());

    const closeOut = h('div', {});
    const closeButton = h('button', { type: 'button', class: 'danger' }, 'Close conversation');
    closeButton.addEventListener('click', async () => {
      const envelope = await ctx.run({ button: closeButton, into: closeOut, call: () => ctx.api.post('/api/orchestrator/conversation/close'), render: (d) => card('Conversation closed', kv({ id: d.conversation?.id, status: d.conversation?.status }), h('p', {}, 'Next: Steps 8 and 9 wait for Memory and Intelligence to process it.')) });
      if (envelope.ok) load();
    });

    function render(data) {
      const profileId = ctx.state().profileId;
      const c = data.conversation || {};
      const picker = data.conversations?.length > 1 && h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Conversation'),
        h('select', { onChange: (e) => load(e.target.value) }, data.conversations.map((conv) => h('option', { value: conv.id, selected: conv.id === c.id }, `${conv.id} · ${conv.status} · ${new Date(conv.createdAt).toLocaleString()}`))));
      return h('div', {},
        picker,
        card('Conversation', kv({ id: c.id, status: c.status, configurationId: c.configurationId, createdAt: c.createdAt })),
        card('Participants', data.participants?.length
          ? h('ul', {}, data.participants.map((p) => h('li', {},
            badge(p.type || 'UNKNOWN', p.type === 'CUSTOMER' ? 'info' : 'neutral'), ' ',
            p.name || '', ' ', (p.addresses || []).map((a) => `${a.channel}:${a.address}`).join(', '), ' ',
            p.profileId ? badge(p.profileId === profileId ? `profile ✓ ${p.profileId}` : `profile ${p.profileId}`, p.profileId === profileId ? 'success' : 'warning') : badge('no profile yet', 'warning'))))
          : empty('No participants.')),
        card('Timeline', timeline(data.communications, { customerAddress: ctx.config.myPhoneNumber })));
    }

    el.append(h('div', { class: 'actions' }, loadButton, closeButton), out, closeOut);
    if (ctx.state().orchestratorConfigId) load();
  },
};
