import * as steps from '../lib/steps.js';
import { check, load, save, wrap } from '../lib/steps.js';

export function main(options, provenance) {
  // save() in a comment is not a call
  const label = 'check() in a string is not a call';
  const handle = options.handle || check;
  load();
  load();
  wrap('schema', () => save(label));
  wrap(check, label);
  handle();
  provenance.confirm(label);
  provenance.get('key');
  [label].map((item) => item.run());
  steps.load();
  load();
}

export function eager() {
  save(load());
}
