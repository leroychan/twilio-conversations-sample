const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBackup } = require('../lib/backup');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'backup-')), '.tester-backup.json');

test('saveOnce stores a value on disk with a timestamp', () => {
  const file = tmpFile();
  createBackup(file).saveOnce('phoneNumber', { sid: 'PN1', smsUrl: 'https://old.example/sms' });
  const saved = createBackup(file).get().phoneNumber;
  assert.equal(saved.smsUrl, 'https://old.example/sms');
  assert.ok(saved.savedAt);
});

test('saveOnce never overwrites the original value', () => {
  const backup = createBackup(tmpFile());
  backup.saveOnce('phoneNumber', { smsUrl: 'https://original.example/sms' });
  const kept = backup.saveOnce('phoneNumber', { smsUrl: 'https://tester.example/channels/sms' });
  assert.equal(kept.smsUrl, 'https://original.example/sms');
  assert.equal(backup.get().phoneNumber.smsUrl, 'https://original.example/sms');
});

test('remove deletes the key, and the file once it is empty', () => {
  const file = tmpFile();
  const backup = createBackup(file);
  backup.saveOnce('phoneNumber', { smsUrl: 'x' });
  backup.remove('phoneNumber');
  assert.deepEqual(backup.get(), {});
  assert.equal(fs.existsSync(file), false);
});

test('a missing or corrupt file reads as empty', () => {
  const file = tmpFile();
  assert.deepEqual(createBackup(file).get(), {});
  fs.writeFileSync(file, '{oops');
  assert.deepEqual(createBackup(file).get(), {});
});
