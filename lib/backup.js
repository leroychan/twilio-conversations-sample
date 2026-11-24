// Saves the original settings of things this tester changes on your Twilio account (today: your
// phone number's SMS and Voice webhooks) in .tester-backup.json, so Step 10 can put them back.
// It is separate from state.json, so deleting state.json never loses your originals.
const fs = require('node:fs');

function createBackup(filePath) {
  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }

  function write(data) {
    if (Object.keys(data).length) fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    else fs.rmSync(filePath, { force: true });
  }

  return {
    get: read,
    // Only the first value is kept, so running a step again never replaces the true original.
    saveOnce(key, value) {
      const data = read();
      if (!data[key]) {
        data[key] = { ...value, savedAt: new Date().toISOString() };
        write(data);
      }
      return data[key];
    },
    remove(key) {
      const data = read();
      delete data[key];
      write(data);
    },
  };
}

module.exports = { createBackup };
