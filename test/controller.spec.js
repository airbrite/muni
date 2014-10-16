'use strict';

var fs = require('fs');
var _ = require('lodash');
var chai = require('chai');
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var assert = require('chai').assert;
var sinon = require('sinon');
var Promise = require('bluebird');
var sinonAsPromised = require('sinon-as-promised')(Promise);

var Model = require('../model');
var Controller = require('../controller');

require('../mixins');

// Eyes
console.inspect = require('eyes').inspector({
  maxLength: 32768,
  sortObjectKeys: true,
  hideFunctions: true
});

// Test helpers
var helpers = require('./helpers');

describe('Controller', function() {
  // Set max timeout allowed
  this.timeout(10000);

  describe('#parseQueryString', function() {
    var controller;
    var req;
    beforeEach(function() {
      controller = new Controller();
      req = {
        query: {},
        body: {},
        params: {}
      };
    });

    it('should parse with empty req', function() {
      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {},
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with limit and skip', function() {
      req.query = {
        limit: 2,
        skip: 3
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 2,
        query: {},
        skip: 3,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with sort and order', function() {
      req.query = {
        sort: 'updated',
        order: 'asc'
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {},
        skip: 0,
        sort: [
          ['updated', 'asc']
        ],
        fields: {}
      });
    });

    it('should parse with created (seconds)', function() {
      req.query = {
        created: {
          gt: '1412804866'
        }
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            created: {
              '$gt': 1412804866000
            }
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with created (milliseconds)', function() {
      req.query = {
        created: {
          lt: '1412804866321'
        }
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            created: {
              '$lt': 1412804866321
            }
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with updated (seconds)', function() {
      req.query = {
        updated: {
          gte: '1412804866'
        }
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            updated: {
              '$gte': 1412804866000
            }
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with updated (milliseconds)', function() {
      req.query = {
        updated: {
          lte: '1412804866789'
        }
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            updated: {
              '$lte': 1412804866789
            }
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with created, ne', function() {
      req.query = {
        created: {
          ne: '1412804866789'
        }
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            created: {
              '$ne': 1412804866789
            }
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with queryParams and logical default', function() {
      controller.queryParams = function() {
        return {
          foo: 'string'
        };
      };

      req.query = {
        foo: 'bar'
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            foo: 'bar'
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with queryParams and logical or', function() {
      controller.queryParams = function() {
        return {
          foo: 'string',
          hey: 'integer'
        };
      };

      req.query = {
        logical: 'or',
        foo: 'bar',
        hey: '1234'
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$or': [{
            foo: 'bar'
          }, {
            hey: 1234
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with queryParams and logical and', function() {
      controller.queryParams = function() {
        return {
          foo: 'string',
          hey: 'float'
        };
      };

      req.query = {
        logical: 'and',
        foo: 'bar',
        hey: 12.34
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            foo: 'bar'
          }, {
            hey: 12.34
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with queryParams regex', function() {
      controller.queryParams = function() {
        return {
          foo: 'regex'
        };
      };

      req.query = {
        foo: 'bar'
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            foo: {
              '$options': 'i',
              '$regex': 'bar'
            }
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with queryParams integer', function() {
      controller.queryParams = function() {
        return {
          foo: 'integer'
        };
      };

      req.query = {
        foo: '1234'
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            foo: 1234
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should parse with queryParams float', function() {
      controller.queryParams = function() {
        return {
          foo: 'float'
        };
      };

      req.query = {
        foo: 56.78
      };

      var qo = controller.parseQueryString(req);

      assert.deepEqual(qo, {
        limit: 100,
        query: {
          '$and': [{
            foo: 56.78
          }]
        },
        skip: 0,
        sort: [
          ['created', 'desc']
        ],
        fields: {}
      });
    });

    it('should #parseQueryString with optional options object', function() {
      controller.queryParams = function() {
        return {
          foo: 'float'
        };
      };

      var qo = controller.parseQueryString(req, {
        queryParams: {
          foo: 'integer'
        },
        limit: 2,
        skip: 3,
        sort: [
          ['updated', 'asc']
        ],
        fields: {
          foo: 1,
          bar: 1
        }
      });

      assert.deepEqual(qo, {
        fields: {
          foo: 1,
          bar: 1
        },
        limit: 2,
        query: {},
        skip: 3,
        sort: [
          [
            'created',
            'desc'
          ]
        ]
      });
    });

    it('should parse fields', function() {
      req.query = {
        fields: 'foo,bar'
      };

      var qo = controller.parseQueryString(req, {
        fields: {
          foo: 1,
          bar: 1
        }
      });

      assert.deepEqual(qo, {
        fields: {
          bar: 1,
          foo: 1
        },
        limit: 100,
        query: {},
        skip: 0,
        sort: [
          [
            'created',
            'desc'
          ]
        ]
      });

    });

  });

});
