import { check, load, save, wrap } from '../lib/steps.js';

function helper() {
  check();
  save();
  wrap();
}

export function direct() {
  load();
  check();
  save();
}

export function spliced() {
  load();
  helper();
}
