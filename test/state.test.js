const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createState, DEFAULT_STATE } = require('../lib/state');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'state-')), 'state.json');

test('starts from defaults when the file does not exist', () => {
  assert.deepEqual(createState(tmpFile()).get(), DEFAULT_STATE);
});

test('set merges, persists to disk, and stamps createdAt', () => {
  const file = tmpFile();
  const state = createState(file);
  state.set({ storeId: 'mem_store_1' });
  const reloaded = createState(file).get();
  assert.equal(reloaded.storeId, 'mem_store_1');
  assert.ok(reloaded.createdAt.storeId);
  assert.equal(reloaded.profileId, null);
});

test('get returns a copy that callers cannot mutate', () => {
  const state = createState(tmpFile());
  state.get().intelligenceRuleIds.push('x');
  assert.deepEqual(state.get().intelligenceRuleIds, []);
});

test('reset restores defaults', () => {
  const state = createState(tmpFile());
  state.set({ storeId: 'a', conversationClosed: true });
  assert.deepEqual(state.reset(), DEFAULT_STATE);
});

test('a corrupt or empty state file falls back to defaults', () => {
  for (const contents of ['{not json', '']) {
    const file = tmpFile();
    fs.writeFileSync(file, contents);
    assert.deepEqual(createState(file).get(), DEFAULT_STATE);
  }
});
