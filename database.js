"use strict";

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
  debug: true,

  defaults: function() {
    return {
      // Each `key: value` pair should consist of `name: url`
      mongos: {},

      // Keys: port, host, auth
      caches: {}
    };
  },

  initialize: function() {
    this.mongos = {};
    this.caches = {};
    
    // Setup all configured mongo connections
    _.each(this.get('mongos'), function(val, key) {
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

    var redisClient = redis.createClient(options.port, options.host);
    if (options.auth) {
      redisClient.auth(options.auth);
    }
    this.caches[name] = redisClient;

    // Catching this error event will prevent node from exiting
    this.caches[name].on('error', function(err) {
      console.error("Redis %d connect error to url: %s - %s".error, process.pid, connString, err.message);
    }.bind(this));

    if (this.debug) {
      var connString = '';
      if (options.auth) {
        connString += options.auth + "@";
      }
      connString += options.host;
      connString += ':';
      connString += options.port;
      console.log("Redis %d connected to url: %s", process.pid, connString);
    }
  },

  setupMongo: function(name, url) {
    this.mongos[name] = new Mongo(url);
    
    // Events
    this.mongos[name].on("connect", function(url) {
      if (this.debug) {
        console.log("Mongo %s (%d) connected to url: %s".info, name, process.pid, url);
      }
    }.bind(this));

    this.mongos[name].on("error", function(error) {
      if (this.debug) {
        console.error("Mongo %s (%d) connect error to url: %s -> %s".error, name, process.pid, url, error.message);
      }
    }.bind(this));

    // Connect
    this.mongos[name].connect();
  }
});