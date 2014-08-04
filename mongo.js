'use strict';

var _ = require('lodash');
var Promise = require('bluebird');
var EventEmitter = require('events').EventEmitter;
var mongodb = require('mongodb');
var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var moment = require('moment');
var objectIdHelper = require('mongodb-objectid-helper');

// The promisified method name will be
// the original method name suffixed with "Async".
Promise.promisifyAll(MongoClient);

// options are used for mongodb connection options
var Mongo = module.exports = function(url, options) {
  this.options = options || {};

  // MongoLab recommended settings
  // http://blog.mongolab.com/2014/04/mongodb-driver-mongoose/
  _.defaults(options, {
    server: {
      socketOptions: {
        keepAlive: 1,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 30000
      }
    },
    replset: {
      socketOptions: {
        keepAlive: 1,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 30000
      }
    }
  });

  // Public properties for direct access allowed
  // Reuseable connection pool, only connect once
  this.db;
  this.url = url || 'mongodb://localhost:27017/test';
};

Mongo.mongodb = mongodb;

// Prototype
// ---

Mongo.prototype = Object.create(EventEmitter.prototype);

_.extend(Mongo.prototype, {
  // Connection
  // ---

  // Connect
  // Called by collection
  // Might be called multiple times at app boot until `this.db` is first set
  connect: Promise.method(function() {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 0 && _.isObject(_.last(args)) ? args.pop() : {};

    // Connection already opened
    if (this.db) {
      callback && callback(null, this.db);
      return this.db;
    }

    // Open a reuseable connection
    return MongoClient.connectAsync(
      this.url,
      this.options
    ).bind(this).then(function(db) {
      this.db = db;
      this.emit('connect', this.url, options.collection);
      callback && callback(null, this.db);
      return this.db;
    }).catch(function(err) {
      this.emit('error', err);
      callback && callback(err);
      throw err;
    });
  }),


  // Open a collection
  // Called by every method (e.g. find, insert, update, etc...)
  collection: Promise.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    return this.connect({
      collection: collectionName
    }).bind(this).then(function() {
      var collection = this.db.collection(collectionName);
      Promise.promisifyAll(collection);
      callback && callback(null, collection);
      return collection;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),



  // Helpers
  // ---

  // Create and return an ObjectId (not a string)
  newObjectId: function(str) {
    return new ObjectID(str);
  },

  newObjectIdHexString: function(str) {
    return new ObjectID(str).toHexString();
  },

  // Check if a string is a valid ObjectID
  isValidObjectID: function(id) {
    return objectIdHelper.isObjectId(id);
  },

  // Check if a string is a valid ISO8601 date string
  isValidISO8601String: function(str) {
    // 2013-11-18T09:04:24.447Z
    // YYYY-MM-DDTHH:mm:ss.SSSZ
    return moment(str, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true).isValid();
  },

  // Automatically cast to HexString to ObjectID
  // Automatically cast ISO8601 date strings to Javascript Date
  // Will mutate the original object
  // obj can be an object or an array
  cast: function(obj) {
    _.each(obj, function(val, key) {
      if (_.isString(val)) {
        if (this.isValidObjectID(val)) {
          obj[key] = new ObjectID(val);
        } else if (this.isValidISO8601String(val)) {
          obj[key] = new Date(val);
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

  // Automatically uncast ObjectID to HexString
  // Automatically uncast Mongo ISODate to Javascript Date
  // Will mutate the original object
  // obj can be an object or an array
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



  // Access
  // ---

  // Retrieve the cursor
  // Uses node-mongodb-native `find`
  //
  // options signature
  // - fields - `{name: 1, email: 0}`
  // - sort - `[['created', 'desc']]`
  // - limit - `100`
  _cursor: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // MongoDB cursors can return the same document more than once in some situations.
    // You can use the `snapshot` option to isolate the operation for a very specific case.
    // http://docs.mongodb.org/manual/faq/developers/#duplicate-document-in-result-set
    // You cannot use snapshot() with sharded collections.
    // You cannot use snapshot() with sort() or hint() cursor methods.
    options = _.pick(options, [
      'fields',
      'sort',
      'limit',
      'hint',
      'explain',
      'timeout',
      'snapshot'
    ]);

    return this.collection(collectionName).then(function(collection) {
      return collection.find(query, options);
    }).then(function(cursor) {
      Promise.promisifyAll(cursor);
      return cursor;
    });
  }),

  // Find and return a cursor
  // NOTE: The cursor does NOT automatically `uncast` $oid in results
  findCursor: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    return this._cursor(collectionName, query, options).then(function(cursor) {
      callback && callback(null, cursor);
      return cursor;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Get pagination data (V1)
  pagination: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    return this._cursor(collectionName, query, options).then(function(cursor) {
      return cursor.countAsync();
    }).then(function(count) {
      var total = count;
      var page = options.limit && options.limit <= total ? options.limit : total;
      var limit = options.limit || 0;
      var skip = options.skip || 0;

      var obj = {
        total: parseInt(total),
        count: parseInt(page),
        limit: parseInt(limit),
        offset: parseInt(skip),
        has_more: parseInt(page) < parseInt(total)
      };

      callback && callback(null, obj);
      return obj;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Count
  count: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    return this._cursor(collectionName, query, options).then(function(cursor) {
      return cursor.countAsync();
    }).then(function(count) {
      callback && callback(null, count);
      return count;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Find all docs matching query and turn into an array with total
  // results is either an array of documents or an array of explanations
  // total is an integer
  // the actual return value is an array in format: [result, total]
  find: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    return this._cursor(
      collectionName,
      query,
      options
    ).bind(this).tap(function(cursor) {
      options.cursor = cursor;
      return cursor.countAsync().then(function(count) {
        options.total = count || 0;
      });
    }).then(function(cursor) {
      return cursor.toArrayAsync();
    }).then(function(results) {
      if (!options.explain) {
        this.uncast(results);
      }
      callback && callback(null, [results, options.total, options.cursor]);
      return [results, options.total, options.cursor];
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),


  // Find a single doc matching query
  // doc is an uncasted document
  findOne: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    // If require is true, throw an error if no document is found
    var require = false;
    if (_.isBoolean(options.require)) {
      require = options.require;
      delete options.require;
    }

    return this._cursor(
      collectionName,
      query,
      options
    ).bind(this).then(function(cursor) {
      return cursor.nextObjectAsync();
    }).then(this.uncast).then(function(doc) {
      if (!doc && require) {
        var requireErr = new Error('Document not found for query: ' +
          JSON.stringify(query) + '.');
        requireErr.code = 404;
        throw requireErr;
      }

      callback && callback(null, doc);
      return doc;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Insert a document (safe: true)
  // obj can be either an array or an object
  // docs is an array of uncasted documents
  insert: Promise.method(function(collectionName, obj) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // force safe mode
    options.safe = true;
    options = _.pick(options, ['safe', 'w']);

    // Deep clone the obj
    obj = this.cast(_.cloneDeep(obj));

    return this.collection(collectionName).bind(this).then(function(collection) {
      return collection.insertAsync(obj, options);
    }).then(this.uncast).then(function(docs) {
      callback && callback(null, docs);
      return docs;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Update one or more docs
  // num is number of documents updated
  update: Promise.method(function(collectionName, query, obj) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 3 && _.isObject(_.last(args)) ? args.pop() : {};

    // If require is true, throw an error if no document is found
    var require = false;
    if (_.isBoolean(options.require)) {
      require = options.require;
      delete options.require;
    }

    // force safe mode
    options.safe = true;
    options = _.pick(options, ['safe', 'multi', 'upsert', 'w']);

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    // Deep clone the obj
    obj = this.cast(_.cloneDeep(obj));

    return this.collection(collectionName).then(function(collection) {
      return collection.updateAsync(query, obj, options);
    }).then(function(result) {
      // result[0] is the number of updated documents
      // result[1] is getLastError object
      var num = result[0];
      if (!num && require) {
        var requireErr = new Error('Document not found for query: ' +
          JSON.stringify(query) + '.');
        requireErr.code = 404;
        throw requireErr;
      }

      callback && callback(null, num);
      return num;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Update and return one doc
  // obj is an uncasted document
  findAndModify: Promise.method(function(collectionName, query, obj) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 3 && _.isObject(_.last(args)) ? args.pop() : {};

    // If require is true, throw an error if no document is found
    var require = false;
    if (_.isBoolean(options.require)) {
      require = options.require;
      delete options.require;
    }

    // force safe and new mode
    options.safe = true;
    options.new = true;
    options = _.pick(options, ['safe', 'new', 'upsert', 'remove', 'w']);

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    // Deep clone the obj
    obj = this.cast(_.cloneDeep(obj));

    return this.collection(collectionName).bind(this).then(function(collection) {
      return collection.findAndModifyAsync(query, [], obj, options);
    }).then(function(result) {
      // result[0] is the updated document
      // result[1] is getLastError object
      var doc = this.uncast(result[0]);
      if (!doc && require) {
        var requireErr = new Error('Document not found for query: ' +
          JSON.stringify(query) + '.');
        requireErr.code = 404;
        throw requireErr;
      }

      callback && callback(null, doc);
      return doc;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Remove a document and returns count
  // num is number of documents removed
  remove: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    return this.collection(collectionName).then(function(collection) {
      return collection.removeAsync(query, options);
    }).then(function(result) {
      // result[0] is the number of updated documents
      // result[1] is getLastError object
      var num = result[0];
      callback && callback(null, num);
      return num;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Aggregate
  // results is an array of uncasted items
  aggregate: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    return this.collection(collectionName).bind(this).then(function(collection) {
      return collection.aggregateAsync(query, options);
    }).then(this.uncast).then(function(results) {
      callback && callback(null, results);
      return results;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Get next sequence for counter
  // seq is a number
  getNextSequence: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    return this.findAndModify(collectionName, query, {
      '$inc': {
        seq: 1
      }
    }, options).then(function(doc) {
      callback && callback(null, doc.seq);
      return doc.seq;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Erases all records from a collection, if any
  eraseCollection: Promise.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    return this.remove(collectionName, {}).then(function(num) {
      callback && callback(null, num);
      return num;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Add index if it doesn't already exist
  // indexName is the string name of the index
  ensureIndex: Promise.method(function(collectionName, index) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};
    options = _.pick(options, ['unique', 'background', 'dropDups', 'w']);

    return this.collection(collectionName).bind(this).then(function(collection) {
      return collection.ensureIndexAsync(index, options);
    }).then(function(indexName) {
      callback && callback(null, indexName);
      return indexName;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Remove index
  // result - { nIndexesWas: 2, ok: 1 }
  dropIndex: Promise.method(function(collectionName, indexName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    return this.collection(collectionName).then(function(collection) {
      return collection.dropIndexAsync(indexName);
    }).then(function(result) {
      callback && callback(null, result);
      return result;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Remove index
  // success - true/false
  dropAllIndexes: Promise.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    return this.collection(collectionName).then(function(collection) {
      return collection.dropAllIndexesAsync();
    }).then(function(success) {
      callback && callback(null, success);
      return success;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Add index if it doesn't already exist
  // indexInformation is an object:
  // { _id_: [ [ '_id', 1 ] ] }
  // indexInformation is an array if `options.full`
  // [ { v: 1, key: { _id: 1 }, name: '_id_', ns: 'test.tests' } ]
  indexInformation: Promise.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 1 && _.isObject(_.last(args)) ? args.pop() : {};
    options = _.pick(options, ['full']);

    return this.collection(collectionName).bind(this).then(function(collection) {
      return collection.indexInformationAsync(options);
    }).then(function(indexInformation) {
      callback && callback(null, indexInformation);
      return indexInformation;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

});
