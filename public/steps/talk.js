import { h, kv, card, empty } from '../lib/dom.js';
import { timeline } from '../lib/timeline.js';

function instructions(config) {
  const wa = config.channels?.whatsapp;
  return {
    SMS: h('div', {},
      h('p', {}, 'From your phone (', h('code', {}, config.myPhoneNumber || 'MY_PHONE_NUMBER'), '), text your Twilio number:'),
      h('p', { class: 'big' }, h('strong', {}, config.phoneNumber || 'TWILIO_PHONE_NUMBER')),
      h('p', { class: 'muted' }, 'Try: "Hi, my order arrived late. Also, can I upgrade to premium?" The app auto-replies, and Orchestrator captures both messages.')),
    WhatsApp: wa
      ? h('div', {},
        h('p', {}, 'Send a WhatsApp message to your sender:'),
        h('p', { class: 'big' }, h('strong', {}, config.whatsappNumber)),
        h('p', { class: 'muted' }, `Make sure the sender's incoming-message webhook is ${config.publicUrl}/channels/whatsapp. Because of GROUP_BY_PROFILE, it joins the same conversation as your SMS.`))
      : h('p', { class: 'muted' }, 'WhatsApp is disabled. Register a WhatsApp sender, set TWILIO_WHATSAPP_NUMBER in .env, and restart.'),
    Voice: h('div', {},
      h('p', {}, 'Call your Twilio number and talk for up to three turns:'),
      h('p', { class: 'big' }, h('strong', {}, config.phoneNumber || 'TWILIO_PHONE_NUMBER')),
      h('p', { class: 'muted' }, 'Voice capture rules turn on real-time transcription, so each utterance becomes a TRANSCRIPTION communication (transcription fees apply).')),
  };
}

export default {
  id: 6,
  docs: 'https://www.twilio.com/docs/conversations/orchestrator/concepts/channels',
  learn: `
    <p>Now create some real traffic. Orchestrator observes it through the capture rules from Step 5. Your app code doesn't change: the SMS, WhatsApp and Voice webhooks here only send simple auto-replies.</p>
    <p>Watch the timeline below and the <strong>Live events</strong> panel. You will see <code>CONVERSATION_CREATED</code>, <code>PARTICIPANT_ADDED</code> and <code>COMMUNICATION_CREATED</code> callbacks arrive.</p>
    <p>You can also <strong>reply as the agent</strong> through the Orchestrator <em>Actions</em> API, or <strong>simulate</strong> messages through the API if you don't have a phone handy. Simulated messages may not trigger Intelligence rules the way real traffic does.</p>`,
  mount(el, ctx) {
    const { config } = ctx;
    const live = [];
    const timelineSlot = h('div', {});
    const status = h('p', { class: 'muted' });
    const drawTimeline = () => {
      status.textContent = ctx.state().conversationId ? `Conversation: ${ctx.state().conversationId}` : 'Waiting for your first message or call…';
      timelineSlot.replaceChildren(live.length ? timeline(live, { customerAddress: config.myPhoneNumber }) : empty('Nothing captured yet.'));
    };
    const unsubscribe = ctx.onEvent((event) => {
      if (event.source === 'orchestrator' && event.type === 'COMMUNICATION_CREATED' && event.payload?.data) {
        live.push(event.payload.data);
        drawTimeline();
      } else if (event.source === 'orchestrator') {
        drawTimeline();
      }
    });

    const refreshOut = h('div', {});
    const refresh = h('button', { type: 'button' }, 'Refresh from API');
    refresh.addEventListener('click', async () => {
      const envelope = await ctx.run({ button: refresh, into: refreshOut, call: () => ctx.api.get('/api/orchestrator/conversation'), render: (d) => timeline(d.communications, { customerAddress: config.myPhoneNumber }) });
      if (envelope.ok) {
        live.splice(0, live.length, ...envelope.data.communications);
        drawTimeline();
      }
    });

    const panels = instructions(config);
    const replyPanel = h('div', {});
    const channelOptions = [{ value: 'SMS', label: 'SMS' }, ...(config.channels?.whatsapp ? [{ value: 'WHATSAPP', label: 'WhatsApp' }] : [])];
    ctx.formStep(replyPanel, {
      fields: [
        { name: 'channel', label: 'Channel', value: 'SMS', options: channelOptions },
        { name: 'text', label: 'Message to send to your phone', value: 'Hi! This is the agent. How can I help?' },
      ],
      submitLabel: 'Send as agent',
      call: (values) => ctx.api.post('/api/orchestrator/reply', values),
      render: (d) => card('Action', kv({ id: d.action?.id, type: d.action?.type, status: d.action?.status, failureReason: d.action?.failureReason, messageSid: d.action?.related?.messageSid })),
    });
    const simulatePanel = h('div', {});
    ctx.formStep(simulatePanel, {
      fields: [
        { name: 'channel', label: 'Channel', value: 'SMS', options: [{ value: 'SMS', label: 'SMS' }, ...(config.channels?.whatsapp ? [{ value: 'WHATSAPP', label: 'WhatsApp' }] : []), { value: 'VOICE', label: 'Voice (transcription)' }] },
        { name: 'author', label: 'Who is speaking?', value: 'CUSTOMER', options: [{ value: 'CUSTOMER', label: 'Customer (you)' }, { value: 'AGENT', label: 'Agent' }] },
        { name: 'text', label: 'Text', type: 'textarea', value: 'Hi, my last order arrived late. Also, can I upgrade to the premium plan?' },
      ],
      submitLabel: 'Add simulated communication',
      call: (values) => ctx.api.post('/api/orchestrator/simulate', values),
      render: (d) => card('Simulated communication', kv({ conversationId: d.communication?.conversationId || ctx.state().conversationId, communicationId: d.communication?.id, text: d.communication?.content?.text })),
    });

    const tabs = { ...panels, 'Reply as agent': replyPanel, Simulate: simulatePanel };
    const panel = h('div', { class: 'subtab-panel' });
    const bar = h('div', { class: 'subtabs', role: 'tablist' });
    const select = (name) => {
      [...bar.children].forEach((b) => b.setAttribute('aria-selected', String(b.textContent === name)));
      panel.replaceChildren(tabs[name]);
    };
    Object.keys(tabs).forEach((name) => bar.append(h('button', { type: 'button', role: 'tab', onClick: () => select(name) }, name)));
    select('SMS');

    el.append(bar, panel, h('h3', {}, 'Live timeline'), status, timelineSlot, h('div', { class: 'actions' }, refresh, h('button', { type: 'button', onClick: () => ctx.goTo(7) }, 'Inspect conversation →')), refreshOut);
    drawTimeline();
    return unsubscribe;
  },
};
