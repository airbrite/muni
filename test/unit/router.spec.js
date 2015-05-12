'use strict';

var Router = require('../../router');
var BootieError = require('../../error');

describe('Router', function() {
  var req;
  var router;

  beforeEach(function() {
    router = new Router();
  });

  describe('#_buildMissingParams', function() {
    beforeEach(function() {
      req = {
        // Replicates `req.param` functionality from Express
        param: function(name) {
          return req.body[name] || req.query[name];
        },

        params: {},
        body: {
          foo: 'bar'
        },
        query: {
          hello: 'world'
        }
      };
    });

    it('should not find in body or query', function() {
      var missingParams = router._buildMissingParams(req, ['required', 'another']);
      assert.deepEqual(missingParams, ['required', 'another']);
    });

    it('should find in body', function() {
      var missingParams = router._buildMissingParams(req, ['foo']);
      assert.deepEqual(missingParams, []);
    });

    it('should find in query', function() {
      var missingParams = router._buildMissingParams(req, ['hello']);
      assert.deepEqual(missingParams, []);
    });
  });

  describe('#_buildMissingParamsError', function() {
    it('should return an error', function() {
      var err = router._buildMissingParamsError(['foo', 'bar', 'world']);
      assert.instanceOf(err, BootieError);
      assert.isString(err.stack);
      assert.strictEqual(err.name, 'BootieError');
      assert.strictEqual(err.message, 'Missing `foo`, `bar`, `world` parameter(s).');
      assert.strictEqual(err.code, 400);
    });
  });
});
