'use strict';

var _ = require('lodash');
var Controller = require('./controller');
var Model = require('./model');
var Collection = require('./collection');

module.exports = Controller.extend({
  /**
   * The Mongo collection associated with all Models in this Controller
   *
   * @type {String}
   */

  urlRoot: 'models',

  /**
   * The Model associated to this Controller
   *
   * @type {Model}
   */

  model: Model,

  /**
   * The Collection associated to this Controller
   *
   * @type {[type]}
   */

  collection: Collection,

  /**
   * Definition of actions that should be automatically connected
   *
   * Possible Values:
   *
   * - `T` Count
   * - `C` Create / Insert
   * - `R` Find / List
   * - `O` FindOne / Fetch
   * - `U` Update
   * - `P` Patch
   * - `D` Destroy / Delete
   *
   * @type {Array}
   */

  crud: ['T', 'C', 'R', 'O', 'U', 'P', 'D'],

  /**
   * Computes the base path for the controller
   *
   * Automatically appends the `urlRoot` string
   *
   * Example: `GET /models`
   *
   * @return {String}
   */

  basePath: function() {
    return this.path + this.urlRoot;
  },

  /**
   * Sets up default CRUD routes
   */

  setupRoutes: function() {
    var basePath = _.result(this, 'basePath');

    _.each(this.crud, function(action) {
      switch (action) {
        case 'T':
          // Count
          this.routes.get[basePath + '/count'] = {
            action: this.count
          };
          break;
        case 'C':
          // Create
          this.routes.post[basePath] = {
            action: this.create
          };
          break;
        case 'R':
          // Find
          this.routes.get[basePath + '.:format?'] = {
            action: this.find
          };
          break;
        case 'O':
          // FindOne
          this.routes.get[basePath + '/:id.:format?'] = {
            action: this.findOne
          };
          break;
        case 'U':
          // Update
          this.routes.put[basePath + '/:id'] = {
            action: this.update
          };
          break;
        case 'P':
          // Patch
          this.routes.patch[basePath + '/:id'] = {
            action: this.update
          };
          break;
        case 'D':
          // Destroy
          this.routes.delete[basePath + '/:id'] = {
            action: this.destroy
          };
          break;
        default:
          break;
      }
    }, this);
  },

  /**
   * Convenience method to instantiate and return a Model
   * If there is a `db` and/or `cache` property, assign it to the model
   *
   * @return {Model}
   */

  setupModel: function(req) {
    var model = new this.model();
    model.db = this.get('db');
    model.cache = this.get('cache');
    return model;
  },

  /**
   * Convenience method to instantiate and return a Collection
   * If there is a `db` and/or `cache` property, assign it to the model
   *
   * @return {Collection}
   */

  setupCollection: function(req) {
    var collection = new this.collection();
    collection.db = this.get('db');
    collection.cache = this.get('cache');
    return collection;
  },

  count: function(req, res, next, options) {
    var collection = this.setupCollection(req);

    options = options || {};
    _.merge(options, this.parseQueryString(req));

    return collection.count(options).then(function(total) {
      res.data = {
        total: total
      };
      return next();
    }).catch(next);
  },

  find: function(req, res, next, options) {
    var collection = this.setupCollection(req);

    options = options || {};
    _.merge(options, this.parseQueryString(req));

    return collection.fetch(options).tap(function() {
      res.paging = {
        total: collection.total,
        count: collection.count,
        limit: collection.limit,
        offset: collection.skip,
        page: collection.page,
        pages: collection.pages,
        has_more: collection.hasMore
      };
    }).bind(this).then(this.render(req, res, next)).catch(next);
  },

  findOne: function(req, res, next, options) {
    var model = this.setupModel(req);

    options = options || {};
    _.merge(options, {
      require: true
    });

    return model.fetch(options).bind(this).then(this.render(req, res, next)).catch(next);
  },

  create: function(req, res, next) {
    var model = this.setupModel(req);

    return model.setFromRequest(req.body).then(function() {
      return model.save();
    }).bind(this).then(this.render(req, res, next)).catch(next);
  },

  update: function(req, res, next, options) {
    var model = this.setupModel(req);

    options = options || {};
    _.merge(options, {
      require: true
    });

    return model.fetch(options).then(function() {
      return model.setFromRequest(req.body);
    }).then(function() {
      return model.save(null, options);
    }).bind(this).then(this.render(req, res, next)).catch(next);
  },

  destroy: function(req, res, next) {
    var model = this.setupModel(req);

    return model.destroy().then(function(resp) {
      if (resp === 0) {
        var err = new Error('Document not found.');
        err.code = 404;
        return next(err);
      }

      res.code = 204;
      return next();
    }).catch(next);
  }
});
