'use strict';

var _ = require('lodash');
var Bluebird = require('bluebird');
var Backbone = require('backbone');
var Model = require('./model');
var debug = require('./debug');

module.exports = Backbone.Collection.extend({
  /**
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
        options.success(resp[0]);
      }
    };
  },



  model: Model,

  initialize: function() {
    this.db; // reference to a mongodb client/connection
  },

  /**
   * Copied from Backbone, not currently overridden
   */

  parse: function(resp, options) {
    return resp;
  },

  /**
   * Override to assign `db` and `user` to all models in the collection on `set`
   * Note that the prototype must be called first and returned at the end
   */

  set: function() {
    var ret = Backbone.Collection.prototype.set.apply(this, arguments);

    this.each(function(model) {
      // Assign `db` to all models in the collection
      if (this.db) {
        model.db = this.db;
      }

      // Assign `user` to all models in the collection
      if (this.user) {
        model.user = this.user;
      }
    }, this);

    return ret;
  },

  /**
   * Creates an array of pojos
   * By calling `Model.render` on all models in collection
   *
   * @param {Object} options
   * @return {Array}
   */

  render: function(options) {
    return this.map(function(model) {
      return model.render(options);
    });
  },

  /**
   * Alias for `render`
   */

  toResponse: function() {
    return this.render();
  },

  /**
   * Override the backbone sync method for use with mongodb
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
    var op = this[method].call(this, model, options);
    model.trigger('request', model, op, options);
    return op;
  }),

  /**
   * Override the backbone read method for use with mongodb
   *
   * The parameter `options` has the following properties:
   *
   * - `limit` Limit number of documents returned in query
   * - `skip` Skip N documents ahead in query
   * - `sort` Set to sort the documents coming back from the query `[['a', 1]]`
   * - `fields` Restrict the fields to return in the query `{'a': 1}`
   * - `readPreference` Use a read preference when running this query
   *
   * @param {Collection} collection
   * @param {Object} options
   * @return {Promise.<Collection>}
   */

  read: Bluebird.method(function(collection, options) {
    options = options || {};
    var query = {};

    // Build query against where query
    if (_.isObject(options.query)) {
      query = options.query;
    }

    // Restrict mongo options
    var mongoOptions = _.pick(options, [
      'limit',
      'skip',
      'sort',
      'fields',
      'readPreference'
    ]) || {};

    debug.info('Collection [%s] read with query: %s and options: %s',
      this.model.prototype.urlRoot,
      JSON.stringify(query),
      JSON.stringify(mongoOptions));

    return this.db.find(
      this.model.prototype.urlRoot,
      query,
      mongoOptions,
      this._wrapResponse(options)
    ).bind(this).tap(function(resp) {
      // Assign pagination properties to the collection
      this.limit = _.parseInt(mongoOptions.limit) || 0;
      this.skip = _.parseInt(mongoOptions.skip) || 0;
      this.total = _.parseInt(resp[1]) || 0;
      this.count = this.length;
      this.page = Math.ceil((this.skip / this.limit) || 0) + 1;
      this.pages = _.isFinite(Math.ceil(this.total / this.limit)) ?
        Math.ceil(this.total / this.limit) :
        1;
      this.hasMore = this.page < this.pages;
    }).return(this);
  }),

  /**
   * A new method for counting with mongodb
   * This is an extension to backbone
   *
   * * The parameter `options` has the following properties:
   *
   * - `limit` Limit number of documents returned in query
   * - `skip` Skip N documents ahead in query
   * - `readPreference` Use a read preference when running this query
   *
   * @param {Object} options
   * @return {Promise.<Number>} Number of documents matching query
   */

  count: Bluebird.method(function(options) {
    options = options || {};

    // This is for `_wrapResponse`
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

    // Restrict mongo options
    var mongoOptions = _.pick(options, [
      'limit',
      'skip',
      'readPreference'
    ]) || {};

    debug.info('Collection [%s] count with query: %s and options: %s',
      this.model.prototype.urlRoot,
      JSON.stringify(query),
      JSON.stringify(mongoOptions));

    return this.db.count(
      this.model.prototype.urlRoot,
      query,
      mongoOptions,
      this._wrapResponse(options)
    );
  })
});
