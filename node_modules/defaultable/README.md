# Default options for NodeJS, NPM, and CommonJS modules

Defaultable is a simple drop-in tool to make your Node API very convenient for your users. It comes from internal [Iris Couch](http://www.iriscouch.com) tooling.

## Is it any good?

Yes.

## What your users see

With Defaultable, these are the promises you make to your users (in documentation, presentations, etc.)

*Dear users, just require my code and use it like normal.*

```javascript
var api = require("my_mod");

api.do_stuff("Bob", { minimum:5, dollars:10 }); // Process Bob.
api.do_stuff("Eve", { minimum:5, dollars:800}); // Process Eve.
```

*If you are using the same options a lot, set them as defaults.*

```javascript
var api = require("my_mod").defaults({ "minimum": 5 });

api.do_stuff("Bob", { dollars:10 }); // minimum will be 5
api.do_stuff("Eve", { dollars:800}); // minimum is still 5
```

*Defaults can even inherit from other defaults.*

```javascript
var api = require("my_mod");

var fivers = api.defaults({ "minimum": 5}});
var rich = fivers.defaults({"dollars": 10});
var poor = fivers.defaults({"dollars": 800});

poor.do_stuff("Bob"); // dollars will be 10, minimum will be 5
rich.do_stuff("Eve"); // dollars will be 800, minimum is still 5
```

## What you see

Defaulable wraps a CommonJS module.

Your original code:

```javascript
// my_mod.js

// My code basically starts here
var DEFAULTS = { "minimum":0, "dollars":0 };

exports.do_stuff = function(person, opts) {
  opts = opts || {};

  console.log("Processing: " + person);
  console.log("  minimum = " + opts.minimum || DEFAULTS.minimum);
  console.log("  dollars = $" + opts.dollars || DEFAULTS.dollars);
}
// And obviously it ends here.
```

Your new code:

```javascript
// my_mod.js

// Insert these lines at the top...
var defaultable = require('defaultable');
module.exports = defaultable(
  { "minimum": 0
  , "dollars": 0
  }, function(module, exports, DEFAULTS) { // The rest of your code follows unchanged.

// My code basically starts here (pretty much unmodified, but no hard-coded DEFAULTS)
exports.do_stuff = function(person, opts) {
  opts = opts || {};
  console.log("Processing: " + person);
  console.log("  minimum = " + opts.minimum || DEFAULTS.minimum);
  console.log("  dollars = $" + opts.dollars || DEFAULTS.dollars);
}
// Code ends here, just one more thing to append...

}) // defaultable
```

## How it works

It's really simple.

Defaultable passes the initial defaults to you as `DEFAULTS` (or whatever name you like). Use `module`, `module.exports`, or `exports` as usual.

The upshot is, whatever you export (via `exports` or `module.exports`) gets an additional `.defaults()` function to re-evaluate the code with user-provided defaults. Those defaults inherit from the old ones.
