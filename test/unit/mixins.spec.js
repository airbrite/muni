/* globals describe, it, before, after */
"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var ObjectId = require('mongodb').ObjectID;

require('../../mixins');

describe("Mixins", function() {
  // Local variables
  var secretString = 'omg wtf bbq!';
  var encryptedString;

  it("should generate a random hash", function() {
    var randomHash = _.randomHash();
    assert.strictEqual(randomHash.length, 64);
  });

  it("should generate an encrypted string", function() {
    encryptedString = _.encryptString(secretString);
    assert.strictEqual(encryptedString, '6cca595aaffee6451e5c6d43451dfaa0');
  });

  it("should decrypt an encrypted string", function() {
    var decryptedString = _.decryptString(encryptedString);
    assert.strictEqual(decryptedString, secretString);
  });

  it("should sanitize an email", function() {
    var email = " lEeTh4x0R@tryCelery.com  ";
    var sanitizedEmail = _.sanitizeEmail(email);
    assert.strictEqual(sanitizedEmail, 'leeth4x0r@trycelery.com');
  });

  it("should validate an email", function() {
    var email = " lEeTh4x0R+spam@tryCelery.com  ";
    var sanitizedEmail = _.sanitizeEmail(email);
    assert.isTrue(_.isValidEmail(sanitizedEmail));
  });

  it('#isUnixTime', function() {
    assert.isTrue(_.isUnixTime(1407397793));
    assert.isFalse(_.isUnixTime(1407397793555));
  });

  it('#isUUID', function() {
    var uuid1 = '1d704255-bd6a-3da8-2978-0fa9d999e656';
    var uuid2 = '54883600-724d-4cd1-954b-bb333de2345d';
    var baduuid1 = '54883600724d4cd1954bbb333de2345d';
    assert.isTrue(_.isUUID(uuid1));
    assert.isTrue(_.isUUID(uuid2));
    assert.isFalse(_.isUUID(baduuid1));
    assert.isFalse(_.isUUID('asdf'));
  });

  it('#encodeBase64', function() {
    var str = 'i am + base $@#4 23425@#$@--//=';
    assert.strictEqual(_.encodeBase64(str), 'aSBhbSArIGJhc2UgJEAjNCAyMzQyNUAjJEAtLS8vPQ');
  });

  it('#decodeBase64', function() {
    var str = 'aSBhbSArIGJhc2UgJEAjNCAyMzQyNUAjJEAtLS8vPQ';
    assert.strictEqual(_.decodeBase64(str), 'i am + base $@#4 23425@#$@--//=');
  });

  it('#validateBase64', function() {
    var str = 'i am + base $@#4 23425@#$@--//=';
    assert.isTrue(_.validateBase64(_.encodeBase64(str)));
    assert.isFalse(_.validateBase64(str));
  });
});
