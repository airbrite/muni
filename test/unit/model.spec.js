'use strict';

var fs = require('fs');
var _ = require('lodash');
var chai = require('chai');
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var assert = require('chai').assert;
var sinon = require('sinon');
var Promise = require('bluebird');
var sinonAsPromised = require('sinon-as-promised')(Promise);
var Model = require('../../model');

require('../../mixins');

// Eyes
console.inspect = require('eyes').inspector({
  maxLength: 32768,
  sortObjectKeys: true,
  hideFunctions: true
});

// Test helpers
var helpers = require('../helpers');

describe('Model', function() {
  // Set max timeout allowed
  this.timeout(10000);

  it('should set an empty array', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();

    return testModel.setFromRequest({
      array_strings: []
    }).then(function() {
      assert.deepEqual(testModel.get('array_strings'), []);
    });
  });

  // return;

  it('should set defaults with null', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();

    // `i_am_null` is type `ufloat` except defaulted to `null
    // It should still be set as `null`
    // Because `null` is special and overrides type
    assert.strictEqual(testModel.get('i_am_null'), null);
  });

  it('#getDeep shallow', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();

    var val = testModel.get('string');
    assert.strictEqual(val, 'i am a string');

  });

  it('#getDeep nested object', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();
    var val = testModel.get('object.omg.wtf');
    assert.strictEqual(val, 'bbq');
  });

  it('#getDeep nested array', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();
    var val = testModel.get('array_objects.1.foo');
    assert.strictEqual(val, 'baz');
  });

  it('#getDeep nested undefined', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();
    var val = testModel.get('object.i_dont_exist.who_am_i');
    assert.isUndefined(val);
  });

  it('#combinedDefaults', function() {
    var TestModel = Model.extend({
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
    var testModel = new TestModel();

    assert.deepEqual(testModel.combinedDefaults(), {
      uno: 'one',
      dos: 'two'
    });
  });

  it('#combinedSchema', function() {
    var TestModel = Model.extend({
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
    var testModel = new TestModel();

    assert.deepEqual(testModel.combinedSchema(), {
      uno: 'string',
      dos: 'number'
    });
  });

  it('should set changedFromRequest after setFromRequest', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();

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



  it('#setFromRequest with readOnlyAttributes', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema'),
      readOnlyAttributes: function() {
        return {
          string: true,
          object: {
            omg: {
              wtf: true
            }
          }
        };
      }
    });
    var testModel = new TestModel();

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

  it('#setFromRequest with unset', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();

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
  it.skip('#setFromRequest with omitted nested key should not unset the omitted key', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();

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
  it.skip('#setFromRequest with omitted nested key should not trigger change', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();

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

  it('#setFromRequest with empty object should work', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();

    var body = {
      object: {}
    };

    testModel.setFromRequest(body);

    assert.deepEqual(testModel.get('object'), {});
  });

  it('#setFromRequest with empty array should work', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema')
    });
    var testModel = new TestModel();

    var body = {
      array_strings: []
    };

    testModel.setFromRequest(body);

    assert.deepEqual(testModel.get('array_strings'), []);
  });

  it('#render', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema'),
      hiddenAttributes: function() {
        return {
          string: true,
          object: {
            omg: {
              wtf: true
            }
          }
        };
      }
    });
    var testModel = new TestModel();

    var json = testModel.render();
    assert.isUndefined(json.string);
    assert.isUndefined(json.object.omg.wtf);
  });

  it('#removeAttributes', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema'),
      hiddenAttributes: function() {
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
      }
    });
    var testModel = new TestModel();
    var hiddenAttributes = _.result(testModel, 'hiddenAttributes');
    testModel.removeAttributes(testModel.attributes, hiddenAttributes);
    assert.isUndefined(testModel.attributes.string);
    assert.isUndefined(testModel.attributes.array_objects);
    assert.isUndefined(testModel.attributes.object.omg.wtf);
    assert.isUndefined(testModel.attributes.array_objects_empty);
  });

  it('#removeAttributes with nested object', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema'),
      hiddenAttributes: function() {
        return {
          string: true,
          integer: false,
          array_objects: true,
          object: true,
          array_objects_empty: true
        };
      }
    });
    var testModel = new TestModel();
    var hiddenAttributes = _.result(testModel, 'hiddenAttributes');
    testModel.removeAttributes(testModel.attributes, hiddenAttributes);
    assert.isUndefined(testModel.attributes.object);
  });

  it('#removeExpandableAttributes', function() {
    var TestModel = Model.extend({
      defaults: helpers.requireFixture('defaults'),
      schema: helpers.requireFixture('schema'),
      expandableAttributes: function() {
        return {
          expandable: true
        };
      }
    });
    var testModel = new TestModel();
    testModel.set('expandable', {
      _id: 'foo',
      foo: 'bar',
      troll: 'lol'
    });
    var expandableAttributes = _.result(testModel, 'expandableAttributes');
    testModel.removeExpandableAttributes(testModel.attributes, expandableAttributes);
    assert.deepEqual(testModel.attributes.expandable, {
      _id: 'foo'
    });
  });

  describe('#validateAttributes', function() {
    var testModel;

    beforeEach(function() {
      var TestModel = Model.extend({
        defaults: helpers.requireFixture('defaults'),
        schema: helpers.requireFixture('schema')
      });
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

      testModel.validateAttributes(attrs, schema);
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

      testModel.validateAttributes(attrs, schema);
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

      testModel.validateAttributes(attrs, schema);

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

      testModel.validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {});
    });

    it('should ignore invalid key', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        invalid_key: 'asdf'
      };

      testModel.validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {});
    });

    it('should not allow negative timestamp', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        timestamp: -123
      };

      testModel.validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {});
    });

    it('should cast ISO8601 date string', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        date: '2014-08-07T07:49:53.555Z'
      };

      testModel.validateAttributes(attrs, schema);
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

      testModel.validateAttributes(attrs, schema);
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

      testModel.validateAttributes(attrs, schema);
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

      testModel.validateAttributes(attrs, schema);
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

      testModel.validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        array_strings: ['z', 'x', null, 'v']
      });
    });

    it('should validate array of uintegers', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        array_numbers: [5, 6, 'a', 8]
      };

      testModel.validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        array_numbers: [5, 6, 0, 8]
      });
    });

    it('should validate array of booleans', function() {
      var schema = _.result(testModel, 'schema');

      var attrs = {
        array_booleans: [true, false, 1, 0, 'true']
      };

      testModel.validateAttributes(attrs, schema);
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

      testModel.validateAttributes(attrs, schema);
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

      testModel.validateAttributes(attrs, schema);
      assert.deepEqual(attrs, {
        array_objects: [{
          foo: 'bar'
        }, {}, {}, {
          foo: 'baz'
        }]
      });
    });
  });
});
