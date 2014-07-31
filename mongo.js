'use strict';

var _ = require('lodash');
var Promise = require('bluebird');
var EventEmitter = require('events').EventEmitter;
var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;

Promise.delay = function(ms) {
  var promise = new Promise(function(resolve, reject) {
    setTimeout(resolve, ms);
  });
  return promise;
};

Promise.promisifyAll(MongoClient);

// Takes url to a mongodb
var Mongo = module.exports = function(url, options) {
  this.options = options || {};

  this.client = MongoClient;
  this.url = url || 'mongodb://localhost:27017';
  this._db = null;
  this.connection = 'disconnected';
  this.reconnectTimeout = this.options.reconnectTimeout || 500;
};

Mongo.prototype = Object.create(EventEmitter.prototype);

_.extend(Mongo.prototype, {
  connect: Promise.method(function() {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();

    return Promise
      .bind(this)
      .then(function() {
        if (this.connection === 'connected') {
          callback && callback(null, this._db);
          return this._db;
        } else if (this.connection === 'connecting') {
          return Promise.delay(this.reconnectTimeout)
            .bind(this)
            .then(function() {
              return this.connect(callback);
            });
        }

        this.connection = 'connecting';
        return this.client.connectAsync(this.url, this.options)
          .bind(this)
          .then(function(db) {
            this._db = db;
            this.emit('connect', this.url);
            this.connection = 'connected';
            callback && callback(null, db);
            return this._db;
          })
          .catch(function(err) {
            this.connection = 'disconnected';
            callback && callback(err);
            throw err;
          });
      });
  }),

  collection: Promise.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();

    return this.connect()
      .bind(this)
      .then(function() {
        var collection = this._db.collection(collectionName);
        Promise.promisifyAll(collection);
        callback && callback(null, collection);
        return collection;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  }),

  // Check if a string is a valid ObjectID
  isValidObjectID: function(id) {
    var checkForHexRegExp = new RegExp('^[0-9a-fA-F]{24}$');
    return (typeof id === 'string') && id.length === 24 && checkForHexRegExp.test(id);
  },

  // Automatically cast to HexString to ObjectID
  // Must clone the obj and not pass it directly into the query
  // Or else the cast function will modify the original object
  cast: function(obj) {
    _.each(obj, function(val, key) {
      if (_.isString(val)) {
        if (this.isValidObjectID(val)) {
          obj[key] = new ObjectID(val);
        }
      } else if (_.isObject(val)) {
        if (val['$oid']) {
          obj[key] = val['$oid'];
        } else {
          return this.cast(val);
        }
      } else {
        return;
      }
    }.bind(this));

    return obj;
  },

  // Automatically cast ObjectID to HexString
  uncast: function(obj) {
    _.each(obj, function(val, key) {
      if (val && _.isFunction(val.toHexString)) {
        obj[key] = val.toHexString();
      } else if (_.isObject(val)) {
        if (val['$oid']) {
          obj[key] = val['$oid'];
        } else {
          return this.uncast(val);
        }
      } else {
        return;
      }
    }.bind(this));

    return obj;
  },

  // Generate a new object id
  newId: function() {
    return new ObjectID().toHexString();
  },

  // Retrieve the cursor
  // Used by `find` and `findCursor`
  _cursor: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = options || {};

    var fields = null;
    if (_.isArray(options.fields)) {
      fields = options.fields;
      delete options.fields;
    }

    var cursor = this._db.collection(collectionName).find(query, fields, options);
    Promise.promisifyAll(cursor);

    return cursor;
  },

  // Find with a cursor, can pass in options.fields and get specific fields
  // NOTE: The cursor does NOT automatically `uncast` $oid in results
  findCursor: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = ((args.length > 2 && typeof args[args.length - 1] === 'object') && args.pop());
    options = options || {};

    query = _.cloneDeep(query);
    query = this.cast(query);

    return this.connect()
      .bind(this)
      .then(function() {
        return this._cursor(collectionName, query, options);
      })
      .then(function(cursor) {
        callback && callback(null, cursor);
        return cursor;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Count associated with findCursor
  count: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = options || {};

    query = _.cloneDeep(query);
    query = this.cast(query);

    return this.findCursor(collectionName, query, options)
      .bind(this)
      .then(function(cursor) {
        return cursor.countAsync();
      })
      .then(function(count) {
        callback && callback(null, count);
        return count;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Find all docs matching query and turn into an array
  find: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = options || {};

    query = _.cloneDeep(query);
    query = this.cast(query);

    // Keep a count of the cursor
    var count = 0;

    return this.connect()
      .bind(this)
      .then(function() {
        return this._cursor(collectionName, query, options);
      })
      .tap(function(cursor) {
        cursor.countAsync().then(function(resp) {
          count = resp || 0;
        });
      })
      .then(function(cursor) {
        return cursor.toArrayAsync();
      })
      .then(this.uncast)
      .then(function(obj) {
        callback && callback(null, [obj, count]);
        return [obj, count];
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  pagination: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = options || {};

    query = _.cloneDeep(query);
    query = this.cast(query);

    return this.connect()
      .bind(this)
      .then(function() {
        return this.count(collectionName, query, options);
      })
      .then(function(total) {
        var count = ((options.limit) && (options.limit <= total)) ? options.limit : total;
        var limit = options.limit || 0;
        var skip = options.skip || 0;

        var obj = {
          total: parseInt(total),
          count: parseInt(count),
          limit: parseInt(limit),
          offset: parseInt(skip),
          has_more: parseInt(count) < parseInt(total)
        };

        callback && callback(null, obj);
        return obj;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Find a single doc matching query
  findOne: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = options || {};

    var require = false;
    if (_.isBoolean(options.require)) {
      require = options.require;
      delete options.require;
    }

    var fields = null;
    if (_.isArray(options.fields)) {
      fields = options.fields;
      delete options.fields;
    }

    query = _.cloneDeep(query);
    query = this.cast(query);

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.findOneAsync(query, fields, options);
      })
      .then(this.uncast)
      .then(function(data) {
        if (!data && require) {
          var requireErr = new Error('Document not found for query: ' + JSON.stringify(query) + '.');
          requireErr.code = 404;
          throw requireErr;
        }

        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Insert a document (safe: true)
  insert: function(collectionName, obj) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = _.extend({
      safe: true
    }, options || {}); // force safe mode

    obj = _.cloneDeep(obj);
    obj = this.cast(obj);

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.insertAsync(obj, options);
      })
      .then(this.uncast)
      .then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Update one or more docs
  update: function(collectionName, query, obj) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 3 && typeof args[args.length - 1] === 'object' && args.pop();
    options = _.extend({
      safe: true
    }, options || {}); // force safe mode

    query = _.cloneDeep(query);
    query = this.cast(query);

    obj = _.cloneDeep(obj);
    obj = this.cast(obj);

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.updateAsync(query, obj, options);
      })
      .then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Update and return one doc
  findAndModify: function(collectionName, query, obj) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 3 && typeof args[args.length - 1] === 'object' && args.pop();
    options = _.extend({
      new: true,
      safe: true
    }, options || {}); // force new mode, safe mode

    var require = false;
    if (_.isBoolean(options.require)) {
      require = options.require;
      delete options.require;
    }

    var sort = options.sort || {};
    delete options.sort;

    query = _.cloneDeep(query);
    query = this.cast(query);

    obj = _.cloneDeep(obj);
    obj = this.cast(obj);

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.findAndModifyAsync(query, sort, obj, options);
      })
      .then(function(response) {
        // mongodb gives the response as the object [0] and updateObject[1]
        response.pop(); // pop off updateObject

        return this.uncast(response[0]);
      }).then(function(data) {
        if (!data && require) {
          var requireErr = new Error('Document not found for query: ' + JSON.stringify(query) + '.');
          requireErr.code = 404;
          throw requireErr;
        }

        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Remove a document and returns count
  remove: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = _.extend({
      safe: true
    }, options || {}); // force new mode, safe mode

    query = _.cloneDeep(query);
    query = this.cast(query);

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.removeAsync(query, options);
      }).then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Aggregate
  aggregate: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = options || {};

    query = _.cloneDeep(query);
    query = this.cast(query);

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        // weird bug if options is empty, and undefined doesn't seem to work -- seems to either be mongo-node or the promisify framework ...
        // since aggregate has a different set of options from everything else, it's probably default objects
        if (!_.isEmpty(options)) {
          return collection.aggregateAsync(query, options);
        } else {
          return collection.aggregateAsync(query);
        }
      })
      .then(this.uncast)
      .then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Get next sequence for counter
  getNextSequence: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = _.extend({
      safe: true,
      new: true
    }, options || {});

    query = _.cloneDeep(query);
    query = this.cast(query);

    return this.findAndModify(collectionName, query, {
        '$inc': {
          seq: 1
        }
      }, options)
      .then(function(obj) {
        return obj.seq;
      }).then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Erases all records from a collection, if any
  eraseCollection: function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();

    return this.remove(collectionName, {})
      .then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },

  // Indexes
  ensureIndex: function(collectionName, index) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] === 'object' && args.pop();
    options = options || {};

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        collection.ensureIndexAsync(index, options);
      }).then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  },


  dropIndexes: function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' && args.pop();

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.dropIndexesAsync();
      }).then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .catch(function(err) {
        callback && callback(err);
        throw err;
      });
  }

});
