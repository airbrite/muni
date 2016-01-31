'use strict';

var _ = require('lodash');
var fs = require('fs');
var Mixins = require('../../mixins');

module.exports = {
  jsonReviver: function(key, value) {
    if (typeof value === 'string') {
      if (Mixins.isValidISO8601String(value)) {
        return new Date(value);
      }
    }
    return value;
  },

  getFixture: function(filename) {
    try {
      return JSON.parse(fs.readFileSync(__dirname + '/../fixtures/' + filename + '.json', 'utf8'), this.jsonReviver);
    } catch (e) {}
    return {};
  },

  requireFixture: function(filename) {
    return require(__dirname + '/../fixtures/' + filename);
  },

  cloneModel: function(model) {
    var clone = model.clone();
    _.assign(clone, model);
    return clone;
  },
};
