# Bootie

#### The components of Bootie are as follows:

- Controller
- Crud Controller
- Model
- Collection
- Router
- Adapter
- Mongo
- Database

### Middleware

All middleware should reside in the `middleware` folder.

Here is an example of a middleware (`middleware/require_user.js`):

    module.exports = function(req, res, next) {
        var err;
        if (!req.user) {
            err = new Error("User required.");
            err.code = 401;
        }
        next(err);
    };


---

## Router, Routes, and Controllers

There can be 1 or more router(s) per application.

### What is the point of the router?

The router extends `express.Router` and works together with `controllers` to define routes the app should serve.

Inside a `controller` there is a `setupRoutes` function. Routes are defined there in the following format:

    this.routes.get["/test"] = {
        action: {{fn}},
        middleware: [{{fn1}}, {{fn2}}]
    };

`action` is a `function` belonging to the `controller`
`middleware` is an array of `express` compatible middleware.


### What is the point of a controller?

Controllers have `middleware`, `routes`, and `route handlers`.

A controller is the ideal place to handle incoming HTTP requests.

Some examples of things the controller does:

- define and respond to express routes (handler and middleware)
- execute middleware before and after a route handler
- parse query parameters, query strings, and request body (regex supported)
- render html/json/xml responses for both success and error
- skip and limit results
- sort and order results
- select results by `since/until` (timestamp in seconds or milliseconds)

Remember to follow the philosophy of "skinny controller, fat model".

Don't overwork the controller!


### Why use a base controller?

Why is there a `base` and `base_crud` controller?

The intention is to keep `Bootie.Controller` and `Bootie.CrudController` as implementation agnostic as possible.

Therefore in order to configure the loading of application specific `middleware`, a base controller and/or a base crud controller is recommended as an extra layer of inheritance.

### Query Parameters

    queryParams: function() {
        return {
            "name": "string",
            "email": "regex",
            "is_awesome": "boolean",
            "price": "integer",
            "tax_rate": "float"
        };
    }

### What is all this `res.data` stuff?

The controller comes with 3 default middleware functions that are at the very end of the route lifecycle. They are responsible for responding to the request and formatting it.

Format for a success response envelope:

    {
        meta: {
            code: 200 or 201
        },
        data: {} or [] or ""
    }

Format for an error response envelope:

    {
        meta: {
            code: 400 or higher,
            error: "An error message"
        },
        data: {} or [] or ""
    }

**successResponse**
Default middleware if not an error. Sets `res.code` to `200` if not already set.

**errorResponse**
Default middleware if there is an error. Sets `res.code` to `500` if not already set.

**finalResponse**
Executes after either `successResponse` or `errorResponse` Determines what format to respond with `res.fmt` and sends the response and code.

### Prototype properties:

- `path` - `string` - root url path
- `basePath` - `object or function` - base url path for all routes for this controller
- `middleware` - `object or function` - configure route handler specific middleware
- `queryParams` - `object or function` - allowed query parameters
- `sortParam` - `string` - default sort param
- `sortOrder` - `string` - default sort order (`asc` or `desc`)
- `skip` - `int` - default skip `0`
- `limit` - `int` - default limit `50`

Example of `middleware` prototype property:

    {
        create: [authenticateMiddleware, requireJsonMiddleware],
        find: [authenticateMiddleware],
        findOne: [authenticateMiddleware],
        update: [authenticateMiddleware, requireJsonMiddleware],
        destroy: [authenticateMiddleware]
    }

### Instance properties:

- `routes` - `object` - configuration of routes/handlers (don't set this directly, use `setupRoutes`)
- `pre` - `array of functions` - middleware executed before route middleware and route handler
- `before` - `array of functions` - middleware executed after route middleware but before route handler
- `after` - `array of functions` - middleware executed after route handler

### Prototype functions:

- `setupRoutes`
- `setupPreMiddleware`
- `setupBeforeMiddleware`
- `setupAfterMiddleware`

---

## What is a crud controller?

Crud controllers have everything a standard controller has with the addition of referencing a database connection and defining and instantiating models and collections.

It also by default automatically configures handlers for find, findOne, create, update, and destroy which correspond to the CRUD actions with resourceful routes.

### Prototype properties: (inherits from controller)

- `urlRoot` - `string` - the name of the mongodb collection
- `model` - `class` - the class of the model
- `collection` - `class` - the class of the collection
- `crud` - `array of strings` - single character of the following {C, R, O, U, D} representing a CRUD action

### Instance properties:

- `db` - an instance of a database (mongo) connection
- `cache` - an instance of a redis connection

### Prototype functions:

- `setupModel`
- `setupCollection`

---

## Models

Models are an extension of Backbone Models. They have an `attributes` property with `.get` and `.set`.

See the [Backbone.js documentation](http://backbonejs.org) for more information on how to work with models.

### Why use a base model?

Why is there a `base` model and collection?

Similar principle to controllers, except in the case of models, it is commonly used to define things like `privateAttributes` or other properties that are intended to be inherited by most if not all of the application's models.

A good example is ... TBD

There is less of a reason for base collection, but it is done here to show what is possible.

### Prototype properties:

- `urlRoot` - `string` - mongodb collection name
- `idAttribute` - `string` - usually is `_id`
- `userIdAttribute` - `string` - usually is `user_id`
- `privateAttributes` - `array of strings` -
- `publicAttributes` - `array of strings` -

### Instance properties:

- `db` - `object` - mongo
- `cache` - `object` - redis

### Prototype functions:

- `setFromRequest`
- `render`

---

## Collections

Collections contain one or more  models.

See the [Backbone.js documentation](http://backbonejs.org) for more information on how to work with collections.

### Prototype properties:

- `urlRoot` - `string` - mongodb collection name
- `model` - `class` - class for the model used by this collection

### Instance properties:

- `db` - `object` - mongo
- `cache` - `object` - redis

### Prototype functions:

None

---

## Custom Errors

TBD

---

## Adapters

TBD

---

## What features does Bootie have?

TBD

### What does Bootie not do?

- Does not give you wings.

## Why should I use Bootie?

Bootie is not for everyone. It worked really well for our team and what we wanted to accomplish so we just wanted to share it with anyone would could benefit from our learnings.

## Why did you build Bootie?

While developing [Celery's](https://trycelery.com) new API, we first started out as using a pure express.js implementation.

## Unit Test Coverage

- Model
- Collection
- Mongo

## TODO

- More unit test coverage

---

## References
- https://github.com/petkaantonov/bluebird/issues/70
- http://blog.parse.com/2013/01/29/whats-so-great-about-javascript-promises/
