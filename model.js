'use strict';

// References
// ---
// https://github.om/jsantell/backbone-promised/blob/master/index.js

var _ = require('lodash');
var Bluebird = require('bluebird');
var Backbone = require('backbone');
var moment = require('moment');
var debug = require('./debug');
var MuniError = require('./error');
var Mixins = require('./mixins');

// Cache ensured indexes
var INDEXED = {};

module.exports = Backbone.Model.extend({
  /**
   * _.mergeWith with a customizer function
   * Do not merge arrays and empty objects
   * Arrays always want to be overwritten explicitly (empty or not)
   * Objects want to be overwritten explicitly (when empty)
   *
   * @return {Object}
   */

   _mergeSafe: function(object, other) {
     return _.mergeWith(object, other, function mergeDeep(objValue, srcValue) {
       if (_.isArray(objValue)) {
         // If array, do not deep merge
         return objValue;
       } else if (_.isPlainObject(objValue) && _.isEmpty(objValue)) {
         // If empty object, do not merge
         return objValue;
       } else if (_.isPlainObject(objValue)) {
         return _.mergeWith(objValue, srcValue, mergeDeep);
       }

       return objValue;
     });
   },

  /**
   * Responsible for setting attributes after a database call
   * Takes the mongodb response and calls the Backbone success method
   *
   * @param {Object} options
   * @return {Function}
   */

  _wrapResponse: function(options) {
    return function(err, resp) {
      if (err) {
        options.error(err);
      } else {
        options.success(resp);
      }
    };
  },

  /**
   * Remove attributes
   *
   * Does not work for objects embedded inside arrays
   *
   * @param {Object} attrs
   * @param {Object} attrsToRemove
   */

  _removeAttributes: function(attrs, attrsToRemove) {
    _.forEach(attrs, function(val, key) {
      // shouldRemove is either an object or a boolean
      var shouldRemove = attrsToRemove[key];
      if (_.isUndefined(shouldRemove)) {
        return;
      }

      // Support nested object
      if (_.isPlainObject(val) && !_.isArray(val) && _.isPlainObject(shouldRemove)) {
        return this._removeAttributes(val, shouldRemove);
      }

      if (shouldRemove) {
        delete attrs[key];
      }
    }.bind(this));
  },

  /**
   * Remove expandable attributes
   *
   * Does not work for objects embedded inside arrays
   *
   * @param {Object} attrs
   * @param {Object} attrsToRemove
   */

  _removeExpandableAttributes: function(attrs, attrsToRemove) {
    _.forEach(attrs, function(val, key) {
      // shouldRemove is either an object or a boolean
      var shouldRemove = attrsToRemove[key];
      if (_.isUndefined(shouldRemove)) {
        return;
      }

      // Support nested object
      if (_.isPlainObject(val) && !_.isArray(val) && _.isPlainObject(shouldRemove)) {
        return this._removeExpandableAttributes(val, shouldRemove);
      }

      // Make sure attribute is an object
      // Strip all nested properties except for `_id`
      if (_.isPlainObject(attrs[key]) && shouldRemove) {
        attrs[key] = _.pick(attrs[key], ['_id']);
      }
    }.bind(this));
  },

  /**
   * Verifies that all attributes are defined in the schema
   * If an attribute is not defined in the schema, it is removed
   *
   * Note: Mutates `attrs` in place
   *
   * @param {Object} attrs
   * @param {Object} schema
   * @param {Object} defaults
   * @return {Object}
   */

  _validateAttributes: function(attrs, schema, defaults) {
    // NOTE: `attrs` can be either an Object or Array
    if (!_.isObject(attrs) ||
      _.isUndefined(schema) ||
      _.isNull(schema) ||
      _.isEmpty(schema)) {
      return;
    }

    // Iterate over all attributes
    _.forEach(attrs, function(val, key) {
      // NOTE: `schema` might be either an Object or String
      var schemaType = _.isPlainObject(schema) ? schema[key] : schema;
      var schemaDefault = _.isPlainObject(defaults) ? defaults[key] : defaults;

      // if the schema for this key does not exist
      // remove it as a property completely
      if (_.isNull(schemaType) || _.isUndefined(schemaType)) {
        delete attrs[key];
        return;
      }

      debug.info(
        'SCHEMA TYPE -> %s, DEFAULT -> %s, KEY -> %s, VAL -> %s',
        schemaType, schemaDefault, key, val
      );

      // Allow the use of `null` to unset back to default
      if (_.isNull(val) || _.isUndefined(val)) {
        attrs[key] = schemaDefault;
        return;
      }

      // Objects and Arrays
      if (_.isArray(schemaType)) {
        // Empty array is a loosely defined schema, no-op
        // That means allow anything inside
        // Ex: []
        if (!schemaType.length) {
          return;
        }

        // The schema type is defined by the first element in the array
        schemaType = schemaType[0];
        if (_.isArray(schemaDefault)) {
          schemaDefault = schemaDefault[0];
        }

        // Array with an empty object, no-op
        // Ex. [{}]
        if (_.isPlainObject(schemaType) && _.isEmpty(schemaType)) {
          return;
        }

        // Iteratively recursively validate inside each object in the array
        // Ex. [{...}]
        if (_.isPlainObject(schemaType)) {
          _.forEach(val, function(arrVal) {
            // Apply defaults to each object value
            if (schemaDefault) {
              _.defaultsDeep(arrVal, schemaDefault);
            }

            // Recursively validate the array values
            this._validateAttributes(arrVal, schemaType, schemaDefault);
          }.bind(this));
          return;
        }

        // Recursively validate the array
        // Ex: ['string'] or ['integer']
        this._validateAttributes(val, schemaType, schemaDefault);

        // Remove `null` and `undefined` from array values
        attrs[key] = _.without(attrs[key], null, undefined);
        return;
      } else if (_.isPlainObject(schemaType)) {
        // Ex. {...}
        // Recursively validate the object
        this._validateAttributes(val, schemaType, schemaDefault);
        return
      }

      // All other types are defined as a string
      switch (schemaType) {
        case 'id':
          if (!Mixins.isObjectId(attrs[key])) {
            delete attrs[key];
          }
          break;
        case 'string':
          // try to coerce to string
          if (_.hasIn(attrs[key], 'toString')) {
            attrs[key] = attrs[key].toString();
          } else {
            delete attrs[key];
          }
          break;
        case 'integer':
          if (_.isNaN(_.parseInt(attrs[key]))) {
            delete attrs[key];
          }
          break;
        case 'uinteger':
          if (_.isNaN(_.parseInt(attrs[key])) || attrs[key] < 0) {
            delete attrs[key];
          }
          break;
        case 'float':
          if (_.isNaN(parseFloat(attrs[key]))) {
            delete attrs[key];
          }
          break;
        case 'ufloat':
          if (_.isNaN(parseFloat(attrs[key])) || attrs[key] < 0) {
            delete attrs[key];
          }
          break;
        case 'boolean':
          if (!_.isBoolean(attrs[key])) {
            delete attrs[key];
          }
          break;
        case 'timestamp':
          if (!Mixins.isTimestamp(attrs[key])) {
            delete attrs[key];
          }
          break;
        case 'date':
          // Also support ISO8601 strings, convert to date
          if (Mixins.isValidISO8601String(attrs[key])) {
            attrs[key] = new Date(attrs[key]);
          } else {
            delete attrs[key];
          }
          break;
        default:
          // Unsupported type
          delete attrs[key];
          break;
      }
    }.bind(this));
  },

  // Reserved attribute definitions
  idAttribute: '_id',
  userIdAttribute: 'user_id',

  // The mongodb collection name
  urlRoot: 'models',

  // Flag to force all updates to be patches on `sync`
  updateUsingPatch: true,

  /**
   * Return the default value for a schema type
   *
   * @param {string} schemaType
   * @param {*} schemaDefault
   * @return {*}
   */

  _defaultVal: function(schemaType, schemaDefault) {
    if (!_.isUndefined(schemaDefault)) {
      return schemaDefault;
    }
    switch (schemaType) {
      case 'integer':
      case 'uinteger':
      case 'float':
      case 'ufloat':
        return 0;
      case 'boolean':
        return false;
      case 'timestamp':
        return new Date().getTime(); // ms
      case 'date':
        return new Date(); // iso
      default:
        return null;
    }
  },

  /**
   * Get the default attribute values for your model.
   * When creating an instance of the model,
   * any unspecified attributes will be set to their default value.
   *
   * Define defaults as a function.
   *
   * @param  {Object} def
   * @param  {boolean} withArray
   * @return {Object}
   */

  defaults: function(def, withArray) {
    def = def ? def : _.result(this, 'definition');

    return _.reduce(def, function(defaults, attr, key) {
      if (attr.computed) {
        return defaults;
      }
      if (attr.default !== undefined) {
        defaults[key] = _.result(attr, 'default');
      } else if (attr.type === 'object') {
        defaults[key] = this.defaults(attr.fields || {});
      } else if (attr.type === 'array') {
        // withArray to populate nested array values for _validateAttributes
        defaults[key] = withArray ? [this.defaults(attr.fields || {})] : [];
      } else {
        defaults[key] = this._defaultVal(attr.type);
      }
      return defaults;
    }.bind(this), {});
  },

  /**
   * Get the types of each attribute.
   *
   * Define schema as a function.
   *
   * See `model.spec.js` for how to use
   *
   * @param  {Object} def
   * @return {Object}
   */

  schema: function(def) {
    def = def ? def : _.result(this, 'definition');

    return _.reduce(def, function(schema, attr, key) {
      if (attr.type === 'object') {
        schema[key] = this.schema(attr.fields || {});
      } else if (attr.type === 'array') {
        if (attr.value_type === 'object') {
          schema[key] = [this.schema(attr.fields || {})];
        } else if (attr.value_type) {
          schema[key] = [attr.value_type];
        } else {
          schema[key] = [];
        }
      } else {
        schema[key] = attr.type;
      }
      return schema;
    }.bind(this), {});
  },

  /**
   * Define attributes that are not settable from the request
   *
   * @param  {String} prop
   * @param  {Object} def
   * @return {Object}
   */
  findAttributes: function(prop, def) {
    def = def ? def : _.result(this, 'definition');

    return _.reduce(def, function(attrs, attr, key) {
      if (attr.type === 'object') {
        var nested = this.findAttributes(prop, attr.fields || {});
        if (!_.isEmpty(nested)) {
          attrs[key] = nested;
        }
      } if (attr[prop]) {
        attrs[key] = true;
      }
      return attrs;
    }.bind(this), {});
  },

  /**
   * New and improved way to define model attributes.
   * Used to derive `schema`, `defaults`, and other
   * properties that can be defined independently.
   *
   * @return {Object}
   */

  definition: function() {
    return {};
  },

  /**
   * Define db indexes
   *
   * @return {Array}
   */

  indexes: function() {
    return [];
  },

  // http://backbonejs.org/docs/backbone.html#section-35
  constructor: function(attributes, options) {
    var attrs = attributes || {};
    options || (options = {});
    this.cid = _.uniqueId('c');
    this.attributes = {};
    if (options.collection) this.collection = options.collection;
    if (options.parse) attrs = this.parse(attrs, options) || {};
    this._schema = this.schema();
    this._defaults = this.defaults(undefined, true);
    attrs = _.defaultsDeep({}, attrs, this.defaults(undefined, false));
    this.set(attrs, options);
    this.changed = {};
    this.initialize.apply(this, arguments);
  },

  initialize: function() {
    this.db; // reference to a mongodb client/connection
    this.changedFromRequest = {};
    this.previousFromRequest = {};
  },

  /**
   * Backbone `parse` extended with support for defaults
   *
   * @param {Object|Array} resp
   * @param {Object} options
   * @return {Object}
   */

  parse: function(resp, options) {
    // Mongodb sometimes returns an array of one document
    if (_.isArray(resp)) {
      resp = resp[0];
    }
    resp = _.defaultsDeep({}, resp, this.defaults());
    return resp;
  },

  /**
   * Backbone `set` extended with support for schema
   *
   * TODO @ptshih Extend with lodash `set` (nested/deep)
   *
   * @return {*}
   */

  set: function(key, val, options) {
    var attrs;
    if (key === null) return this;

    if (typeof key === 'object') {
      attrs = key;
      options = val;
    } else {
      (attrs = {})[key] = val;
    }

    options || (options = {});

    // Don't override unset
    if (options.unset) {
      return Backbone.Model.prototype.set.apply(this, arguments);
    }

    // Apply schema
    this._validateAttributes(attrs, this._schema, this._defaults);

    return Backbone.Model.prototype.set.call(this, attrs, options);
  },

  /**
   * Backbone `get` extended with support for deep/nested get
   *
   * Examples:
   *
   * - 'foo'
   * - 'foo.bar'
   * - 'foo.bar.0'
   * - 'foo.bar.1.baz'
   *
   * Lodash Examples:
   *
   * - 'foo'
   * - 'foo.bar'
   * - 'foo.bar[0]'
   * - 'foo.bar[1].baz'
   *
   * @param {String} attr
   * @return {*}
   */

  get: function(attr) {
    return this.getDeep(this.attributes, attr);
  },

  // DEPRECATED 2015-05-08
  // Soon `get` will use lodash `get` instead of `getDeep`
  getDeep: function(attrs, attr) {
    if (!_.isString(attr)) {
      return undefined;
    }

    var keys = attr.split('.');
    var key;
    var val = attrs;
    var context = this;

    for (var i = 0, n = keys.length; i < n; i++) {
      // get key
      key = keys[i];

      // Hold reference to the context when diving deep into nested keys
      if (i > 0) {
        context = val;
      }

      // get value for key
      val = val[key];

      // value for key does not exist
      // break out of loop early
      if (_.isUndefined(val) || _.isNull(val)) {
        break;
      }
    }

    // Eval computed properties that are functions
    if (_.isFunction(val)) {
      // Call it with the proper context (see above)
      val = val.call(context);
    }

    return val;
  },

  /**
   * Backbone `toJSON` extended with support for lodash `cloneDeep`
   */

  toJSON: function(options) {
    var json = _.cloneDeep(this.attributes);
    return json;
  },

  /**
   * Converts model attributes into a pojo (json object)
   * Also removes all attributes that are defined to be hidden
   * Uses `toJSON`
   *
   * @return {Object} POJO/JSON
   */

  render: function() {
    var json = this.toJSON();
    var hiddenAttributes = this.findAttributes('hidden');
    this._removeAttributes(json, hiddenAttributes);
    return json;
  },

  /**
   * Alias for `render`
   */

  toResponse: function() {
    return this.render();
  },

  /**
   * Used to set attributes from a request body
   * Assume `this.attributes` is populated with existing data
   *
   * @param {Object} body This is the request params/body
   * @return {Promise.<Model>}
   */

  setFromRequest: Bluebird.method(function(body) {
    body = this._mergeSafe(body, this.attributes);

    // Remove read only attributes
    var readOnlyAttributes = this.findAttributes('readonly');
    this._removeAttributes(body, readOnlyAttributes);

    // Remove computed attributes
    var computedAttributes = this.findAttributes('computed');
    this._removeAttributes(this.attributes, computedAttributes);

    // Set new attributes
    this.set(body);

    // At this point, we take a snapshot of the changed attributes
    // A copy of the `changed` attributes right after the request body is set
    this.changedFromRequest = _.cloneDeep(this.changed);
    this.previousFromRequest = _.cloneDeep(this.previousAttributes());

    return this;
  }),

  /**
   * Lifecycle Methods
   *
   * These can either return a promise or a value
   */

  beforeFetch: Bluebird.method(function() {
    return this;
  }),

  afterFetch: Bluebird.method(function() {
    return this;
  }),

  beforeCreate: Bluebird.method(function() {
    return this;
  }),

  beforeUpdate: Bluebird.method(function() {
    return this;
  }),

  afterCreate: Bluebird.method(function() {
    return this;
  }),

  afterUpdate: Bluebird.method(function() {
    return this;
  }),

  beforeSave: Bluebird.method(function() {
    return this;
  }),

  afterSave: Bluebird.method(function() {
    return this;
  }),

  /**
   * Override the backbone sync method for use with mongodb
   *
   * Also, if `updateUsingPatch` is enabled,
   * All updates (PUT) will be aliased to patches (PATCH)
   *
   * The `options` object can contains 2 callbacks:
   * Both callbacks have parameters (model, resp, options)
   * `resp` is either a `document` or an `error` object
   *
   * - `success`
   * - `error`
   *
   * Events:
   *
   * - A `request` event is fired before with parameters (model, op, options)
   * - A `sync` event is fired after with parameters (model, resp, options)
   *
   * @param {String} method
   * @param {Model} model
   * @param {Object} options
   * @return {Promise.<Collection>}
   */

  sync: Bluebird.method(function(method, model, options) {
    // Force all `update` to actually be `patch` if configured
    if (this.updateUsingPatch && method === 'update') {
      method = 'patch';
    }

    var op = this[method].call(this, model, options);
    model.trigger('request', model, op, options);
    return op;
  }),

  /**
   * Backbone `fetch` extended and promisified
   * Support `before` and `after` lifecycle methods
   *
   * @return {Promise.<Model>}
   */

  fetch: Bluebird.method(function() {
    var originalArguments = arguments;

    return Bluebird.bind(this).tap(function() {
      return this.beforeFetch.apply(this, originalArguments);
    }).tap(function() {
      return Backbone.Model.prototype.fetch.apply(this, originalArguments);
    }).tap(function() {
      return this.afterFetch.apply(this, originalArguments);
    }).return(this);
  }),

  /**
   * Backbone `save` extended and promisified
   *
   * @return {Promise.<Model>}
   */

  save: Bluebird.method(function() {
    debug.info('Model [%s] save called', this.urlRoot);
    var originalArguments = arguments;

    // Remove computed attributes
    var computedAttributes = this.findAttributes('computed');
    this._removeAttributes(this.attributes, computedAttributes);

    // Remove expandable attributes
    var expandableAttributes = this.findAttributes('expandable');
    this._removeExpandableAttributes(this.attributes, expandableAttributes);

    var beforeFn, afterFn;
    if (this.isNew()) {
      beforeFn = this.beforeCreate;
      afterFn = this.afterCreate;
    } else {
      beforeFn = this.beforeUpdate;
      afterFn = this.afterUpdate;
    }

    return Bluebird.bind(this).tap(function() {
      return beforeFn.apply(this, originalArguments);
    }).tap(function() {
      return this.beforeSave.apply(this, originalArguments);
    }).tap(function() {
      return Backbone.Model.prototype.save.apply(this, originalArguments);
    }).tap(function() {
      if (this.validationError instanceof Error) {
        throw this.validationError;
      }
    }).tap(function() {
      return afterFn.apply(this, originalArguments);
    }).tap(function() {
      return this.afterSave.apply(this, originalArguments);
    }).return(this);
  }),

  /**
   * Inserts a mongodb document
   *
   * @param {Model} model
   * @param {Object} options
   * @return {Promise.<Model>}
   */

  create: Bluebird.method(function(model, options) {
    debug.info('Model [%s] create called', this.urlRoot);

    return this.db.insert(
      this.urlRoot,
      model.toJSON(),
      this._wrapResponse(options)
    ).return(this);
  }),

  /**
   * Updates a mongodb document
   *
   * NOTE: This replaces the entire document with the model attributes
   *
   * The parameter `options` has the following properties:
   *
   * - `require` If true, will throw an error if document is not found
   *
   * @param {Model} model
   * @param {Object} options
   * @return {Promise.<Model>}
   */

  update: Bluebird.method(function(model, options) {
    // If no ID in query, error out
    if (model.isNew()) {
      var err = new MuniError('Cannot update a new model.', 400);
      options.error(err);
      throw err;
    }

    // Build query against the model's id
    var query = {};
    query[this.idAttribute] = model.id;
    if (!!model.get(this.userIdAttribute)) {
      query[this.userIdAttribute] = model.get(this.userIdAttribute);
    }

    // Mongo options
    // Don't support `multi`, this is a single model
    var mongoOptions = _.pick(options, ['require']) || {};

    debug.info(
      'Model [%s] update with query: %s and options: %s',
      this.urlRoot,
      JSON.stringify(query),
      JSON.stringify(mongoOptions)
    );

    return this.db.findAndModify(
      this.urlRoot,
      query,
      model.toJSON(),
      mongoOptions,
      this._wrapResponse(options)
    ).return(this);
  }),

  /**
   * Sets a mongodb document
   *
   * NOTE: This sets only explicitly provided model attributes
   *
   * The parameter `options` has the following properties:
   *
   * - `require` If true, will throw an error if document is not found
   *
   * @param {Model} model
   * @param {Object} options
   * @return {Promise.<Model>}
   */

  patch: Bluebird.method(function(model, options) {
    // If no ID in query, error out
    if (model.isNew()) {
      var err = new MuniError('Cannot patch a new model.', 400);
      options.error(err);
      throw err;
    }

    // Build query against the model's id
    var query = {};
    query[this.idAttribute] = model.id;
    if (!!model.get(this.userIdAttribute)) {
      query[this.userIdAttribute] = model.get(this.userIdAttribute);
    }

    // Patch attributes with mongodb set
    var attrs = model.toJSON();
    delete attrs[this.idAttribute];

    // Use mongodb set to only update explicit attributes using `$set`
    var obj = {
      '$set': attrs
    };

    // Mongo options
    // Don't support `multi`, this is a single model
    var mongoOptions = _.pick(options, ['require']) || {};

    debug.info(
      'Model [%s] patch with query: %s and options: %s',
      this.urlRoot,
      JSON.stringify(query),
      JSON.stringify(options)
    );

    return this.db.findAndModify(
      this.urlRoot,
      query,
      obj,
      mongoOptions,
      this._wrapResponse(options)
    ).return(this);
  }),

  /**
   * Deletes a mongodb document
   *
   * Note this Promise returns a Number not a Model
   *
   * @param {Model} model
   * @param {Object} options
   * @return {Promise.<Number>} Number of documents deleted
   */

  delete: Bluebird.method(function(model, options) {
    // If no ID in query, error out
    if (model.isNew()) {
      var err = new MuniError('Cannot delete a new model.', 400);
      options.error(err);
      throw err;
    }

    // Build query against the model's id
    var query = {};
    query[this.idAttribute] = model.id;

    debug.info(
      'Model [%s] delete with query: %s',
      this.urlRoot,
      JSON.stringify(query)
    );

    return this.db.remove(
      this.urlRoot,
      query,
      this._wrapResponse(options)
    );
  }),

  /**
   * Finds a single mongodb document
   *
   * The parameter `options` has the following properties:
   *
   * - `query` The query to use for the database
   * - `require` If true, will throw an error if document is not found
   * - `readPreference` Use a read preference when running this query
   *
   * @param {Model} model
   * @param {Object} options
   * @return {Promise.<Model>}
   */

  read: Bluebird.method(function(model, options) {
    var query = {};
    if (_.isPlainObject(options.query)) {
      // Build query
      query = options.query;
    } else {
      if (model.isNew()) {
        // If no ID in query, error out
        var err = new MuniError('Cannot read a new model.', 400);
        options.error(err);
        throw err;
      }

      // Build query against the model's id and user_id if it exists
      query[this.idAttribute] = model.id;
      if (!!model.get(this.userIdAttribute)) {
        query[this.userIdAttribute] = model.get(this.userIdAttribute);
      }
    }

    // Mongo options
    var mongoOptions = _.pick(options, [
      'require',
      'readPreference',
      'sort',
      'fields',
      'limit',
      'skip'
    ]) || {};

    debug.info(
      'Model [%s] read with query: %s and options: %s',
      this.urlRoot,
      JSON.stringify(mongoOptions),
      JSON.stringify(query)
    );

    return Bluebird.bind(this).tap(function() {
      return this.ensureIndexes();
    }).tap(function() {
      return this.db.findOne(
        this.urlRoot,
        query,
        mongoOptions,
        this._wrapResponse(options)
      );
    }).return(this);
  }),

  /**
   * Ensure indexes are created if defined
   * Only once per process/collection
   *
   * @return {Promise}
   */

  ensureIndexes: Bluebird.method(function() {
    if (INDEXED[this.urlRoot]) {
      // No-op
      return;
    }

    INDEXED[this.urlRoot] = true;

    var promises = [];
    var indexes = _.result(this, 'indexes');
    _.forEach(indexes, function(index) {
      var options = index.options || {};

      _.defaults(options, {
        background: true
      });

      promises.push(
        this.db.createIndex(
          this.urlRoot,
          index.keys,
          options
        ).bind(this).catch(function(err) {
          debug.warn(
            '#ensureIndex [%s]: %s',
            this.urlRoot,
            err
          );
        })
      );
    }.bind(this));

    return Bluebird.all(promises);
  })
});
