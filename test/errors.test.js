const test = require('node:test');
const assert = require('node:assert/strict');
const { PrereqError, requireState, requireValue, requireClient, toErrorInfo, hintFor } = require('../lib/errors');

test('requireState names the step that creates each missing value', () => {
  assert.throws(() => requireState({ storeId: null, profileId: null }, ['storeId', 'profileId']), (err) => {
    assert.ok(err instanceof PrereqError);
    assert.match(err.message, /Step 1.*Step 2/);
    return true;
  });
  assert.doesNotThrow(() => requireState({ storeId: 'x' }, ['storeId']));
});

test('requireValue and requireClient throw PrereqError', () => {
  assert.throws(() => requireValue('', 'need it'), /need it/);
  assert.throws(() => requireClient(null), /credentials/);
  assert.equal(requireValue('ok', 'x'), 'ok');
});

test('toErrorInfo copies Twilio RestException fields', () => {
  const err = Object.assign(new Error('Forbidden'), { status: 403, code: 20403, moreInfo: 'https://twilio.com/docs/errors/20403', details: { a: 1 } });
  assert.deepEqual(toErrorInfo(err), { name: 'Error', status: 403, code: 20403, message: 'Forbidden', moreInfo: 'https://twilio.com/docs/errors/20403', details: { a: 1 } });
});

test('hints cover the common beginner failures', () => {
  assert.match(hintFor({ status: 401, message: 'Authenticate' }), /TWILIO_API_KEY/);
  assert.match(hintFor({ status: 403, message: 'Forbidden' }), /new Twilio Console/);
  assert.match(hintFor({ status: 404, message: 'Not found' }), /Reset/);
  assert.match(hintFor({ status: 400, message: 'Configuration limit exceeded' }), /limit/);
  assert.match(hintFor({ code: 'OPERATION_TIMEOUT', message: 'x' }), /still processing/);
  assert.equal(hintFor({ code: 'PREREQUISITE', message: 'Do step 1' }), 'Do step 1');
  assert.equal(hintFor({ status: 500, message: 'oops' }), null);
});

test('limit and capture-rule hints only match those failures', () => {
  const LIMIT = /account limit/;
  const OVERLAP = /already captures this number/;
  assert.match(hintFor({ status: 400, message: 'Configuration limit exceeded' }), LIMIT);
  assert.match(hintFor({ status: 400, message: 'Store limit reached' }), LIMIT);
  assert.match(hintFor({ status: 400, message: 'Maximum number of configurations reached' }), LIMIT);
  assert.match(hintFor({ status: 429, message: 'Quota exceeded' }), LIMIT);
  assert.doesNotMatch(hintFor({ status: 400, message: 'displayName maximum length is 64' }), LIMIT);
  assert.match(hintFor({ status: 409, message: 'Capture rule already exists for +15550001111' }), OVERLAP);
  assert.match(hintFor({ status: 409, message: 'Address overlaps with another configuration' }), OVERLAP);
  assert.doesNotMatch(hintFor({ status: 409, message: 'Conflict: displayName already in use' }) || '', OVERLAP);
});
