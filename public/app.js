// Boots the tester: loads config + state, draws the progress rail, routes #/step/N to step
// modules, and provides the shared `ctx` helpers every step uses.
import { h, field, formValues } from './lib/dom.js';
import { api } from './lib/api.js';
import { STEPS, stepStatus, nextStepId } from './lib/progress.js';
import { resultPanel } from './lib/result-panel.js';
import { createEventLog } from './lib/event-log.js';
import stepModules from './steps/index.js';

const rail = document.getElementById('rail');
const main = document.getElementById('main');
const eventLog = createEventLog(document.getElementById('events'));

let config = {};
let defaults = {};
let state = {};
let cleanup = null;
let pending = null; // { id, lastRun, lastRender } to show after navigation
const modulesById = new Map(stepModules.map((m) => [m.id, m]));

function setState(next) {
  if (!next) return;
  state = next;
  renderRail();
}

async function refreshState() {
  const next = await fetch('/api/state').then((r) => r.json()).catch(() => null);
  setState(next);
}

// Conversations created by real traffic arrive via webhooks: refresh state when they do.
let refreshTimer = null;
eventLog.onEvent((event) => {
  if (event.source !== 'orchestrator') return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshState, 500);
});

const ctx = {
  get config() { return config; },
  get defaults() { return defaults; },
  state: () => state,
  api,
  onEvent: (fn) => eventLog.onEvent(fn),
  goTo,
  resultPanelFor: (envelope, render) => resultPanel(envelope, render),
  async run({ button, call, render, into }) {
    if (button) {
      button.disabled = true;
      button.classList.add('busy');
    }
    const envelope = await call();
    if (button) {
      button.disabled = false;
      button.classList.remove('busy');
    }
    if (envelope.state) setState(envelope.state);
    if (into) into.replaceChildren(resultPanel(envelope, render));
    return envelope;
  },
  formStep(el, { fields, submitLabel, call, render, extra }) {
    const out = h('div', { class: 'result-slot' });
    const button = h('button', { type: 'submit', class: 'primary' }, submitLabel);
    const form = h('form', { class: 'step-form' }, fields.map(field), h('div', { class: 'actions' }, button, extra));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      ctx.run({ button, into: out, call: () => call(formValues(form)), render });
    });
    el.append(form, out);
    return { form, out, button };
  },
  // Re-runs `call` every `every` ms until isDone(envelope) or `times` attempts. Returns stop().
  poll({ call, isDone, onResult, every = 5000, times = 24 }) {
    let attempts = 0;
    let timer = null;
    let stopped = false;
    const tick = async () => {
      attempts += 1;
      const envelope = await call();
      if (stopped) return;
      if (envelope.state) setState(envelope.state);
      const done = isDone(envelope);
      onResult(envelope, { done, attempts, exhausted: !done && attempts >= times });
      if (!done && attempts < times) timer = setTimeout(tick, every);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  },
};

function renderRail() {
  const current = currentStepId();
  const next = nextStepId(state);
  const groups = [];
  for (const step of STEPS) {
    const last = groups[groups.length - 1];
    if (!last || last.product !== step.product) groups.push({ product: step.product, steps: [step] });
    else last.steps.push(step);
  }
  rail.replaceChildren(...groups.map((group) => h('section', {},
    h('h3', {}, group.product),
    h('ol', {}, group.steps.map((step) => {
      const { status, reason } = stepStatus(step, state);
      const icon = { done: '✓', ready: '●', optional: '○', blocked: '🔒' }[status];
      const classes = [status, step.id === next && status === 'ready' ? 'next' : ''].join(' ');
      return h('li', {}, h('a', { href: `#/step/${step.id}`, class: classes, 'aria-current': step.id === current ? 'page' : null },
        h('span', { class: 'status', 'aria-hidden': 'true' }, icon),
        h('span', {}, `${step.id}. ${step.title}`, reason && h('small', {}, reason), step.optional && status !== 'done' && h('small', {}, 'optional'))));
    })))));
}

