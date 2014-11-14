'use strict';

module.exports = function() {
  return {
    id: 'id',
    string: 'string',
    integer: 'integer',
    uinteger: 'uinteger',
    float: 'float',
    ufloat: 'ufloat',
    boolean: 'boolean',
    timestamp: 'timestamp',
    i_am_null: 'ufloat',
    date: 'date',
    object_empty: {},
    object: {
      foo: 'string',
      omg: {
        wtf: 'string'
      }
    },
    object_defaults_empty: {
      first: {
        second: {
          third: {
            such: 'string'
          },
          tres: {
            yo: 'string'
          }
        }
      }
    },
    array_empty: [],
    array_strings: ['string'],
    array_numbers: ['uinteger'],
    array_booleans: ['boolean'],
    array_objects_empty: [{}],
    array_objects: [{
      foo: 'string'
    }],
    expandable: {}
  };
};
