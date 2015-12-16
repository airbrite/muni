'use strict';

module.exports = function() {
  return {
    id: {
      type: 'id',
      default: '53b4694cda836700006b61f2'
    },
    string: {
      type: 'string',
      default: 'i am a string'
    },
    integer: {
      type: 'integer',
      default: -1234
    },
    uinteger: {
      type: 'uinteger',
      default: 1234
    },
    float: {
      type: 'float',
      default: -12.34
    },
    ufloat: {
      type: 'ufloat',
      default: 12.34
    },
    boolean: {
      type: 'boolean',
      default: true
    },
    timestamp: {
      type: 'timestamp',
      default: 1407396108803
    },
    i_am_null: {
      type: 'ufloat',
      default: null
    },
    date: {
      type: 'date'
    },
    object_empty: {
      type: 'object'
    },
    object: {
      type: 'object',
      fields: {
        foo: {
          type: 'string',
          default: 'bar'
        },
        omg: {
          type: 'object',
          fields: {
            wtf: {
              type: 'string',
              default: 'bbq'
            }
          }
        }
      }
    },
    object_defaults_empty: {
      type: 'object',
      fields: {
        first: {
          type: 'object',
          fields: {
            second: {
              type: 'object',
              fields: {
                third: {
                  type: 'object',
                  fields: {
                    such: {
                      type: 'string'
                    }
                  }
                },
                tres: {
                  type: 'object',
                  fields: {
                    yo: {
                      type: 'string'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    array_empty: {
      type: 'array'
    },
    array_strings: {
      type: 'array',
      value_type: 'string'
    },
    array_numbers: {
      type: 'array',
      value_type: 'uinteger'
    },
    array_booleans: {
      type: 'array',
      value_type: 'boolean'
    },
    array_objects_empty: {
      type: 'array',
      value_type: 'object',
      fields: {}
    },
    array_objects: {
      type: 'array',
      value_type: 'object',
      fields: {
        foo: {
          type: 'string'
        },
        bar: {
          type: 'string'
        }
      }
    },
    readonly: {
      type: 'string',
      readonly: true
    },
    hidden: {
      type: 'string',
      hidden: true
    },
    computed: {
      type: 'string',
      computed: true
    },
    expandable: {
      type: 'object',
      expandable: true
    }
  };
};
