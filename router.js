"use strict";

var _ = require('lodash');
var express = require('express');
var MuniError = require('./error');
var debug = require('./debug');
var Mixins = require('./mixins');

/**
 * Extends `Express.Router` with additional features
 * Controllers can define routes that will be connected here
 *
 * Added Properties:
 *
 * - `url` a string representing the base url with optional version
 * - `controllers` an object (map) of controllers: `name -> instance`
 * - `routes` an array of connected routes
 *
 * @param {Object} options
 * @return {Router} An instance of `Express.Router`
 */

module.exports = function(options) {
  options = options || {};

  // Create a new `Express.Router`
  var router = express.Router(options);

  // Additional properties
  _.assign(router, {
    url: options.version ? '/' + options.version : '',
    controllers: options.controllers || {},
    routes: [],

    /**
     * Return a list of missing parameters that were required
     *
     * @param {Object} req
     * @param {Array} requiredParams
     * @return {Array}
     */

    _buildMissingParams: function(req, requiredParams) {
      // Find all missing parameters
      var missingParams = [];
      _.forEach(requiredParams, function(requiredParam) {
        if (
          Mixins.isNullOrUndefined(req.params && req.params[requiredParam]) &&
          Mixins.isNullOrUndefined(req.query && req.query[requiredParam]) &&
          Mixins.isNullOrUndefined(req.body && req.body[requiredParam])
        ) {
          missingParams.push(requiredParam);
        }
      });
      return missingParams;
    },

    /**
     * Return an Error containing missing parameters that were required
     *
     * @param {Array} missingParams
     * @return {MuniError}
     */

    _buildMissingParamsError: function(missingParams) {
      var errParts = [];
      missingParams = _.map(missingParams, function(missingParam) {
        return '`' + missingParam + '`';
      });
      errParts.push("Missing");
      errParts.push(missingParams.join(', '));
      errParts.push("parameter(s).");
      return new MuniError(errParts.join(' '), 400);
    },

    /**
     * Return a route handler/callback
     *
     * @param {Controller} controller
     * @param {Object} routeOptions
     * @return {Function}
     */

    _buildHandler: function(controller, routeOptions) {
      return function(req, res, next) {
        var requiredParams = routeOptions.requiredParams || [];
        var ignoredParams = routeOptions.ignoredParams || [];

        // Omit disallowed params in body and query
        if (ignoredParams.length) {
          req.body = _.omit(req.body, ignoredParams);
          req.query = _.omit(req.query, ignoredParams);
        }

        // Reject request if required params are missing
        if (requiredParams.length) {
          // Find all missing parameters
          // If there are missing parameters,
          // respond with an error before routing
          var missingParams = router._buildMissingParams(req, requiredParams);
          if (missingParams.length) {
            return next(router._buildMissingParamsError(missingParams));
          }
        }

        // Execute the route for the request
        return routeOptions.action.call(controller, req, res, next);
      };
    },

    /**
     * Iterates over all controllers and connects any routes defined
     */

    addControllerRoutes: function() {
      // Used for de-duping
      var paths = {};

      // Each controller has a `routes` object
      // Connect all routes defined in controllers
      _.forEach(router.controllers, function(controller) {
        _.forEach(controller.routes, function(route, method) {
          _.forEach(route, function(routeOptions, path) {
            // If path/method has already been defined, skip
            if (paths[path] === method) {
              debug.warn('Skipping duplicate route: [%s] %s', method, path);
              return;
            }

            // If no route action is defined, skip
            if (!routeOptions.action) {
              debug.warn('No action defined for route: [%s] %s', method, path);
              return;
            }

            // Setup controller scoped middleware
            // These apply to all routes in the controller
            var pre = _.invokeMap(controller.pre, 'bind', controller) || [];
            var before = _.invokeMap(controller.before, 'bind', controller) || [];
            var after = _.invokeMap(controller.after, 'bind', controller) || [];

            // Setup route scoped middleware
            // These apply only to this route
            var middleware = routeOptions.middleware || [];

            // Build the route handler (callback)
            var handler = router._buildHandler(controller, routeOptions);

            // Connect the route
            router[method](path, pre, middleware, before, handler, after);

            // Add route to set of connected routes
            router.routes.push({
              url: router.url,
              method: method,
              path: path
            });

            // Use for de-duping
            paths[path] = method;
          });
        });
      });

      // Debug logging
      _.forEach(router.routes, function(route) {
        debug.info('Route [%s] %s', route.method, route.url + route.path);
      });
    }
  });

  return router;
};
