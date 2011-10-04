// The txn unit tests
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

var COUCH = process.env.couch || 'http://localhost:5984';
var DB    = process.env.db    || 'txn_test';

if(process.env.charles)
  COUCH = 'http://localhost:15984';

var TXN = require('../api');

/*
if(require.isBrowser) {
  COUCH = window.location.protocol + '//' + window.location.host;
  DB    = 'txn_browser_test';
}
*/

var time_C = parseFloat("" + (process.env.timeout_coefficient || process.env.C || 1.0));
var txn = TXN.defaults({ 'couch' : COUCH
                       , 'db'    : DB
                       //, 'time_C': time_C
                       //, browser_attachments: !(process.env.skip_browser)
                       })
  , util = require('util'), I = util.inspect
  , assert = require('assert')
  , request = require('request')
  ;

//
// Some helper operators
//

function plus(X) {
  return adder;
  function adder(doc, to_txn) {
    if(!doc.val)
      return to_txn(new Error('No value'));
    doc.val += X;
    return to_txn();
  }
}

//
//
//

var state = {};
module.exports = [ // TESTS

function setup(done) {
  var url = COUCH + '/' + DB;
  request({method:'DELETE', uri:url}, function(er, resp, body) {
    if(er) throw er;
    var json = JSON.parse(body);

    var already_gone = (resp.statusCode === 404 && json.error === 'not_found');
    var deleted      = (resp.statusCode === 200 && json.ok    === true);

    if(! (already_gone || deleted))
      throw new Error('Unknown DELETE response: ' + resp.statusCode + ' ' + body);

    request({method:'PUT', uri:url}, function(er, resp, body) {
      if(er) throw er;
      var json = JSON.parse(body);

      if(resp.statusCode !== 201 || json.ok !== true)
        throw new Error('Unknown PUT response: ' + resp.statusCode + ' ' + body);

      var doc = {_id:"doc_a", val:23};
      request({method:'POST', uri:url, json:doc}, function(er, resp, body) {
        if(er) throw er;

        if(resp.statusCode !== 201 || json.ok !== true)
          throw new Error("Cannot store doc: " + resp.statusCode + ' ' + body);

        done();
      })
    })
  })
},

// =-=-=-=-=-=-=-=-=

function update_with_uri(done) {
  var loc = COUCH + '/' + DB + '/doc_a';
  TXN({uri:loc}, plus(3), function(er, doc) {
    if(er) throw er;
    assert.equal(23 + 3, doc.val, "Update value in doc_a");

    TXN({url:loc}, plus(6), function(er, doc) {
      if(er) throw er;
      assert.equal(23 + 3 + 6, doc.val, "Second update value in doc_a");

      done();
    })
  })
},

] // TESTS
