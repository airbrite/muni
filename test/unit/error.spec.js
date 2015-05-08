'use strict';

var BootieError = require('../../error');

describe('Error', function() {
  it('should create a custom BootieError with message and code', function() {
    var error = new BootieError('I am a BootieError.', 400);
    assert.instanceOf(error, BootieError);
    assert.isString(error.stack);
    assert.strictEqual(error.name, 'BootieError');
    assert.strictEqual(error.message, 'I am a BootieError.');
    assert.strictEqual(error.code, 400);
  });
});
