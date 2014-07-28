'use strict';

// What is CrudController?
// ---

// CrudController helps making CRUD routing easy
// by providing a controller that automatically maps all CRUD routes
//
// See documentation for [Controller](controller.html)

// TODO
// ---
// 2014/05/22 - Peter will add some comments

// Dependencies
// ---
var _ = require('lodash');
var Controller = require('./controller');
var Model = require('./model');
var Collection = require('./collection');

module.exports = Controller.extend({
  debug: true,

  // All subclasses of crud controller need `urlRoot` defined
  // The mongodb collection name
  urlRoot: 'models',

  // All subclasses of crud controller need `model` and `collection` defined
  model: Model,
  collection: Collection,

  // Available controller actions (see `setupRoutes` for more info)
  crud: ['T', 'C', 'R', 'O', 'U', 'P', 'D'],

  initialize: function() {
    // Make sure to call `super` as a best practice when overriding
    Controller.prototype.initialize.call(this);
  },

  // Base path appends `urlRoot`
  basePath: function() {
    return this.path + this.urlRoot;
  },

  // Sets up default CRUD routes
  // Adds `requireUser` middleware to all routes
  // Adds `requireJSON` middleware for post/put routes
  setupRoutes: function() {
    // Make sure to call `super` as a best practice when overriding
    Controller.prototype.setupRoutes.call(this);

    // Get the base url path
    var basePath = _.result(this, 'basePath');

    // Setup CRUD routes
    _.each(this.crud, function(action) {
      switch (action) {
        case 'T':
          // Create
          this.routes.get[basePath + '/count'] = {
            action: this.count,
            middleware: this.getRouteMiddleware('count')
          };
          break;
        case 'C':
          // Create
          this.routes.post[basePath] = {
            action: this.create,
            middleware: this.getRouteMiddleware('create')
          };
          break;
        case 'R':
          // Find
          this.routes.get[basePath + '.:format?'] = {
            action: this.find,
            middleware: this.getRouteMiddleware('find')
          };
          break;
        case 'O':
          // FindOne
          this.routes.get[basePath + '/:id.:format?'] = {
            action: this.findOne,
            middleware: this.getRouteMiddleware('findOne')
          };
          break;
        case 'U':
          // Update
          this.routes.put[basePath + '/:id'] = {
            action: this.update,
            middleware: this.getRouteMiddleware('update')
          };
          break;
        case 'P':
          // Patch
          this.routes.patch[basePath + '/:id'] = {
            action: this.update,
            middleware: this.getRouteMiddleware('update')
          };
          break;
        case 'D':
          // Destroy
          this.routes.delete[basePath + '/:id'] = {
            action: this.destroy,
            middleware: this.getRouteMiddleware('destroy')
          };
          break;
        default:
          break;
      }
    }.bind(this));
  },

  // CRUD functions
  // ---

  count: function(req, res, next, options) {
    var qo = this.parseQueryString(req);

    // Merge `options.query` with the query string query and filters
    if (options && options.query) {
      _.merge(qo.query, options.query);
    }

    return this.get('db').count(this.urlRoot, qo.query).then(function(total) {
      res.data = {
        total: total
      };
      return next();
    }).catch(this.nextCatch(req, res, next));
  },

  find: function(req, res, next, options) {
    var qo = this.parseQueryString(req);
    var collection = this.setupCollection(req, qo);

    // Merge `options.query` with the query string query and filters
    if (options && options.query) {
      _.merge(qo.query, options.query);
    }

    return collection.fetch(qo).then(function() {
      res.paging = {
        total: parseInt(collection.total),
        count: parseInt(collection.models.length),
        limit: parseInt(qo.limit),
        offset: parseInt(qo.skip),
        has_more: parseInt(collection.models.length) < parseInt(collection.total)
      };
      return collection;
    }).then(this.nextThen(req, res, next)).catch(this.nextCatch(req, res, next));
  },

  findOne: function(req, res, next, options) {
    options = options || {};
    _.merge(options, {
      require: true
    });

    var model = this.setupModel(req);
    return model.fetch(options)
      .then(this.nextThen(req, res, next))
      .catch(this.nextCatch(req, res, next));
  },

  create: function(req, res, next) {
    var model = this.setupModel(req);
    return model.setFromRequest(req.body).then(function() {
      return model.save();
    }).then(this.nextThen(req, res, next)).catch(this.nextCatch(req, res, next));
  },

  update: function(req, res, next, options) {
    options = options || {};

    var model = this.setupModel(req);
    return model.fetch(options).then(function() {
      return model.setFromRequest(req.body);
    }).then(function() {
      return model.save(null, options);
    }).then(this.nextThen(req, res, next)).catch(this.nextCatch(req, res, next));
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
    }).catch(this.nextCatch(req, res, next));
  },


  // Helpers
  // ---

  // Creates and returns a model
  // Checks for the existence of `id` in the url params
  // If there is an authenticated user, set the `user_id` attribute
  setupModel: function(req) {
    var model = new this.model();
    model.db = this.get('db');
    model.cache = this.get('cache');
    return model;
  },

  // Creates and returns a collection
  // If there is an authenticated user, add `user_id` to the query
  setupCollection: function(req, qo) {
    var collection = new this.collection();
    collection.db = this.get('db');
    collection.cache = this.get('cache');
    return collection;
  }

});
