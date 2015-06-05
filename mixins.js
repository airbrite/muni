'use strict';

var _ = require('lodash');
var uuid = require('uuid');
var moment = require('moment');
var accounting = require('accounting');
var URLSafeBase64 = require('urlsafe-base64');
var crypto = require('crypto');
var mongodb = require('mongodb');
var debug = require('./debug');

return module.exports = {
  // Export Dependencies
  Promise: require('bluebird'),
  Backbone: require('backbone'),
  express: require('express'),
  request: require('request'),
  mongodb: mongodb,
  moment: moment,
  accounting: accounting,
  uuid: uuid,
  _: _,

  // Export Logging Methods
  debug: debug,
  log: debug.log,
  error: debug.error,
  warn: debug.warn,
  info: debug.info,

  // Proxy for Lodash
  isError: _.isError,

  // Proxy for MongoDB
  ObjectId: mongodb.ObjectID,

  /**
   * Determine if a value is null or undefined
   *
   * @param {*} val
   * @return {Boolean}
   */

  isNullOrUndefined: function(val) {
    return _.isNull(val) || _.isUndefined(val);
  },

  /**
   * Check if a string is a valid ObjectId
   *
   * @param {String} id
   * @return {Boolean}
   */

  isObjectId: function(id) {
    // Check if a string is a valid ObjectId
    return require('mongodb-objectid-helper').isObjectId(id);
  },

  /**
   * Create and return an ObjectId as a BSON object
   *
   * @param {String} [str]
   * @return {BSON}
   */

  newObjectId: function(str) {
    return new this.ObjectId(str);
  },

  /**
   * Create and return an ObjectId as a hex string
   *
   * @param {String} [str]
   * @return {String}
   */

  newObjectIdHexString: function(str) {
    return new this.ObjectId(str).toHexString();
  },

  /**
   * Convert cents to dollars with 2 decimal points and no thousand separator
   *
   * Example: `1234 -> 12.34`
   *
   * @param {Number} value
   * @return {Number}
   */

  centsToDollars: function(value) {
    return parseFloat(accounting.toFixed(value / 100, 2));
  },

  /**
   * Convert dollars to cents
   *
   * Example: `12.34 -> 1234`
   *
   * @param {Number} value
   * @return {Number}
   */

  dollarsToCents: function(value) {
    return _.parseInt(accounting.toFixed(accounting.unformat(value) * 100, 0));
  },

  /**
   * Encrypts a utf8 string into an encrypted hex string
   *
   * Useful for encrypting strings that later need to be decrypted
   *
   * https://github.com/joyent/node/issues/6386
   *
   * @param {String} str
   * @param {String} [algorithm=aes256]
   * @param {String} [key=...]
   * @return {String}
   */

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

  /**
   * Decrypts an encrypted hex string back into a utf8 string
   *
   * https://github.com/joyent/node/issues/6386
   *
   * @param {} str
   * @param {} [algorithm=aes256]
   * @param {} [key=...]
   * @return {String}
   */

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

  /**
   * Encodes a string into a URL safe Base64 string
   *
   * @param {String} str
   * @return {String}
   */

  encodeBase64: function(str) {
    return URLSafeBase64.encode(new Buffer(str, 'utf-8'));
  },

  /**
   * Decode a URL safe Base64 string
   *
   * @param {String} str
   * @return {String}
   */

  decodeBase64: function(str) {
    return URLSafeBase64.decode(str).toString('utf-8');
  },

  /**
   * Determine if a string is URL safe Base64
   *
   * @param {String} str
   * @return {Boolean}
   */

  validateBase64: function(str) {
    return URLSafeBase64.validate(str);
  },

  /**
   * Determine if a string is a UUID
   *
   * http://en.wikipedia.org/wiki/Universally_unique_identifier#Variants_and_versions
   *
   * Supports Version 3 (MD5 hash)
   * xxxxxxxx-xxxx-3xxx-yxxx-xxxxxxxxxxxx
   * where x is any hexadecimal digit and y is one of 8, 9, A, or B
   *
   * Supports Version 4 (random)
   * xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx / f47ac10b-58cc-4372-a567-0e02b2c3d479
   * where x is any hexadecimal digit and y is one of 8, 9, A, or B
   *
   * @param {String} value
   * @return {Boolean}
   */

  isUUID: function(value) {
    return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(value);
  },

  /**
   * Check if a string is a unix timestamp in milliseconds
   *
   * @param {String} value
   * @return {Boolean}
   */

  isTimestamp: function(value) {
    if (value && value >= 0 && value.toString().length === 13) {
      return true;
    }
    return false;
  },

  /**
   * Check if a string is in ISO8601 date format
   *
   * Examples:
   *
   * - YYYY-MM-DDTHH:mm:ss.SSSZ
   * - 2013-11-18T09:04:24.447Z
   *
   * @param {String} str
   * @return {Boolean}
   */

  isValidISO8601String: function(str) {
    // 2013-11-18T09:04:24.447Z
    // YYYY-MM-DDTHH:mm:ss.SSSZ
    return moment.utc(str, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true).isValid();
  },

  /**
   * Determine if a number is a unix timestamp in seconds
   *
   * @param {Number} value
   * @return {Boolean}
   */

  isUnixTime: function(value) {
    if (value && value >= 0 && value.toString().length > 11) {
      return false;
    }
    return true;
  },

  /**
   * Determine if a number is a unix timestamp in milliseconds
   *
   * @param {Number} value
   * @return {Boolean}
   */

  isUnixTimeMilliseconds: function(value) {
    if (value && value >= 0 && value.toString().length > 11) {
      return false;
    }
    return true;
  },

  /**
   * Trim, Remove Whitespace, and Lowercase an email
   *
   * @param {String} email
   * @return {String}
   */

  sanitizeEmail: function(email) {
    return email.trim().toLowerCase().replace(/\s/g, '');
  },

  /**
   * Determine if a string is a valid email
   *
   * @param {String} email
   * @return {Boolean}
   */

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

  /**
   * Escape special characters for use in Mongo query
   *
   * @param {String} str
   * @return {String}
   */

  escapeRegExp: function(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
  },

  /**
   * Turns an Object into a hashed String
   *
   * @param {Object} object
   * @param {String} [algorithm=sha1]
   * @return {String}
   */

  fingerprintObject: function(object, algorithm) {
    algorithm = algorithm || 'sha1';
    return crypto.createHash(algorithm)
      .update(JSON.stringify(object))
      .digest('hex')
      .toString();
  },

  /**
   * Randomly generates a `sha256` hashed hex String
   * Uses `uuid.v4` as the seed
   *
   * @return {String}
   */

  randomHash: function() {
    return crypto.createHash('sha256').update(uuid.v4()).digest('hex');
  }
};
