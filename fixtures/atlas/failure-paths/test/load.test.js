import { loadConfig } from '../src/load.js';

try {
  loadConfig('missing.json');
} catch {
  // expected
}
