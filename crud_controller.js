"use strict";

// What is CrudController?
// ---

// CrudController helps making CRUD routing easy by providing a controller that automatically maps all CRUD routes
// 
// See documentation for [Controller](controller.html)

// TODO
// ---
// 2014/05/22 - Peter will add some comments

// Dependencies
// ---
var _ = require('lodash');
var Controller = require('./controller');
var Model = require("./model");
var Collection = require("./collection");

module.exports = Controller.extend({
  debug: true,

  // All subclasses of crud controller need `urlRoot` defined
  // The mongodb collection name
  urlRoot: 'models',

  // All subclasses of crud controller need `model` and `collection` defined
  model: Model,
  collection: Collection,

  // Available controller actions (see `setupRoutes` for more info)
  crud: ["C", "R", "O", "U", "D"],

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
    var basePath = _.result(this, "basePath");

    // Setup CRUD routes
    _.each(this.crud, function(action) {
      switch (action) {
        case 'C':
          // Create
          this.routes.post[basePath] = {
            action: this.create,
            middleware: this.getRouteMiddleware('create')
          };
          break;
        case 'R':
          // Find
          this.routes.get[basePath] = {
            action: this.find,
            middleware: this.getRouteMiddleware('find')
          };
          break;
        case 'O':
          // FindOne
          this.routes.get[basePath + "/:id"] = {
            action: this.findOne,
            middleware: this.getRouteMiddleware('findOne')
          };
          break;
        case 'U':
          // Update
          this.routes.put[basePath + "/:id"] = {
            action: this.update,
            middleware: this.getRouteMiddleware('update')
          };
          break;
        case 'D':
          // Destroy
          this.routes.delete[basePath + "/:id"] = {
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
  
  find: function(req, res, next, options) {
    var qo = this.parseQueryString(req);
    var collection = this.setupCollection(req, qo);

    options = options || {};
    _.merge(options, {
      query: qo.query
    });

    if (this.debug) {
      console.log("Find with Query: %s".verbose, JSON.stringify(qo));
    }

    return collection.fetch(qo).bind(this).then(function(resp) {
      return collection.count(qo).tap(function(resp) {
        res.paging = {
          total: parseInt(resp),
          count: parseInt(collection.models.length),
          limit: parseInt(qo.limit),
          offset: parseInt(qo.skip),
          has_more: parseInt(collection.models.length) < parseInt(resp)
        };
      });
    }).then(function(count) {
      return collection;
    }).then(this.nextThen(req, res, next)).catch(this.nextCatch(req, res, next));
  },

  findOne: function(req, res, next, options) {
    var model = this.setupModel(req);
    options = options || {};
    _.merge(options, {
      require: true
    });

    if (this.debug) {
      if (options.query) {
        console.log("Find with Query: %s and UserID: %s".verbose, JSON.stringify(options.query), model.get('user_id'));
      } else {
        console.log("Find with ID: %s and UserID: %s".verbose, model.id, model.get('user_id'));
      }
    }

    return model.fetch(options).then(this.nextThen(req, res, next)).catch(this.nextCatch(req, res, next));
  },

  create: function(req, res, next) {
    var model = this.setupModel(req);
    model.setFromRequest(req.body);
    return model.save().bind(this).then(this.nextThen(req, res, next)).catch(this.nextCatch(req, res, next));
  },

  update: function(req, res, next) {
    var model = this.setupModel(req);
    model.setFromRequest(req.body);
    return model.save().bind(this).then(this.nextThen(req, res, next)).catch(this.nextCatch(req, res, next));
  },

  destroy: function(req, res, next) {
    var model = this.setupModel(req);
    return model.destroy().then(this.nextThen(req, res, next)).catch(this.nextCatch(req, res, next));
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