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
    definition: helpers.requireFixture('definition')
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

    it('#_removeAttributes for hidden root', function() {
      testModel.definition = {
        string: {
          hidden: true
        },
        integer: {
          type: 'integer',
          hidden: false
        },
        array_objects: {
          type: 'array',
          hidden: true
        },
        object: {
          hidden: true
        },
        array_objects_empty: {
          type: 'array',
          hidden: true
        }
      };

      var hiddenAttributes = testModel.findAttributes('hidden');
      testModel._removeAttributes(testModel.attributes, hiddenAttributes);
      assert.isUndefined(testModel.attributes.object);
    });

    it('#_removeAttributes for hidden nested', function() {
      testModel.definition = {
        string: {
          hidden: true
        },
        integer: {
          type: 'integer',
          hidden: false
        },
        array_objects: {
          type: 'array',
          hidden: true
        },
        object: {
          type: 'object',
          fields: {
            omg: {
              type: 'object',
              fields: {
                wtf: {
                  hidden: true
                }
              }
            }
          }
        },
        array_objects_empty: {
          type: 'array',
          hidden: true
        }
      };

      var hiddenAttributes = testModel.findAttributes('hidden');
      testModel._removeAttributes(testModel.attributes, hiddenAttributes);
      assert.isUndefined(testModel.attributes.string);
      assert.isUndefined(testModel.attributes.array_objects);
      assert.isUndefined(testModel.attributes.object.omg.wtf);
      assert.isUndefined(testModel.attributes.array_objects_empty);
    });

    it('#_removeExpandableAttributes', function() {
      testModel.definition = {
        expandable: {
          type: 'object',
          expandable: true
        }
      };

      testModel.set('expandable', {
        _id: 'foo',
        foo: 'bar',
        troll: 'lol'
      });
      var expandableAttributes = testModel.findAttributes('expandable');
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
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        non_existent_key: null,
        string: 'i should show up',
        object: {
          non_existent_nested_key: null,
          foo: 'i should also show up'
        }
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        object: {
          foo: 'i should also show up'
        },
        string: 'i should show up'
      });
    });

    it('should set nested attribute of empty object', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

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

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        object_defaults_empty: {
          first: {
            second: {
              third: {
                such: 'win'
              },
              tres: {
                yo: '12345'
              }
            }
          }
        }
      });
    });

    it('should reset to defaults with null', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        string: null,
        integer: null,
        timestamp: null,
        object: null,
        array_strings: null,
        boolean: null
      };

      testModel._validateAttributes(attrs, schema, defaults);

      assert.deepEqual(attrs, {
        string: 'i am a string',
        integer: -1234,
        timestamp: 1407396108803,
        object: {
          foo: 'bar',
          omg: {
            wtf: 'bbq'
          }
        },
        array_strings: [],
        boolean: true
      });
    });


    it('should coerce invalid value type', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        string: 1234
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        string: '1234'
      });
    });

    it('should ignore invalid key', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        invalid_key: 'asdf'
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {});
    });

    it('should not allow negative timestamp', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        timestamp: -123
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {});
    });

    it('should cast ISO8601 date string', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        date: '2014-08-07T07:49:53.555Z'
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        date: new Date('2014-08-07T07:49:53.555Z')
      });
    });

    it('should allow setting anything into empty object', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var date = new Date();
      var attrs = {
        object_empty: {
          n: 1,
          s: 's',
          d: date,
          b: true
        }
      };

      testModel._validateAttributes(attrs, schema, defaults);
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
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        object: {
          foo: 'baz',
          troll: 'lol'
        }
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        object: {
          foo: 'baz'
        }
      });
    });

    it('should allow setting anything into empty array', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        array_empty: ['any', 'thing', 1, {
          foo: 'bar'
        }]
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        array_empty: ['any', 'thing', 1, {
          foo: 'bar'
        }]
      });
    });

    it('should validate array of strings', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        array_strings: ['z', 'x', 1, 'v']
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        array_strings: ['z', 'x', '1', 'v']
      });
    });

    it('should validate array of uintegers', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        array_numbers: [5, 6, 'a', 8]
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        array_numbers: [5, 6, 8]
      });
    });

    it('should validate array of booleans', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        array_booleans: [true, false, 1, 0, 'true']
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        array_booleans: [true, false]
      });
    });

    it('should validate array of objects that are empty', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        array_objects_empty: [{
          foo: 'bar'
        }, {
          awesome: true
        }]
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        array_objects_empty: [{
          foo: 'bar'
        }, {
          awesome: true
        }]
      });
    });

    it('should validate array of objects', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

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

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        array_objects: [{
          foo: 'bar'
        }, {}, {}, {
          foo: 'baz'
        }]
      });
    });

    it('should validate array of objects with defaults', function() {
      var schema = testModel.schema();
      var defaults = testModel.defaults();

      var attrs = {
        array_objects: [{
          foo: 'bar'
        }, {
          omg: 'wtf'
        }]
      };
      var defaults = {
        array_objects: [{
          foo: 'bar',
          bar: 'baz'
        }]
      };

      testModel._validateAttributes(attrs, schema, defaults);
      assert.deepEqual(attrs, {
        array_objects: [{
          foo: 'bar',
          bar: 'baz'
        }, {
          foo: 'bar',
          bar: 'baz'
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
      testModel.set('array_objects', [{foo: 'bar'}, {foo: 'baz'}]);
      var val = testModel.get('array_objects.1.foo');
      assert.strictEqual(val, 'baz');
    });

    it('#getDeep nested undefined', function() {
      var val = testModel.get('object.i_dont_exist.who_am_i');
      assert.isUndefined(val);
    });
  });


  describe('Rendering', function() {
    var testModel;
    beforeEach(function() {
      testModel = new TestModel();
      testModel.definition = {
        string: {
          hidden: true
        },
        object: {
          type: 'object',
          fields: {
            omg: {
              type: 'object',
              fields: {
                wtf: {
                  hidden: true
                }
              }
            }
          }
        }
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
          foo: 'bar',
          bar: null
        }, {
          foo: 'changed',
          bar: null
        }]
      });
    });

    it('readOnlyAttributes', function() {
      testModel.definition = {
        string: {
          readonly: true
        },
        object: {
          type: 'object',
          fields: {
            omg: {
              type: 'object',
              fields: {
                wtf: {
                  readonly: true
                }
              }
            }
          }
        }
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
      testModel.definition = {
        expandable: {
          type: 'object',
          expandable: true
        }
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
      testModel.definition = {
        computed: {
          computed: true
        }
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

    it('unset should revert to defaults', function() {
      var body = {
        string: null,
        integer: null,
        timestamp: null,
        object: null,
        boolean: null
      };

      testModel.setFromRequest(body);

      var attrs = _.pick(testModel.attributes, [
        'string',
        'integer',
        'timestamp',
        'object',
        'boolean'
      ]);
      assert.deepEqual(attrs, {
        string: 'i am a string',
        integer: -1234,
        timestamp: 1407396108803,
        object: {
          foo: 'bar',
          omg: {
            wtf: 'bbq'
          }
        },
        boolean: true
      });
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

  describe('Definition', function() {
    var testModel;
    beforeEach(function() {
      testModel = new TestModel();
    });

    it('should match defaults with nested array object', function() {
      var defaults = testModel.defaults(undefined, true);

      assert.deepEqual(defaults.array_objects, [{
        foo: null,
        bar: null
      }]);
    });

    it('should support function defaults', function() {
      testModel.definition = {
        test_default: {
          type: 'string',
          default: function() { return 'foo'; }
        }
      };
      var defaults = testModel.defaults();

      assert.deepEqual(defaults, {
        test_default: 'foo'
      });
    });

    it('should match readOnlyAttributes', function() {
      var readOnlyAttributes = testModel.findAttributes('readonly');

      assert.deepEqual(readOnlyAttributes, {
        readonly: true
      });
    });

    it('should match hiddenAttributes', function() {
      var hiddenAttributes = testModel.findAttributes('hidden');

      assert.deepEqual(hiddenAttributes, {
        hidden: true
      });
    });

    it('should match computedAttributes', function() {
      var computedAttributes = testModel.findAttributes('computed');

      assert.deepEqual(computedAttributes, {
        computed: true
      });
    });

    it('should match expandableAttributes', function() {
      var expandableAttributes = testModel.findAttributes('expandable');

      assert.deepEqual(expandableAttributes, {
        expandable: true
      });
    });
  })
});
