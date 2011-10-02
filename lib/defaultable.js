exports.defaults = make_defaults;
function make_defaults(defs) {
  defs = defs || {};
  var DEFAULT = {};

  CONSTRUCTOR_KEYS.forEach(function(key) {
    DEFAULT[key] = (key in defs) ? defs[key] || })
  var DEFAULT = { retries : ('retries'  in defs) ? defs.retries  : 5
                , pristine: ('pristine' in defs) ? defs.pristine : false
                };
