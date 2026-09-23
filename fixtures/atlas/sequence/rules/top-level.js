import { check, load, save } from '../lib/steps.js';

function main() {
  load();
  save();
}

export function wider() {
  load();
  check();
  save();
}

await main();
