import { check, load } from '../lib/steps.js';

export function other() {
  load();
  check();
}

export function publish() {
  load();
}