function currentStepId() {
  const match = location.hash.match(/^#\/step\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function goTo(id) {
  location.hash = `#/step/${id}`;
}

// Navigate to a step and show a result envelope at the top of it (used by Run all and Reset).
function show(id, lastRun, lastRender) {
  pending = { id, lastRun, lastRender };
  if (currentStepId() === id) renderStep();
  else goTo(id);
}

function renderStep() {
  if (cleanup) cleanup();
  cleanup = null;
  const id = currentStepId();
  const { lastRun, lastRender } = pending && pending.id === id ? pending : {};
  pending = null;
  const meta = STEPS.find((s) => s.id === id) || STEPS[0];
  const mod = modulesById.get(meta.id);
  const { status, reason } = stepStatus(meta, state);
  const body = h('div', { class: 'step-body' });
  main.replaceChildren(
    h('div', { class: 'step-header' }, h('span', { class: `product product-${meta.product}` }, meta.product), h('h2', {}, `${meta.id}. ${meta.title}`)),
    status === 'blocked' && h('p', { class: 'blocked-banner' }, `🔒 ${reason}. You can read this step now; its Run buttons will explain what is missing.`),
    mod && h('div', { class: 'learn', html: mod.learn }),
    mod?.docs && h('p', {}, h('a', { href: mod.docs, target: '_blank', rel: 'noopener' }, 'Twilio docs for this step ↗')),
    lastRun && resultPanel(lastRun, lastRender || mod?.render),
    body,
    h('div', { class: 'actions' },
      meta.id > 0 && h('button', { type: 'button', onClick: () => goTo(meta.id - 1) }, '← Previous'),
      meta.id < 9 && h('button', { type: 'button', onClick: () => goTo(meta.id + 1) }, 'Next →')));
  if (mod) cleanup = mod.mount(body, ctx) || null;
  else body.append(h('p', { class: 'muted' }, 'This step is coming soon.'));
  renderRail();
  main.focus();
}

async function runAll(button) {
  const sequence = [
    { id: 1, needed: () => !state.storeId, call: () => api.post('/api/memory/stores', {}) },
    { id: 2, needed: () => !state.profileId, call: () => api.post('/api/memory/profiles', {}) },
    { id: 4, needed: () => !state.intelligenceConfigId, call: () => api.post('/api/intelligence/configurations', {}) },
    { id: 5, needed: () => !state.orchestratorConfigId, call: () => api.post('/api/orchestrator/configurations', {}) },
  ];
  button.disabled = true;
  let last = null;
  for (const item of sequence) {
    if (!item.needed()) continue;
    button.textContent = `Running step ${item.id}…`;
    const envelope = await item.call();
    if (envelope.state) setState(envelope.state);
    last = { id: item.id, envelope };
    if (!envelope.ok) break;
  }
  button.disabled = false;
  button.textContent = 'Run setup steps 1–5';
  // Show the failing step, or step 5's result when everything succeeded.
  if (last) show(last.id, last.envelope);
  else goTo(6);
}

const renderDeleted = (data) => h('ul', { class: 'checklist' }, (data.deleted || []).map((d) =>
  h('li', { class: d.ok ? 'ok' : 'fail' }, h('strong', {}, `${d.ok ? '✓' : '✕'} ${d.label}`), h('div', { class: 'muted' }, `${d.id}${d.note ? ` (${d.note})` : ''}${d.error ? `: ${d.error}` : ''}`))));

async function reset(button) {
  if (!confirm('Delete the Memory store, configurations and custom operator this tester created, and clear local state?')) return;
  const envelope = await ctx.run({ button, call: () => api.post('/api/reset') });
  show(0, envelope, renderDeleted);
}

document.getElementById('run-all').addEventListener('click', (e) => runAll(e.currentTarget));
document.getElementById('reset').addEventListener('click', (e) => reset(e.currentTarget));

let boot;
try {
  boot = await fetch('/api/setup/config').then((r) => r.json());
} catch (err) {
  main.replaceChildren(h('p', { class: 'muted' }, `Could not load /api/setup/config — is \`npm start\` running? ${err.message}`));
  throw err;
}
config = boot.config;
defaults = boot.defaults;
state = boot.state;
window.addEventListener('hashchange', () => renderStep());
if (!location.hash) location.hash = '#/step/0';
else renderStep();
