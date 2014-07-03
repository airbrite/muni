"use strict";

// References
// ---
// https://github.com/jsantell/backbone-promised/blob/master/index.js

// Dependencies
// ---
var _ = require('lodash');
var Promise = require('bluebird');
var Backbone = require('backbone');

module.exports = Backbone.Model.extend({
  debug: false,

  // mongodb id attribute, usually `_id`
  idAttribute: "_id",
  userIdAttribute: "user_id",

  // The mongodb collection name
  urlRoot: "models",

  // Flag to force all updates to be patches on `sync`
  updateUsingPatch: true,

  // Attributes that are not settable from the request
  readOnlyAttributes: [],

  // Attributes that should be saved to the database but NOT rendered to JSON
  hiddenAttributes: [],

  // The defaults hash (or function) can be used to specify the default attributes for your model.
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

  // Instance properties
  // ---
  // `db`
  // `cache`

  constructor: function() {
    Backbone.Model.prototype.constructor.apply(this, arguments);

    // Apply `baseDefaults`
    _.defaults(this.attributes, _.result(this, 'baseDefaults'));

    // Whenever a model gets assigned a value for `idAttribute`
    // We clear out defaults because we assume this is an existing model in the db
    // this.listenTo(this, 'change:' + this.idAttribute, function() {
    //   // Clear out all defaults
    //   this.clearDefaults();
    // }.bind(this));
  },

  initialize: function() {},

  // Copied from Backbone
  parse: function(resp, options) {
    // Mongodb `create` returns an array of one document
    if (_.isArray(resp)) {
      resp = resp[0];
    }
    return resp;
  },


  _validate: function(attrs, options) {
    var valid = Backbone.Model.prototype._validate.apply(this, arguments);

    if (!valid) {
      return false;
    }

    // TODO: Perform `schema` validation here

    return true;
  },

  // Clears out all attributes that were set with `defaults`
  // Useful for doing mongodb `patch` without first fetching the entire model
  clearDefaults: function() {
    var defaultKeys = _.keys(_.result(this, 'defaults'));
    _.each(defaultKeys, function(defaultKey) {
      this.unset(defaultKey);
    }.bind(this));
  },

  // Do any request body sanitation here
  // TODO: support deep set
  setFromRequest: function(body) {
    var schema = _.result(this, 'schema');
    _.merge(schema, _.result(this, 'baseSchema'));
    _.each(schema, function(val, key) {
      if (!_.has(body, key)) {
        return;
      }

      if (val === 'integer') {
        // Perform `parseInt` on all integers
        body[key] = _.parseInt(body[key]);
      } else if (val === 'float') {
        // Perform `parseFloat` on all integers
        body[key] = _.parseFloat(body[key]);
      }
    }.bind(this));

    // Set new attributes
    this.set(_.omit(body, _.result(this, 'readOnlyAttributes')));

    // To support a `patch` operation
    // We're gonna `default/extend` all existing attributes after the `set`
    var attrs = {};
    _.merge(attrs, this.previousAttributes(), this.attributes, body);
    this.attributes = attrs;

    // An array of attributes that were set from the request body
    this.attributesFromRequest = _.keys(body);

    return this;
  },

  // Alias for `render`
  toResponse: function() {
    return this.render();
  },

  // Builds a response based on `schema` and the model attributes
  buildResponse: function(schema, json) {
    var response = {};

    if (_.isEmpty(schema)) {
      return json;
    }

    _.each(json, function(val, key) {
      // Don't render hidden attributes
      if (_.contains(this.hiddenAttributes, key)) {
        return;
      }

      // Schema does not have this key
      if (!_.has(schema, key)) {
        return;
      }

      if (_.isArray(val)) {
        // Arrays
        response[key] = [];
        if (val.length === 0) {
          // Empty array
        } else if (_.isObject(val[0])) {
          _.each(val, function(arrVal) {
            // Recursively build response for object
            response[key].push(this.buildResponse(schema[key][0], arrVal));
          }.bind(this));
        } else {
          // Array of String, Number, or Boolean
          response[key] = json[key];
        }
      } else if (_.isObject(val)) {
        // Objects
        if (schema[key] === 'date') {
          // Date object
          response[key] = json[key];
        } else {
          // Object
          response[key] = this.buildResponse(schema[key], json[key]);
        }
      } else {
        // String, Number (int or float), or Boolean
        if (schema[key] === 'integer') {
          response[key] = _.parseInt(json[key]);
        } else if (schema[key] === 'float') {
          response[key] = _.parseFloat(json[key]);
        } else {
          response[key] = json[key];
        }
      }
    }.bind(this));

    return response;
  },

  render: function() {
    // If there is no schema defined, return all attributes
    var schema = _.result(this, 'schema');
    if (_.isEmpty(_.result(this, 'schema'))) {
      return this.toJSON();
    }

    // Merge the `baseSchema` with the defined `schema`
    _.merge(schema, _.result(this, 'baseSchema'));

    // Build the response
    var response = this.buildResponse(schema, this.toJSON());
    return response;
  },

  optionsFromSave: function(key, val, options) {
    var attrs;
    if (key === null || typeof key === 'object') {
      attrs = key;
      options = val;
    } else {
      (attrs = {})[key] = val;
    }

    return options = _.extend({
      validate: true
    }, options);
  },

  // Lifecycle methods
  // ---
  // Returns: Promise (this)

  beforeFetch: function() {
    return this;
  },

  afterFetch: function() {
    return this;
  },

  beforeCreate: function() {
    return this;
  },

  beforeUpdate: function() {
    return this;
  },

  afterCreate: function() {
    return this;
  },

  afterUpdate: function() {
    return this;
  },

  beforeSave: function() {
    return this;
  },

  afterSave: function() {
    return this;
  },

  // Adds before/after fetch lifecycle methods
  // Returns: Promise (this)
  fetch: function() {
    var originalArguments = arguments;

    return Promise.cast().bind(this).then(function() {
      return this.beforeFetch.apply(this, originalArguments);
    }).then(function() {
      return Backbone.Model.prototype.fetch.apply(this, originalArguments);
    }).then(function() {
      return this.afterFetch.apply(this, originalArguments);
    });
  },


  // Return a rejected promise if validation fails
  // Bubble up the `validationError` from Backbone
  save: function() {
    var originalArguments = arguments;

    var beforeFn, afterFn;
    if (this.isNew()) {
      beforeFn = this.beforeCreate;
      afterFn = this.afterCreate;
    } else {
      beforeFn = this.beforeUpdate;
      afterFn = this.afterUpdate;
    }

    return Promise.cast().bind(this).then(function() {
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
  },



  // Transactions
  // Applies a boolean flag `locked`
  lock: function() {
    if (this.get('locked')) {
      var err = new Error("Model already locked.");
      return Promise.reject(err);
    }

    this.set('locked', true);
    return this.save();
  },

  unlock: function() {
    if (!this.get('locked')) {
      return Promise.resolve(this);
    }

    this.set('locked', false);
    return this.save();
  },

  // Convert all nested objects into dot notation keypaths (for `$set` patch)
  objToPaths: function(obj) {
    var ret = {};
    var separator = '.';

    _.each(obj, function(val, key) {
      if (_.isObject(val) && !_.isArray(val) && !_.isEmpty(val)) {
        //Recursion for embedded objects
        var obj2 = this.objToPaths(val);

        for (var key2 in obj2) {
          var val2 = obj2[key2];

          ret[key + separator + key2] = val2;
        }
      } else {
        ret[key] = val;
      }
    }.bind(this));

    return ret;
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

  // Override the backbone sync method for use with mongodb
  // options contains 2 callbacks: `success` and `error`
  // Both callbacks have parameters (model, resp, options)
  // `resp` is either a `document` or an `error` object
  //
  // Events
  // ---
  // A `request` event is fired before with parameters (model, op, options)
  // A `sync` event is fired after with parameters (model, resp, options)
  sync: function(method, model, options) {
    // Force all `update` to actually be `patch` if configured
    if (this.updateUsingPatch && method === 'update') {
      method = 'patch';
    }

    var op = this[method].call(this, model, options);
    model.trigger("request", model, op, options);
    return op;
  },

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

  // Inserts a mongodb document
  create: function(model, options) {
    if (this.debug) {
      console.log("Model [%s] create called".verbose, this.urlRoot);
    }

    return this.db.insert(this.urlRoot, model.toJSON(), this.wrapResponse(options)).return(this);
  },

  // Updates a mongodb document
  // NOTE: This replaces the entire document with the model attributes
  update: function(model, options) {
    // If no ID in query, error out
    if (model.isNew()) {
      var err = new Error("No ID for Model");
      options.error(err);
      return Promise.reject(err);
    }

    // Build query against the model's id
    var query = {};
    query[this.idAttribute] = model.id;
    if (model.has(this.userIdAttribute)) {
      query[this.userIdAttribute] = model.get(this.userIdAttribute);
    }

    if (this.debug) {
      console.log("Model [%s] update with query: %s and object: %s".verbose, this.urlRoot, JSON.stringify(query), JSON.stringify(model.toJSON()));
    }

    return this.db.findAndModify(this.urlRoot, query, model.toJSON(), this.wrapResponse(options)).return(this);
  },

  // Updates a mongodb document
  // NOTE: This sets only explicitly provided model attributes
  patch: function(model, options) {
    // If no ID in query, error out
    if (model.isNew()) {
      var err = new Error("No ID for Model");
      options.error(err);
      return Promise.reject(err);
    }

    // Build query against the model's id
    var query = {};
    query[this.idAttribute] = model.id;
    if (model.has(this.userIdAttribute)) {
      query[this.userIdAttribute] = model.get(this.userIdAttribute);
    }

    // Patch attributes with mongodb set
    var attrs = model.toJSON();
    delete attrs[this.idAttribute];

    // Use mongodb set to only update explicit attributes
    // Convert all nested objects into paths so `$set` doesn't overwrite nested objects
    // `$set -> this.objToPaths(attrs)` has issues with nested objects where the parent doesn't exist
    // For example `metadata.foo.bar: true` will fail if `metadata.foo` !== {} in the database yet
    var obj = {
      "$set": attrs
    };

    if (this.debug) {
      console.log("Model [%s] update with query: %s and object: %s".verbose, this.urlRoot, JSON.stringify(query), JSON.stringify(obj));
    }

    return this.db.findAndModify(this.urlRoot, query, obj, this.wrapResponse(options)).return(this);
  },

  // Removes a mongodb document
  // Must have ID
  delete: function(model, options) {
    // If no ID in query, error out
    if (model.isNew()) {
      var err = new Error("No ID for Model");
      options.error(err);
      return Promise.reject(err);
    }

    // Build query against the model's id
    var query = {};
    query[this.idAttribute] = model.id;

    if (this.debug) {
      console.log("Model [%s] delete with query: %s".verbose, this.urlRoot, JSON.stringify(query));
    }

    return this.db.remove(this.urlRoot, query, this.wrapResponse(options));
  },

  // Finds a single mongodb document
  // If `options.query` is provided and is an object,
  // it is used as the query
  read: function(model, options) {
    var query = {};
    if (_.isObject(options.query)) {
      // Build query
      query = options.query;
    } else {
      if (model.isNew()) {
        // If no ID in query, error out
        var err = new Error("No ID for Model");
        options.error(err);
        return Promise.reject(err);
      }

      // Build query against the model's id and user_id if it exists
      query[this.idAttribute] = model.id;
      if (model.has(this.userIdAttribute)) {
        query[this.userIdAttribute] = model.get(this.userIdAttribute);
      }
    }

    if (this.debug) {
      console.log("Model [%s] read with query: %s".verbose, this.urlRoot, JSON.stringify(query));
    }

    var mongoOptions = _.pick(options, ["require"]) || {};
    return this.db.findOne(this.urlRoot, query, mongoOptions, this.wrapResponse(options)).return(this);
  }

});
