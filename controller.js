"use strict";

// What is Controller?
// ---

// Controller helps facilitate routing via express by providing configuring route handlers
// 
// For example, a route to `/users/:id` would be handled by a `UsersController` with function `findOne`
// 
// It provides a way for each controller to setup the routes and handlers it wants to respond to
// 
// Also provides a mechanism to define pre, before, and after middleware per controller or per route
// 
// Finally, it also provides response and error handling middleware
// 
// Also parses query strings for filter, limit, and sort

// Dependencies
// ---
var _ = require('lodash');
var Backbone = require('backbone');
var Model = require('./model');
var Collection = require('./collection');

module.exports = Backbone.Model.extend({
  className: "Controller",

  // Root path url for routes
  path: "/",

  // Database query parameters/filters
  queryParams: function() {
    return {};
  },

  // Called after the constructor
  initialize: function() {
    // Routes
    this.routes = {
      get: {},
      post: {},
      put: {},
      delete: {}
    };

    // Middleware(s)
    this.pre = []; // run before route middleware
    this.before = []; // run after route middleware but before route handler
    this.after = []; // run after route handler
    this.post = []; // run after everything else (internal use)

    // Setup middleware and route handlers
    this.setupPreMiddleware();
    this.setupBeforeMiddleware();
    this.setupRoutes();
    this.setupAfterMiddleware();
    this.setupPostMiddleware();
  },

  // Computes the base path for the controller
  basePath: function() {
    return this.path;
  },

  // Setup routes that this controller should handle
  // 
  // Example:
  // this.routes.get["/test"] = {
  //   action: this.testGet,
  //   middleware: []
  // };
  setupRoutes: function() {},

  // Setup middleware that should run before the route middleware
  // Example: `this.pre.push(this.fakePreMiddleware)`
  setupPreMiddleware: function() {},

  // Setup middleware that should run before the route handler
  // Example: `this.before.push(this.fakeBeforeMiddleware)`
  setupBeforeMiddleware: function() {},

  // Setup middleware that should run after the route handler
  // Example: `this.after.push(this.fakeAfterMiddleware)`
  setupAfterMiddleware: function() {},

  // Setup middleware that should run after everything else
  // Example: `this.post.push(this.fakePostMiddleware)`
  // DO NOT OVERRIDE (advanced internal use)
  setupPostMiddleware: function() {
    this.post.push(this.successResponse);
    this.post.push(this.errorResponse);
    this.post.push(this.finalResponse);
  },


  // Middleware
  // ---

  // Checks for the presence of `req.admin`
  requireAdmin: function(req, res, next) {
    var err;
    if (!req.admin) {
      err = new Error("Admin required.");
      err.code = 401;
    }
    next(err);
  },

  // Checks for the presence of `req.user`
  requireUser: function(req, res, next) {
    var err;
    if (!req.user) {
      err = new Error("User required.");
      err.code = 401;
    }
    next(err);
  },

  // Checks for `Content-Type: application/json` in the headers
  requireJSON: function(req, res, next) {
    var err;
    if (!req.is('json')) {
      err = new Error("Please set your request headers to contain: `Content-Type: application/json`.");
      err.code = 400;
    }
    next(err);
  },

  // Promise friendly next()
  // Used as a resolver for `then`
  nextThen: function(req, res, next) {
    return function(modelOrCollection) {
      this.prepareResponse(modelOrCollection, req, res, next);
    }.bind(this);
  },

  // Promise friendly next(err)
  // Used as a resolver for `catch`
  nextCatch: function(req, res, next) {
    return function(err) {
      next(err);
    }.bind(this);
  },

  // This method can be overridden to customize the response
  prepareResponse: function(modelOrCollection, req, res, next) {
    if (!modelOrCollection) {
      return next();
    }

    if (modelOrCollection instanceof Model) {
      // Data is a Model
      res.data = this.renderModel(modelOrCollection);
    } else if (modelOrCollection instanceof Collection) {
      // Data is a Collection
      res.data = this.renderCollection(modelOrCollection);
    } else {
      // Data is raw
      res.data = modelOrCollection;
    }

    return next();
  },

  // Default middleware for handling successful responses
  successResponse: function(req, res, next) {
    // Default to 200, but allow override (e.g. 201)
    res.code = res.code || 200;

    var data = res.data || {};
    var envelope = {
      meta: {
        code: res.code
      },
      data: data
    };

    // Optional paging meta
    if (res.paging) {
      envelope.meta.paging = res.paging;
    }

    res.data = envelope;
    next();
  },

  // Default middleware for handling error responses
  errorResponse: function(err, req, res, next) {
    // Default to 500, but allow override
    res.code = res.code || err.code || 500;

    var data = res.data || {};
    var envelope = {
      meta: {
        code: res.code,
        error: err.message
      },
      data: data
    };

    // TODO
    // We should log these errors somewhere remotely
    
    res.data = envelope;
    next();
  },

  // Final middleware for handling all responses
  // Server actually responds to the request here
  finalResponse: function(req, res, next) {
    // If we timed out before managing to respond, don't send the response
    if (res.headerSent) {
      return;
    }

    // Respond with correct format, defaulting to json
    res.fmt = res.fmt || 'json';
    if (res.fmt === 'json') {
      // json
      res.jsonp(res.code, res.data);
    } else if (res.fmt === 'xml') {
      // xml
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.send(res.code, res.data);
    } else {
      // text or html
      res.send(res.code, res.data);
    }
  },


  // Renderers
  // ---
  
  renderModel: function(model) {
    return model.render().content();
  },

  renderCollection: function(collection) {
    return collection.map(function(model) {
      return model.render().content();
    });
  },




  // Helpers
  // ---

  // Parses req.query (querystring) for since/until, sort/order, skip/limit
  // Also builds a query using allowed queryParams if applicable
  parseQueryString: function(req) {
    var query = {};
    var queries = [];
    var options = {};

    // Reserved Params
    var since = req.query.since || req.query.from; // validate timestamp (s or ms) [DO NOT USE]
    var until = req.query.until || req.query.to; // validate timestamp (s or ms) [ DO NOT USE]
    var sortBy = req.query.sort || "created"; // validate sortableParams
    var orderBy = req.query.order || "desc"; // validate [asc, desc]
    var skip = req.query.skip || req.query.offset || 0; // validate int
    var limit = req.query.limit || req.query.count || 50; // validate int

    // Build created, updated objects into the query string if sent in as dot notation
    _.each(req.query, function(obj, key) {
      var match;
      if (match = key.match(/(created|updated).(gte|lte|gt|lt)/)) {
        req.query[match[1]] = req.query[match[1]] || {};
        req.query[match[1]][match[2]] = parseInt(obj);
      }
    });

    var created = req.query.created || {}; // accepts both s and ms
    var updated = req.query.updated || {}; // accepts both s and ms

    // Convert all timestamps into integers
    _.each(created, function(timestamp, key) {
      created[key] = _.parseInt(timestamp);
    });

    _.each(updated, function(timestamp, key) {
      updated[key] = _.parseInt(timestamp);
    });

    // Query
    // Create date
    if (!_.isEmpty(created)) {
      var createdQuery = {
        created: {}
      };

      if (created.gte) {
        created.gte = _.isUnixTime(created.gte) ? created.gte * 1000 : created.gte;
        createdQuery.created["$gte"] = new Date(created.gte).getTime();
      } else if (created.gt) {
        created.gt = _.isUnixTime(created.gt) ? created.gt * 1000 : created.gt;
        createdQuery.created["$gt"] = new Date(created.gt).getTime();
      }

      if (created.lte) {
        created.lte = _.isUnixTime(created.lte) ? created.lte * 1000 : created.lte;
        createdQuery.created["$lte"] = new Date(created.lte).getTime();
      } else if (created.lt) {
        created.lt = _.isUnixTime(created.lt) ? created.lt * 1000 : created.lt;
        createdQuery.created["$lt"] = new Date(created.lt).getTime();
      }

      if (_.isNumber(created)) {
        created = _.isUnixTime(created) ? created * 1000 : created;
        createdQuery.created = new Date(created).getTime();
      }
      queries.push(createdQuery);
    }

    // Updated/modified date
    if (!_.isEmpty(updated)) {
      var updatedQuery = {
        updated: {}
      };

      if (updated.gte) {
        updated.gte = _.isUnixTime(updated.gte) ? updated.gte * 1000 : updated.gte;
        updatedQuery.created["$gte"] = new Date(updated.gte).getTime();
      } else if (updated.gt) {
        updated.gt = _.isUnixTime(updated.gt) ? updated.gt * 1000 : updated.gt;
        updatedQuery.updated["$gt"] = new Date(updated.gt).getTime();
      }

      if (updated.lte) {
        updated.lte = _.isUnixTime(updated.lte) ? updated.lte * 1000 : updated.lte;
        updatedQuery.updated["$lte"] = new Date(updated.lte).getTime();
      } else if (updated.lt) {
        updated.lt = _.isUnixTime(updated.lt) ? updated.lt * 1000 : updated.lt;
        updatedQuery.created["$lt"] = new Date(updated.lt).getTime();
      }

      if (_.isNumber(updated)) {
        updated = _.isUnixTime(updated) ? updated * 1000 : updated;
        updatedQuery.updated = new Date(updated).getTime();
      }
      queries.push(updatedQuery);
    }

    // Since/Until Range
    if (since || until) {
      var sinceUntilQuery = {
        created: {}
      };

      if (since) {
        sinceUntilQuery.created["$gte"] = new Date(_.parseInt(since) * 1000).getTime();
      }

      if (until) {
        sinceUntilQuery.created["$lte"] = new Date(_.parseInt(until) * 1000).getTime();
      }

      queries.push(sinceUntilQuery);
    }

    // Filter Params
    var allowedParams = _.extend(this.queryParams(), {
      "user_id": "string"
    });
    var queryParams = _.pick(req.query, _.keys(allowedParams));

    _.each(queryParams, function(val, key) {
      // If value is all, ignore this param
      if (val === 'all') {
        return;
      }

      // The built query filter
      var filter = {};

      // Get param type
      var type = allowedParams[key];

      // Deal with different param types
      if (type === 'regex') {
        // regex case insensitive and escaping special characters
        filter[key] = {
          "$regex": '^' + _.escapeRegExp(val),
          "$options": 'i'
        };
      } else if (type === 'string') {
        // strings and objectid
        filter[key] = val;
      } else if (type === 'integer') {
        // integers
        val = _.parseInt(val);
        filter[key] = val;
      } else {
        // invalid or unknown type
        return;
      }

      queries.push(filter);
    });

    // Combine the query
    if (queries.length > 0) {
      query['$and'] = queries;
    }


    // Options
    // Sort/Order/Limit/Skip
    var sortOptions = [
      [sortBy, orderBy]
    ];

    return {
      query: query,
      "sort": sortOptions,
      "limit": parseInt(limit, 10),
      "skip": parseInt(skip, 10)
    };
  },


  // Get `access_token` from `req`
  // Attempts to get an `access_token` from the `Authorization` header
  // Uses several fallbacks to read the token
  // Also falls back to reading `access_token` from the query string
  accessTokenFromRequest: function(req) {
    var access_token;

    if (req.headers.authorization) {
      // Use HTTP Auth header
      var parts = req.headers.authorization.split(' ');
      var scheme = parts[0];
      var credentials = parts[1];

      if (scheme === 'Basic') {
        // HTTP Basic
        var userPass = new Buffer(credentials, 'base64')
          .toString()
          .split(':');
        if (userPass.length > 1) {
          // Base64
          access_token = userPass[0];
        } else {
          // Not Base64
          access_token = credentials;
        }
      } else if (scheme === 'Bearer') {
        // HTTP Bearer
        access_token = credentials;
      } else {
        // Fallback if access_token is passed directly without scheme
        access_token = scheme;
      }
    } else if (req.query.access_token) {
      // Use query string
      access_token = req.query.access_token;
    }

    return access_token;
  }

});