import { banner } from './banner.js';
import { load } from './load.js';
import { run } from './run.js';

export function main(argv) {
  banner();
  const input = load(argv);
  return run(input);
}

main(process.argv.slice(2));
