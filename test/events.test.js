const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventBus } = require('../lib/events');

test('publish stores events and notifies subscribers', () => {
  const bus = createEventBus();
  const seen = [];
  const unsubscribe = bus.subscribe((e) => seen.push(e));
  const event = bus.publish('orchestrator', 'COMMUNICATION_CREATED', { a: 1 });
  assert.equal(event.source, 'orchestrator');
  assert.equal(seen.length, 1);
  unsubscribe();
  bus.publish('orchestrator', 'X', {});
  assert.equal(seen.length, 1);
  assert.equal(bus.recent().length, 2);
});

test('ring buffer keeps only the newest events', () => {
  const bus = createEventBus({ size: 3 });
  for (let i = 0; i < 5; i += 1) bus.publish('channels', `E${i}`, {});
  assert.deepEqual(bus.recent().map((e) => e.type), ['E2', 'E3', 'E4']);
});

test('recent accepts a filter and clear empties the buffer', () => {
  const bus = createEventBus();
  bus.publish('intelligence', 'A', {});
  bus.publish('channels', 'B', {});
  assert.equal(bus.recent((e) => e.source === 'intelligence').length, 1);
  bus.clear();
  assert.equal(bus.recent().length, 0);
});

test('event ids are unique across server restarts (new buses)', () => {
  const a = createEventBus().publish('x', 'y', {});
  const b = createEventBus().publish('x', 'y', {});
  assert.notEqual(a.id, b.id);
});

test('a throwing subscriber does not break publishing', () => {
  const bus = createEventBus();
  bus.subscribe(() => { throw new Error('boom'); });
  assert.doesNotThrow(() => bus.publish('x', 'y', {}));
});
