'use strict';

var env = process.env['NODE_ENV'] || 'development';
var winston = require('winston');

module.exports = new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: env === 'development' ? 'silly' : 'warn',
      colorize: true,
      timestamp: false
    })
  ],
  levels: {
    silly: 0,
    verbose: 1,
    info: 2,
    data: 3,
    warn: 4,
    debug: 5,
    error: 6
  },
  colors: {
    silly: 'magenta',
    verbose: 'cyan',
    info: 'green',
    data: 'grey',
    warn: 'yellow',
    debug: 'blue',
    error: 'red'
  }
});
