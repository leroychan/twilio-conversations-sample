// Remembers the IDs each step creates (store, profile, configs, conversation) in state.json,
// so later steps can pre-fill their forms. Delete state.json (or use Reset) to start over.
const fs = require('node:fs');

const DEFAULT_STATE = Object.freeze({
  storeId: null,
  profileId: null,
  operatorId: null,
  intelligenceConfigId: null,
  intelligenceRuleIds: [],
  orchestratorConfigId: null,
  conversationId: null,
  conversationClosed: false,
  createdAt: {},
});

const defaults = () => structuredClone(DEFAULT_STATE);

function createState(filePath) {
  let data = load();

  function load() {
    try {
      return { ...defaults(), ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
    } catch {
      return defaults();
    }
  }

  function save() {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  return {
    get: () => structuredClone(data),
    set(patch) {
      const now = new Date().toISOString();
      data = { ...data, ...patch, createdAt: { ...data.createdAt } };
      for (const [key, value] of Object.entries(patch)) {
        if (value != null && value !== false && key !== 'createdAt') data.createdAt[key] = now;
      }
      save();
      return structuredClone(data);
    },
    reset() {
      data = defaults();
      save();
      return structuredClone(data);
    },
  };
}

module.exports = { createState, DEFAULT_STATE };
