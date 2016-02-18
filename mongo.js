'use strict';

var _ = require('lodash');
var moment = require('moment');
var querystring = require('querystring');
var Bluebird = require('bluebird');
var EventEmitter = require('events').EventEmitter;
var MongoClient = require('mongodb').MongoClient;
var debug = require('./debug');
var Mixins = require('./mixins');
var MuniError = require('./error');

// Object `options` are used for mongodb connection options
var Mongo = module.exports = function(url, options) {
  this.options = options || {};
  this.options.promiseLibrary = Bluebird;

  var defaultConnectionOptions = {
    poolSize: 1,
    reconnectTries: 1,
    socketOptions: {
      keepAlive: 120,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 300000,
    },
  };

  // Default options for `mongos`, `replset`, and `server`
  if (this.options.mongos) {
    _.defaultsDeep(this.options.mongos, defaultConnectionOptions);
  } else if (this.options.replset) {
    _.defaultsDeep(this.options.replset, defaultConnectionOptions);
  } else if (this.options.server) {
    _.defaultsDeep(this.options.server, defaultConnectionOptions);
  }

  // Public properties for direct access allowed
  // Reuseable connection pool, only connect once
  this.db;
  this.url = url || 'mongodb://localhost:27017/test';
};

// Prototype
// ---

Mongo.prototype = Object.create(EventEmitter.prototype);

