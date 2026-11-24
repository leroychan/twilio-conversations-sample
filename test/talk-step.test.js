const test = require('node:test');
const assert = require('node:assert/strict');

// Just enough DOM for public/steps/talk.js to mount under node:test (no browser, no extra deps).
class FakeNode {}
class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
  }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
}

function installFakeDom(t) {
  globalThis.Node = FakeNode;
  globalThis.document = { createElement: (tag) => new FakeElement(tag) };
  t.after(() => {
    delete globalThis.Node;
    delete globalThis.document;
  });
}

function fakeCtx(state) {
  const calls = [];
  const ctx = {
    config: { channels: {}, phoneNumber: '+15550001111', myPhoneNumber: '+15559998888' },
    state: () => state,
    onEvent: () => () => {},
    formStep: () => {},
    goTo: () => {},
    api: { get: (path) => { calls.push(path); return Promise.resolve({ ok: true, data: { communications: [] } }); } },
    run: async ({ call }) => call(),
  };
  return { ctx, calls };
}

test('Step 6 loads the saved conversation from the API when it mounts', async (t) => {
  installFakeDom(t);
  const { default: talk } = await import('../public/steps/talk.js');
  const { ctx, calls } = fakeCtx({ conversationId: 'conv_1' });
  talk.mount(new FakeElement('div'), ctx);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['/api/orchestrator/conversation']);
});

test('Step 6 waits for traffic when there is no conversation yet', async (t) => {
  installFakeDom(t);
  const { default: talk } = await import('../public/steps/talk.js');
  const { ctx, calls } = fakeCtx({ conversationId: null });
  talk.mount(new FakeElement('div'), ctx);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
});
