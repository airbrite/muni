'use strict';

var _ = require('lodash');
var debug = require('./debug');

// Clients
// ---
var clients = {};

// Options
// ---
// keys - array of strings - id or ip
// limit - number of requests allowed in window
// window - rate limit window in seconds
// reject - true/false - whether to respond early with code 429
var options = {
  whitelist: {
    keys: [],
    limit: 3600,
    window: 60
  },
  blacklist: {
    keys: [],
    limit: 0,
    window: 60
  },
  normal: {
    limit: 60,
    window: 60
  },
  reject: true
};

module.exports = function(opts) {
  _.merge(options, _.pick(opts, [
    'whitelist',
    'blacklist',
    'normal',
    'reject'
  ]));

  debug.log('Limiter enabled with options: %s', JSON.stringify(options));

  return middleware;
};

function middleware(req, res, next) {
  var key = (req.user && req.user.id) || req.ip;
  var type = typeForKey(key);
  var client = clients[key] ? clients[key] : (clients[key] = new Client(key, type));
  var bypass = req.get('X-Rate-Limit-Bypass') ? true : false;

  debug.info('Limiter request: %s', JSON.stringify(client));

  // X-Rate-Limit-Limit: the rate limit ceiling for that given request
  // X-Rate-Limit-Remaining: the number of requests left for the window
  // X-Rate-Limit-Reset: the remaining window before the rate limit resets in UTC epoch milliseconds
  res.set({
    'X-Rate-Limit-Limit': client.limit,
    'X-Rate-Limit-Remaining': client.limit - client.used,
    'X-Rate-Limit-Reset':  client.resets
  });

  if (!bypass && options.reject && client.used >= client.limit) {
    return rejected(req, res, next);
  }

  client.used++;
  return next();
}

function rejected(req, res, next) {
  // If we timed out before managing to respond, don't send a response
  if (res.headersSent) {
    return;
  }

  var code = 429;
  var message = 'Rate limit exceeded';

  // Respond in different formats
  res.format({
    json: function() {
      res.status(code).jsonp({
        code: code,
        message: message
      });
    },
    xml: function() {
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.status(code).send('<error>' + message + '</error');
    },
    text: function() {
      res.status(code).send(message);
    }
  });
}

function typeForKey(key) {
  if (_.contains(options.whitelist.keys, key)) {
    return 'whitelist';
  }
  if (_.contains(options.blacklist.keys, key)) {
    return 'blacklist';
  }
  return 'normal';
}

function Client(key, type) {
  this.used = 0;
  this.key = key;
  this.type = type;
  this.limit = options[type].limit;
  this.duration = options[type].window * 1000;
  this.resets = (new Date()).getTime() + this.duration;

  setTimeout(function() {
    delete clients[key];
  }, this.duration);
}
