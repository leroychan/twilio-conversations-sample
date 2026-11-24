// The learning path. Each step lists the state it needs, so the rail can show what is
// done, ready, or blocked (and why).
export const STEPS = [
  { id: 0, product: 'Setup', title: 'Setup check', requires: [], done: () => false },
  { id: 1, product: 'Memory', title: 'Create a Memory Store', requires: [], done: (s) => Boolean(s.storeId) },
  { id: 2, product: 'Memory', title: 'Create your Profile', requires: ['storeId'], done: (s) => Boolean(s.profileId) },
  { id: 3, product: 'Intelligence', title: 'Explore & create operators', requires: [], optional: true, done: (s) => Boolean(s.operatorId) },
  { id: 4, product: 'Intelligence', title: 'Create an Intelligence Configuration', requires: [], done: (s) => Boolean(s.intelligenceConfigId) },
  { id: 5, product: 'Orchestrator', title: 'Create a Conversation Configuration', requires: ['storeId', 'profileId', 'intelligenceConfigId'], done: (s) => Boolean(s.orchestratorConfigId) },
  { id: 6, product: 'Orchestrator', title: 'Talk on any channel', requires: ['orchestratorConfigId'], done: (s) => Boolean(s.conversationId) },
  { id: 7, product: 'Orchestrator', title: 'Inspect & close the conversation', requires: ['conversationId'], done: (s) => Boolean(s.conversationClosed) },
  { id: 8, product: 'Memory', title: 'See what Memory learned', requires: ['profileId', 'conversationId'], done: () => false },
  { id: 9, product: 'Intelligence', title: 'See Intelligence results', requires: ['conversationId'], done: () => false },
  { id: 10, product: 'Cleanup', title: 'Clean up & restore', requires: [], done: () => false },
];

const CREATED_BY = { storeId: 'Step 1', profileId: 'Step 2', intelligenceConfigId: 'Step 4', orchestratorConfigId: 'Step 5', conversationId: 'Step 6' };

export function stepStatus(step, state) {
  if (step.done(state)) return { status: 'done' };
  const missing = step.requires.filter((key) => !state[key]);
  if (missing.length) return { status: 'blocked', reason: `Needs ${[...new Set(missing.map((key) => CREATED_BY[key]))].join(', ')}` };
  return { status: step.optional ? 'optional' : 'ready' };
}

export function nextStepId(state) {
  const next = STEPS.find((step) => step.id > 0 && !step.optional && stepStatus(step, state).status === 'ready');
  return next ? next.id : 9;
}
