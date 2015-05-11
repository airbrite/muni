'use strict';

var Bootie = {};

Bootie.Promise = require('bluebird');
Bootie.Backbone = require('backbone');
Bootie._ = require('lodash');

// Version, Mixins, and Backbone.Events
// Bootie can be used as a pubsub bus
Bootie._.extend(Bootie, Bootie.Backbone.Events, {
  version: require('./package.json').version
}, Bootie, require('./mixins'));

// DEPRECATED
// Remove in `0.4.x`
Bootie._.mixin(require('./mixins'));

// Limiter
Bootie.limiter = require('./limiter');

// Database driver
Bootie.Mongo = require('./mongo');

// Router
Bootie.Router = require('./router');

// Controller
Bootie.Controller = require('./controller');

// Crud Controller, extends Controller, adds CRUD routing
Bootie.CrudController = require('./crud_controller');

// Model for the ORM
Bootie.Model = require('./model');

// Collection for the ORM
Bootie.Collection = require('./collection');

// Adapters connect to third-party APIs and services
Bootie.Adapter = require('./adapter');

// Errors dawg
Bootie.Error = require('./error');

// Debug and error logging
Bootie.debug = require('./debug');
Bootie.log = Bootie.debug.log;
Bootie.error = Bootie.debug.error;

// Export to the world
module.exports = Bootie;
