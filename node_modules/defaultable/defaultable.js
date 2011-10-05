// Defaultable APIs
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

module.exports = defaultable;

function defaultable(initial_defs, definer) {
  if(typeof initial_defs == 'function' && typeof definer != 'function') {
    var args = Array.prototype.slice.call(arguments);
    definer      = args[0];
    initial_defs = args[1];
  }

  if(typeof initial_defs == 'undefined')
    initial_defs = {};

  if(!initial_defs || Array.isArray(initial_defs) || typeof initial_defs != 'object')
    throw new Error('Defaults must be an object');

  if(!definer && typeof initial_defs === 'function') {
    definer = initial_defs;
    initial_defs = {};
  }

  var defaulter = make_defaulter({});
  return defaulter(initial_defs);

  function make_defaulter(old_defs) {
    return defaulter;

    function defaulter(new_defs) {
      new_defs = new_defs || {};

      for (var key in old_defs)
        if(! (key in new_defs))
          new_defs[key] = old_defs[key];

      var faux_exports = {};
      var faux_module = {"exports":faux_exports};

      definer(faux_module, faux_exports, new_defs);

      var api = faux_module.exports;
      api.defaults = make_defaulter(new_defs);

      return api;
    }
  }
}
