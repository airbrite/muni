'use strict';

// TODO
// ---
// 2014/05/22 - Peter will add some comments

// Dependencies
// ---
var _ = require('lodash');
var Backbone = require('backbone');
var redis = require('redis');
var Mongo = require('./mongo');

// DatabaseManager is a singleton that maintains the databases
module.exports = Backbone.Model.extend({
  debug: false,

  defaults: function() {
    return {
      // Each `key: value` pair should consist of `name: url`
      mongodbs: {},

      // Keys: port, host, auth
      caches: {},

      silent: false
    };
  },

  initialize: function() {
    this.mongodbs = {};
    this.caches = {};

    // Setup all configured mongo connections
    _.each(this.get('mongodbs'), function(val, key) {
      this.setupMongo(key, val);
    }.bind(this));

    // Setup all configured redis connections
    _.each(this.get('caches'), function(val, key) {
      this.setupRedis(key, val);
    }.bind(this));
  },

  setupRedis: function(name, options) {
    if (_.isEmpty(options)) {
      return;
    }

    // Connection string
    var connString = '';

    var redisClient = redis.createClient(options.port, options.host);
    if (options.auth) {
      redisClient.auth(options.auth);
      connString += options.auth + '@';
    }
    connString += options.host;
    connString += ':';
    connString += options.port;
    this.caches[name] = redisClient;

    // Catching this error event will prevent node from exiting
    this.caches[name].on('error', function(err) {
      if (!this.get('silent')) {
        console.error('Redis %s %d connect error to url: %s - %s'.error,
          name, process.pid, connString, err.message);
      }
    }.bind(this));

    this.caches[name].on('ready', function() {
      if (!this.get('silent')) {
        console.log('Redis %s %d connected to url: %s',
          name, process.pid, connString);
      }
    }.bind(this));
  },

  setupMongo: function(name, url) {
    this.mongodbs[name] = new Mongo(url);

    // Events
    this.mongodbs[name].on('connect', function(url) {
      if (!this.get('silent')) {
        console.log('Mongo %s %d connected to url: %s',
          name, process.pid, url);
      }
    }.bind(this));

    this.mongodbs[name].on('error', function(error) {
      if (!this.get('silent')) {
        console.error('Mongo %s %d connect error to url: %s -> %s'.error,
          name, process.pid, url, error.message);
      }
    }.bind(this));

    // Connect
    this.mongodbs[name].connect();
  }
});
