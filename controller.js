'use strict';

// What is Controller?
// ---

// Controller helps facilitate routing via express
// by providing configuring route handlers
//
// For example, a route to `/users/:id`
// would be handled by a `UsersController` with function `findOne`
//
// It provides a way for each controller
// to setup the routes and handlers it wants to respond to
//
// Also provides a mechanism to define pre, before, and after middleware
// per controller or per route
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
var xml2js = require('xml2js');

module.exports = Backbone.Model.extend({
  debug: false,

  path: '/',

  sortParam: 'created',
  sortOrder: 'desc',
  skip: 0,
  limit: 100,

  xmlBuilder: new xml2js.Builder(),

  // Route specific middleware definitions
  // Object or Function
  middleware: function() {
    return {};
  },

  // Database query parameters/filters
  // Object or Function
  queryParams: function() {
    return {};
  },

  // Computes the base path for the controller
  // Object or Function
  basePath: function() {
    return this.path;
  },

  // Called after the constructor
  initialize: function() {
    // Routes
    this.routes = {
      get: {},
      post: {},
      put: {},
      patch: {},
      delete: {}
    };

    // Middleware(s)
    this.pre = []; // run before route middleware
    this.before = []; // run after route middleware but before route handler
    this.after = []; // run after route handler

    // Setup middleware and route handlers
    this.setupPreMiddleware();
    this.setupBeforeMiddleware();
    this.setupRoutes();
    this.setupAfterMiddleware();

    // Response/error handler middleware
    this.after.push(this.successResponse);
    this.after.push(this.errorResponse);
    this.after.push(this.finalResponse);
  },

  // Setup routes that this controller should handle
  //
  // Example:
  // this.routes.get['/test'] = {
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


  // Middleware
  // ---

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

    if (res.code === 204) {
      res.data = null;
    } else {
      res.data = envelope;
    }
    next();
  },

  // Default middleware for handling error responses
  errorResponse: function(err, req, res, next) {
    // Default to 500, but allow override
    var code = res.code || err.code || 500;
    var data = err.message || '';

    var envelope = {
      meta: {
        code: code,
        error: {
          message: data,
          code: code
        }
      },
      data: data
    };

    // TODO
    // We should log these errors somewhere remotely
    if (this.debug) {
      if (code >= 500) {
        if (err && err.stack && err.stack.error) {
          console.error(err.stack.error);
        }
      } else {
        console.error('Error (%d): %s'.error, code, data);
      }
    }

    res.code = code;
    res.data = envelope;
    next();
  },

  // Final middleware for handling all responses
  // Server actually responds to the request here
  finalResponse: function(req, res, next) {
    // If we timed out before managing to respond, don't send the response
    if (res.headersSent) {
      return;
    }

    res.format({
      json: function() {
        res.status(res.code).jsonp(res.data);
      },
      xml: function() {
        var xml;
        try {
          var xmlObject = {};
          if (_.isObject(res.data)) {
            xmlObject = res.data;
          } else if (_.isString(res.data))  {
            xmlObject = {
              message: res.data
            };
          }
          xml = this.xmlBuilder.buildObject(xmlObject);
        } catch (e) {}
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(res.code, xml);
      }.bind(this),
      text: function() {
        res.send(res.code, res.data);
      }
    });
  },


  // Render
  // ---

  renderModel: function(model) {
    return model.render();
  },

  renderCollection: function(collection) {
    return collection.map(function(model) {
      return model.render();
    });
  },



  // Helpers
  // ---

  // Gets any route middleware that may have been defined
  getRouteMiddleware: function(action) {
    // Find route middleware definitions
    var middleware = _.result(this, 'middleware');
    if (_.has(middleware, action)) {
      return middleware[action];
    } else {
      return [];
    }
  },

  // Parses req.query (querystring) for since/until, sort/order, skip/limit
  // Also builds a query using allowed queryParams if applicable
  parseQueryString: function(req) {
    var query = {};
    var queries = [];
    var options = {};

    // Reserved Params
    var since = req.query.since || req.query.from; // validate timestamp (s or ms) [DO NOT USE]
    var until = req.query.until || req.query.to; // validate timestamp (s or ms) [ DO NOT USE]
    var sortBy = req.query.sort || this.sortParam; // validate sortableParams
    var orderBy = req.query.order || this.sortOrder; // validate [asc, desc]
    var skip = req.query.skip || req.query.offset || this.skip;
    var limit = req.query.limit || req.query.count || this.limit;
    skip = _.parseInt(skip) > 0 || 0;
    limit = _.parseInt(limit) > 0 ? Math.min(limit, this.limit) : this.limit; // Hard limit at 100

    // Build created
    // updated objects into the query string if sent in as dot notation
    _.each(req.query, function(obj, key) {
      var match;
      if (match = key.match(/(created|updated).(gte|lte|gt|lt)/)) {
        req.query[match[1]] = req.query[match[1]] || {};
        req.query[match[1]][match[2]] = _.parseInt(obj);
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
        createdQuery.created['$gte'] = new Date(created.gte).getTime();
      } else if (created.gt) {
        created.gt = _.isUnixTime(created.gt) ? created.gt * 1000 : created.gt;
        createdQuery.created['$gt'] = new Date(created.gt).getTime();
      }

      if (created.lte) {
        created.lte = _.isUnixTime(created.lte) ? created.lte * 1000 : created.lte;
        createdQuery.created['$lte'] = new Date(created.lte).getTime();
      } else if (created.lt) {
        created.lt = _.isUnixTime(created.lt) ? created.lt * 1000 : created.lt;
        createdQuery.created['$lt'] = new Date(created.lt).getTime();
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
        updatedQuery.updated['$gte'] = new Date(updated.gte).getTime();
      } else if (updated.gt) {
        updated.gt = _.isUnixTime(updated.gt) ? updated.gt * 1000 : updated.gt;
        updatedQuery.updated['$gt'] = new Date(updated.gt).getTime();
      }

      if (updated.lte) {
        updated.lte = _.isUnixTime(updated.lte) ? updated.lte * 1000 : updated.lte;
        updatedQuery.updated['$lte'] = new Date(updated.lte).getTime();
      } else if (updated.lt) {
        updated.lt = _.isUnixTime(updated.lt) ? updated.lt * 1000 : updated.lt;
        updatedQuery.created['$lt'] = new Date(updated.lt).getTime();
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
        sinceUntilQuery.created['$gte'] = new Date(_.parseInt(since) * 1000).getTime();
      }

      if (until) {
        sinceUntilQuery.created['$lte'] = new Date(_.parseInt(until) * 1000).getTime();
      }

      queries.push(sinceUntilQuery);
    }

    // Filter Params
    var queryParams = _.extend(_.result(this, 'queryParams'), {
      'user_id': 'string'
    });
    var filterParams = _.pick(req.query, _.keys(queryParams));

    _.each(filterParams, function(val, key) {
      // If value is all, ignore this param
      if (val === 'all') {
        return;
      }

      // Support `,` as `$or` for each param
      var vals = val.split(',');

      // No value, ignore this param
      if (vals.length === 0) {
        return;
      }

      // The built query filter
      var filter = {};

      // Get param type
      var type = queryParams[key];

      // Deal with different param types
      if (type === 'string') {
        // strings and objectid
        // no transformation
      } else if (type === 'regex') {
        // regex case insensitive and escaping special characters
        vals = _.map(vals, function(v) {
          return {
            // '$regex': '^' + _.escapeRegExp(v),
            '$regex': _.escapeRegExp(v),
            '$options': 'i'
          };
        });
        // filter[key] = {
        //   '$regex': '^' + _.escapeRegExp(val),
        //   '$options': 'i'
        // };
      } else if (type === 'integer') {
        // integers
        vals = _.map(vals, function(v) {
          return _.parseInt(v);
        });
        // val = _.parseInt(val);
      } else if (type === 'float') {
        // floats
        vals = _.map(vals, function(v) {
          return _.parseFloat(v);
        });
        // val = parseFloat(val);
      } else {
        // invalid or unknown type
        return;
      }

      // If there is only one val, no need to use `$or`
      if (vals.length === 1) {
        filter[key] = vals[0];
      } else {
        var orExpr = [];
        _.each(vals, function(orVal) {
          var orClause = {};
          orClause[key] = orVal;
          orExpr.push(orClause);
        });
        filter['$or'] = orExpr;
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
      'query': query,
      'sort': sortOptions,
      'limit': limit,
      'skip': skip
    };
  }

});
