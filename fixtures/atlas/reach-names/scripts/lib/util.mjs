export function check(name) {
  if (!/^[a-z]+$/.test(name)) throw new Error(`not a name: ${name}`);
  return name;
}
