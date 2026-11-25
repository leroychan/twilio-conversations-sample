const test = require('node:test');
const assert = require('node:assert/strict');

const SENTIMENT = 'intelligence_operator_01kcrvw16kfa88qvgrfmr7y151';
const SUMMARY = 'intelligence_operator_01kcv35pnkeysaf6z6cqtbpegn';
const CUSTOM = 'intelligence_operator_custom';
const opts = { names: { [SENTIMENT]: 'Sentiment (Twilio)', [SUMMARY]: 'Summary (Twilio)' }, customOperatorId: CUSTOM };

const result = (id, operatorId, value, extra = {}) => ({
  id,
  operator: { id: operatorId },
  dateCreated: '2026-11-25T01:00:00Z',
  executionDetails: { trigger: { on: 'COMMUNICATION' } },
  result: value,
  ...extra,
});

const load = () => import('../public/lib/insights.js');

test('sentiment labels become a coloured label', async () => {
  const { describeResult } = await load();
  const d = describeResult(result('r1', SENTIMENT, { label: 'negative' }, { outputFormat: 'CLASSIFICATION' }), opts);
  assert.equal(d.name, 'Sentiment (Twilio)');
  assert.equal(d.kind, 'label');
  assert.equal(d.label, 'negative');
  assert.equal(d.tone, 'danger');
  assert.equal(d.trigger, 'COMMUNICATION');
});

test('summary text becomes a paragraph', async () => {
  const { describeResult } = await load();
  const d = describeResult(result('r2', SUMMARY, { text: 'Customer asked to upgrade.' }), opts);
  assert.equal(d.kind, 'text');
  assert.equal(d.text, 'Customer asked to upgrade.');
});

test('custom JSON becomes labelled fields: tick, percentage and quote', async () => {
  const { describeResult } = await load();
  const d = describeResult(result('r3', CUSTOM, { upsellIntent: true, confidence: 0.82, evidence: 'can I upgrade?' }), opts);
  assert.equal(d.name, 'Your custom operator');
  assert.equal(d.kind, 'fields');
  assert.deepEqual(d.fields, [
    { label: 'Upsell intent', kind: 'boolean', value: true },
    { label: 'Confidence', kind: 'percent', value: 82 },
    { label: 'Evidence', kind: 'quote', value: 'can I upgrade?' },
  ]);
});

test('unknown shapes still render: nested values as JSON, empty strings as a dash', async () => {
  const { describeResult } = await load();
  const d = describeResult(result('r4', 'intelligence_operator_other', { categories: [{ key: 'greet' }], note: '', count: 1 }), opts);
  assert.equal(d.name, 'intelligence_operator_other');
  assert.deepEqual(d.fields, [
    { label: 'Categories', kind: 'json', value: '[{"key":"greet"}]' },
    { label: 'Note', kind: 'text', value: '—' },
    { label: 'Count', kind: 'text', value: '1' },
  ]);
  assert.equal(describeResult(result('r5', SUMMARY, null), opts).kind, 'empty');
  assert.equal(describeResult(result('r6', SUMMARY, 'plain'), opts).kind, 'text');
});

test('mergeResults dedupes by id and sorts oldest first', async () => {
  const { mergeResults } = await load();
  const a = result('r1', SENTIMENT, { label: 'positive' }, { dateCreated: '2026-11-25T01:00:02Z' });
  const b = result('r2', SENTIMENT, { label: 'negative' }, { dateCreated: '2026-11-25T01:00:01Z' });
  const merged = mergeResults([a], [b, { ...a }]);
  assert.deepEqual(merged.map((r) => r.id), ['r2', 'r1']);
});

test('groupByOperator keeps the newest result first in each group', async () => {
  const { groupByOperator, describeResult } = await load();
  const described = [
    result('r1', SENTIMENT, { label: 'positive' }),
    result('r2', SUMMARY, { text: 'x' }),
    result('r3', SENTIMENT, { label: 'negative' }),
  ].map((r) => describeResult(r, opts));
  const groups = groupByOperator(described);
  assert.deepEqual(groups.map((g) => [g.name, g.items.map((i) => i.id)]), [
    ['Sentiment (Twilio)', ['r3', 'r1']],
    ['Summary (Twilio)', ['r2']],
  ]);
});
