'use strict';

var _ = require('lodash');
var Mongo = require('../../mongo');
var Mixins = require('../../mixins');
var mongodb = require('mongodb');

// Test helpers
var helpers = require('../helpers');

describe('Mongo', function() {
  var mongo;

  beforeEach(function() {
    mongo = new Mongo();
  });

  describe('Helpers', function() {
    describe('Cast', function() {
      it('should cast ObjectId', function() {
        var fixture = helpers.getFixture('mongo/doc');
        var casted = mongo.cast(fixture);
        assert.deepEqual(casted, require('../fixtures/mongo/casted.js')());
      });
    });

    describe('Uncast', function() {
      it('should uncast ObjectId', function() {
        var fixture = helpers.getFixture('mongo/doc');
        var casted = require('../fixtures/mongo/casted.js')();
        assert.deepEqual(mongo.uncast(casted), fixture);
      });

      it('#uncast undefined is undefined', function() {
        var uncasted = mongo.uncast(undefined);
        assert.isUndefined(uncasted);
      });

      it('#uncast null is null', function() {
        var uncasted = mongo.uncast(null);
        assert.isNull(uncasted);
      });
    });
  });

  describe('Connection', function() {
    it('#connect', function() {
      return mongo.connect().then(function(db) {
        assert.isTrue(db instanceof mongodb.Db);
      });
    });

    it('#_collection', function() {
      return mongo._collection('tests').then(function(collection) {
        assert.isTrue(collection instanceof mongodb.Collection);
      });
    });

    it('#_cursor', function() {
      return mongo._cursor('tests').then(function(cursor) {
        assert.isTrue(cursor instanceof mongodb.Cursor);
      });
    });
  });

  describe('Insert', function() {
    // Erase collection, drop all indexes, don't insert test data
    beforeEach(function() {
      return mongo.eraseCollection('tests').then(function() {
        return mongo.dropAllIndexes('tests');
      });
    });
    it('single document', function() {
      return mongo.insert('tests', helpers.getFixture('mongo/doc')).then(function(docs) {
        assert.deepEqual(docs, [helpers.getFixture('mongo/doc')]);
      });
    });

    it('multiple documents', function() {
      return mongo.insert('tests', helpers.getFixture('mongo/docs')).then(function(docs) {
        assert.deepEqual(docs, helpers.getFixture('mongo/docs'));
      });
    });
  });

  describe('Cursor', function() {
    // Erase collection, drop all indexes, and insert test data
    beforeEach(function() {
      return mongo.eraseCollection('tests').then(function() {
        return mongo.dropAllIndexes('tests');
      }).then(function() {
        return mongo.insert('tests', helpers.getFixture('mongo/docs'));
      });
    });

    it('should return a cursor using #findCursor', function() {
      return mongo.findCursor('tests', {}).then(function(cursor) {
        assert.isTrue(typeof cursor.toArray === 'function');
        assert.isTrue(typeof cursor.each === 'function');
        assert.isTrue(typeof cursor.nextObject === 'function');
        assert.isTrue(typeof cursor.nextObjectAsync === 'function');
      });
    });

    it('should #nextObjectAsync to loop over all documents', function() {
      var docs = [];
      return mongo.findCursor('tests', {}).then(function next(cursor) {
        return cursor.nextObjectAsync().then(function(doc) {
          if (!doc) {
            return docs;
          }
          docs.push(doc);
          return next(cursor);
        });
      }).then(function(docs) {
        assert.deepEqual(docs, helpers.getFixture('mongo/docs'));
      });
    });
  });

  describe('Find', function() {
    // Erase collection, drop all indexes, and insert test data
    beforeEach(function() {
      return mongo.eraseCollection('tests').then(function() {
        return mongo.dropAllIndexes('tests');
      }).then(function() {
        return mongo.insert('tests', helpers.getFixture('mongo/docs'));
      });
    });

    it('with empty query', function() {
      return mongo.find('tests', {}).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, helpers.getFixture('mongo/docs'));
      });
    });

    it('with `_id` query', function() {
      return mongo.find('tests', {
        _id: '538b7c95c883570700ee9644'
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, helpers.getFixture('mongo/docs').slice(0, 1));
      });
    });

    it('with snapshot', function() {
      return mongo.find('tests', {}, {
        snapshot: true
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, helpers.getFixture('mongo/docs'));
      });
    });

    it('with fields', function() {
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

    it('with limit', function() {
      return mongo.find('tests', {}, {
        limit: 1
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, helpers.getFixture('mongo/docs').splice(0, 1));
      });
    });

    it('with skip', function() {
      return mongo.find('tests', {}, {
        skip: 1
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs, helpers.getFixture('mongo/docs').splice(1, 1));
      });
    });

    it('with sort', function() {
      return mongo.find('tests', {}, {
        sort: [
          ['seq', 'desc']
        ]
      }).then(function(results) {
        var docs = results[0];
        assert.deepEqual(docs[0], helpers.getFixture('mongo/docs')[1]);
      });
    });

    it('count (total) should not apply limit and skip', function() {
      return mongo.find('tests', {}, {
        limit: 1,
        skip: 1
      }).then(function(results) {
        assert.lengthOf(results[0], 1);
        assert.strictEqual(results[1], 2);
      });
    });
  });

  describe('FindOne', function() {
    // Erase collection, drop all indexes, and insert test data
    beforeEach(function() {
      return mongo.eraseCollection('tests').then(function() {
        return mongo.dropAllIndexes('tests');
      }).then(function() {
        return mongo.insert('tests', helpers.getFixture('mongo/docs'));
      });
    });

    it('#findOne', function() {
      return mongo.findOne('tests', {
        _id: '538b7c95c883570700ee9646'
      }).then(function(doc) {
        assert.deepEqual(doc, helpers.getFixture('mongo/docs')[1]);
      });
    });

    it('#findOne with fields', function() {
      return mongo.findOne('tests', {}, {
        fields: {
          cost: 1,
          seq: 1
        }
      }).then(function(doc) {
        assert.deepEqual(doc, {
          _id: '538b7c95c883570700ee9644',
          cost: 100,
          seq: 1000
        });
      });
    });
  });

  describe('Count', function() {
    // Erase collection, drop all indexes, and insert test data
    beforeEach(function() {
      return mongo.eraseCollection('tests').then(function() {
        return mongo.dropAllIndexes('tests');
      }).then(function() {
        return mongo.insert('tests', helpers.getFixture('mongo/docs'));
      });
    });

    it('#count', function() {
      return mongo.count('tests', {}).then(function(count) {
        assert.strictEqual(count, 2);
      });
    });
  });

  describe('Update and FindAndModify', function() {
    // Erase collection, drop all indexes, and insert test data
    beforeEach(function() {
      return mongo.eraseCollection('tests').then(function() {
        return mongo.dropAllIndexes('tests');
      }).then(function() {
        return mongo.insert('tests', helpers.getFixture('mongo/docs'));
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
  });

  describe('Remove', function() {
    // Erase collection, drop all indexes, and insert test data
    beforeEach(function() {
      return mongo.eraseCollection('tests').then(function() {
        return mongo.dropAllIndexes('tests');
      }).then(function() {
        return mongo.insert('tests', helpers.getFixture('mongo/docs'));
      });
    });

    it('#remove', function() {
      return mongo.remove('tests', {
        _id: '538b7c95c883570700ee9644'
      }).then(function(num) {
        assert.strictEqual(num, 1);
      });
    });
  });

  describe('Aggregate', function() {
    // Erase collection, drop all indexes, and insert test data
    beforeEach(function() {
      return mongo.eraseCollection('tests').then(function() {
        return mongo.dropAllIndexes('tests');
      }).then(function() {
        return mongo.insert('tests', helpers.getFixture('mongo/docs'));
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
  });

  describe('Counters', function() {
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
  });

  describe('Index', function() {
    it('#ensureIndex', function() {
      return mongo.ensureIndex('tests', {
        cost: 1
      }).then(function(indexName) {
        // index name is auto generated
        assert.strictEqual(indexName, 'cost_1');
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
