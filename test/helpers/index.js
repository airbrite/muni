'use strict';

var fs = require('fs');

module.exports = {
  getFixture: function(filename) {
    try {
      return JSON.parse(fs.readFileSync(__dirname + '/../fixtures/' + filename + '.json', 'utf8'));
    } catch (e) {}
    return {};
  },

  cloneModel: function(model) {
    var clone = model.clone();
    _.extend(clone, model);
    return clone;
  },
};
