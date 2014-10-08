'use strict';

// References
// ---
// https://github.com/petkaantonov/bluebird/issues/70

// Dependencies
// ---
// Depends on `config` to be a global variable

// Module
// ---
// Only used by V2
// All your modules are belong to us.
// Export to global
var Bootie = {};

Bootie.Promise = require('bluebird');
Bootie.Backbone = require('backbone');
Bootie._ = require('lodash');
Bootie.colors = require('colors');
Bootie.uuid = require('uuid');

Bootie.mixins = require('./mixins');


// All external libraries
// ---

// Limiter
Bootie.limiter = require('./limiter');

// Database driver
// [Annotated Source](mongo.html)
Bootie.Mongo = require('./mongo');

// Router
// [Annotated Source](router.html)
Bootie.Router = require('./router');

// Controller.
// [Annotated Source](controller.html)
Bootie.Controller = require('./controller');

// Crud Controller, extends Controller, adds CRUD routing.
// [Annotated Source](crud_controller.html)
Bootie.CrudController = require('./crud_controller');

// Model for the ORM.
// [Annotated Source](model.html)
Bootie.Model = require('./model');

// Collection for the ORM.
// [Annotated Source](collection.html)
Bootie.Collection = require('./collection');

// Adapters connect to third-party APIs and services.
// [Annotated Source](adapter.html)
Bootie.Adapter = require('./adapter');

// Errors dawg.
// [Annotated Source](error.html)
Bootie.Error = require('./error');


// Mixin Backbone.Events so that Bootie can be a pubsub bus
var pjson = require('./package.json');
Bootie._.extend(Bootie, Bootie.Backbone.Events, {
  VERSION: pjson.version
});


// Export to the world
module.exports = Bootie;
