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
var Mongo = require('../mongo');

// Test helpers
var helpers = require('./helpers');

describe('Mongo', function() {
  // Set max timeout allowed
  this.timeout(10000);

  // Variables
  var mongo;

  // Begin tests
  // ---

  beforeEach(function(done) {
    // Creates a new product model for each test
    mongo = new Mongo();

    return mongo.eraseCollection('tests').tap(function(docs) {
      return mongo.dropAllIndexes('tests');
    }).then(function(docs) {
      return mongo.insert('tests', helpers.getFixture('docs'));
    }).then(function(docs) {
      done();
    }).catch(done);
  });



  describe('Helpers', function() {
    it('#newObjectId and #newObjectIdHexString', function() {
      var objectId = mongo.newObjectId();
      var objectIdString = mongo.newObjectIdHexString();
      assert.isTrue(mongo.isValidObjectID(objectId), true);
      assert.isTrue(mongo.isValidObjectID(objectIdString), true);
    });

    it('#isValidObjectID', function() {
      assert.isTrue(mongo.isValidObjectID('538b7c95c883570700ee9644'), true);
      assert.isFalse(mongo.isValidObjectID('12345'), true);
      assert.isFalse(mongo.isValidObjectID(12345), true);
    });

    it('#isValidISO8601String', function() {
      // YYYY-MM-DDTHH:mm:ss.SSSZ
      assert.isTrue(mongo.isValidISO8601String('2013-11-18T09:04:24.447Z'), true);
      assert.isFalse(mongo.isValidISO8601String((new Date()).toString()), true);
      assert.isFalse(mongo.isValidISO8601String((new Date()).getTime()), true);
      assert.isFalse(mongo.isValidISO8601String(new Date()), true);
    });

    it('#cast from js', function() {
      var uncasted = require('./fixtures/uncasted')(mongo);
      var casted = require('./fixtures/casted')(mongo);

      assert.deepEqual(mongo.cast(uncasted), casted);
    });

    it('#cast from json', function() {
      var uncasted = helpers.getFixture('uncasted');
      var casted = require('./fixtures/casted')(mongo);

      assert.deepEqual(mongo.cast(uncasted), casted);
    });

    it('#uncast', function() {
      var casted = require('./fixtures/casted')(mongo);
      var uncasted = require('./fixtures/uncasted')(mongo);

      assert.deepEqual(mongo.uncast(casted), uncasted);
    });
  });



  describe('Connection', function() {
    it('#connect', function() {
      return mongo.connect().then(function(db) {
        assert.isTrue(db instanceof Mongo.mongodb.Db);
      });
    });

    it('#collection', function() {
      return mongo.collection('tests').then(function(collection) {
        assert.isTrue(collection instanceof Mongo.mongodb.Collection);
      });
    });
  });



  describe('Cursors', function() {
    it('#findCursor', function() {
      return mongo.findCursor('tests', {}).then(function(cursor) {
        assert.isTrue(typeof cursor.toArray === 'function');
        assert.isTrue(typeof cursor.each === 'function');
        assert.isTrue(typeof cursor.nextObject === 'function');
      });
    });

    it('#count', function() {
      return mongo.count('tests', {}).then(function(count) {
        assert.strictEqual(count, 2);
      });
    });

    it('#find', function() {
      return mongo.find('tests', {}).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, mongo.uncast(mongo.cast(helpers.getFixture('docs'))));
      });
    });

    it('#find with snapshot', function() {
      return mongo.find('tests', {}, {
        snapshot: true
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, mongo.uncast(mongo.cast(helpers.getFixture('docs'))));
      });
    });

    it('#find with timeout', function() {
      return mongo.find('tests', {}, {
        timeout: true
      }).then(function(results) {
        var docs = results[0];
        var cursor = results[2];
        assert.isTrue(cursor.timeout);
        assert.deepEqual(docs, mongo.uncast(mongo.cast(helpers.getFixture('docs'))));
      });
    });

    it('#find with fields', function() {
      return mongo.find('tests', {}, {
        fields: {
          cost: 1,
          seq: 1
        }
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, [{
          _id: '538b7c95c883570700ee9644',
          cost: 100,
          seq: 1000
        }, {
          _id: '538b7c95c883570700ee9646',
          cost: 200,
          seq: 2000
        }]);
      });
    });

    it('#find with limit', function() {
      return mongo.find('tests', {}, {
        limit: 1
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, mongo.uncast(mongo.cast(helpers.getFixture('docs'))).splice(0, 1));
      });
    });

    it('#find with skip', function() {
      return mongo.find('tests', {}, {
        skip: 1
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, mongo.uncast(mongo.cast(helpers.getFixture('docs'))).splice(1, 1));
      });
    });

    it('#find with sort', function() {
      return mongo.find('tests', {}, {
        sort: [
          ['seq', 'desc']
        ]
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs[0], mongo.uncast(mongo.cast(helpers.getFixture('docs')))[1]);
      });
    });

    it('#find with explain', function() {
      return mongo.find('tests', {}, {
        explain: true
      }).then(function(results) {
        var explanations = results[0];
        assert.isArray(explanations);
        assert.isString(explanations[0].cursor);
        assert.isNumber(explanations[0].n);
      });
    });

    it('#find with hint', function() {
      return mongo.find('tests', {}, {
        hint: 'cost_1'
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, mongo.uncast(mongo.cast(helpers.getFixture('docs'))));
      });
    });

    it('#findOne', function() {
      return mongo.findOne('tests', {
        _id: '538b7c95c883570700ee9646'
      }).then(function(doc) {
        assert.deepEqual(doc, mongo.uncast(mongo.cast(helpers.getFixture('docs')))[1]);
      });
    });
  });



  describe('Collections', function() {
    it('#insert', function() {
      return mongo.insert('tests', helpers.getFixture('doc')).then(function(docs) {
        assert.deepEqual(docs, [mongo.uncast(mongo.cast(helpers.getFixture('doc')))]);
      });
    });

    it('#update', function() {
      var updatedDoc = {
        updated: true
      };
      return mongo.update('tests', {
        _id: '538b7c95c883570700ee9646'
      }, updatedDoc).then(function(num) {
        assert.deepEqual(num, 1);
      });
    });

    it('#findAndModify', function() {
      var updatedDoc = {
        updated: true
      };
      return mongo.findAndModify('tests', {
        _id: '538b7c95c883570700ee9646'
      }, updatedDoc).then(function(doc) {
        assert.isTrue(doc.updated);
      });
    });

    it('#remove', function() {
      return mongo.remove('tests', {
        _id: '538b7c95c883570700ee9644'
      }).then(function(num) {
        assert.strictEqual(num, 1);
      });
    });

    it('#aggregate', function() {
      var pipeline = [{
        '$match': {
          user_id: '538b7c95c883570700ee9744'
        }
      }, {
        '$group': {
          _id: '$user_id',
          cost: {
            '$sum': '$cost'
          }
        }
      }];
      return mongo.aggregate('tests', pipeline).then(function(results) {
        assert.strictEqual(results[0].cost, 300);
      });
    });

    it('#getNextSequence', function() {
      var updatedDoc = {
        updated: true
      };
      return mongo.getNextSequence('tests', {
        _id: '538b7c95c883570700ee9646'
      }, updatedDoc).then(function(seq) {
        assert.strictEqual(seq, 2001);
      });
    });

    it('#ensureIndex', function() {
      return mongo.ensureIndex('tests', {
        cost: 1
      }).then(function(indexName) {
        // index name is auto generated
        assert.strictEqual(indexName, 'cost_1');

        return mongo.find('tests', {
          cost: 100
        }, {
          explain: true
        });
      }).then(function(result) {
        var explanation = result[0][0];

        // the index should be used
        assert.ok(explanation.indexBounds.cost);
      });
    });

    it('#dropIndex', function() {
      return mongo.ensureIndex('tests', {
        cost: 1
      }).then(function(indexName) {
        return mongo.dropIndex('tests', 'cost_1');
      }).then(function(result) {
        assert.strictEqual(result.ok, 1);
      });
    });

    it('#indexInformation', function() {
      return mongo.indexInformation('tests', {
        full: false
      }).then(function(indexInformation) {
        assert.deepEqual(indexInformation._id_, [
          ['_id', 1]
        ]);
      });
    });

    it('#indexInformation full', function() {
      return mongo.indexInformation('tests', {
        full: true
      }).then(function(indexInformation) {
        assert.deepEqual(indexInformation[0].key, {
          _id: 1
        });
      });
    });
  });
});