_.assign(Mongo.prototype, {
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
    return MongoClient.connect(
      this.url,
      this.options
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
      debug.error('#connect error: %s', err.message);
      this.emit('error', err);
      callback && callback(err);
      throw err;
    });
  }),

  _findOptions: function(options) {
    // MongoDB cursors can return the same document more than once in some situations.
    // You can use the `snapshot` option to isolate the operation for a very specific case.
    // http://docs.mongodb.org/manual/faq/developers/#duplicate-document-in-result-set
    // You cannot use snapshot() with sharded collections.
    // You cannot use snapshot() with sort() or hint() cursor methods.
    return _.pick(options, [
      'limit',
      'sort',
      'fields',
      'skip',
      'hint',
      'snapshot',
      'timeout',
      'batchSize',
      'maxTimeMS',
      'readPreference'
    ]);
  },

  _countOptions: function(options) {
    return _.pick(options, ['limit', 'skip', 'hint', 'readPreference']);
  },

  // Automatically cast to HexString to ObjectId
  // Automatically cast ISO8601 date strings to Javascript Date
  // Will mutate the original object
  // obj can be an object or an array
  cast: function(obj) {
    _.forEach(obj, function(val, key) {
      if (_.isString(val)) {
        if (Mixins.isObjectId(val)) {
          obj[key] = Mixins.newObjectId(val);
        } else if (Mixins.isValidISO8601String(val)) {
          obj[key] = new Date(val);
        }
      } else if (_.isDate(val)) {
        obj[key] = val;
      } else if (_.isObject(val)) {
        if (val['$oid']) {
          obj[key] = val['$oid'];
        } else {
          obj[key] = this.cast(val);
        }
      }
    }.bind(this));

    return obj;
  },

  // Automatically uncast ObjectId to HexString
  // Will mutate the original object
  // obj can be an object or an array
  uncast: function(obj) {
    _.forEach(obj, function(val, key) {
      if (val && _.isFunction(val.toHexString)) {
        obj[key] = val.toHexString();
      } else if (_.isDate(val)) {
        obj[key] = val;
      } else if (_.isObject(val)) {
        if (val['$oid']) {
          obj[key] = val['$oid'];
        } else {
          obj[key] = this.uncast(val);
        }
      }
    }.bind(this));

    return obj;
  },

  // Open a collection
  // Called by every method (e.g. find, insert, update, etc...)
  _collection: Bluebird.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    return this.connect({
      collection: collectionName
    }).bind(this).then(function() {
      var collection = this.db.collection(collectionName);
      callback && callback(null, collection);
      return collection;
    }).catch(function(err) {
      debug.error('#_collection error: %s', err.message);
      // Reset the saved `db` instance so the next `connect` will reconnect
      this.db = null;
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

    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.find(query, this._findOptions(options));
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

    debug.info(
      '#findCursor: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    return this._cursor(collectionName, query, options).then(function(cursor) {
      callback && callback(null, cursor);
      return cursor;
    }).catch(function(err) {
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

    debug.info(
      '#pagination: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.count(query, this._countOptions(options));
    }).then(function(count) {
      var total = count;
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

    debug.info(
      '#count: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.count(query, this._countOptions(options));
    }).then(function(count) {
      callback && callback(null, count);
      return count;
    }).catch(function(err) {
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

    debug.info(
      '#find: %s with query: %s with options: %s and count: %s',
      collectionName,
      JSON.stringify(query),
      JSON.stringify(options),
      count
    );
    var total = 0;
    return this._cursor(
      collectionName,
      query,
      options
    ).bind(this).tap(function(cursor) {
      if (!count) {
        return;
      }
      return cursor.count(false).tap(function(count) {
        total = count;
      });
    }).then(function(cursor) {
      return cursor.toArray().tap(function() {
        cursor.close();
      });
    }).then(function(docs) {
      return this.uncast(docs);
    }).then(function(docs) {
      callback && callback(null, [docs, total]);
      return [docs, total];
    }).catch(function(err) {
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

    debug.info(
      '#findOne: %s with query: %s with options: %s',
      collectionName,
      JSON.stringify(query),
      JSON.stringify(options)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.findOne(query, this._findOptions(options));
    }).then(function(doc) {
      return this.uncast(doc);
    }).then(function(doc) {
      if (!doc && require) {
        throw new MuniError(
          'Document not found for query: ' + JSON.stringify(query) + '.',
          404
        );
      }

      callback && callback(null, doc);
      return doc;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Insert a document
  // obj can be either an array or an object
  // docs is an array of uncasted documents
  insert: Bluebird.method(function(collectionName, obj) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    options = _.pick(options, ['w', 'wtimeout', 'j']);

    // Deep clone the obj
    obj = this.cast(_.cloneDeep(obj));

    debug.info(
      '#insert: %s with options: %s',
      collectionName,
      JSON.stringify(options)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.insert(obj, options);
    }).then(function(result) {
      return this.uncast(result.ops);
    }).then(function(docs) {
      callback && callback(null, docs);
      return docs;
    }).catch(function(err) {
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

    options = _.pick(options, ['w', 'wtimeout', 'j', 'upsert', 'multi']);

    // Deep clone the query and obj
    query = this.cast(_.cloneDeep(query));
    obj = this.cast(_.cloneDeep(obj));

    debug.info(
      '#update: %s with query: %s with options: %s',
      collectionName,
      JSON.stringify(query),
      JSON.stringify(options)
    );
    return this._collection(collectionName).then(function(collection) {
      return collection.update(query, obj, options);
    }).then(function(result) {
      var num = result.result.n;
      if (!num && require) {
        throw new MuniError(
          'Document not found for query: ' + JSON.stringify(query) + '.',
          404
        );
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

    options.new = true;
    options = _.pick(options, [
      'w',
      'wtimeout',
      'j',
      'remove',
      'upsert',
      'new',
      'fields'
    ]);

    // Deep clone the query and obj
    query = this.cast(_.cloneDeep(query));
    obj = this.cast(_.cloneDeep(obj));

    debug.info(
      '#findAndModify: %s with query: %s with options: %s',
      collectionName,
      JSON.stringify(query),
      JSON.stringify(options)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.findAndModify(query, [], obj, options);
    }).then(function(result) {
      return this.uncast(result.value);
    }).then(function(doc) {
      if (!doc && require) {
        throw new MuniError(
          'Document not found for query: ' + JSON.stringify(query) + '.',
          404
        );
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
  remove: Bluebird.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Allowed options
    options = _.pick(options, ['w', 'wtimeout', 'j', 'single']);

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    debug.info(
      '#remove: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    return this._collection(collectionName).then(function(collection) {
      return collection.remove(query, options);
    }).then(function(result) {
      var num = result.result.n;
      callback && callback(null, num);
      return num;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Aggregate
  // results is an array of uncasted items
  aggregate: Bluebird.method(function(collectionName, pipeline) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Allowed options
    options = _.pick(options, ['readPreference']);

    // Deep clone the pipeline
    pipeline = this.cast(_.cloneDeep(pipeline));

    debug.info(
      '#aggregate: %s with pipeline: %s and options: %s',
      collectionName,
      JSON.stringify(pipeline),
      JSON.stringify(options)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.aggregate(pipeline, options).toArray();
    }).then(function(result) {
      return this.uncast(result);
    }).then(function(result) {
      callback && callback(null, result);
      return result;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // https://github.com/mongodb/node-mongodb-native/blob/master/lib/mongodb/collection.js#L489
  mapReduce: Bluebird.method(function(collectionName, query, map, reduce, finalize) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 5 && _.isObject(_.last(args)) ? args.pop() : {};

    // Allowed options
    options = _.pick(options, ['scope', 'sort', 'limit', 'readPreference']);

    // Always output inline
    options.out = {
      inline: 1
    };

    // Execution in JS (faster)
    options.jsMode = true;

    // Driver expects `finalize` function in `options`
    options.finalize = finalize;

    // Deep clone the query
    // Driver expects `query` object in `options`
    options.query = this.cast(_.cloneDeep(query));

    debug.info(
      '#mapReduce: %s with query: %s and options: %s',
      collectionName,
      JSON.stringify(query),
      JSON.stringify(options)
    );
    return this._collection(collectionName).bind(this).then(function(collection) {
      return collection.mapReduce(map, reduce, options);
    }).then(function(result) {
      return result.results;
    }).then(function(results) {
      return this.uncast(results);
    }).then(function(results) {
      callback && callback(null, results);
      return results;
    }).catch(function(err) {
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

    debug.info(
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
      callback && callback(err);
      throw err;
    });
  }),

  // Erases all records from a collection, if any
  eraseCollection: Bluebird.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    debug.info('#eraseCollection: %s', collectionName);
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
  createIndex: Bluebird.method(function(collectionName, keys, options) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = options || {};
    options = _.pick(options, [
      'name',
      'unique',
      'background',
      'dropDups',
      'w',
      'expireAfterSeconds'
    ]);

    debug.info(
      '#ensureIndex: %s for index: %s',
      collectionName,
      JSON.stringify(keys)
    );
    return this._collection(collectionName).then(function(collection) {
      return collection.createIndex(keys, options);
    }).then(function(result) {
      callback && callback(null, result);
      return result;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  }),

  // Alias for createIndex
  // ensureIndex is deprecated
  ensureIndex: function() {
    return this.createIndex.apply(this, arguments);
  },

  // Remove index
  // result - { nIndexesWas: 2, ok: 1 }
  dropIndex: Bluebird.method(function(collectionName, indexName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    debug.info('#dropIndex: %s for index: %s', collectionName, indexName);
    return this._collection(collectionName).then(function(collection) {
      return collection.dropIndex(indexName);
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
  dropAllIndexes: Bluebird.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    debug.info('#dropAllIndexes: %s', collectionName);
    return this._collection(collectionName).then(function(collection) {
      return collection.dropAllIndexes();
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
  indexInformation: Bluebird.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 1 && _.isObject(_.last(args)) ? args.pop() : {};
    options = _.pick(options, ['full']);

    return this._collection(collectionName).then(function(collection) {
      return collection.indexInformation(options);
    }).then(function(indexInformation) {
      callback && callback(null, indexInformation);
      return indexInformation;
    }).catch(function(err) {
      callback && callback(err);
      throw err;
    });
  })

});
