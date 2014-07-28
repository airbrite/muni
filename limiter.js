'use strict';

var _ = require('lodash');
var logger = require('./logger');

// Clients
// ---
// Keys are IP addresses
var clients = {};

// Options
// ---
// ips - array of strings - ips to assign for each bucket
// limit - number of requests allowed in window
// window - rate limit window in seconds
// reject - true/false - whether to respond early with code 429
var options = {
  whitelist: {
    ips: [],
    limit: 1000,
    window: 60 * 15
  },
  blacklist: {
    ips: [],
    limit: 0,
    window: 0
  },
  normal: {
    limit: 500,
    window: 60 * 15
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

  logger.info('Limiter: %s', JSON.stringify(options));

  return middleware;
};

function middleware(req, res, next) {
  var ip = req.ip;
  var type = typeForIp(ip);
  var client = clients[ip] ? clients[ip] : (clients[ip] = new Client(ip, type));

  logger.info('Limiter: %s', JSON.stringify(client));

  // X-Rate-Limit-Limit: the rate limit ceiling for that given request
  // X-Rate-Limit-Remaining: the number of requests left for the window
  // X-Rate-Limit-Reset: the remaining window before the rate limit resets in UTC epoch milliseconds
  res.set({
    'X-Rate-Limit-Limit': client.limit,
    'X-Rate-Limit-Remaining': client.limit - client.used,
    'X-Rate-Limit-Reset':  client.resets
  });

  if (options.reject && client.used >= client.limit) {
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
      res.jsonp(code, {
        code: code,
        message: message
      });
    },
    xml: function() {
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.send(code, '<error>' + message + '</error');
    },
    text: function() {
      res.send(code, message);
    }
  });
}

function typeForIp(ip) {
  if (_.contains(options.whitelist.ips, ip)) {
    return 'whitelist';
  }
  if (_.contains(options.blacklist.ips, ip)) {
    return 'blacklist';
  }
  return 'normal';
}

function Client(ip, type) {
  this.used = 0;
  this.ip = ip;
  this.type = type;
  this.limit = options[type].limit;
  this.duration = options[type].window * 1000;
  this.resets = (new Date()).getTime() + this.duration;

  setTimeout(function() {
    delete clients[ip];
  }, this.duration);
}
