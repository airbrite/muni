'use strict';

var MuniError = require('../../error');

describe('Error', function() {
  it('should create a custom MuniError with message and code', function() {
    var error = new MuniError('I am a MuniError.', 400);
    assert.instanceOf(error, MuniError);
    assert.isString(error.stack);
    assert.strictEqual(error.name, 'MuniError');
    assert.strictEqual(error.message, 'I am a MuniError.');
    assert.strictEqual(error.code, 400);
  });
});
