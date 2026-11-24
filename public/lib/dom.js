// Tiny DOM helpers. Server data is always added as text (never innerHTML), so message content
// such as "<b>" shows up literally instead of being interpreted as HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value; // static, trusted copy only
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export const json = (value) => h('pre', { class: 'json' }, JSON.stringify(value, null, 2));

export function field({ name, label, value = '', help, type = 'text', options, disabled }) {
  let input;
  if (options) input = h('select', { name, disabled }, options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  else if (type === 'textarea') input = h('textarea', { name, rows: 4, disabled }, value);
  else input = h('input', { name, type, value, disabled });
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, help && h('small', { class: 'muted' }, help));
}

export const formValues = (form) => Object.fromEntries(new FormData(form).entries());

export const badge = (text, tone = 'neutral') => h('span', { class: `badge badge-${tone}` }, text);

export const card = (title, ...children) => h('div', { class: 'card' }, title && h('h4', {}, title), ...children);

export function kv(object) {
  const show = (v) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return h('dl', { class: 'kv' }, Object.entries(object).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, show(v))]));
}

export const empty = (text) => h('p', { class: 'muted empty' }, text);
