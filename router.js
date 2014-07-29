"use strict";

var _ = require('lodash');
var express = require('express');

// Exposes 2 additional attributes
// routes - an array of mapped routes
// url - a string representing the base url with optional version
module.exports = function(options) {
  options = options || {};

  // Create a new express router
  var router = express.Router(options);

  // Array of active routes
  router.routes = [];

  // Base URL of the router with optional version
  router.url = "";
  if (options.version) {
    router.url += "/" + options.version;
  }

  // Controllers
  router.controllers = options.controllers;

  // Add routes
  router.addControllerRoutes = function() {
    // Set of active routes
    var paths = {};

    // Each controller has a `routes` object
    // Automagically hook up all routes defined in controllers
    if (router.controllers) {
      _.each(router.controllers, function(controller) {
        var routes = controller.routes;

        _.each(routes, function(route, method) {
          _.each(route, function(routeOptions, path) {
            // If path/method has already been defined, skip
            if (paths[path] === method) {
              return;
            }

            // If no route action is defined, skip
            if (!routeOptions.action) {
              return;
            }

            var disallowedParams = routeOptions.disallowedParams || [];
            var requiredParams = routeOptions.requiredParams || [];
            var allowedParams = routeOptions.allowedParams || [];

            // Hook up the route/path/method to the controller action/middleware
            var pre = _.invoke(controller.pre, 'bind', controller) || [];
            var before = _.invoke(controller.before, 'bind', controller) || [];
            var after = _.invoke(controller.after, 'bind', controller) || [];
            var fn = function(req, res, next) {
              // Omit disallowed params in body and query
              if (disallowedParams.length) {
                req.body = _.omit(req.body, disallowedParams);
                req.query = _.omit(req.query, disallowedParams);
              }

              // Pick allowed params in body and query
              if (allowedParams.length) {
                req.body = _.pick(req.body, allowedParams);
                req.query = _.pick(req.query, allowedParams);
              }

              // Reject request if required params are not present
              if (requiredParams.length) {
                // Find all missing parameters
                var missingParams = [];
                _.each(requiredParams, function(requiredParam) {
                  if (!req.body[requiredParam] && !req.query[requiredParam]) {
                    missingParams.push(requiredParam);
                  }
                });

                // If there are missing parameters,
                // respond with an error before routing
                if (missingParams.length) {
                  var err;
                  var errParts = [];
                  missingParams = _.map(missingParams, function(missingParam) {
                    return '`' + missingParam + '`';
                  });
                  errParts.push("Missing");
                  errParts.push(missingParams.join(', '));
                  errParts.push("parameter(s).");
                  err = new Error(errParts.join(' '));
                  err.code = 400;
                  return next(err);
                }
              }

              // Execute the route for the request
              routeOptions.action.call(controller, req, res, next);
            };

            // Define the express route
            router[method](
              path,
              pre,
              routeOptions.middleware || [],
              before,
              fn,
              after
            );

            // Add route to set of active routes
            router.routes.push({
              url: router.url,
              method: method,
              path: path
            });

            // Set this path/method as being active
            paths[path] = method;
          });
        });
      });
    }
  };

  return router;
};
