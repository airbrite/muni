'use strict';

var Mixins = require('../../mixins');

module.exports = function() {
  return {
    _id: Mixins.newObjectId('538b7c95c883570700ee9644'),
    date: new Date('2013-11-18T09:04:24.447Z'),
    object: {
      _id: Mixins.newObjectId('538b7c95c883570700ee9644'),
      date: new Date('2013-11-18T09:04:24.447Z')
    },
    arrayOfIds: [Mixins.newObjectId('538b7c95c883570700ee9644'), Mixins.newObjectId('538b7c95c883570700ee9645')],
    arrayOfDates: [new Date('2013-11-18T09:04:24.447Z'), new Date('2013-11-19T09:04:24.447Z')],
    arrayOfObjects: [{
      _id: Mixins.newObjectId('538b7c95c883570700ee9644'),
      date: new Date('2013-11-18T09:04:24.447Z')
    }, {
      _id: Mixins.newObjectId('538b7c95c883570700ee9645'),
      date: new Date('2013-11-19T09:04:24.447Z')
    }],
  };
};
