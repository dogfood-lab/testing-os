import { alpha } from '../lib/alpha.js';
import { beta } from '../lib/beta.js';
import { gamma } from '../lib/gamma.js';

export function main(argv) {
  const input = gamma(argv);
  alpha(input);
  return beta(input);
}

main(process.argv.slice(2));
