const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { waitForOperation, pollUntil } = require('../lib/operations');

function fakeClient(responses) {
  const fetchWithHttpInfo = mock.fn(async () => responses.shift());
  const operations = mock.fn(() => ({ fetchWithHttpInfo }));
  return { client: { memory: { v1: { operations } }, conversations: { v2: { operations } } }, operations, fetchWithHttpInfo };
}
const noSleep = mock.fn(async () => {});

test('polls a memory operation until COMPLETED', async () => {
  const { client, operations, fetchWithHttpInfo } = fakeClient([
    { body: { status: 'PENDING' }, headers: {} },
    { body: { status: 'RUNNING' }, headers: {} },
    { body: { status: 'COMPLETED', result: { id: 'mem_store_1' } }, headers: {} },
  ]);
  const op = await waitForOperation(client, 'https://memory.twilio.com/v1/ControlPlane/Operations/op_123', { sleep: noSleep });
  assert.equal(op.result.id, 'mem_store_1');
  assert.equal(operations.mock.calls[0].arguments[0], 'op_123');
  assert.equal(fetchWithHttpInfo.mock.callCount(), 3);
});

test('routes conversations.twilio.com URLs to the Orchestrator operations API', async () => {
  const memoryOps = mock.fn();
  const convOps = mock.fn(() => ({ fetchWithHttpInfo: async () => ({ body: { status: 'COMPLETED' }, headers: {} }) }));
  const client = { memory: { v1: { operations: memoryOps } }, conversations: { v2: { operations: convOps } } };
  await waitForOperation(client, 'https://conversations.twilio.com/v2/ControlPlane/Operations/op_9', { sleep: noSleep });
  assert.equal(convOps.mock.calls[0].arguments[0], 'op_9');
  assert.equal(memoryOps.mock.callCount(), 0);
});

test('FAILED operations throw OPERATION_FAILED with the operation error message', async () => {
  const { client } = fakeClient([{ body: { status: 'FAILED', error: { message: 'Display name taken' } }, headers: {} }]);
  await assert.rejects(waitForOperation(client, 'https://memory.twilio.com/v1/ControlPlane/Operations/x', { sleep: noSleep }), (err) => {
    assert.equal(err.code, 'OPERATION_FAILED');
    assert.match(err.message, /Display name taken/);
    return true;
  });
});

test('times out with OPERATION_TIMEOUT', async () => {
  let clock = 0;
  const pending = { body: { status: 'PENDING' }, headers: {} };
  const { client } = fakeClient(Array.from({ length: 50 }, () => pending));
  await assert.rejects(
    waitForOperation(client, 'https://memory.twilio.com/v1/ControlPlane/Operations/x', { sleep: async () => {}, now: () => (clock += 10000), timeoutMs: 30000 }),
    (err) => err.code === 'OPERATION_TIMEOUT',
  );
});

test('honors Retry-After (seconds) and backs off otherwise', async () => {
  const sleep = mock.fn(async () => {});
  const { client } = fakeClient([
    { body: { status: 'PENDING' }, headers: { 'retry-after': '2' } },
    { body: { status: 'PENDING' }, headers: {} },
    { body: { status: 'COMPLETED' }, headers: {} },
  ]);
  await waitForOperation(client, 'https://memory.twilio.com/v1/ControlPlane/Operations/x', { sleep });
  assert.deepEqual(sleep.mock.calls.map((c) => c.arguments[0]), [2000, 1500]);
});

test('missing statusUrl is an OPERATION_FAILED error', async () => {
  await assert.rejects(waitForOperation({}, undefined), (err) => err.code === 'OPERATION_FAILED');
});

test('pollUntil returns the first value that satisfies isDone', async () => {
  const values = [1, 2, 3];
  const result = await pollUntil(async () => ({ value: values.shift() }), (v) => v === 2, { sleep: async () => {} });
  assert.equal(result, 2);
});
