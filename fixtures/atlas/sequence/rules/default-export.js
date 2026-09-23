import { check, load } from '../lib/steps.js';

export function main() {
  load();
  check();
}

export default function build() {
  load();
}
