'use strict';

var _ = require('lodash');
var moment = require('moment');
var querystring = require('querystring');
var Promise = require('bluebird');
var EventEmitter = require('events').EventEmitter;
var MongoClient = require('mongodb').MongoClient;
var debug = require('debug')('bootie:debug');
var error = require('debug')('bootie:error');

// The promisified method name will be
// the original method name suffixed with "Async".
Promise.promisifyAll(MongoClient);

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
    debug('#connect: %s', this.url);
    return MongoClient.connectAsync(
      this.url
    ).bind(this).then(function(db) {
      if (this.db) {
        debug('#connect reuse and close: %s', this.url);
        db.close();
        callback && callback(null, this.db);
        return this.db;
      }

      debug('#connect pool: %s', this.url);
      this.db = db;
      this.emit('connect', this.url, options.collection);
      callback && callback(null, this.db);
      return this.db;
    }).catch(function(err) {
      error(err);
      this.emit('error', err);
      callback && callback(err);
      throw err;
    });
  }),



  // Helpers
  // ---

  // Proxy (note: `Id` not `ID`)
  ObjectId: require('mongodb').ObjectID,

  // Create and return an ObjectId (not a string)
  newObjectId: function(str) {
    return new this.ObjectId(str);
  },

  newObjectIdHexString: function(str) {
    return new this.ObjectId(str).toHexString();
  },

  // Check if a string is a valid ObjectId
  isObjectId: function(id) {
    return require('mongodb-objectid-helper').isObjectId(id);
  },

  // Check if a string is a valid ISO8601 date string
  isValidISO8601String: function(str) {
    // 2013-11-18T09:04:24.447Z
    // YYYY-MM-DDTHH:mm:ss.SSSZ
    return moment.utc(str, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true).isValid();
  },

  // Automatically cast to HexString to ObjectId
  // Automatically cast ISO8601 date strings to Javascript Date
  // Will mutate the original object
  // obj can be an object or an array
  cast: function(obj) {
    _.each(obj, function(val, key) {
      if (_.isString(val)) {
        if (this.isObjectId(val)) {
          obj[key] = this.newObjectId(val);
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
  _collection: Promise.method(function(collectionName) {
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
      error(err);
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
      'skip',
      'hint',
      'explain',
      'timeout',
      'snapshot',
      'batchSize',
      'maxTimeMS'
    ]);

    return this._collection(collectionName).then(function(collection) {
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

    debug(
      '#findCursor: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    return this._cursor(collectionName, query, options).then(function(cursor) {
      callback && callback(null, cursor);
      return cursor;
    }).catch(function(err) {
      error(err);
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

    debug(
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
      return cursor.closeAsync();
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
      error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Count total matching documents matching query
  count: Promise.method(function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};

    // Deep clone the query
    query = this.cast(_.cloneDeep(query));

    debug(
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
      return cursor.closeAsync();
    }).then(function(cursor) {
      callback && callback(null, total);
      return total;
    }).catch(function(err) {
      error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Find all documents matching query and turn into an array
  // Optionally also count total matching documents matching query
  find: Promise.method(function(collectionName, query) {
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

    debug(
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
        return cursor;
      }
      return cursor.countAsync().then(function(result) {
        total = result || total;
      });
    }).tap(function(cursor) {
      return cursor.toArrayAsync().then(function(results) {
        docs = results || docs;
      });
    }).tap(function(cursor) {
      return cursor.closeAsync();
    }).then(function(cursor) {
      if (!options.explain) {
        this.uncast(docs);
      }
      callback && callback(null, [docs, total, cursor]);
      return [docs, total, cursor];
    }).catch(function(err) {
      error(err);
      callback && callback(err);
      throw err;
    });
  }),


  // Find and return a single document matching query with options
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

    debug(
      '#findOne: %s with query: %s',
      collectionName,
      JSON.stringify(query)
    );
    var doc = {};
    return this._cursor(
      collectionName,
      query,
      options
    ).bind(this).tap(function(cursor) {
      return cursor.nextObjectAsync().then(function(result) {
        doc = result || doc;
      });
    }).tap(function(cursor) {
      return cursor.closeAsync();
    }).then(function(cursor) {
      if (_.isEmpty(doc) && require) {
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
      error(err);
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

    debug(
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
      error(err);
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

    // Deep clone the query and obj
    query = this.cast(_.cloneDeep(query));
    obj = this.cast(_.cloneDeep(obj));

    debug(
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

    // Deep clone the query and obj
    query = this.cast(_.cloneDeep(query));
    obj = this.cast(_.cloneDeep(obj));

    debug(
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
      error(err);
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

    debug(
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
      error(err);
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

    debug(
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
      error(err);
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

    debug(
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
      error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Erases all records from a collection, if any
  eraseCollection: Promise.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    debug('#eraseCollection: %s', collectionName, {});
    return this.remove(collectionName, {}).then(function(num) {
      callback && callback(null, num);
      return num;
    }).catch(function(err) {
      error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Add index if it doesn't already exist
  // indexName is the string name of the index
  ensureIndex: Promise.method(function(collectionName, indexName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;
    var options = args.length > 2 && _.isObject(_.last(args)) ? args.pop() : {};
    options = _.pick(options, ['unique', 'background', 'dropDups', 'w']);

    debug('#ensureIndex: %s for index: %s', collectionName, indexName, {});
    return this._collection(collectionName).then(function(collection) {
      return collection.ensureIndexAsync(indexName, options);
    }).then(function(result) {
      callback && callback(null, result);
      return result;
    }).catch(function(err) {
      error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Remove index
  // result - { nIndexesWas: 2, ok: 1 }
  dropIndex: Promise.method(function(collectionName, indexName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    debug('#dropIndex: %s for index: %s', collectionName, indexName, {});
    return this._collection(collectionName).then(function(collection) {
      return collection.dropIndexAsync(indexName);
    }).then(function(result) {
      callback && callback(null, result);
      return result;
    }).catch(function(err) {
      error(err);
      callback && callback(err);
      throw err;
    });
  }),

  // Remove index
  // success - true/false
  dropAllIndexes: Promise.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = _.isFunction(_.last(args)) ? args.pop() : null;

    debug('#dropAllIndexes: %s', collectionName, {});
    return this._collection(collectionName).then(function(collection) {
      return collection.dropAllIndexesAsync();
    }).then(function(success) {
      callback && callback(null, success);
      return success;
    }).catch(function(err) {
      error(err);
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

    return this._collection(collectionName).then(function(collection) {
      return collection.indexInformationAsync(options);
    }).then(function(indexInformation) {
      callback && callback(null, indexInformation);
      return indexInformation;
    }).catch(function(err) {
      error(err);
      callback && callback(err);
      throw err;
    });
  })

});
