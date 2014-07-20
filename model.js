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
  readOnlyAttributes: {},

  // Attributes that should be saved to the database but NOT rendered to JSON
  hiddenAttributes: {},

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

  combinedSchema: function() {
    var schema = _.result(this, 'schema');
    _.merge(schema, _.result(this, 'baseSchema'));
    return schema;
  },

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

  initialize: function() {
    this.requestAttributes = {};
    this.changedFromRequest = {};
    this.previousFromRequest = {};
  },

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

  // Validates attribute type
  // Applies default attributes
  // Omits readOnly and hidden attributes
  buildAttributes: function(schema, defaults, json, attrs, ignoredAttrs) {
    var obj = {};

    _.each(schema, function(val, key) {
      var jsonVal = _.isObject(json) ? json[key] : null;
      var defaultsVal = _.isObject(defaults) ? defaults[key] : null;
      var attrsVal = _.isObject(attrs) ? attrs[key] : null;
      var ignoredAttrsVal = _.isObject(ignoredAttrs) ? ignoredAttrs[key] : null;

      // If this key should be ignored, don't set it at all
      if (ignoredAttrsVal === true) {
        return;
      }

      // A schema key with a value of `[]` or `{}`
      // Direct set json value for this key
      if (_.isObject(val) && _.isEmpty(val)) {
        obj[key] = jsonVal || attrsVal;
        return;
      }

      // Schema value can be one of three types: `Array, Object, String`
      // Arrays and Objects can have nested schemas
      // Strings are a final type definition and can be: `integer, float, boolean, id, string, date`
      if (_.isArray(val)) {
        // json value is null or undefined
        // use current attribute value or default to `[]`
        if (_.isNull(jsonVal) || _.isUndefined(jsonVal)) {
          obj[key] = !_.isUndefined(attrsVal) ? attrsVal : (!_.isUndefined(defaultsVal) ? defaultsVal : []);
          return;
        }

        // No object inside array or the object inside is empty
        // It is an array of strings/numbers/booleans/dates/ids
        // A schema key with a vaue of `['string']` or `['date']` or `[{}]`
        // Direct set json value for this key
        if (_.isString(val[0]) || _.isEmpty(val[0])) {
          obj[key] = jsonVal || attrsVal;
          return;
        }

        // Setting an empty array will reset to defaults
        if (_.isEmpty(jsonVal)) {
          obj[key] = !_.isUndefined(defaultsVal) ? defaultsVal : [];
          return;
        }

        // If first value inside schema value is an object
        // For each json value for this key
        // Recursively call `buildAttributes` for each json value (object)
        // Push results into an array
        obj[key] = [];
        _.each(jsonVal, function(jsonKeyVal) {
          obj[key].push(this.buildAttributes(val[0], defaultsVal, jsonKeyVal, attrsVal, ignoredAttrsVal));
        }.bind(this));
      } else if (_.isObject(val)) {
        // json value is null or undefined
        // use current attribute value or default to `{}`
        if (_.isNull(jsonVal) || _.isUndefined(jsonVal)) {
          obj[key] = !_.isUndefined(attrsVal) ? attrsVal : (!_.isUndefined(defaultsVal) ? defaultsVal : {});
          return;
        }

        // Setting an empty object will reset to defaults
        if (_.isEmpty(jsonVal)) {
          obj[key] = !_.isUndefined(defaultsVal) ? defaultsVal : {};
          return;
        }

        // Recursively call `buildAttributes` for the json value (object)
        obj[key] = this.buildAttributes(val, defaultsVal, jsonVal, attrsVal, ignoredAttrsVal);
      } else if (_.isString(val)) {
        if (val === 'integer' || val === 'uinteger') {
          if (jsonVal === '') {
            obj[key] = !_.isUndefined(defaultsVal) ? defaultsVal : 0;
            return;
          }
          var intNumber = _.parseInt(jsonVal);
          if (_.isNaN(intNumber)) {
            obj[key] = !_.isUndefined(attrsVal) ? attrsVal : (!_.isUndefined(defaultsVal) ? defaultsVal : 0);
            return;
          }

          obj[key] = val === 'uinteger' ? Math.max(intNumber, 0) : intNumber;
        } else if (val === 'float' || val === 'ufloat') {
          if (jsonVal === '') {
            obj[key] = !_.isUndefined(defaultsVal) ? defaultsVal : 0.0;
            return;
          }
          var floatNumber = _.parseFloat(jsonVal);
          if (_.isNaN(floatNumber)) {
            obj[key] = !_.isUndefined(attrsVal) ? attrsVal : (!_.isUndefined(defaultsVal) ? defaultsVal : 0.0);
            return;
          }

          obj[key] = val === 'ufloat' ? Math.max(floatNumber, 0.0) : floatNumber;
        } else if (val === 'boolean') {
          if (!_.isBoolean(jsonVal)) {
            obj[key] = !_.isUndefined(attrsVal) ? attrsVal : (!_.isUndefined(defaultsVal) ? defaultsVal : false);
            return;
          }

          obj[key] = jsonVal;
        } else if (val === 'id') {
          if (!_.isString(jsonVal) && !_.isNull(jsonVal)) {
            obj[key] = !_.isUndefined(attrsVal) ? attrsVal : (!_.isUndefined(defaultsVal) ? defaultsVal : null);
            return;
          }

          obj[key] = jsonVal;
        } else if (val === 'string') {
          if (!_.isString(jsonVal) && !_.isNull(jsonVal)) {
            obj[key] = !_.isUndefined(attrsVal) ? attrsVal : (!_.isUndefined(defaultsVal) ? defaultsVal : null);
            return;
          }

          obj[key] = jsonVal;
        } else if (val === 'timestamp') {
          // Empty string means reset to default
          if (jsonVal === '') {
            obj[key] = !_.isUndefined(defaultsVal) ? defaultsVal : null;
            return;
          }
          // a timestamp can be set explicitly to `null`
          if (!_.isNumber(jsonVal) && !_.isNull(jsonVal)) {
            obj[key] = !_.isUndefined(attrsVal) ? attrsVal : (!_.isUndefined(defaultsVal) ? defaultsVal : null);
            return;
          }

          obj[key] = jsonVal;
        } else if (val === 'date') {
          // a date can be set explicitly to `null`
          if (!_.isValidISO8601String(jsonVal) && !_.isDate(jsonVal) && !_.isNull(jsonVal)) {
            obj[key] = !_.isUndefined(attrsVal) ? attrsVal : (!_.isUndefined(defaultsVal) ? defaultsVal : null);
            return;
          }

          obj[key] = jsonVal;
        } else {
          obj[key] = jsonVal;
        }
      }
    }.bind(this));

    return obj;
  },

  // Used to set attributes from a request body
  setFromRequest: function(body) {
    var defaults = _.result(this, 'defaults');
    var schema = _.result(this, 'combinedSchema');
    var readOnlyAttributes = _.result(this, 'readOnlyAttributes');
    body = this.buildAttributes(schema, defaults, body, this.attributes, readOnlyAttributes);

    // Set new attributes
    this.requestAttributes = _.cloneDeep(body);
    this.set(body);

    // At this point, we take a snapshot of the changed attributes
    // A copy of the `changed` attributes right after the request body is set
    this.changedFromRequest = _.cloneDeep(this.changed);
    this.previousFromRequest = _.cloneDeep(this.previousAttributes());

    return this;
  },

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

    var schema = _.result(this, 'combinedSchema');

    // If there is no schema defined, return all attributes
    if (_.isEmpty(schema)) {
      return json;
    }

    var hiddenAttributes = _.result(this, 'hiddenAttributes');
    var defaults = _.result(this, 'defaults');
    json = this.buildAttributes(schema, defaults, json, this.attributes, hiddenAttributes);

    return json;
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
    if (!!model.get(this.userIdAttribute)) {
      query[this.userIdAttribute] = model.get(this.userIdAttribute);
    }

    if (this.debug) {
      console.log("Model [%s] update with query: %s".verbose, this.urlRoot, JSON.stringify(query));
      // console.log("Model [%s] update with query: %s and object: %s".verbose, this.urlRoot, JSON.stringify(query), JSON.stringify(model.toJSON()));
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
    if (!!model.get(this.userIdAttribute)) {
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
      console.log("Model [%s] patch with query: %s".verbose, this.urlRoot, JSON.stringify(query));
      // console.log("Model [%s] patch with query: %s and object: %s".verbose, this.urlRoot, JSON.stringify(query), JSON.stringify(obj));
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
        var err = new Error("Trying to fetch a model with no `_id` attribute.");
        options.error(err);
        return Promise.reject(err);
      }

      // Build query against the model's id and user_id if it exists
      query[this.idAttribute] = model.id;
      if (!!model.get(this.userIdAttribute)) {
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
