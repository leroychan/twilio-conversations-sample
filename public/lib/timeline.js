// Renders Orchestrator communications as a chat-style timeline with a channel label on each.
import { h, empty } from './dom.js';

const CHANNEL_LABEL = { SMS: '💬 SMS', WHATSAPP: '🟢 WhatsApp', VOICE: '📞 Voice', RCS: '💬 RCS', EMAIL: '✉️ Email', CHAT: '💭 Chat' };
const normalize = (address = '') => String(address).replace(/^whatsapp:/, '');

export function timeline(communications, { customerAddress } = {}) {
  if (!communications?.length) return empty('No communications yet.');
  return h('ol', { class: 'timeline' }, communications.map((c) => {
    const channel = c.author?.channel || c.channelId || '';
    const fromCustomer = normalize(c.author?.address) === normalize(customerAddress);
    const when = c.occurredAt || c.createdAt;
    return h('li', { class: `bubble ${fromCustomer ? 'customer' : 'agent'}` },
      h('div', { class: 'bubble-meta' },
        `${CHANNEL_LABEL[channel] || channel} · ${fromCustomer ? 'Customer' : 'Agent'}${when ? ` · ${new Date(when).toLocaleTimeString()}` : ''}`),
      h('div', { class: 'bubble-text' }, c.content?.text ?? JSON.stringify(c.content)),
      c.content?.type === 'TRANSCRIPTION' && h('small', { class: 'muted' }, 'voice transcription'));
  }));
}
