import { run } from '../engine/index.js';

export function main(argv) {
  return run(argv);
}

main(process.argv.slice(2));
