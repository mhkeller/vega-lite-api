import {emitter, error, stringValue as $, isString, isObject} from './util';

export function generateMethod(schema, methodName, spec) {
  const emit = emitter('__util__'),
        className = '_' + methodName,
        ext = spec.ext || {};

  // -- constructor --
  generateConstructor(emit, className, spec.set, spec.arg);

  // -- prototype --
  emit.import('proto');
  emit('// eslint-disable-next-line no-unused-vars');
  emit(`const prototype = proto(${className});\n`);

  // -- properties --
  for (let prop in schema) {
    if (ext.hasOwnProperty(prop)) continue; // skip if extension defined
    const mod = schema[prop].type === 'array' ? '...' : '';
    generateProperty(emit, prop, prop, mod);
  }

  // -- extensions --
  for (let prop in ext) {
    if (ext[prop] == null) continue; // skip if null
    generateExtension(emit, prop, ext[prop]);
  }

  // -- pass --
  for (let prop in spec.pass) {
    if (spec.pass[prop] == null) continue; // skip if null
    generatePass(emit, prop, spec.pass[prop]);
  }

  // -- call --
  for (let prop in spec.call) {
    if (spec.call[prop] == null) continue; // skip if null
    generateCall(emit, prop, spec.call[prop]);
  }

  // -- key --
  if (spec.key) {
    generateToJSON(emit, spec.key);
  }

  // -- exports --
  emit(`export function ${methodName}(...args) {`);
  emit(`  return new ${className}(...args);`);
  emit(`}`);

  // emit(`import {assign, copy, id, init, flat, get, merge, proto, set} from "./__util__";`);
  // collectImports(emit, spec.pass);
  // collectImports(emit, spec.call);
  return emit.code();
}

function generateConstructor(emit, className, set, arg) {
  emit(`function ${className}(...args) {`);

  // init data object
  emit.import('init');
  emit(`  init(this);`);

  // handle set values
  for (let prop in set) {
    emit.import('set');
    emit(`  set(this, ${$(prop)}, ${$(set[prop])});`);
  }

  // handle argument values
  if (Array.isArray(arg)) {
    // use provided argument definitions
    for (let i=0, n=arg.length; i<n; ++i) {
      const _ = arg[i];
      if (Array.isArray(_)) { // include a default value
        emit.import('set');
        emit(`  set(this, ${$(_[0])}, args[${i}] !== undefined ? args[${i}] : ${_[1]});`);
      } else if (_.startsWith(':::')) { // merge object arguments
        if (i !== 0) error('Illegal argument definition.');
        emit.import(['get', 'set', 'merge']);
        emit(`  set(this, ${$(_.slice(3))}, merge(0, get(this, ${$(_.slice(3))}), args));`);
        break;
      } else if (_.startsWith('...')) { // array value from arguments
        if (i !== 0) error('Illegal argument definition.');
        emit.import(['set', 'flat']);
        emit(`  set(this, ${$(_.slice(3))}, flat(args));`);
        break;
      } else if (_.startsWith('^_')) { // internal state, autogenerate id
        emit.import('id');
        emit(`  this[${$(_.slice(1))}] = args[${i}] !== undefined ? args[${i}] : id(${$(_.slice(2))});`);
      } else if (_.startsWith('_')) { // internal state
        emit(`  if (args[${i}] !== undefined) this[${$(_)}] = args[${i}];`);
      } else { // set value if not undefined
        emit.import('set');
        emit(`  if (args[${i}] !== undefined) set(this, ${$(_)}, args[${i}]);`);
      }
    }
  } else {
    // otherwise, accept property value objects
    emit.import('assign');
    emit(`  assign(this, ...args);`);
  }

  emit(`}`);
  emit();
}

function generateExtension(emit, prop, val) {
  if (val.arg && val.arg.length > 1) {
    error('Extension method must take 0-1 named arguments');
  }

  const arg = val.arg && val.arg[0],
        set = generateMutations('obj', val.set);

  !arg // zero-argument generator
      ? generateCopy(emit, prop, set)
    : arg.startsWith(':::') // merge object arguments
      ? generateMergedProperty(emit, prop, arg.slice(3), val.flag, set)
    : arg.startsWith('+++') // merge object arguments and accrete
      ? generateAccretiveProperty(emit, prop, arg.slice(3), val.flag, set)
    : arg.startsWith('...') // array value from arguments
      ? generateProperty(emit, prop, arg.slice(3), '...', set)
    : generateProperty(emit, prop, arg, '', set); // standard value argument
}

