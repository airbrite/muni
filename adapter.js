'use strict';

// What is an Adapter?
// ---
// What isn't an Adapter?
// It's not a Controller.
//
// TODO
// ---
// 2014/05/22 - Peter will add some comments

// Dependencies
// ---
var _ = require('lodash');
var Promise = require('bluebird');
var Backbone = require('backbone');
var request = require('request');
var logger = require('./logger');

module.exports = Backbone.Model.extend({
  urlRoot: '',

  baseUrl: function() {
    return this.urlRoot;
  },

  // Build the request options config object
  buildRequestOptions: function(options) {
    var err;
    options = options || {};

    // Validate options
    if (!options.url && !options.path) {
      options.path = '';
    }

    // Computed Base URL
    var baseUrl = (typeof(this.baseUrl) === 'function') ?
      this.baseUrl() :
      this.baseUrl;

    // Prepare the request
    var requestOptions = {
      method: options.method || 'GET',
      url: options.url || baseUrl + options.path,
      qs: options.qs || {},
      headers: {}
    };

    if (!_.isNull(options.json) && !_.isUndefined(options.json)) {
      requestOptions.json = options.json;
    } else {
      requestOptions.json = true;
    }
    if (options.access_token) {
      requestOptions.access_token = options.access_token;
    }

    // Optionally attach access_token
    var access_token = options.access_token || this.get('access_token');
    if (access_token) {
      requestOptions.access_token = access_token;
      _.defaults(requestOptions.headers, {
        'Authorization': 'Bearer: ' + access_token
      });
    }

    var oauth_token = options.oauth_token || this.get('oauth_token');
    if (oauth_token) {
      requestOptions.oauth_token = oauth_token;
      _.defaults(requestOptions.headers, {
        'Authorization': 'OAuth ' + oauth_token
      });
    }

    var authorization_token = options.authorization_token ||
      this.get('authorization_token');
    if (authorization_token) {
      requestOptions.authorization_token = authorization_token;
      _.defaults(requestOptions.headers, {
        'Authorization': authorization_token
      });
    }

    // Optionally include FORM or BODY
    if (options.form) {
      requestOptions.form = options.form;
      requestOptions.headers['Content-Type'] =
        'application/x-www-form-urlencoded; charset=utf-8';
    } else if (options.body) {
      requestOptions.body = options.body;
    }

    if (options.headers) {
      _.defaults(requestOptions.headers, options.headers);
    }

    // auth for affirm
    if (options.auth) {
      requestOptions.auth = options.auth;
    }

    return requestOptions;
  },

  // Send the http request
  sendRequest: function(options, callback) {
    // Create a promise to defer to later
    var deferred = Promise.defer();
    var requestOptions = this.buildRequestOptions(options);

    // Fire the request
    request(requestOptions, function(error, response, body) {
      this.LAST_REQUEST = requestOptions;
      this.LAST_ERROR = error;
      this.LAST_RESPONSE = response;
      this.LAST_BODY = body;

      if (error) {
        var message = error.message ||
          response.meta &&
          response.meta.error_message;
        logger.warn('Request error: %s', message);

        if (callback) {
          callback(error);
        }

        return deferred.reject(error);
      } else if (response.statusCode >= 400) {
        error = new Error(this.extractError(body));
        error.code = response.statusCode;
        logger.warn('Request failed with code: %d and message: %s',
          error.code, error.message);

        if (callback) {
          callback(error);
        }

        return deferred.reject(error);
      }

      if (callback) {
        callback(null, body);
      }

      return deferred.resolve(body);
    }.bind(this));

    return deferred.promise;
  },

  // If there's an error, try your damndest to find it.
  // APIs hide errors in all sorts of places these days
  extractError: function(body) {
    if (_.isString(body)) {
      return body;
    } else if (_.isObject(body) && _.isString(body.error)) {
      return body.error;
    } else if (_.isObject(body) && _.isString(body.msg)) {
      return body.msg;
    } else if (_.isObject(body) && _.isObject(body.error)) {
      return this.extractError(body.error);
    } else if (_.isObject(body) && _.isString(body.message)) {
      return body.message;
    } else if (_.isObject(body) &&
      body.meta &&
      _.isString(body.meta.error_message)) {
      return body.meta.error_message;
    } else {
      return 'Unknown Error';
    }
  },
});
