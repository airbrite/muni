'use strict';

module.exports = function() {
  return {
    id: '53b4694cda836700006b61f2',
    string: 'i am a string',
    integer: -1234,
    uinteger: 1234,
    float: -12.34,
    ufloat: 12.34,
    boolean: true,
    timestamp: 1407396108803,
    date: new Date(),
    object_empty: {},
    object: {
      foo: 'bar',
      omg: {
        wtf: 'bbq'
      }
    },
    object_defaults_empty: {},
    array_empty: [],
    array_strings: ['a', 'b', 'c', 'd'],
    array_numbers: [1, 2, 3, 4],
    array_booleans: [true, false, false, true],
    array_objects_empty: [{
      n: 1
    }, {
      s: 's'
    }, {
      b: true
    }],
    array_objects: [{
      foo: 'bar'
    }, {
      foo: 'baz'
    }]
  };
};
