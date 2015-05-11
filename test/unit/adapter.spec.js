'use strict';

var Adapter = require('../../adapter');

describe('Adapter', function() {
  var adapter;

  beforeEach(function() {
    adapter = new Adapter();
  });

  describe('#_extractError', function() {
    it('should with string', function() {
      var message = adapter._extractError('Hello World!');
      assert.strictEqual(message, 'Hello World!');
    });

    it('should with object', function() {
      var message;
      message = adapter._extractError({
        error: 'Hello World!'
      });
      assert.strictEqual(message, 'Hello World!');

      message = adapter._extractError({
        msg: 'Hello World!'
      });
      assert.strictEqual(message, 'Hello World!');

      message = adapter._extractError({
        message: 'Hello World!'
      });
      assert.strictEqual(message, 'Hello World!');
    });

    it('should with nested object error', function() {
      var message;
      message = adapter._extractError({
        error: {
          error: 'Hello World!'
        }
      });
      assert.strictEqual(message, 'Hello World!');

      message = adapter._extractError({
        error: {
          msg: 'Hello World!'
        }
      });
      assert.strictEqual(message, 'Hello World!');

      message = adapter._extractError({
        error: {
          message: 'Hello World!'
        }
      });
      assert.strictEqual(message, 'Hello World!');
    });

    it('should with meta', function() {
      var message = adapter._extractError({
        meta: {
          error_message: 'Hello World!'
        }
      });
      assert.strictEqual(message, 'Hello World!');
    });

    it('should with unknown format', function() {
      var message = adapter._extractError({
        unknown: 'Hello World'
      });
      assert.strictEqual(message, 'Unknown Request Error');
    });

  });

  describe.skip('#_buildRequestOptions', function() {
    describe('Default', function() {
      it('should with no options', function() {
        var requestOptions = adapter._buildRequestOptions();
        assert.deepEqual(requestOptions, {
          headers: {},
          method: 'GET',
          qs: {},
          url: ''
        });
      });

      it('should with urlRoot', function() {
        adapter.urlRoot = 'https://www.google.com';
        var requestOptions = adapter._buildRequestOptions();
        assert.deepEqual(requestOptions, {
          headers: {},
          method: 'GET',
          qs: {},
          url: 'https://www.google.com'
        });
      });

      it('should with urlRoot and path', function() {
        adapter.urlRoot = 'https://www.google.com';
        var requestOptions = adapter._buildRequestOptions({
          path: '/doodles'
        });
        assert.deepEqual(requestOptions, {
          headers: {},
          method: 'GET',
          qs: {},
          url: 'https://www.google.com/doodles'
        });
      });

      it('should with url', function() {
        adapter.urlRoot = 'https://www.google.com';
        var requestOptions = adapter._buildRequestOptions({
          url: 'https://www.google.com/doodles'
        });
        assert.deepEqual(requestOptions, {
          headers: {},
          method: 'GET',
          qs: {},
          url: 'https://www.google.com/doodles'
        });
      });

      it('should with method', function() {
        var requestOptions = adapter._buildRequestOptions({
          method: 'POST'
        });
        assert.deepEqual(requestOptions, {
          headers: {},
          method: 'POST',
          qs: {},
          url: ''
        });
      });

      it('should with qs', function() {
        var requestOptions = adapter._buildRequestOptions({
          qs: {
            string: 'string',
            number: 1337,
            bool: true
          }
        });
        assert.deepEqual(requestOptions, {
          headers: {},
          method: 'GET',
          qs: {
            string: 'string',
            number: 1337,
            bool: true
          },
          url: ''
        });
      });

      it('should with headers', function() {
        var requestOptions = adapter._buildRequestOptions({
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        assert.deepEqual(requestOptions, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          method: 'GET',
          qs: {},
          url: ''
        });
      });
    });

    describe('FORM, BODY, JSON', function() {
      it('should with form', function() {
        var requestOptions = adapter._buildRequestOptions({
          form: {
            string: 'string',
            number: 1337,
            bool: true
          }
        });
        assert.deepEqual(requestOptions, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
          },
          method: 'GET',
          qs: {},
          url: '',
          form: {
            string: 'string',
            number: 1337,
            bool: true
          }
        });
      });

      it('should with body', function() {
        var requestOptions = adapter._buildRequestOptions({
          body: {
            string: 'string',
            number: 1337,
            bool: true
          }
        });
        assert.deepEqual(requestOptions, {
          headers: {},
          method: 'GET',
          qs: {},
          url: '',
          body: {
            string: 'string',
            number: 1337,
            bool: true
          }
        });
      });

      it('should with json', function() {
        var requestOptions = adapter._buildRequestOptions({
          json: {
            string: 'string',
            number: 1337,
            bool: true
          }
        });
        assert.deepEqual(requestOptions, {
          headers: {},
          method: 'GET',
          qs: {},
          url: '',
          json: {
            string: 'string',
            number: 1337,
            bool: true
          }
        });
      });
    });

    describe('Authorization', function() {
      it('should with access_token', function() {
        var requestOptions = adapter._buildRequestOptions({
          access_token: '1234'
        });
        assert.deepEqual(requestOptions, {
          headers: {
            'Authorization': 'Bearer 1234'
          },
          method: 'GET',
          qs: {},
          url: ''
        });
      });

      it('should with oauth_token', function() {
        var requestOptions = adapter._buildRequestOptions({
          oauth_token: '5678'
        });
        assert.deepEqual(requestOptions, {
          headers: {
            'Authorization': 'OAuth 5678'
          },
          method: 'GET',
          qs: {},
          url: ''
        });
      });

      it('should with authorization_token', function() {
        var requestOptions = adapter._buildRequestOptions({
          authorization_token: '1337'
        });
        assert.deepEqual(requestOptions, {
          headers: {
            'Authorization': '1337'
          },
          method: 'GET',
          qs: {},
          url: ''
        });
      });

      it('should with basic auth', function() {
        var requestOptions = adapter._buildRequestOptions({
          auth: {
            user: 'username',
            pass: 'password',
            sendImmediately: false
          }
        });
        assert.deepEqual(requestOptions, {
          headers: {},
          method: 'GET',
          qs: {},
          url: '',
          auth: {
            user: 'username',
            pass: 'password',
            sendImmediately: false
          }
        });
      });
    });
  });
});
