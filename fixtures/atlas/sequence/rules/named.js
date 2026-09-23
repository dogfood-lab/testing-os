import { check, load, save } from '../lib/steps.js';

export function wide() {
  load();
  check();
  save();
}

export function run() {
  load();
}
