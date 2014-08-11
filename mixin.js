'use strict';

var _ = require('lodash');
var uuid = require('uuid');
var moment = require('moment');
var accounting = require('accounting');
var URLSafeBase64 = require('urlsafe-base64');
var crypto = require('crypto');
var objectIdHelper = require('mongodb-objectid-helper');

var mixin = module.exports = {};

// This mixes in several helper functions to `_`
_.mixin({
  uuid: uuid.v4,

  defaultsDeep: _.partialRight(_.merge, function deep(value, other) {
    return _.merge(value, other, deep);
  }),

  centsToDollars: function(value) {
    return accounting.formatNumber(accounting.toFixed(value / 100, 2), 2);
  },

  dollarsToCents: function(value) {
    return _.parseInt(accounting.toFixed(accounting.unformat(value) * 100, 0));
  },

  // Encrypts a utf8 string into an encrypted hex string
  // https://github.com/joyent/node/issues/6386
  encryptString: function(str, algorithm, key) {
    var inputEncoding = 'utf8';
    var outputEncoding = 'hex';

    algorithm = algorithm || 'aes256';
    // Obviously don't reuse this key
    key = key || '13741c7ec3a809950ed8e75c1abcfa0e8f9994b2b79d7a895c2e383f28c8a792';

    var cipher = crypto.createCipher(algorithm, key);
    var ciphered = cipher.update(str, inputEncoding, outputEncoding);
    ciphered += cipher.final(outputEncoding);
    return ciphered;
  },

  // Decrypts an encrypted hex string back into a utf8 string
  // https://github.com/joyent/node/issues/6386
  decryptString: function(str, algorithm, key) {
    var inputEncoding = 'utf8';
    var outputEncoding = 'hex';
    algorithm = algorithm || 'aes256';
    // Obviously don't reuse this key
    key = key || '13741c7ec3a809950ed8e75c1abcfa0e8f9994b2b79d7a895c2e383f28c8a792';

    var decipher = crypto.createDecipher(algorithm, key);
    var deciphered = decipher.update(str, outputEncoding, inputEncoding);
    deciphered += decipher.final(inputEncoding);
    return deciphered;
  },

  encodeBase64: function(str) {
    return URLSafeBase64.encode(new Buffer(str, 'utf-8'));
  },

  decodeBase64: function(str) {
    return URLSafeBase64.decode(str).toString('utf-8');
  },

  validateBase64: function(str) {
    return URLSafeBase64.validate(str);
  },

  isUUID: function(value) {
    // http://en.wikipedia.org/wiki/Universally_unique_identifier#Variants_and_versions
    // Version 3 (MD5 hash)
    // xxxxxxxx-xxxx-3xxx-yxxx-xxxxxxxxxxxx
    // where x is any hexadecimal digit and y is one of 8, 9, A, or B
    //
    // Celery uses mostly V4 (some older uuid is not v4 compatible)
    // Version 4 (random)
    // xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where x is any hexadecimal digit and y is one of 8, 9, A, or B
    // f47ac10b-58cc-4372-a567-0e02b2c3d479
    //
    // This regex is compatible with non-v4 uuid
    return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(value);
  },

  // Check if a String or ObjectId is a valid ObjectId
  isObjectId: function(value) {
    return objectIdHelper.isObjectId(value);
  },

  isUnixTime: function(value) {
    if (value && value >= 0 && value.toString().length > 11) {
      return false;
    }
    return true;
  },

  isTimestamp: function(value) {
    if (value && value >= 0 && value.toString().length === 13) {
      return true;
    }
    return false;
  },

  sanitizeEmail: function(email) {
    return email.trim().toLowerCase().replace(/\s/g, '');
  },

  isValidEmail: function(email) {
    if (email &&
      typeof(email) === 'string' &&
      email.length > 0 &&
      email.match(/^(|(([A-Za-z0-9]+_+)|([A-Za-z0-9]+\-+)|([A-Za-z0-9]+\.+)|([A-Za-z0-9]+\++))*[A-Za-z0-9]+@((\w+\-+)|(\w+\.))*\w{1,63}\.[a-zA-Z]{2,12})$/i)) {
      return true;
    } else {
      return false;
    }
  },

  isValidISO8601String: function(str) {
    // 2013-11-18T09:04:24.447Z
    // YYYY-MM-DDTHH:mm:ss.SSSZ
    return moment.utc(str, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true).isValid();
  },

  escapeRegExp: function(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
  },

  fingerprintObject: function(object, algorithm) {
    algorithm = algorithm || 'sha1';
    return crypto.createHash(algorithm)
      .update(JSON.stringify(object))
      .digest('hex')
      .toString();
  },

  randomHash: function() {
    return crypto.createHash('sha256').update(this.uuid()).digest('hex');
  }
});
