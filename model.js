'use strict';

// References
// ---
// https://github.om/jsantell/backbone-promised/blob/master/index.js

// Dependencies
// ---
var _ = require('lodash');
var Promise = require('bluebird');
var Backbone = require('backbone');

module.exports = Backbone.Model.extend({
  debug: false,

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

  // The defaults hash (or function) can be used
  // to specify the default attributes for your model.
  // When creating an instance of the model,
  // any unspecified attributes will be set to their default value.
  //
  // Remember that in JavaScript, objects are passed by reference,
  // so if you include an object as a default value,
  // it will be shared among all instances.
  // Instead, define defaults as a function.
  // Object or Function
  // string: null
  // integer: 0
  // float: 0.0
  // boolean: true or false
  // object: {}
  // array: []
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
  // key: 'string'
  // key: 'integer'
  // key: 'float'
  // key: 'date'
  // key: {inner_key: 'string'}
  // key: ['string']
  // key: [{inner_key: 'string'}]
  // key: ['model']
  schema: function() {},

  // Attributes that should be included in all responses
  // Object or Function
  baseSchema: function() {},

  combinedSchema: function() {
    var schema = _.result(this, 'schema');
    _.merge(schema, _.result(this, 'baseSchema'));
    return schema;
  },

  constructor: function() {
    Backbone.Model.prototype.constructor.apply(this, arguments);

    // Apply `baseDefaults`
    _.defaults(this.attributes, _.result(this, 'baseDefaults'));
  },

  initialize: function() {
    this.db; // reference to a mongodb client/connection
    this.cache; // reference to a redis client/connection
    this.requestAttributes = {};
    this.changedFromRequest = {};
    this.previousFromRequest = {};
  },

  // Set defaults and apply/validate schema
  parse: function(resp, options) {
    // Mongodb `create` returns an array of one document
    if (_.isArray(resp)) {
      resp = resp[0];
    }

    // Set defaults and apply schema
    var defaults = _.result(this, 'combinedDefaults');
    _.defaultsDeep(resp, defaults);
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

  // TODO: Perform `schema` validation here
  _validate: function(attrs, options) {
    var valid = Backbone.Model.prototype._validate.apply(this, arguments);

    if (!valid) {
      return false;
    }

    return true;
  },

  // Note: Mutates attrs
  // Verifies that all attr keys are defined in the schema
  // If an attr does not have a corresponding schema, it is removed
  validateAttributes: function(attrs, schema) {
    _.each(attrs, function(val, key) {
      // schema might be either an object or a string
      var schemaType = _.isObject(schema) ? schema[key] : schema;
      var isValid = false;

      // Objects and Arrays
      if (_.isArray(schemaType)) {
        // Empty array [], no-op
        if (!schemaType.length) {
          return;
        }

        schemaType = schemaType[0];

        // Empty array with an empty object [{}], no-op
        if (_.isObject(schemaType) && _.isEmpty(schemaType)) {
          return;
        }

        if (_.isObject(schemaType)) {
          _.each(val, function(arrVal) {
            this.validateAttributes(arrVal, schemaType);
          }, this);
          return;
        }

        return this.validateAttributes(val, schemaType);
      } else if (_.isObject(schemaType)) {
        if (_.isEmpty(schemaType)) {
          return;
        }
        return this.validateAttributes(val, schemaType);
      }


      switch (schemaType) {
        case 'id':
          isValid = _.isValidObjectID(val) || _.isUUID(val);
          break;
        case 'string':
          isValid = _.isString(val);
          break;
        case 'integer':
          attrs[key] = val = _.parseInt(val);
          isValid = _.isNumber(val) && !_.isNaN(val);
          break;
        case 'uinteger':
          attrs[key] = val = _.parseInt(val);
          isValid = _.isNumber(val) && !_.isNaN(val) && val >= 0;
          break;
        case 'float':
          attrs[key] = val = parseFloat(val);
          isValid = _.isNumber(val) && !_.isNaN(val);
          break;
        case 'ufloat':
          attrs[key] = val = parseFloat(val);
          isValid = _.isNumber(val) && !_.isNaN(val) && val >= 0;
          break;
        case 'boolean':
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
          // Do not allow an attr without a schema defined
          break;
      }

      // Array elements default to `null` if invalid
      // Other keys are deleted
      if (!isValid) {
        if (_.isArray(attrs)) {
          attrs[key] = null;
        } else if (_.isObject(attrs)) {
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
      if (_.isObject(val) && !_.isArray(val)) {
        return this.removeAttributes(val, shouldRemove);
      }

      if (shouldRemove === true) {
        delete attrs[key];
      }
    }, this);
  },


  // Used to set attributes from a request body
  setFromRequest: Promise.method(function(body) {
    var schema = _.result(this, 'combinedSchema');
    var readOnlyAttributes = _.result(this, 'readOnlyAttributes');
    this.validateAttributes(body, schema);
    this.removeAttributes(body, readOnlyAttributes);

    // Set new attributes
    this.requestAttributes = _.cloneDeep(body);
    this.set(body);

    // At this point, we take a snapshot of the changed attributes
    // A copy of the `changed` attributes right after the request body is set
    this.changedFromRequest = _.cloneDeep(this.changed);
    this.previousFromRequest = _.cloneDeep(this.previousAttributes());

    return this;
  }),

  // Alias for `render`
  toResponse: function() {
    return this.render();
  },

  toJSON: function(options) {
    var json = _.cloneDeep(this.attributes);
    return json;
  },

  render: function() {
    var json = this.toJSON();
    var hiddenAttributes = _.result(this, 'hiddenAttributes');
    this.removeAttributes(json, hiddenAttributes);
    return json;
  },

  // Getters and Setters
  // ---

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
      console.error('#fetch: %s', err.message);
      throw err;
    });
  }),


  // Return a rejected promise if validation fails
  // Bubble up the `validationError` from Backbone
  save: Promise.method(function() {
    var originalArguments = arguments;

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
    console.info('Model [%s] create called', this.urlRoot);
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
    console.info('Model [%s] update with query: %s',
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
    console.info('Model [%s] patch with query: %s',
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

    console.info('Model [%s] delete with query: %s',
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
    console.info('Model [%s] read with query: %s',
      this.urlRoot, JSON.stringify(query));

    return this.db.findOne(
      this.urlRoot,
      query,
      mongoOptions,
      this.wrapResponse(options)
    ).return(this);
  })
});
