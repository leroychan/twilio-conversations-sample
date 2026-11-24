// Live log of webhooks (Server-Sent Events from GET /events). Deduped by event id, so a
// reconnect, which replays recent events, never shows duplicates.
import { h, json } from './dom.js';

const FILTERS = ['all', 'orchestrator', 'intelligence', 'channels'];

export function createEventLog(container) {
  const seen = new Set();
  const listeners = new Set();
  let filter = 'all';
  const list = h('ol', { class: 'event-list' });
  const status = h('span', { class: 'muted small' }, 'connecting…');

  const chips = FILTERS.map((name) => h('button', {
    type: 'button',
    class: 'chip',
    'aria-pressed': String(name === 'all'),
    onClick: () => {
      filter = name;
      chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.textContent === name)));
      applyFilter();
    },
  }, name));

  function applyFilter() {
    for (const item of list.children) item.hidden = filter !== 'all' && item.dataset.source !== filter;
  }

  function add(event) {
    if (seen.has(event.id)) return;
    seen.add(event.id);
    const item = h('li', { 'data-source': event.source },
      h('details', {},
        h('summary', {},
          h('span', { class: `src src-${event.source}` }, event.source), ' ',
          h('strong', {}, event.type), ' ',
          h('time', { class: 'muted' }, new Date(event.at).toLocaleTimeString())),
        json(event.payload)));
    list.prepend(item);
    applyFilter();
    listeners.forEach((fn) => fn(event));
  }

  container.append(
    h('div', { class: 'event-head' }, h('h3', {}, 'Live events'), status,
      h('button', { type: 'button', class: 'link', onClick: () => list.replaceChildren() }, 'Clear')),
    h('div', { class: 'chips' }, chips),
    list,
    h('p', { class: 'muted small' }, 'Webhooks from Twilio (and calls to your number) appear here in real time.'));

  const source = new EventSource('/events');
  source.onopen = () => { status.textContent = '● live'; };
  source.onerror = () => { status.textContent = 'reconnecting…'; };
  source.onmessage = (message) => {
    try {
      add(JSON.parse(message.data));
    } catch {
      // ignore malformed events
    }
  };

  return { onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
}
