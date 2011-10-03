// Transaction
//
// Copyright 2011 Iris Couch
//
//    Licensed under the Apache License, Version 2.0 (the "License");
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.

var lib = require('./lib')
  , defaultable = require('./defaultable')
  , util = require('util')
  , log4js = require('log4js')
  , events = require('events')
  , assert = require('assert')
  , obj_diff = require('obj_diff')
  ;

module.exports = defaultable(
  { 'log'       : log4js.getLogger('txn')
  , 'log_level' : process.env.txn_log_level || 'info'
  , 'timestamps': true
  , 'create'    : false
  , 'max_tries' : 5
  , 'delay'     : 100
  , 'timeout'   : 15 * 1000
  , 'operation' : null
  , 'req'       : null
  , 'couch'     : null
  , 'db'        : null
  , 'id'        : null
  }, function(module, exports, DEFAULT) {

// The main API is the shortcut function, but the object API is also available.
//var api = function() { return couch_doc_txn.apply(this, arguments) };
var api = couch_doc_txn;
api.Txn = api.Transaction = Transaction;
module.exports = api;


function couch_doc_txn(fetch_req, operation, callback) {
  assert.equal('function', typeof callback, 'Need callback');

  // Allow specifying options in the req object.
  var opts = {};
  for (var key in DEFAULT)
    if(key in fetch_req) {
      opts[opt] = fetch_req[key];
      delete fetch_req[key];
    }

  opts.req       = fetch_req;
  opts.operation = operation;

  var txn = new Transaction(opts);

  txn.on('timeout', function() {
    var err = new Error('Transaction ('+txn.name+') timed out');
    err.timeout = true;
    return callback(err);
  })

  txn.on('exhausted', function(tries) {
    var err = new Error('Transaction ('+txn.name+') fail after '+tries+' conflicts');
    err.conflict = true;
    err.tries = tries;
    return callback(err);
  })

  txn.on('error', function(er) {
    return callback(er);
  })

  txn.on('done', function(doc) {
    return callback(null, doc, txn);
  })

  txn.start();
  return txn;
}


var EventEmitter = events.EventEmitter2 || events.EventEmitter;
util.inherits(Transaction, EventEmitter);

function Transaction (opts) {
  var self = this;
  EventEmitter.call(self);

  self.req       = opts.req       || DEFAULT.req;
  self.operation = opts.operation || DEFAULT.operation;
  self.timeout   = opts.timeout   || DEFAULT.timeout;
  self.delay     = opts.delay     || DEFAULT.delay;
  self.log       = opts.log       || DEFAULT.log;

  self.log.setLevel(DEFAULT.log_level);

  // These can be falsy.
  self.timestamps = ('timestamps' in opts) ? opts.timestamps : DEFAULT.timestamps;
  self.max_tries  = ('max_tries'  in opts) ? opts.max_tries  : DEFAULT.max_tries;
} // Transaction


Transaction.prototype.start = function() {
  var self = this;

  assert.ok(self.req, 'Request object required');
  assert.ok(self.max_tries > 0, 'max_tries must be 1 or greater');
  assert.ok(self.timeout > 0, 'timeout must be 1 or greater');
  assert.equal(typeof self.operation, 'function', 'Data operation required');

  self.name = self.operation.name || 'Untitled';
  self.tries = 0;
  return self.attempt();
}

Transaction.prototype.attempt = function() {
  var self = this;

  var error
    , delay = self.delay * Math.pow(2, self.tries);

  if(self.tries >= self.max_tries) {
    self.log.debug('Too many tries ('+self.name+'): ' + self.tries);
    return self.emit('exhausted', self.tries);
  }

  if(self.retry_timer)
    return self.emit('error', new Error('retry_timer already set: ' + self.name));

  if(self.tries == 0)
    return go(); // No delay.
  else {
    self.log.debug('Delay until next attempt ('+self.name+'): ' + delay);
    self.retry_timer = setTimeout(go, delay);
  }

  function go() {
    self.tries += 1;
    self.emit('attempt', self.tries);
    self.run();
  }
}

Transaction.prototype.run = function() {
  var self = this;

  var uri = self.req.uri || self.req.url;
  self.log.debug('Transaction '+self.name+' (' + self.tries + '/' + self.max_tries + '): ' + uri);

  lib.req_couch(self.req, function(er, resp, doc) {
    if(er)
      return self.emit('error', er);

    var original_doc = lib.JDUP(doc)
      , id = doc._id
      , rev = doc._rev
      ;

    if(!id)
      return self.emit('error', new Error('No _id: ' + lib.JS(doc)));
    if(!rev)
      return self.emit('error', new Error('No _rev: ' + lib.JS(doc)));

    if(self.op_timer)
      return self.emit('error', new Error('op_timer already set: ' + self.name));

    self.op_timer = setTimeout(on_timeout, self.timeout);
    function on_timeout() {
      self.op_timer = null;
      return self.emit('timeout');
    }

    // Execute the operation.
    self.operation(doc, op_done);

    function op_done(er, new_doc) {
      clearTimeout(self.op_timer);
      if(!self.op_timer) {
        self.log.debug('Ignoring operation after timeout');
        return self.emit('ignore');
      }

      if(er)
        return self.emit('error', er);

      if(new_doc) {
        self.log.debug('Using new doc: ' + JS(new_doc));
        self.emit('replace', doc, new_doc);
        doc = new_doc;
      }

      if(obj_diff.atmost(original_doc, doc, {})) {
        self.log.debug('Skipping txn update for unchanged doc: ' + id);
        return self.emit('done', doc);
      }

      var diff = obj_diff.diff(original_doc, doc);
      self.log.debug('Operation diff ('+self.name+'): ' + lib.JS(diff));
      self.emit('change', diff);

      doc._id = id;
      doc._rev = rev;
      if(!! self.timestamps)
        doc.updated_at = new Date;

      var update_req = { method: 'PUT'
                       , uri   : uri
                       , json  : doc
                       };

      self.log.debug('Updating transaction ('+self.name+'): ' + update_req.uri);
      lib.req_couch(update_req, function(er, resp, result) {
        if(er && resp && resp.statusCode === 409 && result.error === "conflict") {
          // Retryable error.
          self.log.debug('Conflict: '+self.name);
          self.emit('conflict', self.tries);
          return self.attempt();
        }

        if(er)
          // Normal error, non-retryable.
          return self.emit('error', er);

        // Success.
        doc._rev = result.rev;
        return self.emit('done', doc);
      })
    }
  })
}

Transaction.prototype.cancel = function() {
  if(self.retry_timer)
    clearTimeout(self.retry_timer);
  if(self.op_timer)
    clearTimeout(self.op_timer);

  self.log.debug('Cancelling transaction try: ' + self.tries);
  self.retry_timer = null;
  self.op_timer = null;

  self.emit('cancel', self.tries);
}

}) // defaultable
