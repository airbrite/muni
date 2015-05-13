'use strict';

var Muni = {};

Muni.Promise = require('bluebird');
Muni.Backbone = require('backbone');
Muni._ = require('lodash');

// Version, Mixins, and Backbone.Events
// Muni can be used as a pubsub bus
Muni._.extend(Muni, Muni.Backbone.Events, {
  version: require('./package.json').version
}, Muni, require('./mixins'));

// Limiter
Muni.limiter = require('./limiter');

// Database driver
Muni.Mongo = require('./mongo');

// Router
Muni.Router = require('./router');

// Controller
Muni.Controller = require('./controller');

// Crud Controller, extends Controller, adds CRUD routing
Muni.CrudController = require('./crud_controller');

// Model for the ORM
Muni.Model = require('./model');

// Collection for the ORM
Muni.Collection = require('./collection');

// Adapters connect to third-party APIs and services
Muni.Adapter = require('./adapter');

// Errors dawg
Muni.Error = require('./error');

// Debug and error logging
Muni.debug = require('./debug');
Muni.log = Muni.debug.log;
Muni.error = Muni.debug.error;

// Export to the world
module.exports = Muni;
