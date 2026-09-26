import { check } from './lib/util.mjs';

export function generate(args) {
  if (args.length === 0) throw new Error('gen needs a name');
  return check(args[0]);
}

generate(process.argv.slice(2));
