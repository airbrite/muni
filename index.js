'use strict';

var _ = require('lodash');

// Module
var Muni = {
  version: require('./package.json').version,
  limiter: require('./limiter'),
  Adapter: require('./adapter'),
  Collection: require('./collection'),
  Controller: require('./controller'),
  CrudController: require('./crud_controller'),
  Error: require('./error'),
  Model: require('./model'),
  Mongo: require('./mongo'),
  Router: require('./router')
};
_.assign(Muni, require('backbone').Events, require('./mixins'));

// Export to the world
module.exports = Muni;
