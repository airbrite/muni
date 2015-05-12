'use strict';

// References
// ---
// https://github.om/jsantell/backbone-promised/blob/master/index.js

var _ = require('lodash');
var Bluebird = require('bluebird');
var Backbone = require('backbone');
var moment = require('moment');
var debug = require('./debug');
var BootieError = require('./error');
var Mixins = require('./mixins');

module.exports = Backbone.Model.extend({
  /**
   * Deep version of lodash `defaults`
   *
   * @return {Object}
   */

  _defaultsDeep: _.partialRight(_.merge, function deep(value, other) {
    return _.merge(value, other, deep);
  }),

  /**
   * Do not merge arrays and empty objects
   * Arrays always want to be overwritten explicitly (empty or not)
   * Objects want to be overwritten explicitly when empty
   *
   * @return {Object}
   */

  _mergeSafe: _.partialRight(_.merge, function deep(value, other) {
    if (_.isArray(value)) {
      // If array, do not deep merge
      return value;
    } else if (_.isObject(value) && _.isEmpty(value)) {
      // If empty object, do not merge
      return value;
    }
    return _.merge(value, other, deep);
  }),

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
    _.each(attrs, function(val, key) {
      // shouldRemove is either an object or a boolean
      var shouldRemove = attrsToRemove[key];
      if (_.isUndefined(shouldRemove)) {
        return;
      }

      // Support nested object
      if (_.isObject(val) && !_.isArray(val) && _.isObject(shouldRemove)) {
        return this._removeAttributes(val, shouldRemove);
      }

      if (shouldRemove) {
        delete attrs[key];
      }
    }, this);
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
    _.each(attrs, function(val, key) {
      // shouldRemove is either an object or a boolean
      var shouldRemove = attrsToRemove[key];
      if (_.isUndefined(shouldRemove)) {
        return;
      }

      // Support nested object
      if (_.isObject(val) && !_.isArray(val) && _.isObject(shouldRemove)) {
        return this._removeExpandableAttributes(val, shouldRemove);
      }

      // Make sure attribute is an object
      // Strip all nested properties except for `_id`
      if (_.isObject(attrs[key]) && shouldRemove) {
        attrs[key] = _.pick(attrs[key], ['_id']);
      }
    }, this);
  },


  /**
   * Verifies that all attributes are defined in the schema
   * If an attribute is not defined in the schema, it is removed
   *
   * Note: Mutates `attrs` in place
   *
   * @param {Object} attrs
   * @param {Object} schema
   * @return {Object}
   */

  _validateAttributes: function(attrs, schema) {
    if (!_.isObject(attrs) ||
      _.isUndefined(schema) ||
      _.isNull(schema) ||
      _.isEmpty(schema)) {
      return;
    }

    _.each(attrs, function(val, key) {
      var isValid = false;
      // schema might be either an object or a string
      var schemaType = _.isObject(schema) ? schema[key] : schema;

      // if the schema for this key does not exist
      // remove it as a property completely
      if (_.isNull(schemaType) || _.isUndefined(schemaType)) {
        delete attrs[key];
        return;
      }

      // Allow the use of `null` to unset
      if (_.isNull(val) || _.isUndefined(val)) {
        attrs[key] = null;
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

        // Array with an empty object, no-op
        // Ex. [{}]
        if (_.isObject(schemaType) && _.isEmpty(schemaType)) {
          return;
        }

        // Iteratively recursively validate inside each object in the array
        // Ex. [{...}]
        if (_.isObject(schemaType)) {
          _.each(val, function(arrVal) {
            this._validateAttributes(arrVal, schemaType);
          }, this);
          return;
        }

        // Recursively validate the array
        // Ex: ['string'] or ['integer']
        return this._validateAttributes(val, schemaType);
      } else if (_.isObject(schemaType)) {
        // Empty object is a loosely defined schema, no-op
        // That means allow anything inside
        // Ex: {}
        if (_.isEmpty(schemaType)) {
          return;
        }

        // Recursively validate the object
        // Ex: {...}
        return this._validateAttributes(val, schemaType);
      }

      // All other types are defined as a string
      switch (schemaType) {
        case 'id':
          isValid = Mixins.isObjectId(val);
          break;
        case 'string':
          isValid = _.isString(val);
          break;
        case 'integer':
          // coerce value into integer
          attrs[key] = val = _.parseInt(val) || 0;
          isValid = _.isNumber(val) && !_.isNaN(val);
          break;
        case 'uinteger':
          // coerce value into integer
          attrs[key] = val = _.parseInt(val) || 0;
          isValid = _.isNumber(val) && !_.isNaN(val) && val >= 0;
          break;
        case 'float':
          // coerce value into float
          attrs[key] = val = parseFloat(val) || 0;
          isValid = _.isNumber(val) && !_.isNaN(val);
          break;
        case 'ufloat':
          // coerce value into float
          attrs[key] = val = parseFloat(val) || 0;
          isValid = _.isNumber(val) && !_.isNaN(val) && val >= 0;
          break;
        case 'boolean':
          // coerce value into a boolean
          attrs[key] = val = !!val;
          isValid = _.isBoolean(val);
          break;
        case 'timestamp':
          isValid = Mixins.isTimestamp(val);
          break;
        case 'date':
          // Also support ISO8601 strings, convert to date
          if (_.isString(val) && Mixins.isValidISO8601String(val)) {
            attrs[key] = val = new Date(val);
          }
          isValid = _.isDate(val);
          break;
        default:
          isValid = false;
          break;
      }

      // Invalid value for schema type
      // Array elements default to `null` if invalid
      // Other keys are deleted
      if (!isValid) {
        if (_.isArray(attrs)) {
          attrs[key] = null;
        } else {
          delete attrs[key];
        }
      }
    }, this);
  },



  // Reserved attribute definitions
  idAttribute: '_id',
  userIdAttribute: 'user_id',

  // The mongodb collection name
  urlRoot: 'models',

  // Flag to force all updates to be patches on `sync`
  updateUsingPatch: true,

  // Attributes that are not settable from the request
  readOnlyAttributes: {},

  // Attributes that should be saved to the database but NOT rendered to JSON
  hiddenAttributes: {},

  // Attributes that can be expanded (relations) and should NOT be saved to the database
  // Does not support nested objects
  expandableAttributes: {},

  /**
   * The defaults hash (or function) can be used
   * to specify the default attributes for your model.
   * When creating an instance of the model,
   * any unspecified attributes will be set to their default value.
   *
   * Remember that in JavaScript, objects are passed by reference,
   * so if you include an object as a default value,
   * it will be shared among all instances.
   * Instead, define defaults as a function.
   *
   * @return {Object}
   */

  defaults: function() {
    return {};
  },

  // DEPRECATED 2015-05-08
  // Use `defaults` instead
  // Defaults that should be applied to all models
  baseDefaults: function() {
    return {};
  },

  // DEPRECATED 2015-05-08
  combinedDefaults: function() {
    var defaults = _.result(this, 'defaults');
    _.merge(defaults, _.result(this, 'baseDefaults'));
    return defaults;
  },

  /**
   * Define the types of each attribute
   *
   * See `model.spec.js` for how to use
   *
   * @return {Object}
   */

  schema: function() {
    return {};
  },

  // DEPRECATED 2015-05-08
  // Use `schema` instead
  // Attributes that should be included in all responses
  baseSchema: function() {
    return {};
  },

  // DEPRECATED 2015-05-08
  combinedSchema: function() {
    var schema = _.result(this, 'schema');
    _.merge(schema, _.result(this, 'baseSchema'));
    return schema;
  },

  // Override to support `defaultsDeep` and `combinedDefaults`
  // http://backbonejs.org/docs/backbone.html#section-35
  constructor: function(attributes, options) {
    var attrs = attributes || {};
    options || (options = {});
    this.cid = _.uniqueId('c');
    this.attributes = {};
    if (options.collection) this.collection = options.collection;
    if (options.parse) attrs = this.parse(attrs, options) || {};
    attrs = this._defaultsDeep({}, attrs, _.result(this, 'combinedDefaults'));
    this.set(attrs, options);
    this.changed = {};
    this.initialize.apply(this, arguments);
  },

  initialize: function() {
    this.db; // reference to a mongodb client/connection
    this.cache; // reference to a redis client/connection
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
    resp = this._defaultsDeep({}, resp, _.result(this, 'combinedDefaults'));
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
    var schema = _.result(this, 'combinedSchema');
    this._validateAttributes(attrs, schema);

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
    var hiddenAttributes = _.result(this, 'hiddenAttributes');
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
    var readOnlyAttributes = _.result(this, 'readOnlyAttributes');
    this._removeAttributes(body, readOnlyAttributes);

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
    debug.log('Model [%s] save called', this.urlRoot);
    var originalArguments = arguments;

    // Remove expandable attributes
    var expandableAttributes = _.result(this, 'expandableAttributes');
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
    debug.log('Model [%s] create called', this.urlRoot);

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
      var err = new BootieError('Cannot update a new model.', 400);
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

    debug.log(
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
      var err = new BootieError('Cannot patch a new model.', 400);
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

    debug.log(
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
      var err = new BootieError('Cannot delete a new model.', 400);
      options.error(err);
      throw err;
    }

    // Build query against the model's id
    var query = {};
    query[this.idAttribute] = model.id;

    debug.log(
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
    if (_.isObject(options.query)) {
      // Build query
      query = options.query;
    } else {
      if (model.isNew()) {
        // If no ID in query, error out
        var err = new BootieError('Cannot read a new model.', 400);
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
      'readPreference'
    ]) || {};

    debug.log(
      'Model [%s] read with query: %s and options: %s',
      this.urlRoot,
      JSON.stringify(mongoOptions),
      JSON.stringify(query)
    );

    return this.db.findOne(
      this.urlRoot,
      query,
      mongoOptions,
      this._wrapResponse(options)
    ).return(this);
  })
});
