'use strict';

var _ = require('lodash');
var moment = require('moment');
var querystring = require('querystring');
var Bluebird = require('bluebird');
var EventEmitter = require('events').EventEmitter;
var MongoClient = require('mongodb').MongoClient;
var debug = require('./debug');
var Mixins = require('./mixins');

// The promisified method name will be
// the original method name suffixed with "Async".
Bluebird.promisifyAll(MongoClient);

// Object `options` are used for mongodb connection options
var Mongo = module.exports = function(url, options) {
  options = options || {};

  // MongoLab recommended settings
  // http://blog.mongolab.com/2014/04/mongodb-driver-mongoose/
  _.defaults(options, {
    auto_reconnect: true,
    poolSize: 5, // default is 5
    connectTimeoutMS: 30000,
    socketTimeoutMS: 300000
  });

  // Turn query options into a URL query string
  // To append to the mongodb connection URL
  this.queryOptions = querystring.stringify(options);

  // Public properties for direct access allowed
  // Reuseable connection pool, only connect once
  this.db;
  this.url = url || 'mongodb://localhost:27017/test';
  this.url = this.url + '?' + this.queryOptions;
};

// Prototype
// ---

Mongo.prototype = Object.create(EventEmitter.prototype);

_.extend(Mongo.prototype, {
  // Connection
  // ---

  // Connect
  // Called by collection
  // Might be called multiple times at app boot until `this.db` is first set
  connect: Bluebird.method(function() {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 0 && _.isObject(_.last(args)) ? args.pop() : {};

    // Connection already opened
    if (this.db) {
      callback && callback(null, this.db);
      return this.db;
    }

    // Open a reuseable connection
    debug.log('#connect: %s', this.url);
    return MongoClient.connectAsync(
      this.url
    ).bind(this).then(function(db) {
      if (this.db) {
        debug.log('#connect reuse and close: %s', this.url);
        db.close();
        callback && callback(null, this.db);
        return this.db;
      }

      debug.log('#connect pool: %s', this.url);
      this.db = db;
      this.emit('connect', this.url, options.collection);
      callback && callback(null, this.db);
      return this.db;
    }).catch(function(err) {
      debug.error(err);
      this.emit('error', err);
      callback && callback(err);
      throw err;
    });
  }),



  // Helpers
  // ---

  // Automatically cast to HexString to ObjectId
  // Automatically cast ISO8601 date strings to Javascript Date
  // Will mutate the original object
  // obj can be an object or an array
  cast: function(obj) {
    _.each(obj, function(val, key) {
      if (_.isString(val)) {
        if (Mixins.isObjectId(val)) {
          obj[key] = Mixins.newObjectId(val);
        } else if (Mixins.isValidISO8601String(val)) {
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

  // Automatically uncast ObjectId to HexString
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

  // Open a collection
  // Called by every method (e.g. find, insert, update, etc...)
  _collection: Bluebird.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    return this.connect({
      collection: collectionName
    }).bind(this).then(function() {
      var collection = this.db.collection(collectionName);
      Bluebird.promisifyAll(collection);
      callback && callback(null, collection);
      return collection;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Retrieve the cursor
  // Uses node-mongodb-native `find`
  //
  // options signature
  // - fields - `{name: 1, email: 0}`
  // - sort - `[['created', 'desc']]`
  // - limit - `100`
  _cursor: Bluebird.method(function(collectionName, query) {
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
      'skip',
      'hint',
      'explain',
      'timeout',
      'snapshot',
      'batchSize',
      'maxTimeMS',
      'readPreference'
    ]);

    return this._collection(collectionName).then(function(collection) {
      return collection.find(query, options);
    }).then(function(cursor) {
      Bluebird.promisifyAll(cursor);
      return cursor;
    });
  }),

  // Find and return a cursor
  // NOTE: The cursor does NOT automatically `uncast` $oid in results
  findCursor: Bluebird.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    debug.log(
      '#findCursor: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    return this._cursor(collectionName, query, options).then(function(cursor) {
      callback && callback(null, cursor);
      return cursor;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Get pagination data (V1)
  pagination: Bluebird.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    debug.log(
      '#pagination: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    var total = 0;
    return this._cursor(collectionName, query, options).tap(function(cursor) {
      return cursor.countAsync().then(function(result) {
        total = result || total;
      });
    }).tap(function(cursor) {
      cursor.closeAsync();
    }).then(function(cursor) {
      var page = options.limit && options.limit <= total ? options.limit : total;
      var limit = options.limit || 0;
      var skip = options.skip || 0;

      var paging = {
        total: _.parseInt(total),
        count: _.parseInt(page),
        limit: _.parseInt(limit),
        offset: _.parseInt(skip),
        has_more: _.parseInt(page) < _.parseInt(total)
      };

      callback && callback(null, paging);
      return paging;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Count total matching documents matching query
  count: Bluebird.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    debug.log(
      '#count: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    var total = 0;
    return this._cursor(collectionName, query, options).tap(function(cursor) {
      return cursor.countAsync().then(function(result) {
        total = result || total;
      });
    }).tap(function(cursor) {
      cursor.closeAsync();
    }).then(function(cursor) {
      callback && callback(null, total);
      return total;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Find all documents matching query and turn into an array
  // Optionally also count total matching documents matching query
  find: Bluebird.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    // Optionally perform a count
    var count = true;
    if (_.isBoolean(options.count)) {
      count = options.count;
      delete options.count;
    }

    debug.log(
      '#find: %s with query: %s with options: %s and count: %s',
      collectionName,
      JSON.stringify(query),
      JSON.stringify(options),
      count
    );
    var total = 0;
    var docs = [];
    return this._cursor(
      collectionName,
      query,
      options
    ).bind(this).tap(function(cursor) {
      if (!count) {
        return;
      }
      return cursor.countAsync().then(function(result) {
        total = result || total;
      });
    }).tap(function(cursor) {
      return cursor.toArrayAsync().then(function(results) {
        docs = results || docs;
      });
    }).tap(function(cursor) {
      cursor.closeAsync();
    }).then(function(cursor) {
      if (!options.explain) {
        this.uncast(docs);
      }
      callback && callback(null, [docs, total, cursor]);
      return [docs, total, cursor];
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),


  // Find and return a single document matching query with options
  findOne: Bluebird.method(function(collectionName, query) {
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

    debug.log(
      '#findOne: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    var doc;
    return this._cursor(
      collectionName,
      query,
      options
    ).bind(this).tap(function(cursor) {
      return cursor.nextObjectAsync().then(function(result) {
        doc = result || doc;
      });
    }).tap(function(cursor) {
      cursor.closeAsync();
    }).then(function(cursor) {
      if (!doc && require) {
        var requireErr = new Error('Document not found for query: ' +
          JSON.stringify(query) + '.');
        requireErr.code = 404;
        throw requireErr;
      }

      if (!options.explain) {
        this.uncast(doc);
      }

      callback && callback(null, doc);
      return doc;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Insert a document (safe: true)
  // obj can be either an array or an object
  // docs is an array of uncasted documents
  insert: Bluebird.method(function(collectionName, obj) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // force safe mode
    options.safe = true;
    options = _.pick(options, ['safe', 'w']);

    // Deep clone the obj
    obj = this.cast(_.cloneDeep(obj));

    debug.log(
      '#insert: %s with query: %s',
      collectionName,
      JSON.stringify(obj)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.insertAsync(obj, options);
    }).then(this.uncast).then(function(docs) {
      callback && callback(null, docs);
      return docs;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Update one or more docs
  // num is number of documents updated
  update: Bluebird.method(function(collectionName, query, obj) {
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

    // Deep clone the query and obj
    query = this.cast(_.cloneDeep(query));
    obj = this.cast(_.cloneDeep(obj));

    debug.log(
      '#update: %s with query: %s with obj: %s',
      collectionName,
      JSON.stringify(query),
      JSON.stringify(obj)
    );
    return this._collection(collectionName).then(function(collection) {
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
  findAndModify: Bluebird.method(function(collectionName, query, obj) {
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

    // Deep clone the query and obj
    query = this.cast(_.cloneDeep(query));
    obj = this.cast(_.cloneDeep(obj));

    debug.log(
      '#findAndModify: %s with query: %s with obj: %s',
      collectionName,
      JSON.stringify(query),
      JSON.stringify(obj)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
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
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Remove a document and returns count
  // num is number of documents removed
  remove: Bluebird.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    debug.log(
      '#remove: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    return this._collection(collectionName).then(function(collection) {
      return collection.removeAsync(query, options);
    }).then(function(result) {
      // result[0] is the number of updated documents
      // result[1] is getLastError object
      var num = result[0];
      callback && callback(null, num);
      return num;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Aggregate
  // results is an array of uncasted items
  aggregate: Bluebird.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    debug.log(
      '#aggregate: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.aggregateAsync(query, options);
    }).then(this.uncast).then(function(results) {
      callback && callback(null, results);
      return results;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Get next sequence for counter
  // seq is a number
  getNextSequence: Bluebird.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    debug.log(
      '#getNextSequence: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    return this.findAndModify(collectionName, query, {
      '$inc': {
        seq: 1
      }
    }, options).then(function(doc) {
      callback && callback(null, doc.seq);
      return doc.seq;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Erases all records from a collection, if any
  eraseCollection: Bluebird.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    debug.log('#eraseCollection: %s', collectionName, {});
    return this.remove(collectionName, {}).then(function(num) {
      callback && callback(null, num);
      return num;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Add index if it doesn't already exist
  // indexName is the string name of the index
  ensureIndex: Bluebird.method(function(collectionName, indexName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};
    options = _.pick(options, ['unique', 'background', 'dropDups', 'w']);

    debug.log('#ensureIndex: %s for index: %s', collectionName, indexName, {});
    return this._collection(collectionName).then(function(collection) {
      return collection.ensureIndexAsync(indexName, options);
    }).then(function(result) {
      callback && callback(null, result);
      return result;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Remove index
  // result - { nIndexesWas: 2, ok: 1 }
  dropIndex: Bluebird.method(function(collectionName, indexName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    debug.log('#dropIndex: %s for index: %s', collectionName, indexName, {});
    return this._collection(collectionName).then(function(collection) {
      return collection.dropIndexAsync(indexName);
    }).then(function(result) {
      callback && callback(null, result);
      return result;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Remove index
  // success - true/false
  dropAllIndexes: Bluebird.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    debug.log('#dropAllIndexes: %s', collectionName, {});
    return this._collection(collectionName).then(function(collection) {
      return collection.dropAllIndexesAsync();
    }).then(function(success) {
      callback && callback(null, success);
      return success;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Add index if it doesn't already exist
  // indexInformation is an object:
  // { _id_: [ [ '_id', 1 ] ] }
  // indexInformation is an array if `options.full`
  // [ { v: 1, key: { _id: 1 }, name: '_id_', ns: 'test.tests' } ]
  indexInformation: Bluebird.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 1 && _.isObject(_.last(args)) ? args.pop() : {};
    options = _.pick(options, ['full']);

    return this._collection(collectionName).then(function(collection) {
      return collection.indexInformationAsync(options);
    }).then(function(indexInformation) {
      callback && callback(null, indexInformation);
      return indexInformation;
    }).catch(function(err) {
      debug.error(err);
      callback && callback(err);
      throw err;
    });
  })

});
