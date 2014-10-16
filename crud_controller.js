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
  setupRoutes: function() {
    // Get the base url path
    var basePath = _.result(this, 'basePath');

    // Setup CRUD routes
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
    }.bind(this));
  },



  // CRUD functions
  // ---

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
      var total = _.parseInt(collection.total);
      var count = _.parseInt(collection.length);
      var page = Math.ceil(_.parseInt(options.skip) / _.parseInt(options.limit)) + 1;
      var pages = Math.ceil(_.parseInt(collection.total) / _.parseInt(options.limit));
      var limit = _.parseInt(options.limit) || 0;
      var skip = _.parseInt(options.skip) || 0;

      res.paging = {
        total: total,
        count: count,
        limit: limit,
        offset: skip,
        page: page,
        pages: pages,
        has_more: page < pages
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
  setupCollection: function(req) {
    var collection = new this.collection();
    collection.db = this.get('db');
    collection.cache = this.get('cache');
    return collection;
  }
});
