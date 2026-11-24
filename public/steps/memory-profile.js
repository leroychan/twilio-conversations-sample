import { h, card, kv } from '../lib/dom.js';

function render(data) {
  const found = data.lookup?.profiles?.length;
  return h('div', { class: 'cards' },
    card('Profile', kv({ id: data.profile?.id })),
    card('Traits sent (Contact group)', kv(data.traits || {})),
    card('Lookup by phone', h('p', {}, found
      ? `Identity resolution found ${data.lookup.profiles.join(', ')} for ${data.lookup.normalizedValue}.`
      : 'Not found yet. Trait processing is async, so run the step again in a few seconds.')));
}

export default {
  id: 2,
  docs: 'https://www.twilio.com/docs/conversations/memory/identity-resolution',
  learn: `
    <p>A <strong>Profile</strong> is one customer, across every channel. It holds <em>traits</em> (facts such as name and phone) and, later, <em>observations</em> and <em>summaries</em> learned from conversations.</p>
    <p><strong>Identity resolution</strong> matches incoming addresses (a phone number, a WhatsApp number) to a profile. Messages and calls captured by Orchestrator only link to a profile that <strong>already exists</strong>, so create yours <em>before</em> you text or call.</p>`,
  render,
  mount(el, ctx) {
    const { config } = ctx;
    ctx.formStep(el, {
      fields: [
        { name: 'firstName', label: 'First name', value: 'Alex' },
        { name: 'lastName', label: 'Last name', value: '' },
        { name: 'phone', label: 'Your mobile number (E.164)', value: config.myPhoneNumber, help: 'You will text and call from this number.' },
        { name: 'whatsapp', label: 'Your WhatsApp number (E.164)', value: config.channels?.whatsapp ? config.myPhoneNumber : '', help: config.channels?.whatsapp ? 'Usually the same as your mobile number.' : 'WhatsApp is disabled (TWILIO_WHATSAPP_NUMBER is not set).', disabled: !config.channels?.whatsapp },
      ],
      submitLabel: 'Create Profile',
      call: (values) => ctx.api.post('/api/memory/profiles', values),
      render,
    });
  },
};
