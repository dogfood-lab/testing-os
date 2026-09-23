export function load() {
  return {};
}

export function check() {
  return true;
}

export function save() {
  return true;
}

export function wrap(fn) {
  return typeof fn === 'function' ? fn() : fn;
}
