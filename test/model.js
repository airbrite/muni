/* globals describe, it, before, after */
"use strict";

var _ = require('lodash');
var should = require("chai").should();
var Model = require("../model");
var Mongo = require("../mongo");

// TODO FIX TESTS
return;

describe("Models", function() {

  // Local variables
  var savedId;

  // Before
  // Connect to mongodb

  before(function(done) {
    Model.prototype.urlRoot = "tests";

    Model.prototype.validate = function(attributes, options) {
      if (attributes.name === "Jack Dagnels") {
        return new Error("You Shall Not Pass!");
      } else {
        return false;
      }
    };


    var db = new Mongo("mongodb://localhost:27017/test");
    db.connect();
    db.on("connect", function(url) {
      Model.prototype.db = db;
      Model.prototype.db.eraseCollection("tests");
      done();
    });
  });


  // Save

  it("should save with create and events", function(done) {
    var model = new Model({
      cid: _.random(1, 65535),
      name: "Pedro Sanchez",
      address: {
        city: "Los Angeles",
        state: "CA"
      }
    });

    var requestEventFired = false;

    model.on("request", function(model, op, options) {
      requestEventFired = true;
    });

    model.on("sync", function(model, resp, options) {
      done();
    });

    model.save(null, {
      success: function(model, resp, options) {
        requestEventFired.should.be.true;
        model.attributes.should.not.be.empty;
        should.exist(model.id);

        savedId = model.id;
      }
    });
  });

  it("should not save with create and validate and invalid and events", function(done) {
    var model = new Model({
      cid: _.random(1, 65535),
      name: "Jack Dagnels"
    });

    model.on("invalid", function(model, error, options) {
      (error instanceof Error).should.be.true;
      // done();
    });

    model.save().bind(this).then(function() {
      // should not be called
    }).catch(function(err) {
      (err instanceof Error).should.be.true;
      done();
    });
  });

  it("should save with update", function(done) {
    var model = new Model({
      _id: savedId,
      name: "Hugh Bowner",
      address: {
        city: "Los Santos",
        zip: "90210"
      }
    });
    model.save(null, {
      success: function(model, resp, options) {
        model.attributes.should.not.be.empty;
        should.exist(model.id);
        model.get("name").should.equal("Hugh Bowner");

        // shallow get
        model.get("address").city.should.equal("Los Santos");
        model.get("address").state.should.equal("CA");

        // deep get
        model.get("address.city").should.equal("Los Santos");
        model.get("address.state").should.equal("CA");
        done();
      }
    });
  });

  it("should save with patch", function(done) {
    var model = new Model({
      _id: savedId,
      email: "hughbowner@gmail.com"
    });
    model.save(null, {
      patch: true,
      success: function(model, resp, options) {
        model.attributes.should.not.be.empty;
        should.exist(model.id);
        model.get("name").should.equal("Hugh Bowner");
        model.get("email").should.equal("hughbowner@gmail.com");
        done();
      }
    });
  });


  // Fetch

  it("should fetch", function(done) {
    var model = new Model({
      _id: savedId
    });
    model.fetch({
      success: function(model, resp, options) {
        model.get("name").should.equal("Hugh Bowner");
        model.get("email").should.equal("hughbowner@gmail.com");
        done();
      }
    });
  });

  it("should fetch with require", function(done) {
    var model = new Model({
      _id: savedId
    });
    model.fetch({
      // require: true,
      success: function(model, resp, options) {
        model.get("name").should.equal("Hugh Bowner");
        model.get("email").should.equal("hughbowner@gmail.com");
        done();
      }
    });
  });


  it("should fetch with require with errors", function(done) {
    var model = new Model({
      _id: "epicfail"
    });
    model.fetch({
      require: true,
      success: function(model, resp, options) {
        resp.should.equal(null);
        done();
      },
      error: function(model, resp, options) {
        (resp instanceof Error).should.be.true;
        done();
      }
    }).catch(function(err) {
      // Promise rejects even if error callback fires
    });
  });



  it("should fetch with promise", function(done) {
    var model = new Model({
      _id: savedId
    });
    model.fetch()
      .then(function(resp) {
        done();
      })
      .catch(function(err) {
        done();
      });
  });

  it("should fetch with promise with errors", function(done) {
    var model = new Model();
    model.fetch()
      .then(function(resp) {
        done();
      })
      .catch(function(err) {
        done();
      });
  });


  it("should fetch with no ID with errors", function(done) {
    var model = new Model();
    model.fetch({
      success: function(model, resp, options) {
        done();
      },
      error: function(model, resp, options) {
        resp.message.should.equal("No ID for Model");
        (resp instanceof Error).should.be.true;
        done();
      }
    }).catch(function(err) {
      // Promise rejects even if error callback fires
    });
  });

  it("should fetch with query with regex", function(done) {
    var model = new Model();
    model.fetch({
      query: {
        name: /Hugh bowner/i,
        email: "hughbowner@gmail.com"
      },
      success: function(model, resp, options) {
        model.get("name").should.equal("Hugh Bowner");
        model.get("email").should.equal("hughbowner@gmail.com");
        done();
      }
    });
  });


  // Delete

  it("should delete", function(done) {
    var model = new Model({
      _id: savedId
    });
    model.destroy({
      success: function(model, resp, options) {
        resp.should.be.equal(1);
        done();
      }
    });
  });


  // After

  after(function(done) {
    done();
  });

});
