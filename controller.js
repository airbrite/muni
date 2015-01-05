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
      all: {},
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

  // Render a model or a collection in the response
  // Used as a promise resolver in a `.then` promise handler
  // Always bind inner function to `this` original context
  render: function(req, res, next) {
    return function(modelOrCollection) {
      this.prepareResponse(modelOrCollection, req, res, next);
    }.bind(this);
  },

  // Deprecated (see `render`)
  nextThen: function(req, res, next) {
    return this.render(req, res, next);
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
    var data = res.data || null;
    var code = 200;
    if (_.isNumber(res.code)) {
      code = res.code;
    }
    var envelope = {
      meta: {
        code: code
      },
      data: data
    };

    // Optional paging meta
    if (res.paging) {
      envelope.meta.paging = res.paging;
    }

    // Set code and data
    res.code = code;
    if (res.code !== 204) {
      res.data = envelope;
    }

    return next();
  },

  // Default middleware for handling error responses
  errorResponse: function(err, req, res, next) {
    var data = err.message || 'Internal Server Error';
    var code = 500;
    if (_.isNumber(err.code)) {
      code = err.code;
    } else if (_.isNumber(res.code)) {
      code = res.code;
    }
    var error = {
      message: data,
      code: code
    };
    if (_.isString(err.type)) {
      error.type = err.type;
    }
    var envelope = {
      meta: {
        code: code,
        error: error
      },
      data: data
    };

    // TODO
    // We should log these errors somewhere remotely
    if (this.debug) {
      if (code >= 500) {
        if (err && err.stack) {
          console.error('Request Error: %j', err.stack, {});
        }
      } else {
        console.error('Request Error (%d): %s', code, err.message);
      }
    }

    // Set code and data
    res.code = code;
    res.data = envelope;

    return next();
  },

  // Final middleware for handling all responses
  // Server actually responds to the request here
  finalResponse: function(req, res, next) {
    // If we timed out before managing to respond, don't send the response
    if (res.headersSent) {
      return;
    }

    // Look for `.json` or `.xml` extension in path
    // And override request accept header
    if (/.json$/.test(req.path)) {
      req.headers.accept = 'application/json';
    } else if (/.xml$/.test(req.path)) {
      req.headers.accept = 'application/xml';
    }

    // Use request accept header to determine response content-type
    res.format({
      json: function() {
        res.status(res.code).jsonp(res.data);
      },
      xml: function() {
        res.set('Content-Type', 'application/xml; charset=utf-8');

        var xml;
        try {
          var xmlData = JSON.parse(JSON.stringify(res.data));
          xml = this.xmlBuilder.buildObject(xmlData);
          res.status(res.code).send(xml);
        } catch (e) {
          console.error('XML building error: %s', e.stack);
          res.status(res.code);
        }
      }.bind(this)
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

  // For `created` and `updated` date range query string
  buildTimestampQuery: function(query) {
    var result = {};
    if (!_.isObject(query) || _.isEmpty(query)) {
      return result;
    }

    // timestamp might be in `ms` or `s`
    _.each(query, function(timestamp, operator) {
      if (!_.contains(['gt', 'gte', 'lt', 'lte', 'ne'], operator)) {
        return;
      }

      // Timestamp must be an integer
      timestamp = _.parseInt(timestamp);
      if (_.isNaN(timestamp)) {
        return;
      }

      // Convert seconds to milliseconds
      timestamp = _.isUnixTime(timestamp) ? timestamp * 1000 : timestamp;

      result['$' + operator] = timestamp;
    });

    return result;
  },

  // Parses req.query (querystring) for since/until, sort/order, skip/limit
  // Also builds a query using allowed queryParams if applicable
  parseQueryString: function(req, options) {
    var query = {};
    var queries = [];
    options = options || {};

    // Need to make sure these are strings, they get parsed to int later
    options.skip = options.skip ? options.skip.toString() : options.skip;
    options.limit = options.limit ? options.limit.toString() : options.limit;

    // Reserved Params
    var fields = {};
    var created = req.query.created || {}; // accepts both s and ms
    var updated = req.query.updated || {}; // accepts both s and ms
    var sortBy = options.sortParam || req.query.sort || this.sortParam;
    var orderBy = options.sortOrder || req.query.order || this.sortOrder;
    var skip = options.skip || req.query.skip || req.query.offset || this.skip;
    var limit = options.limit || req.query.limit || req.query.count || this.limit;
    skip = _.parseInt(skip) || 0;
    limit = _.parseInt(limit) || 0;
    limit = Math.min(limit, this.limit); // Hard limit at 100

    var page = _.parseInt(req.query.page);
    if (page > 0) {
      // IMPORTANT! `page` starts at 1
      // if `page` is specified, we override `skip`
      // calculate skip based on page and limit
      // lets assume limit is 100
      // page 1 is skip 0
      // page 2 is skip 100
      // etc...
      skip = (page - 1) * limit;
    }

    // Date Range params
    var createdQuery = this.buildTimestampQuery(created);
    var updatedQuery = this.buildTimestampQuery(updated);

    if (!_.isEmpty(createdQuery)) {
      queries.push({
        created: createdQuery
      });
    }
    if (!_.isEmpty(updatedQuery)) {
      queries.push({
        updated: updatedQuery
      });
    }

    // Fields
    if (_.isString(req.query.fields)) {
      _.each(req.query.fields.split(','), function(field) {
        fields[field] = 1;
      });
    }
    if (_.isObject(options.fields)) {
      _.extend(fields, options.fields);
    }

    // Filter params
    var queryParams = _.extend(_.result(this, 'queryParams'), {
      'user_id': 'string'
    });
    if (_.isObject(options.queryParams)) {
      _.extend(queryParams, options.queryParams);
    }
    var filterParams = _.pick(req.query, _.keys(queryParams));
    var logicalOperator = '$' + (req.query.logical || 'and').toLowerCase().replace(/[@\s]/g, '');

    _.each(filterParams, function(val, key) {
      // If value is all, ignore this param
      if (val === 'all') {
        return;
      }

      // Make sure val is a string (should usually be from express)
      if (!_.isString(val)) {
        val = val.toString();
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
            '$regex': _.escapeRegExp(v),
            '$options': 'i'
          };
        });
      } else if (type === 'integer') {
        // integers
        vals = _.map(vals, function(v) {
          return _.parseInt(v);
        });
      } else if (type === 'float') {
        // floats
        vals = _.map(vals, function(v) {
          return parseFloat(v);
        });
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
      query[logicalOperator] = queries;
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
      'skip': skip,
      'fields': fields
    };
  }
});
