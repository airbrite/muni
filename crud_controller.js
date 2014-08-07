'use strict';

// What is CrudController?
// ---

// CrudController helps making CRUD routing easy
// by providing a controller that automatically maps all CRUD routes
//
// See documentation for [Controller](controller.html)

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
    var collection = this.setupCollection(req, qo);

    // Merge `options.query` with the query string query and filters
    if (options && options.query) {
      _.merge(qo.query, options.query);
    }

    return collection.count(qo).then(function(total) {
      res.data = {
        total: total
      };
      return next();
    }).catch(next);
  },

  find: function(req, res, next, options) {
    var qo = this.parseQueryString(req);
    var collection = this.setupCollection(req, qo);

    // Merge `options.query` with the query string query and filters
    if (options && options.query) {
      _.merge(qo.query, options.query);
    }

    return collection.fetch(qo).tap(function() {
      res.paging = {
        total: parseInt(collection.total),
        count: parseInt(collection.models.length),
        limit: parseInt(qo.limit),
        offset: parseInt(qo.skip),
        has_more: parseInt(collection.models.length) < parseInt(collection.total)
      };
    }).bind(this).then(this.render(req, res, next)).catch(next);
  },

  findOne: function(req, res, next, options) {
    options = options || {};
    _.merge(options, {
      require: true
    });

    var model = this.setupModel(req);
    return model.fetch(options).bind(this).then(this.render(req, res, next)).catch(next);
  },

  create: function(req, res, next) {
    var model = this.setupModel(req);
    return model.setFromRequest(req.body).then(function() {
      return model.save();
    }).bind(this).then(this.render(req, res, next)).catch(next);
  },

  update: function(req, res, next, options) {
    options = options || {};
    _.merge(options, {
      require: true
    });

    var model = this.setupModel(req);
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
  },



  // Helpers
  // ---

  // Creates and returns a model
  // If there is a `db` and/or `cache` connection, assign it to the model
  setupModel: function(req) {
    var model = new this.model();
    model.db = this.get('db');
    model.cache = this.get('cache');
    return model;
  },

  // Creates and returns a collection
  // If there is a `db` and/or `cache` connection, assign it to the collection
  setupCollection: function(req, qo) {
    var collection = new this.collection();
    collection.db = this.get('db');
    collection.cache = this.get('cache');
    return collection;
  }
});
