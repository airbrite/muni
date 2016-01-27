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
    i_am_null: null,
    date: new Date(),
    object_empty: {},
    object: {
      foo: 'bar',
      omg: {
        wtf: 'bbq'
      }
    },
    object_defaults_empty: {
      first: {
        second: {
          third: {
            such: null
          },
          tres: {
            yo: null
          }
        }
      }
    },
    array_empty: [],
    array_strings: [],
    array_numbers: [],
    array_booleans: [],
    array_objects_empty: [],
    array_objects: [],
    readonly: null,
    hidden: null,
    expandable: {}
  };
};
