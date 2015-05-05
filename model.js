'use strict';

// References
// ---
// https://github.om/jsantell/backbone-promised/blob/master/index.js

// Dependencies
// ---
var _ = require('lodash');
var Promise = require('bluebird');
var Backbone = require('backbone');
var debug = require('./debug');

module.exports = Backbone.Model.extend({
  // mongodb id attribute, usually `_id`
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

  // The defaults hash (or function) can be used
  // to specify the default attributes for your model.
  // When creating an instance of the model,
  // any unspecified attributes will be set to their default value.
  //
  // Remember that in JavaScript, objects are passed by reference,
  // so if you include an object as a default value,
  // it will be shared among all instances.
  // Instead, define defaults as a function.
  //
  // See `model.spec.js` for how to use

  defaults: function() {},

  // Defaults that should be applied to all models
  // Object or Function
  baseDefaults: function() {},

  combinedDefaults: function() {
    var defaults = _.result(this, 'defaults');
    _.merge(defaults, _.result(this, 'baseDefaults'));
    return defaults;
  },

  // Define the types of each attribute
  // Object or Function
  // See `model.spec.js` for how to use
  schema: function() {},

  // Attributes that should be included in all responses
  // Object or Function
  baseSchema: function() {},

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
    attrs = _.defaultsDeep({}, attrs, _.result(this, 'combinedDefaults'));
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

  // Set defaults and apply/validate schema
  parse: function(resp, options) {
    // Mongodb sometimes returns an array of one document
    if (_.isArray(resp)) {
      resp = resp[0];
    }

    resp = _.defaultsDeep({}, resp, _.result(this, 'combinedDefaults'));

    return resp;
  },

  // Responsible for setting attributes after a database call
  // Takes the mongodb response and calls the Backbone success method
  wrapResponse: function(options) {
    return function(err, resp) {
      if (err) {
        options.error(err);
      } else {
        options.success(resp);
      }
    };
  },

  // Getters and Setters
  // ---


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
    this.validateAttributes(attrs, schema);

    return Backbone.Model.prototype.set.call(this, attrs, options);
  },

  // Tested and working with both shallow and deep keypaths
  get: function(attr) {
    if (!_.isString(attr)) {
      return undefined;
    }

    return this.getDeep(this.attributes, attr);
  },

  // Support dot notation of accessing nested keypaths
  getDeep: function(attrs, attr) {
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

  // TODO setDeep

  // Note: Mutates attrs
  // Verifies that all attr keys are defined in the schema
  // If an attr does not have a corresponding schema, it is removed
  validateAttributes: function(attrs, schema) {
    if (!_.isObject(attrs) || _.isUndefined(schema) || _.isNull(schema)) {
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
            this.validateAttributes(arrVal, schemaType);
          }, this);
          return;
        }

        // Recursively validate the array
        // Ex: ['string'] or ['integer']
        return this.validateAttributes(val, schemaType);
      } else if (_.isObject(schemaType)) {
        // Empty object is a loosely defined schema, no-op
        // That means allow anything inside
        // Ex: {}
        if (_.isEmpty(schemaType)) {
          return;
        }

        // Recursively validate the object
        // Ex: {...}
        return this.validateAttributes(val, schemaType);
      }

      // All other types are defined as a string
      switch (schemaType) {
        case 'id':
          isValid = _.isObjectId(val);
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
          isValid = _.isTimestamp(val);
          break;
        case 'date':
          // Also support ISO8601 strings, convert to date
          if (_.isString(val) && _.isValidISO8601String(val)) {
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

  // Removes attributes
  // Does not work for objects embedded inside arrays
  removeAttributes: function(attrs, options) {
    _.each(attrs, function(val, key) {
      // shouldRemove is either an object or a boolean
      var shouldRemove = options[key];
      if (_.isUndefined(shouldRemove)) {
        return;
      }

      // Support nested object
      if (_.isObject(val) && !_.isArray(val) && _.isObject(shouldRemove)) {
        return this.removeAttributes(val, shouldRemove);
      }

      if (shouldRemove) {
        delete attrs[key];
      }
    }, this);
  },

  // Removes expandable attributes
  // Does not work for objects embedded inside arrays
  removeExpandableAttributes: function(attrs, options) {
    _.each(attrs, function(val, key) {
      // shouldRemove is either an object or a boolean
      var shouldRemove = options[key];
      if (_.isUndefined(shouldRemove)) {
        return;
      }

      // Support nested object
      if (_.isObject(val) && !_.isArray(val) && _.isObject(shouldRemove)) {
        return this.removeExpandableAttributes(val, shouldRemove);
      }

      // Make sure attribute is an object
      // Strip all nested properties except for `_id`
      if (_.isObject(attrs[key]) && shouldRemove) {
        attrs[key] = _.pick(attrs[key], ['_id']);
      }
    }, this);
  },

  // Override backbone's `toJSON` to support `cloneDeep`
  toJSON: function(options) {
    var json = _.cloneDeep(this.attributes);
    return json;
  },

  // Convert attributes into a pojo,
  // then remove attributes that should be hidden
  render: function() {
    var json = this.toJSON();
    var hiddenAttributes = _.result(this, 'hiddenAttributes');
    this.removeAttributes(json, hiddenAttributes);
    return json;
  },

  // Alias for `render`
  toResponse: function() {
    return this.render();
  },



  // Used to set attributes from a request body
  // Assume `this.attributes` is populated with existing data
  setFromRequest: Promise.method(function(body) {
    body = _.mergeSafe(body, this.attributes);

    // Remove read only attributes
    var readOnlyAttributes = _.result(this, 'readOnlyAttributes');
    this.removeAttributes(body, readOnlyAttributes);

    // Set new attributes
    this.set(body);

    // At this point, we take a snapshot of the changed attributes
    // A copy of the `changed` attributes right after the request body is set
    this.changedFromRequest = _.cloneDeep(this.changed);
    this.previousFromRequest = _.cloneDeep(this.previousAttributes());

    return this;
  }),



  // Lifecycle methods
  // ---
  // These can either return a promise or a value

  beforeFetch: Promise.method(function() {
    return this;
  }),

  afterFetch: Promise.method(function() {
    return this;
  }),

  beforeCreate: Promise.method(function() {
    return this;
  }),

  beforeUpdate: Promise.method(function() {
    return this;
  }),

  afterCreate: Promise.method(function() {
    return this;
  }),

  afterUpdate: Promise.method(function() {
    return this;
  }),

  beforeSave: Promise.method(function() {
    return this;
  }),

  afterSave: Promise.method(function() {
    return this;
  }),

  // Override the backbone sync method for use with mongodb
  // options contains 2 callbacks: `success` and `error`
  // Both callbacks have parameters (model, resp, options)
  // `resp` is either a `document` or an `error` object
  //
  // Events
  // ---
  // A `request` event is fired before with parameters (model, op, options)
  // A `sync` event is fired after with parameters (model, resp, options)
  sync: Promise.method(function(method, model, options) {
    // Force all `update` to actually be `patch` if configured
    if (this.updateUsingPatch && method === 'update') {
      method = 'patch';
    }

    var op = this[method].call(this, model, options);
    model.trigger('request', model, op, options);
    return op;
  }),

  // Adds before/after fetch lifecycle methods
  fetch: Promise.method(function() {
    var originalArguments = arguments;

    return Promise.bind(this).then(function() {
      return this.beforeFetch.apply(this, originalArguments);
    }).then(function() {
      return Backbone.Model.prototype.fetch.apply(this, originalArguments);
    }).then(function() {
      return this.afterFetch.apply(this, originalArguments);
    }).catch(function(err) {
      debug.error('#fetch:', err);
      throw err;
    });
  }),


  // Return a rejected promise if validation fails
  // Bubble up the `validationError` from Backbone
  save: Promise.method(function() {
    var originalArguments = arguments;

    // Remove expandable attributes
    var expandableAttributes = _.result(this, 'expandableAttributes');
    this.removeExpandableAttributes(this.attributes, expandableAttributes);

    var beforeFn, afterFn;
    if (this.isNew()) {
      beforeFn = this.beforeCreate;
      afterFn = this.afterCreate;
    } else {
      beforeFn = this.beforeUpdate;
      afterFn = this.afterUpdate;
    }

    return Promise.bind(this).then(function() {
      return beforeFn.apply(this, originalArguments);
    }).then(function() {
      return this.beforeSave.apply(this, originalArguments);
    }).then(function() {
      var op = Backbone.Model.prototype.save.apply(this, originalArguments);
      if (!op) {
        return Promise.reject(this.validationError);
      }
      return op;
    }).then(function() {
      return afterFn.apply(this, originalArguments);
    }).then(function() {
      return this.afterSave.apply(this, originalArguments);
    });
  }),

  // Inserts a mongodb document
  create: Promise.method(function(model, options) {
    debug.log('Model [%s] create called', this.urlRoot);
    return this.db.insert(
      this.urlRoot,
      model.toJSON(),
      this.wrapResponse(options)
    ).return(this);
  }),

  // Updates a mongodb document
  // NOTE: This replaces the entire document with the model attributes
  update: Promise.method(function(model, options) {
    // If no ID in query, error out
    if (model.isNew()) {
      var err = new Error('No ID for Model');
      options.error(err);
      throw err;
    }

    // Build query against the model's id
    var query = {};
    query[this.idAttribute] = model.id;
    if (!!model.get(this.userIdAttribute)) {
      query[this.userIdAttribute] = model.get(this.userIdAttribute);
    }

    var mongoOptions = _.pick(options, ['require']) || {};
    debug.log('Model [%s] update with query: %s',
      this.urlRoot, JSON.stringify(query));
    return this.db.findAndModify(
      this.urlRoot,
      query,
      model.toJSON(),
      mongoOptions,
      this.wrapResponse(options)
    ).return(this);
  }),

  // Updates a mongodb document
  // NOTE: This sets only explicitly provided model attributes
  patch: Promise.method(function(model, options) {
    // If no ID in query, error out
    if (model.isNew()) {
      var err = new Error('No ID for Model');
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

    var mongoOptions = _.pick(options, ['require']) || {};
    debug.log('Model [%s] patch with query: %s',
      this.urlRoot, JSON.stringify(query));
    return this.db.findAndModify(
      this.urlRoot,
      query,
      obj,
      mongoOptions,
      this.wrapResponse(options)
    ).return(this);
  }),

  // Removes a mongodb document
  // Must have ID
  delete: Promise.method(function(model, options) {
    // If no ID in query, error out
    if (model.isNew()) {
      var err = new Error('No ID for Model');
      options.error(err);
      throw err;
    }

    // Build query against the model's id
    var query = {};
    query[this.idAttribute] = model.id;

    debug.log('Model [%s] delete with query: %s',
      this.urlRoot, JSON.stringify(query));

    return this.db.remove(
      this.urlRoot,
      query,
      this.wrapResponse(options)
    );
  }),

  // Finds a single mongodb document
  // If `options.query` is provided and is an object,
  // it is used as the query
  read: Promise.method(function(model, options) {
    var query = {};
    if (_.isObject(options.query)) {
      // Build query
      query = options.query;
    } else {
      if (model.isNew()) {
        // If no ID in query, error out
        var err = new Error('Trying to fetch a model with no `_id` attribute.');
        options.error(err);
        throw err;
      }

      // Build query against the model's id and user_id if it exists
      query[this.idAttribute] = model.id;
      if (!!model.get(this.userIdAttribute)) {
        query[this.userIdAttribute] = model.get(this.userIdAttribute);
      }
    }

    var mongoOptions = _.pick(options, ['require']) || {};
    debug.log('Model [%s] read with query: %s',
      this.urlRoot, JSON.stringify(query));

    return this.db.findOne(
      this.urlRoot,
      query,
      mongoOptions,
      this.wrapResponse(options)
    ).return(this);
  })
});
