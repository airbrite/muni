'use strict';

var _ = require('lodash');
var Bluebird = require('bluebird');
var Model = require('../../model');
var ObjectId = require('mongodb').ObjectID;

// Test helpers
var helpers = require('../helpers');

describe('Model', function() {
  // Set max timeout allowed
  this.timeout(10000);

  var TestModel = Model.extend({
    defaults: helpers.requireFixture('defaults'),
    schema: helpers.requireFixture('schema')
  });

  describe('Fetch and Save and Destroy', function() {
    var data = {
      _id: '5411ed2b08eed46469029c85',
      foo: 'bar',
      hello: 'world'
    };
    var insertData = {
      foo: 'bar',
      hello: 'world'
    };

    var testModel;
    beforeEach(function() {
      testModel = new Model();
      testModel.db = {
        findOne: function() {},
        findAndModify: function() {},
        insert: function() {},
        delete: function() {}
      };
      sinon.stub(testModel.db, 'findOne', function(a, b, c, cb) {
        cb && cb(null, data);
        return Bluebird.resolve(data);
      });
      sinon.stub(testModel.db, 'findAndModify', function(a, b, c, d, cb) {
        cb && cb(null, data);
        return Bluebird.resolve(data);
      });
      sinon.stub(testModel.db, 'insert', function(a, b, cb) {
        cb && cb(null, data);
        return Bluebird.resolve(data);
      });
    });

    it('should #fetch', function() {
      testModel.set(data);
      return testModel.fetch().then(function(model) {
        assert.deepEqual(model.render(), data);
      });
    });

    it('should #save new (insert)', function() {
      testModel.set(insertData);
      return testModel.save().then(function(model) {
        assert.deepEqual(model.render(), data);
      });
    });

    it('should #save existing (update)', function() {
      testModel.updateUsingPatch = false;
      testModel.set(data);
      return testModel.save().then(function(model) {
        assert.deepEqual(model.render(), data);
      });
    });

    it('should #save existing (patch)', function() {
      testModel.set(data);
      return testModel.save().then(function(model) {
        assert.deepEqual(model.render(), data);
      });
    });

    it.skip('should #destroy existing', function() {});
  });

  describe.skip('Before/After Lifecycle', function() {
  });


  describe('Private', function() {
    var testModel;
    beforeEach(function() {
      testModel = new TestModel();
    });

    it('#_defaultsDeep', function() {
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
        }],
        object: {
          array: [1, 2, 3]
        }
      };

      testModel._defaultsDeep(obj, {
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
        }],
        object: {
          array: [3, 4, 5]
        }
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
        }],
        object: {
          array: [1, 2, 3]
        }
      });
    });

    it('#_mergeSafe', function() {
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
        }],
        object: {
          array: [1, 2, 3]
        }
      };

      testModel._mergeSafe(obj, {
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
        }],
        object: {
          array: [3, 4, 5]
        }
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
          foo: 'bar'
        }, {
          hello: 'moto'
        }],
        object: {
          array: [1, 2, 3]
        }
      });
    });

    it.skip('#_wrapResponse', function() {});

    it('#_removeAttributes', function() {
      testModel.hiddenAttributes = function() {
        return {
          string: true,
          integer: false,
          array_objects: true,
          object: {
            omg: {
              wtf: true
            }
          },
          array_objects_empty: true
        };
      };

      var hiddenAttributes = _.result(testModel, 'hiddenAttributes');
      testModel._removeAttributes(testModel.attributes, hiddenAttributes);
      assert.isUndefined(testModel.attributes.string);
      assert.isUndefined(testModel.attributes.array_objects);
      assert.isUndefined(testModel.attributes.object.omg.wtf);
      assert.isUndefined(testModel.attributes.array_objects_empty);
    });

    it('#_removeAttributes with nested object', function() {
      testModel.hiddenAttributes = function() {
        return {
          string: true,
          integer: false,
          array_objects: true,
          object: true,
          array_objects_empty: true
        };
      };

      var hiddenAttributes = _.result(testModel, 'hiddenAttributes');
      testModel._removeAttributes(testModel.attributes, hiddenAttributes);
      assert.isUndefined(testModel.attributes.object);
    });

    it('#_removeExpandableAttributes', function() {
      testModel.expandableAttributes = function() {
        return {
          expandable: true
        };
      };

      testModel.set('expandable', {
        _id: 'foo',
        foo: 'bar',
        troll: 'lol'
      });
      var expandableAttributes = _.result(testModel, 'expandableAttributes');
      testModel._removeExpandableAttributes(testModel.attributes, expandableAttributes);
      assert.deepEqual(testModel.attributes.expandable, {
        _id: 'foo'
      });
    });
  });



  describe('Validate Attributes', function() {
    var testModel;
    beforeEach(function() {
      testModel = new TestModel();
    });

    it('should delete undefined schema attributes', function() {
      // when setting a non-existent key to null
      // should have no effect, and the key should be removed
      var schema = _.result(testModel, 'schema');

      var attrs = {
        non_existent_key: null,
        string: 'i should show up',
        object: {
          non_existent_nested_key: null,
          foo: 'i should also show up'
        }
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        object: {
          foo: 'i should also show up'
        },
        string: 'i should show up'
      });
    });

    it('should set nested attribute of empty object', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        object_defaults_empty: {
          first: {
            second: {
              third: {
                such: 'win',
                wtf: 'lol'
              },
              tres: {
                yo: 12345
              }
            }
          }
        }
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        object_defaults_empty: {
          first: {
            second: {
              third: {
                such: 'win'
              },
              tres: {}
            }
          }
        }
      });
    });

    it('should unset with null', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        string: null,
        integer: null,
        timestamp: null,
        object: null,
        array_strings: null,
        boolean: null
      };

      testModel._validateAttributes(attrs, schema);

      assert.deepEqual(attrs, {
        string: null,
        integer: null,
        timestamp: null,
        object: null,
        array_strings: null,
        boolean: null
      });
    });


    it('should ignore invalid value type', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        string: 1234
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {});
    });

    it('should ignore invalid key', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        invalid_key: 'asdf'
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {});
    });

    it('should not allow negative timestamp', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        timestamp: -123
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {});
    });

    it('should cast ISO8601 date string', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        date: '2014-08-07T07:49:53.555Z'
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        date: new Date('2014-08-07T07:49:53.555Z')
      });
    });

    it('should allow setting anything into empty object', function() {
      var schema = _.result(testModel, 'schema');

      var date = new Date();
      var attrs = {
        object_empty: {
          n: 1,
          s: 's',
          d: date,
          b: true
        }
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        object_empty: {
          n: 1,
          s: 's',
          d: date,
          b: true
        }
      });
    });

    it('should deep validate object', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        object: {
          foo: 'baz',
          troll: 'lol'
        }
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        object: {
          foo: 'baz'
        }
      });
    });

    it('should allow setting anything into empty array', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        array_empty: ['any', 'thing', 1, {
          foo: 'bar'
        }]
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        array_empty: ['any', 'thing', 1, {
          foo: 'bar'
        }]
      });
    });

    it('should validate array of strings', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        array_strings: ['z', 'x', 1, 'v']
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        array_strings: ['z', 'x', null, 'v']
      });
    });

    it('should validate array of uintegers', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        array_numbers: [5, 6, 'a', 8]
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        array_numbers: [5, 6, 0, 8]
      });
    });

    it('should validate array of booleans', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        array_booleans: [true, false, 1, 0, 'true']
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        array_booleans: [true, false, true, false, true]
      });
    });

    it('should validate array of objects that are empty', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        array_objects_empty: [{
          foo: 'bar'
        }, {
          awesome: true
        }]
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        array_objects_empty: [{
          foo: 'bar'
        }, {
          awesome: true
        }]
      });
    });

    it('should validate array of objects', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        array_objects: [{
          foo: 'bar'
        }, {
          omg: 'wtf'
        }, {
          lol: true
        }, {
          foo: 'baz'
        }]
      };

      testModel._validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        array_objects: [{
          foo: 'bar'
        }, {}, {}, {
          foo: 'baz'
        }]
      });
    });
  });



  describe('Set and Get', function() {
    var testModel;
    beforeEach(function() {
      testModel = new TestModel();
    });

    it('should set an empty array', function() {
      return testModel.setFromRequest({
        array_strings: []
      }).then(function() {
        assert.deepEqual(testModel.get('array_strings'), []);
      });
    });

    it('should set defaults with null', function() {
      // `i_am_null` is type `ufloat` except defaulted to `null
      // It should still be set as `null`
      // Because `null` is special and overrides type
      assert.strictEqual(testModel.get('i_am_null'), null);
    });

    it('#getDeep shallow', function() {

      var val = testModel.get('string');
      assert.strictEqual(val, 'i am a string');

    });

    it('#getDeep nested object', function() {
      var val = testModel.get('object.omg.wtf');
      assert.strictEqual(val, 'bbq');
    });

    it('#getDeep nested array', function() {
      var val = testModel.get('array_objects.1.foo');
      assert.strictEqual(val, 'baz');
    });

    it('#getDeep nested undefined', function() {
      var val = testModel.get('object.i_dont_exist.who_am_i');
      assert.isUndefined(val);
    });
  });



  describe('Schema and Defaults', function() {
    var testModel;
    beforeEach(function() {
      testModel = new Model();
    });

    it('#combinedDefaults', function() {
      _.extend(testModel, {
        defaults: function() {
          return {
            uno: 'one'
          };
        },
        baseDefaults: function() {
          return {
            dos: 'two'
          };
        }
      });

      assert.deepEqual(testModel.combinedDefaults(), {
        uno: 'one',
        dos: 'two'
      });
    });

    it('#combinedSchema', function() {
      _.extend(testModel, {
        schema: function() {
          return {
            uno: 'string'
          };
        },
        baseSchema: function() {
          return {
            dos: 'number'
          };
        }
      });

      assert.deepEqual(testModel.combinedSchema(), {
        uno: 'string',
        dos: 'number'
      });
    });
  });



  describe('Rendering', function() {
    var testModel;
    beforeEach(function() {
      testModel = new TestModel();
      testModel.hiddenAttributes = function() {
        return {
          string: true,
          object: {
            omg: {
              wtf: true
            }
          }
        };
      };
    });

    it('#render', function() {
      var json = testModel.render();
      assert.isUndefined(json.string);
      assert.isUndefined(json.object.omg.wtf);
    });

    it('#toResponse', function() {
      var json = testModel.toResponse();
      assert.isUndefined(json.string);
      assert.isUndefined(json.object.omg.wtf);
    });
  });



  describe('setFromRequest', function() {
    var testModel;
    beforeEach(function() {
      testModel = new TestModel();
      testModel.db = {
        findOne: function() {},
        findAndModify: function() {},
        insert: function() {},
        delete: function() {}
      };
      sinon.stub(testModel.db, 'findOne', function(a, b, c, cb) {
        cb && cb(null, {});
        return Bluebird.resolve({});
      });
      sinon.stub(testModel.db, 'findAndModify', function(a, b, c, d, cb) {
        cb && cb(null, {});
        return Bluebird.resolve({});
      });
      sinon.stub(testModel.db, 'insert', function(a, b, cb) {
        cb && cb(null, {});
        return Bluebird.resolve({});
      });
    });

    it('should set changedFromRequest after setFromRequest', function() {
      var body = {
        string: 'i changed',
        i_dont_exist: 'trollolol',
        boolean: true,
        object: {
          omg: {
            wtf: 'lol'
          }
        },
        array_objects: [{
          foo: 'bar'
        }, {
          foo: 'changed'
        }]
      };

      testModel.setFromRequest(body);

      assert.deepEqual(testModel.changedFromRequest, {
        string: 'i changed',
        object: {
          foo: 'bar',
          omg: {
            wtf: 'lol'
          }
        },
        array_objects: [{
          foo: 'bar'
        }, {
          foo: 'changed'
        }]
      });
    });

    it('readOnlyAttributes', function() {
      testModel.readOnlyAttributes = function() {
        return {
          string: true,
          object: {
            omg: {
              wtf: true
            }
          }
        };
      };

      var body = {
        string: 'readonly',
        integer: 9876,
        object: {
          omg: {
            wtf: 'lol'
          }
        },
        object_defaults_empty: {
          first: {
            second: {
              third: {
                such: 'win',
                wtf: 'lol'
              },
              tres: {
                yo: 12345
              }
            }
          }
        }
      };

      testModel.setFromRequest(body);

      assert.deepEqual(testModel.attributes.object, {
        foo: 'bar',
        omg: {}
      });
      assert.strictEqual(testModel.attributes.integer, 9876);
      assert.strictEqual(testModel.attributes.string, 'i am a string');
    });

    it('expandableAttributes', function() {
      testModel.expandableAttributes = function() {
        return {
          expandable: true,
        };
      };

      var body = {
        expandable: {
          _id: '1234',
          foo: 'bar'
        }
      };

      return testModel.setFromRequest(body).then(function() {
        return testModel.save();
      }).then(function() {
        assert.deepEqual(testModel.attributes.expandable, {});
      });
    });

    it('computedAttributes', function() {
      testModel.computedAttributes = function() {
        return {
          computed: true,
        };
      };

      var body = {
        computed: 'i am a computed value, don\'t save me!@#!$'
      };

      return testModel.setFromRequest(body).then(function() {
        return testModel.save();
      }).then(function() {
        assert.isUndefined(testModel.attributes.computed);
      });
    });

    it('unset', function() {
      var body = {
        string: null,
        integer: null,
        timestamp: null,
        object: null,
        boolean: null
      };

      testModel.setFromRequest(body);

      assert.isNull(testModel.get('string'));
      assert.isNull(testModel.get('timestamp'));
      assert.isNull(testModel.get('object'));
      assert.isNull(testModel.get('integer'));
      assert.isNull(testModel.get('boolean'));
    });

    // this is no longer the case
    // we don't do `deep` extends anymore
    it.skip('omitted nested key should not unset the omitted key', function() {
      var body = {
        object: {
          omg: {
            wtf: 'lol'
          }
        }
      };

      testModel.setFromRequest(body);

      assert.deepEqual(testModel.attributes.object, {
        foo: 'bar',
        omg: {
          wtf: 'lol'
        }
      });
    });

    // see test above
    it.skip('omitted nested key should not trigger change', function() {
      var body = {
        object: {
          // foo: 'bar'
          omg: {
            wtf: 'bbq'
          }
        }
      };

      testModel.setFromRequest(body);

      assert.deepEqual(testModel.changedFromRequest, {});
    });

    it('empty object should work', function() {
      var body = {
        object: {}
      };

      testModel.setFromRequest(body);

      assert.deepEqual(testModel.get('object'), {});
    });

    it('empty array should work', function() {
      var body = {
        array_strings: []
      };

      testModel.setFromRequest(body);

      assert.deepEqual(testModel.get('array_strings'), []);
    });
  });
});
