"use strict";

// Dependencies
// ---
var _ = require('lodash');
var Backbone = require('backbone');
var Model = require("./model");

module.exports = Backbone.Collection.extend({
  debug: false,

  model: Model,

  // Instance properties
  // ---
  // `db`
  // `cache`

  initialize: function() {},

  // Copied from Backbone, not currently overridden
  parse: function(resp, options) {
    return resp;
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
        options.success(resp[0]);
      }
    };
  },

  // Finds mongodb documents
  read: function(collection, options) {
    var query = {};

    // Build query against where query
    if (_.isObject(options.query)) {
      query = options.query;
    }

    // Build query with optional: limit, skip, sort
    var mongoOptions = _.pick(options, ["limit", "skip", "sort"]) || {};
    if (this.debug) {
      console.log("Collection [%s] read with query: %s and options: %s".verbose, this.model.prototype.urlRoot, JSON.stringify(query), JSON.stringify(mongoOptions));
    }
    return this.db.find(this.model.prototype.urlRoot, query, mongoOptions, this.wrapResponse(options)).bind(this).then(function(resp) {
      this.total = resp[1] || 0;
      return this;
    });
  },

  set: function() {
    var ret = Backbone.Collection.prototype.set.apply(this, arguments);

    // Pass `collection.user` to all models in the collection
    this.each(function(model) {
      if (this.user) {
        model.user = this.user;
      }
    }.bind(this));

    return ret;
  },

  // Count (not part of `sync`)
  // success/error parameters are (resp)
  count: function(options) {
    options = options || {};

    var success = options.success;
    options.success = function(resp) {
      if (success) {
        success(resp);
      }
    };

    var query = {};

    // Build query against where query
    if (_.isObject(options.query)) {
      query = options.query;
    }

    // Don't allow any mongo options for now
    var mongoOptions = {};
    return this.db.count(this.model.prototype.urlRoot, query, mongoOptions, this.wrapResponse(options));
  }

});
