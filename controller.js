'use strict';

var _ = require('lodash');
var Backbone = require('backbone');
var Model = require('./model');
var Collection = require('./collection');
var xml2js = require('xml2js');
var debug = require('./debug');
var Mixins = require('./mixins');

module.exports = Backbone.Model.extend({
  /**
   * Converts a url query object containing time range data
   * into a Mongo compatible query
   *
   * Note:
   *
   * - timestamps can be either milliseconds or seconds
   * - timestamps can be strings, they will be parsed into Integers
   *
   * Example:
   *
   * {
   *   gt: 1405494000,
   *   lt: 1431327600
   * }
   *
   * Possible Keys:
   *
   * - `gt` Greater than
   * - `gte` Greather than or equal
   * - `lt` Less than
   * - `lte` Less than or equal
   * - `ne` Not equal
   *
   * @param {Object} query
   * @return {Object}
   */

  _buildTimestampQuery: function(query) {
    var result = {};
    if (!_.isObject(query) || _.isEmpty(query)) {
      return result;
    }

    // timestamp might be in `ms` or `s`
    _.forEach(query, function(timestamp, operator) {
      if (!_.includes(['gt', 'gte', 'lt', 'lte', 'ne'], operator)) {
        return;
      }

      // Timestamp must be an integer
      timestamp = _.parseInt(timestamp);
      if (_.isNaN(timestamp)) {
        return;
      }

      // Convert seconds to milliseconds
      timestamp = Mixins.isUnixTime(timestamp) ? timestamp * 1000 : timestamp;

      result['$' + operator] = timestamp;
    });

    debug.info(
      '#_buildTimestampQuery with query: %s and result: %s',
      JSON.stringify(query),
      JSON.stringify(result)
    );
    return result;
  },

  /**
   * Modify `data` to only contain keys that are specified in `fields`
   *
   * @param {Object} fields
   * @param {Object|Array} data
   * @return {Object|Array}
   */

  _restrictFields: function(fields, data) {
    if (!_.isString(fields)) {
      return data;
    }

    // If a field is specified as `foo.bar` or `foo.bar.baz`,
    // Convert it to just `foo`
    var map = {};
    _.forEach(fields.split(','), function(field) {
      map[field.split('.')[0]] = 1;
    });

    var keys = _.keys(map);
    if (_.isArray(data)) {
      data = _.map(data, function(object) {
        return _.pick(object, keys);
      });
    } else if (_.isObject(data)) {
      data = _.pick(data, keys);
    }

    return data;
  },

  path: '/',

  /**
   * Default field to sort by for `find` query
   *
   * @type {String}
   */

  sortParam: 'created',

  /**
   * Default order/direction when sorting with `find` query
   *
   * Possible values:
   *
   * - desc
   * - asc
   *
   * @type {String}
   */

  sortOrder: 'desc',

  /**
   * Default Mongo `skip` value for `find` query
   *
   * @type {Number}
   */

  skip: 0,

  /**
   * Default Mongo `limit` value for `find` query
   *
   * @type {Number}
   */

  limit: 100,

  /**
   * Used to generate XML output for responses
   *
   * Can override to configure default XML builder options
   *
   * @type {xml2js}
   */

  xmlBuilder: new xml2js.Builder({
    renderOpts: {
      pretty: false
    },
    allowSurrogateChars: true,
  }),

  /**
   * Field and Type pairs that can be used in a URL query string
   * to filter results when using a `find` query
   *
   * Possible Types:
   *
   * - string
   * - regex
   * - integer
   * - float
   *
   * Example:
   * - {name: 'string'}
   * - {description: 'regex'}
   * - {timestamp: 'integer'}
   * - {dollars: 'float'}
   *
   * @return {Object}
   */

  queryParams: function() {
    return {};
  },

  /**
   * Computes the base path for the controller
   *
   * Can be overridden by children
   *
   * @return {String}
   */

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

  /**
   * Define routes that this Controller should connect to the Router
   *
   * See the `Router` for more details on how routes are connected
   *
   * Properties of a Route:
   *
   * - `action` - An Express-style route handler
   * - `middleware` - An Express-style middleware handler
   * - `requiredParams` - An array of required params (in body or url string)
   * - `ignoredParams` - An array of ignored params (in body or url string)
   *
   * Example:
   *
   * this.routes.get['/test'] = {
   *   action: function(req, res, next) {},
   *   middleware: [function(req, res, next) {}],
   *   requiredParams: ['foo'],
   *   ignoredParams: ['bar']
   * };
   */

  setupRoutes: function() {},

  /**
   * Define pre middleware that applies to all routes in this Controller
   *
   * Pre middleware is run **BEFORE** route-specific middleware
   *
   * Example:
   *
   * this.pre.push(this.fakePreMiddleware)
   */

  setupPreMiddleware: function() {},

  /**
   * Define before middleware that applies to all routes in this Controller
   *
   * Before middleware is run **AFTER** route-specific middleware
   *
   * Example:
   *
   * this.before.push(this.fakeBeforeMiddleware)
   */

  setupBeforeMiddleware: function() {},


  /**
   * Define after middleware that applies to all routes in this Controller
   *
   * Example:
   *
   * this.after.push(this.fakeAfterMiddleware)
   */
  setupAfterMiddleware: function() {},

  /**
   * Convenience middleware to render a Model or Collection
   *
   * DEPRECATED 2015-06-08
   *
   * @return {Function} A middleware handler
   */

  render: function(req, res, next) {
    return function(modelOrCollection) {
      this.prepareResponse(modelOrCollection, req, res, next);
    }.bind(this);
  },

  /**
   * Attempt to render a Model or Collection
   * If input is not a Model or Collection, pass it thru unmodified
   *
   * DEPRECATED 2015-06-08
   *
   * @param {*} modelOrCollection
   */

  prepareResponse: function(modelOrCollection, req, res, next) {
    if (!modelOrCollection) {
      return next();
    }

    if (modelOrCollection instanceof Model) {
      // Data is a Model
      res.data = modelOrCollection.render();
    } else if (modelOrCollection instanceof Collection) {
      // Data is a Collection
      res.data = modelOrCollection.render();
    } else {
      // Data is raw
      res.data = modelOrCollection;
    }

    return next();
  },

  /**
   * Default middleware for handling successful responses
   */

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

  /**
   * Default middleware for handling error responses
   */

  errorResponse: function(err, req, res, next) {
    err.message = err.message || 'Internal Server Error';
    err.code = err.code || res.code || 500;
    if (!_.isNumber(err.code)) {
      err.code = 500;
    }

    try {
      err.line = err.stack.split('\n')[1].match(/\(.+\)/)[0];
    } catch (e) {
      err.line = null;
    }

    var envelope = {
      meta: {
        code: err.code,
        error: {
          code: err.code,
          message: err.message,
          line: err.line
        }
      },
      data: err.message
    };

    // Set code and data
    res.code = err.code;
    res.data = envelope;

    return next();
  },

  /**
   * Final middleware for handling all responses
   * Server actually responds and terminates to the request here
   */

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
        var xml;
        try {
          var xmlData = JSON.parse(JSON.stringify(res.data));
          xml = this.xmlBuilder.buildObject(xmlData);
          res.set('Content-Type', 'application/xml; charset=utf-8');
          res.status(res.code).send(xml);
        } catch (e) {
          res.status(500).end();
        }
      }.bind(this)
    });
  },

  /**
   * Parses the request query string for `fields`
   *
   * Converse it into a Mongo friendly `fields` Object
   *
   * Example: `?fields=hello,world,foo.bar`
   *
   * @param {Object} req
   * @return {Object}
   */

  parseQueryStringFields: function(req) {
    var fields = {};

    // Fields
    if (_.isString(req.query.fields)) {
      _.forEach(req.query.fields.split(','), function(field) {
        fields[field] = 1;
      });
    }

    return fields;
  },

  /**
   * Parses `req.query` into Mongo compatible syntax
   *
   * Possible Properties:
   *
   * - `created`
   * - `updated`
   * - `since|until`
   * - `sort|order`
   * - `skip|limit`
   * - `page`
   * - `sort`
   * - `order`
   *
   * @param {Express.Req} req
   * @param {Object} options
   * @return {Object} An Object that can be passed as options into the Mongo ORM
   */

  parseQueryString: function(req, options) {
    var query = {};
    var queries = [];
    options = options || {};

    // Need to make sure these are strings, they get parsed to int later
    options.skip = options.skip ? options.skip.toString() : options.skip;
    options.limit = options.limit ? options.limit.toString() : options.limit;

    // Reserved Params
    var created = req.query.created || {}; // accepts both s and ms
    var updated = req.query.updated || {}; // accepts both s and ms
    var sortBy = options.sortParam || req.query.sort || this.sortParam;
    var orderBy = options.sortOrder || req.query.order || this.sortOrder;
    var skip = options.skip || req.query.skip || req.query.offset || this.skip;
    var limit = options.limit || req.query.limit || req.query.count || this.limit;
    skip = _.parseInt(skip) || 0;
    limit = _.parseInt(limit) || 0;

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
    var createdQuery = this._buildTimestampQuery(created);
    var updatedQuery = this._buildTimestampQuery(updated);

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

    // Filter params
    var queryParams = _.assign(_.result(this, 'queryParams'), {
      'user_id': 'string'
    });
    if (_.isObject(options.queryParams)) {
      _.assign(queryParams, options.queryParams);
    }
    var filterParams = _.pick(req.query, _.keys(queryParams));
    var logicalOperator = '$' + (req.query.logical || 'and').toLowerCase().replace(/[@\s]/g, '');

    _.forEach(filterParams, function(val, key) {
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
            '$regex': Mixins.escapeRegExp(v),
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
        _.forEach(vals, function(orVal) {
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

    var result = {
      'query': query,
      'sort': sortOptions,
      'limit': limit,
      'skip': skip
    };

    debug.info(
      '#parseQueryString with req.query: %s and result: %s',
      JSON.stringify(req.query),
      JSON.stringify(result)
    );
    return result;
  }
});
