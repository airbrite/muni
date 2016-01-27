'use strict';

var Bluebird = require('bluebird');
var Collection = require('../../collection');
var Model = require('../../model');

describe('Collection', function() {
  var collection;
  var data = [{
    foo: 'bar'
  }, {
    foo: 'baz'
  }];

  beforeEach(function() {
    collection = new Collection();
    collection.db = {
      count: function() {},
      find: function() {},
      createIndex: function() {}
    };
  });

  describe('Render', function() {
    it('should #render empty collection', function() {
      assert.deepEqual(collection.render(), []);
    });

    it('should #toResponse empty collection', function() {
      assert.deepEqual(collection.toResponse(), []);
    });

    it('should #render collection after setting models', function() {
      var bar = new Model({
        foo: 'bar'
      });
      var baz = new Model({
        foo: 'baz'
      });

      collection.set([bar, baz]);
      assert.deepEqual(collection.render(), data);
    });

    it('should #render collection after setting objects', function() {
      collection.set(data);
      assert.deepEqual(collection.render(), data);
    });
  });

  describe('Fetch and Count', function() {
    beforeEach(function() {
      sinon.stub(collection.db, 'count').resolves(1337);
      sinon.stub(collection.db, 'find', function(a, b, c, cb) {
        cb && cb(null, [data]);
        return Bluebird.resolve(data);
      });
    });

    it('should #fetch', function() {
      return collection.fetch().then(function(collection) {
        assert.deepEqual(collection.render(), data);
      });
    });

    it('should #count', function() {
      return collection.count().then(function(total) {
        assert.strictEqual(total, 1337);
      });
    });

    afterEach(function() {
      collection.db.count.restore();
      collection.db.find.restore();
    });
  });
});
