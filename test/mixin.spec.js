/* globals describe, it, before, after */
"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var ObjectID = require('mongodb').ObjectID;

require('../mixin');

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

  it('#isTimestamp', function() {
    assert.isTrue(_.isTimestamp(1407397793555));
    assert.isFalse(_.isTimestamp(1407397793));
  });

  it('#isUnixTime', function() {
    assert.isTrue(_.isUnixTime(1407397793));
    assert.isFalse(_.isUnixTime(1407397793555));
  });

  it('#isValidISO8601String', function() {
    assert.isTrue(_.isValidISO8601String('2013-11-18T09:04:24.447Z'));
    assert.isFalse(_.isValidISO8601String('Thu, 07 Aug 2014 07:49:53 GMT'));
  });

  it('#isValidObjectID', function() {
    var oid = new ObjectID();
    assert.isTrue(_.isValidObjectID(oid));
    assert.isTrue(_.isValidObjectID('53b4694cda836700006b61f2'));
    assert.isFalse(_.isValidObjectID('trollolol'));
  });

  it('#isObjectID', function() {
    var oid = new ObjectID();
    assert.isTrue(_.isObjectID(oid.toHexString()));
    assert.isTrue(_.isObjectID('53b4694cda836700006b61f2'));
    assert.isFalse(_.isObjectID('trollolol'));
  });


  it('#isUUID', function() {
    var uuid = _.uuid();
    assert.isTrue(_.isUUID(uuid));
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


  it('#defaultsDeep', function() {
    var obj = {
      foo: {
        bar: {
          baz: false
        }
      },
      array: [{
        foo: 'bar'
      }, {
        hello: 'moto'
      }]
    };

    _.defaultsDeep(obj, {
      omg: 'troll',
      foo: {
        bar: {
          lol: true
        },
        wtf: 'doge'
      },
      array: [{
        noob: 'tube'
      }, {
        hello: 'android'
      }]
    });

    assert.deepEqual(obj, {
      omg: 'troll',
      foo: {
        bar: {
          baz: false,
          lol: true
        },
        wtf: 'doge'
      },
      array: [{
        foo: 'bar',
        noob: 'tube'
      }, {
        hello: 'moto'
      }]
    });
  });

});
