'use strict';

// Dependencies
// ---
var _ = require('lodash');
var Promise = require('bluebird');
var Backbone = require('backbone');
var Model = require('./model');

module.exports = Backbone.Collection.extend({
  debug: false,

  model: Model,

  initialize: function() {
    this.db; // reference to a mongodb client/connection
    this.cache; // reference to a redis client/connection
  },

  // Copied from Backbone, not currently overridden
  parse: function(resp, options) {
    return resp;
  },

  // Takes the mongodb response and calls the Backbone success method
  wrapResponse: function(options) {
    return function(err, resp) {
      if (err) {
        options.error(err);
      } else {
        options.success(resp[0]);
      }
    };
  },

  // Override `Collection.set` to assign
  // a collection's user to all models in the collection
  set: function() {
    var ret = Backbone.Collection.prototype.set.apply(this, arguments);

    this.each(function(model) {
      // Pass `db` to all models in the collection
      model.db = this.db;
      // Pass `collection.user` to all models in the collection
      if (this.user) {
        model.user = this.user;
      }
    }.bind(this));

    return ret;
  },

  // Convert attributes into a pojo,
  // then remove attributes that should be hidden
  render: function(options) {
    return this.map(function(model) {
      return model.render(options);
    });
  },

  // Alias for `render`
  toResponse: function() {
    return this.render();
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
  sync: Promise.method(function(method, model, options) {
    var op = this[method].call(this, model, options);
    model.trigger('request', model, op, options);
    return op;
  }),

  // Finds mongodb documents
  read: Promise.method(function(collection, options) {
    var query = {};

    // Build query against where query
    if (_.isObject(options.query)) {
      query = options.query;
    }

    // Build query with optional: limit, skip, sort
    var mongoOptions = _.pick(options, ['limit', 'skip', 'sort', 'fields']) || {};
    console.info('Collection [%s] read with query: %s and options: %s',
      this.model.prototype.urlRoot,
      JSON.stringify(query),
      JSON.stringify(mongoOptions));
    return this.db.find(
      this.model.prototype.urlRoot,
      query, mongoOptions,
      this.wrapResponse(options)
    ).bind(this).then(function(resp) {
      this.limit = _.parseInt(mongoOptions.limit) || 0;
      this.skip = _.parseInt(mongoOptions.skip) || 0;
      this.total = _.parseInt(resp[1]) || 0;
      this.count = this.length;
      this.page = Math.ceil((this.skip / this.limit) || 0) + 1;
      this.pages = _.isFinite(Math.ceil(this.total / this.limit)) ?
        Math.ceil(this.total / this.limit) :
        1;
      this.hasMore = this.page < this.pages;
      return this;
    });
  }),

  // Count (not part of `sync`)
  // This is an extension to Backbone
  count: Promise.method(function(options) {
    options = options || {};

    // This is for `wrapResponse`
    // `options` may contain `success` and `error` callbacks
    var successCallback = options.success;
    var errorCallback = options.error;
    options.success = function(resp) {
      if (successCallback) {
        successCallback(resp);
      }
    };
    options.error = function(err) {
      if (errorCallback) {
        errorCallback(err);
      }
    };

    // Build query against where query
    var query = {};
    if (_.isObject(options.query)) {
      query = options.query;
    }

    return this.db.count(
      this.model.prototype.urlRoot,
      query, {},
      this.wrapResponse(options)
    );
  })
});