function generateMutations(obj, values) {
  let code = [];
  for (let prop in values) {
    code.push(`set(${obj}, ${$(prop)}, ${$(values[prop])});`);
  }
  return code;
}

function generateCopy(emit, method, set) {
  emit.import('copy');
  if (set) emit.import('set');

  emit(`prototype.${method} = function() {`);
  emit(`  const obj = copy(this);`);
  if (set) set.forEach(v => emit('  ' + v));
  emit(`  return obj;`);
  emit(`};`);
  emit();
}

function generateProperty(emit, method, prop, mod, set) {
  emit.import(['copy', 'get', 'set']);
  if (mod) emit.import('flat');

  let val = mod ? 'flat(value)' : 'value';

  emit(`prototype.${method} = function(${mod || ''}value) {`);
  emit(`  if (arguments.length) {`);
  emit(`    const obj = copy(this);`);
  emit(`    set(obj, ${$(prop)}, ${val});`);
  if (set) set.forEach(v => emit('    ' + v));
  emit(`    return obj;`);
  emit(`  } else {`);
  emit(`    return get(this, ${$(prop)});`);
  emit(`  }`);
  emit(`};`);
  emit();
}

function generateMergedProperty(emit, method, prop, flag, set) {
  emit.import(['copy', 'get', 'merge', 'set']);

  emit(`prototype.${method} = function(...values) {`);
  emit(`  if (arguments.length) {`);
  emit(`    const obj = copy(this);`);
  emit(`    set(obj, ${$(prop)}, merge(${flag}, values));`);
  if (set) set.forEach(v => emit('    ' + v));
  emit(`    return obj;`);
  emit(`  } else {`);
  emit(`    return get(this, ${$(prop)});`);
  emit(`  }`);
  emit(`};`);
  emit();
}

function generateAccretiveProperty(emit, method, prop, flag, set) {
  emit.import(['copy', 'get', 'merge', 'set']);

  emit(`prototype.${method} = function(...values) {`);
  emit(`  if (arguments.length) {`);
  emit(`    const val = get(this, ${$(prop)}) || [];`);
  emit(`    const obj = copy(this);`);
  emit(`    set(obj, ${$(prop)}, [].concat(val, merge(${flag}, values)));`);
  if (set) set.forEach(v => emit('    ' + v));
  emit(`    return obj;`);
  emit(`  } else {`);
  emit(`    return get(this, ${$(prop)});`);
  emit(`  }`);
  emit(`};`);
  emit();
}

function generatePass(emit, method, opt) {
  emit.import(opt.call, opt.from || opt.call);
  if (!opt.self) emit.import(['assign']);

  emit(`prototype.${method} = function(...values) {`);
  if (opt.args) emit(`  values = values.slice(0, ${opt.args});`);
  emit(`  const obj = ${opt.call}(...values);`);
  opt.self
    ? emit(`  return obj.${opt.self}(this);`)
    : emit(`  return assign(obj, this);`);
  emit(`};`);
  emit();
}

function generateCall(emit, method, opt) {
  emit.import(opt.call, opt.from || opt.call);

  emit(`prototype.${method} = function(...values) {`);
  if (opt.args) emit(`  values = values.slice(0, ${opt.args});`);
  emit(`  return ${opt.call}.apply(this, values);`);
  emit(`};`);
  emit();
}

function generateToJSON(emit, key) {
  emit.import('proto');

  if (Array.isArray(key)) {
    emit(`prototype.toJSON = function(flag) {`);
    emit(`  return flag`);
    emit(`    ? ${generateJSON(key[1])}`);
    emit(`    : ${generateJSON(key[0])};`);
  } else {
    emit(`prototype.toJSON = function() {`);
    emit(`  return ${generateJSON(key)};`);
  }
  emit(`};`);
  emit();
}

function generateJSON(key) {
  if (isObject(key)) {
    let c = [];
    for (let k in key) {
      let v = key[k];
      v = v.startsWith('_') ? `this[${$(v)}]` : v;
      c.push(`${k}: ${v}`);
    }
    return `{${c.join(', ')}}`;
  } else if (isString(key)) {
    const k = key.startsWith('_') ? `[this[${$(key)}]]` : key;
    return `{${k}: proto().toJSON.call(this)}`;
  } else {
    return `proto().toJSON.call(this)`;
  }
}
