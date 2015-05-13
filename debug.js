'use strict';

var debug = require('debug');

module.exports = {
  log: debug('muni:log'),
  error: debug('muni:error'),
  warn: debug('muni:warn'),
  info: debug('muni:info')
};
