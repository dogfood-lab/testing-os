export function gate(value) {
  if (typeof value !== 'number') throw new TypeError('gate takes a number');
  return value >= 0;
}
