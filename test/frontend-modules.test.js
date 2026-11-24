const test = require('node:test');
const assert = require('node:assert/strict');

test('step modules match the progress rail and implement mount()', async () => {
  const { STEPS } = await import('../public/lib/progress.js');
  const { default: modules } = await import('../public/steps/index.js');
  const ids = modules.map((m) => m.id).sort((a, b) => a - b);
  for (const mod of modules) {
    assert.equal(typeof mod.mount, 'function', `step ${mod.id} mount`);
    assert.equal(typeof mod.learn, 'string', `step ${mod.id} learn`);
    assert.ok(STEPS.some((s) => s.id === mod.id), `step ${mod.id} in STEPS`);
  }
  assert.equal(new Set(ids).size, ids.length);
});
