'use strict';

// http://www.devthought.com/2011/12/22/a-string-is-not-an-error/
// https://gist.github.com/justmoon/15511f92e5216fa2624b

var debug = require('./debug');

module.exports = function MuniError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code;

  // Prepend code to stack
  if (this.stack) {
    this.stack = this.code + ' ' + this.stack;
    if (this.code >= 400 && this.code < 500) {
      debug.error(this.message);
      debug.info(this.stack);
    } else {
      debug.error(this.stack);
    }
  }
};

require('util').inherits(module.exports, Error);
