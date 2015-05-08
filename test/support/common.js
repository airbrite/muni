'use strict';

// Force NODE_ENV to be `test`
process.env.NODE_ENV = 'test';

var Bluebird = require('bluebird');

// Chai
var chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-datetime'));
var assert = chai.assert;

// Sinon
var sinon = require('sinon');
require('sinon-as-promised')(Bluebird);

// Test Helpers
var helpers = require('../helpers');

// Globals
global.assert = assert;
global.sinon = sinon;
global.helpers = helpers;

var inspect = require('eyes').inspector({
  maxLength: 32768,
  sortObjectKeys: true,
  hideFunctions: true
});
console.inspect = inspect;
