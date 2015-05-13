'use strict';

// http://www.devthought.com/2011/12/22/a-string-is-not-an-error/
// https://gist.github.com/justmoon/15511f92e5216fa2624b

module.exports = function MuniError(message, code) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.code = code;
};

require('util').inherits(module.exports, Error);
