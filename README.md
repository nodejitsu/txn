# Transaction: Javascript ACID objects

Transaction (or *Txn*) is a library to load, modify, and commit Javascript objects in atomic, all-or-nothing operations. It comes from internal Iris Couch tooling, inspired by Google [App Engine transactions][app_engine_txn].

Transaction is great for using CouchDB documents as state machines, moving through a workflow in discrete steps.

## Objective

Txn **guarantees** that data modifications either *commit* completely, or *roll back* completely ([MVCC][mvcc]). For roll-backs, Txn automatically and transparently retries the operation a few times until it commits. I like me some transaction and you should too:

1. Write a simple, clear *operation* function to process a chunk of data (Javascript object)
1. Other parts of the program trigger the operation for various objects with various IDs.
1. Operations might accidently run *multiple times*, even *concurrently*, perhaps behaving *unpredictably*, probably *timing out* when web sites go down. In other words, it is working within the real world.
1. No matter. Transaction ensures that, for a given object ID, changes update atomically, persist consistently, run in isolation, and commit durably (ACID guarantees).

## Example: account signup

Consider account signup as a stateful workflow:

* **requested** (performed by user): User submits their username and email address
* **emailed** (performed by server): Approved the request and emailed the user
* **confirmed**: (performed by user): User clicked the email link and confirmed signup
* **done**: (performed by server): Initial account is set up and ready to use.

The code:

```javascript
// Usage: signup.js <username>
var txn = require("txn");
var username = process.env.username;
var user_uri = "http://example.iriscouch.com/users/" + username;

// Execute the signup processor and react to what happens.
txn({"uri":user_uri}, process_signup, function(error, newData) {
  if(!error)
    return console.log("Processed " + username + " to state: " + newData.state);

  // These errors can be sent by Txn.
  if(error.timeout)
    return console.log("Gave up after " + error.tries + " conflicts");
  if(error.conflict)
    return console.log("process_signup never completed. Troubleshoot and try again");

  // App-specific errors, made by process_signup below.
  if(error.email)
    return console.log('Failed to email: ' + username);
  if(error.account)
    return console.log('Failed to create account: ' + username);

  throw error; // Unknown error
})

function process_signup(doc, to_txn) {
  if(doc.state == 'requested') {
    if(! valid_request(doc))
      return to_txn(null, {"_deleted":true}); // Return a whole new doc.

    doc.emailed_by = require('os').hostname();
    doc.signup_key = Math.random();
    send_email(doc.email, doc.signup_key, function(error) {
      if(error) {
        error.email = true;
        return to_txn(error); // Roll back
      }
      doc.state = 'emailed';
      return to_txn();
    })
  }

  // If the data is unchanged, Txn will not write to the back-end. This operation is thus read-only.
  else if(doc.state == 'emailed') {
    console.log('Still waiting on user to click email link.');
    return to_txn();
  }

  else if(doc.state == 'confirmed') {
    doc.confirmed_at = new Date;
    create_account(doc.username, function(error) {
      if(error) {
        error.account = true;
        return to_txn(error);
      }
      doc.confirmed_by = require('os').hostname();
      doc.state = 'done';
      return to_txn();
    })
  }
}
```

## Considerations

Transaction is great for job processing, from a CouchDB `_changes` feed for example. Unfortunately, jobs are for *doing stuf* (create an account, save a file, send a tweet) and the useful "stuff" are all side-effects. But Txn only provides atomic *data*. It cannot roll-back side-effects your own code made.

Thus the best Txn functions are [reentrant][reent]: At any time, for any reason, a txn function might begin executing anew, concurrent to the original execution, perhaps with the same input parameters or perhaps with different ones. Either execution path could finish first. (The race loser will be rolled back and re-executed, this time against the winner's updated data.)

## TODO

* A shortcut where you can supply the doc and txn will not fetch it first. The downside with that is the doc could have totally changed when your function runs so it may be easy to make a mistake.

[app_engine_txn]: http://code.google.com/appengine/docs/python/datastore/transactions.html
[mvcc]: http://en.wikipedia.org/wiki/Multiversion_concurrency_control
[reent]: http://en.wikipedia.org/wiki/Reentrancy_(computing)
[follow]: https://github.com/iriscouch/follow
