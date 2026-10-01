import { score } from './score.js';

export function run(input) {
  return input.names.map(score);
}
