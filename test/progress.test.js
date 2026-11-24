const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_STATE } = require('../lib/state');

test('steps unlock in dependency order', async () => {
  const { STEPS, stepStatus, nextStepId } = await import('../public/lib/progress.js');
  const byId = (id) => STEPS.find((s) => s.id === id);
  const empty = structuredClone(DEFAULT_STATE);
  assert.equal(stepStatus(byId(1), empty).status, 'ready');
  assert.equal(stepStatus(byId(3), empty).status, 'optional');
  const blocked = stepStatus(byId(5), empty);
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.reason, /Step 1, Step 2, Step 4/);
  assert.equal(nextStepId(empty), 1);

  const ready = { ...empty, storeId: 's', profileId: 'p', intelligenceConfigId: 'i' };
  assert.equal(stepStatus(byId(2), ready).status, 'done');
  assert.equal(nextStepId(ready), 5);
  assert.equal(stepStatus(byId(7), { ...ready, conversationId: 'c', conversationClosed: true }).status, 'done');
});

test('every step has a unique id from 0 to 10, ending with clean-up', async () => {
  const { STEPS, stepStatus } = await import('../public/lib/progress.js');
  assert.deepEqual(STEPS.map((s) => s.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const cleanup = STEPS.at(-1);
  assert.equal(cleanup.product, 'Cleanup');
  // Clean-up is always available, even with nothing created yet.
  assert.notEqual(stepStatus(cleanup, structuredClone(DEFAULT_STATE)).status, 'blocked');
});
