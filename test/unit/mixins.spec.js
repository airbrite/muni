/* globals describe, it, before, after */
"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var ObjectId = require('mongodb').ObjectID;

var Mixins = require('../../mixins');

describe("Mixins", function() {
  // Local variables
  var secretString = 'omg wtf bbq!';
  var encryptedString;

  it("should generate a random hash", function() {
    var randomHash = Mixins.randomHash();
    assert.strictEqual(randomHash.length, 64);
  });

  it("should generate an encrypted string", function() {
    encryptedString = Mixins.encryptString(secretString);
    assert.strictEqual(encryptedString, '6cca595aaffee6451e5c6d43451dfaa0');
  });

  it("should decrypt an encrypted string", function() {
    var decryptedString = Mixins.decryptString(encryptedString);
    assert.strictEqual(decryptedString, secretString);
  });

  it("should sanitize an email", function() {
    var email = " lEeTh4x0R@tryCelery.com  ";
    var sanitizedEmail = Mixins.sanitizeEmail(email);
    assert.strictEqual(sanitizedEmail, 'leeth4x0r@trycelery.com');
  });

  it("should validate an email", function() {
    var email = " lEeTh4x0R+spam@tryCelery.com  ";
    var sanitizedEmail = Mixins.sanitizeEmail(email);
    assert.isTrue(Mixins.isValidEmail(sanitizedEmail));
  });

  it('#isUnixTime', function() {
    assert.isTrue(Mixins.isUnixTime(1407397793));
    assert.isFalse(Mixins.isUnixTime(1407397793555));
  });

  it('#isUUID', function() {
    var uuid1 = '1d704255-bd6a-3da8-2978-0fa9d999e656';
    var uuid2 = '54883600-724d-4cd1-954b-bb333de2345d';
    var baduuid1 = '54883600724d4cd1954bbb333de2345d';
    assert.isTrue(Mixins.isUUID(uuid1));
    assert.isTrue(Mixins.isUUID(uuid2));
    assert.isFalse(Mixins.isUUID(baduuid1));
    assert.isFalse(Mixins.isUUID('asdf'));
  });

  it('#encodeBase64', function() {
    var str = 'i am + base $@#4 23425@#$@--//=';
    assert.strictEqual(Mixins.encodeBase64(str), 'aSBhbSArIGJhc2UgJEAjNCAyMzQyNUAjJEAtLS8vPQ');
  });

  it('#decodeBase64', function() {
    var str = 'aSBhbSArIGJhc2UgJEAjNCAyMzQyNUAjJEAtLS8vPQ';
    assert.strictEqual(Mixins.decodeBase64(str), 'i am + base $@#4 23425@#$@--//=');
  });

  it('#validateBase64', function() {
    var str = 'i am + base $@#4 23425@#$@--//=';
    assert.isTrue(Mixins.validateBase64(Mixins.encodeBase64(str)));
    assert.isFalse(Mixins.validateBase64(str));
  });

  it('#newObjectId and #newObjectIdHexString', function() {
    var objectId = Mixins.newObjectId();
    var objectIdString = Mixins.newObjectIdHexString();
    assert.isTrue(Mixins.isObjectId(objectId), true);
    assert.isTrue(Mixins.isObjectId(objectIdString), true);
  });

  it('#isObjectId', function() {
    assert.isTrue(Mixins.isObjectId('538b7c95c883570700ee9644'), true);
    assert.isFalse(Mixins.isObjectId('12345'), true);
    assert.isFalse(Mixins.isObjectId(12345), true);
  });

  it('#isTimestamp', function() {
    assert.isTrue(Mixins.isTimestamp(1407397793555));
    assert.isFalse(Mixins.isTimestamp(1407397793));
  });

  it('#isValidISO8601String', function() {
    assert.isTrue(Mixins.isValidISO8601String('2013-11-18T09:04:24.447Z'));
    assert.isFalse(Mixins.isValidISO8601String('Thu, 07 Aug 2014 07:49:53 GMT'));
  });

  it('#isValidISO8601String', function() {
    // YYYY-MM-DDTHH:mm:ss.SSSZ
    assert.isTrue(Mixins.isValidISO8601String('2013-11-18T09:04:24.447Z'), true);
    assert.isFalse(Mixins.isValidISO8601String((new Date()).toString()), true);
    assert.isFalse(Mixins.isValidISO8601String((new Date()).getTime()), true);
    assert.isFalse(Mixins.isValidISO8601String(new Date()), true);
  });
});
