import { h, kv } from '../lib/dom.js';

function renderChecks(data) {
  return h('ul', { class: 'checklist' }, data.checks.map((check) => {
    const tone = check.ok ? 'ok' : check.optional ? 'warn' : 'fail';
    const icon = check.ok ? '✓' : check.optional ? '⚠' : '✕';
    return h('li', { class: tone }, h('strong', {}, `${icon} ${check.label}`), h('div', { class: 'muted' }, check.detail));
  }));
}

export default {
  id: 0,
  docs: 'https://www.twilio.com/docs/conversations/orchestrator/quickstart',
  learn: `
    <p>This tester walks through three products that work together:</p>
    <ul>
      <li><strong>Conversation Orchestrator</strong> captures your SMS, WhatsApp and Voice traffic and groups it into <em>conversations</em>.</li>
      <li><strong>Conversation Memory</strong> keeps a <em>profile</em> per customer and learns from each conversation.</li>
      <li><strong>Conversation Intelligence</strong> runs AI <em>language operators</em> (sentiment, summary, your own prompts) on conversations.</li>
    </ul>
    <p>First, check that your <code>.env</code> is filled in, your API key works, your number's webhooks point here, and Twilio can reach this app through your public URL (ngrok).</p>
    <p class="note">These products only appear in the <strong>new Twilio Console</strong> (1console.twilio.com), and they need the AI/ML Features Addendum accepted. They are not HIPAA eligible or PCI compliant, so use test data only.</p>`,
  render: renderChecks,
  mount(el, ctx) {
    const out = h('div', { class: 'result-slot' });
    const check = h('button', { type: 'button', class: 'primary' }, 'Run setup check');
    const point = h('button', { type: 'button' }, "Point my number's webhooks at this app");
    check.addEventListener('click', () => ctx.run({ button: check, into: out, call: () => ctx.api.post('/api/setup/check'), render: renderChecks }));
    point.addEventListener('click', () => ctx.run({
      button: point,
      into: out,
      call: () => ctx.api.post('/api/setup/point-number'),
      render: (d) => kv({ 'Number SID': d.sid, 'SMS webhook': d.smsUrl, 'Voice webhook': d.voiceUrl }),
    }));
    el.append(h('div', { class: 'actions' }, check, point), out);
    check.click();
  },
};
