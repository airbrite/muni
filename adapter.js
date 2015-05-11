'use strict';

// Dependencies
// ---
var _ = require('lodash');
var Bluebird = require('bluebird');
var Backbone = require('backbone');
var request = require('request');
var debug = require('./debug');
var BootieError = require('./error');

module.exports = Backbone.Model.extend({
  urlRoot: '',

  /**
   * If there's an error, try your damndest to find it.
   * APIs hide errors in all sorts of places these days
   *
   * @param {String|Object} body
   * @return {String}
   */

  _extractError: function(body) {
    if (_.isString(body)) {
      return body;
    } else if (_.isObject(body) && _.isString(body.error)) {
      return body.error;
    } else if (_.isObject(body) && _.isString(body.msg)) {
      return body.msg;
    } else if (_.isObject(body) && _.isObject(body.error)) {
      return this._extractError(body.error);
    } else if (_.isObject(body) && _.isString(body.message)) {
      return body.message;
    } else if (_.isObject(body) &&
      body.meta &&
      _.isString(body.meta.error_message)) {
      return body.meta.error_message;
    } else {
      return 'Unknown Request Error';
    }
  },

  /**
   * Build and configure the request options
   *
   * @param {Object} options
   * @param {String} options.url
   * @param {String} [options.path=]
   * @param {String} [options.method=GET]
   * @param {String} [options.qs={}]
   * @param {String} [options.headers={}]
   * @param {String} options.json
   * @param {String} options.form
   * @param {String} options.body
   * @param {String} options.access_token
   * @param {String} options.oauth_token
   * @param {String} options.authorization_token
   * @param {String} options.auth
   * @return {Object}
   */

  _buildRequestOptions: function(options) {
    options = options || {};

    // Set default path
    if (!options.url && !options.path) {
      options.path = '';
    }

    // Prepare the request
    var requestOptions = {
      method: options.method || 'GET',
      url: options.url || this.urlRoot + options.path,
      qs: options.qs || {},
      headers: options.headers || {},
    };

    // Add `form`, `body`, or `json` as Request Payload (only one per request)
    //
    // If `json` is a Boolean,
    // Request will set` Content-Type`
    // and call `JSON.stringify()` on `body`
    if (options.body) {
      requestOptions.body = options.body;
      requestOptions.json = _.isBoolean(options.json) ? options.json : true;
    } else if (options.form) {
      requestOptions.form = options.form;
      requestOptions.headers['Content-Type'] =
        'application/x-www-form-urlencoded; charset=utf-8';
    } else if (_.isBoolean(options.json) || _.isObject(options.json)) {
      requestOptions.json = options.json;
    }

    // Basic HTTP Auth
    if (options.auth) {
      requestOptions.auth = options.auth;
    }

    // Access Token
    var accessToken = options.access_token || this.get('access_token');
    if (accessToken) {
      _.defaults(requestOptions.headers, {
        Authorization: ['Bearer', accessToken].join(' ')
      });
    }

    // OAuth Token
    var oauthToken = options.oauth_token || this.get('oauth_token');
    if (oauthToken) {
      _.defaults(requestOptions.headers, {
        Authorization: ['OAuth', oauthToken].join(' ')
      });
    }

    // Authorization Token (No Scheme)
    var authorizationToken = options.authorization_token || this.get('authorization_token');
    if (authorizationToken) {
      _.defaults(requestOptions.headers, {
        Authorization: authorizationToken
      });
    }
    return requestOptions;
  },

  /**
   * Send an HTTP Request with provided request options
   *
   * @param {Object}   options
   * @param {Function} callback
   * @return {Promise}
   */

  sendRequest: function(options, callback) {
    // Create a promise to defer to later
    var deferred = Bluebird.defer();

    // Fire the request
    request(this._buildRequestOptions(options), function(err, response, body) {
      // Handle Errors
      if (err) {
        // Usually a connection error (server unresponsive)
        err = new BootieError(err.message || 'Internal Server Error', err.code || 500);
      } else if (response.statusCode >= 400) {
        // Usually an intentional error from the server
        err = new BootieError(this._extractError(body), response.statusCode);
      }
      if (err) {
        debug.error(
          'Adapter Request Error with Code: %d and Message: %s',
          err.code,
          err.message
        );
        callback && callback(err);
        return deferred.reject(err);
      }

      // Handle Success
      debug.log(
        'Adapter Request Sent with code: %d and body: %s',
        response.statusCode,
        body
      );
      callback && callback(null, body);
      return deferred.resolve(body);
    }.bind(this));

    return deferred.promise;
  }
});
