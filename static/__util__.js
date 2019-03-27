const Data = Symbol('data');
let id_counter = 0;

export function id(prefix) {
  return (prefix || '') + (++id_counter);
}

const prototype = {
  toJSON: function() { return toJSON(this); }
};

export function proto(ctr) {
  if (ctr) {
    var p = (ctr.prototype = Object.create(prototype));
    p.constructor = ctr;
    return p;
  } else {
    return prototype;
  }
}

export function assign(target, ...sources) {
  if (sources.length === 1 && Array.isArray(sources[0])) {
    target[Data] = sources[0];
  } else {
    sources.forEach(s => {
      Object.assign(target[Data], isObject(s) && s[Data] || s)
    });
  }
  return target;
}

export function flat(value) {
  return Array.isArray(value) ? [].concat(...value) : value;
}

export function get(obj, name) {
  return obj[Data][name];
}

export function set(obj, name, value) {
  obj[Data][name] = object(value);
}

export function copy(obj) {
  const mod = Object.create(Object.getPrototypeOf(obj));
  Object.assign(mod, obj);
  mod[Data] = Object.assign({}, obj[Data]);
  return mod;
}

export function init(obj, value) {
  obj[Data] = value || {};
}

function recurse(d, flag) {
  return d && d.toJSON ? d.toJSON(flag) : toJSON(d, flag);
}

function toJSON(value, flag) {
  if (isArray(value)) {
    return value.map(d => recurse(d, flag));
  } else if (isObject(value)) {
    const data = value[Data] || value;
    return isArray(data)
      ? recurse(data, flag)
      : Object.keys(data).reduce((_, k) => {
          _[k] = recurse(data[k], flag);
          return _;
        }, {});
  } else {
    return value;
  }
}

function object(value) {
  return (isObject(value) && !value[Data]) ? {[Data]: value || {}} : value;
}

export function merge(flag, ...values) {
  const objects = toJSON([].concat(...values), flag);
  return object(Object.assign({}, ...objects));
}

// -- type checkers --

export const isArray = Array.isArray;

export function isBoolean(_) {
  return typeof _ === 'boolean';
}

export function isNumber(_) {
  return typeof _ === 'number';
}

export function isObject(_) {
  return _ === Object(_) && !isArray(_);
}

export function isString(_) {
  return typeof _ === 'string';
}
