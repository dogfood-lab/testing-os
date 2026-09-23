import { writeFileSync } from 'node:fs';

export function exportAll(args, opts) {
  writeFileSync(args.out, '{}\n');
  writeFileSync(opts.target ?? 'data/keep.json', '{}\n');
}
