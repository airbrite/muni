'use strict';

var debug = require('debug');

module.exports = {
  log: debug('bootie:log'),
  error: debug('bootie:error')
};
