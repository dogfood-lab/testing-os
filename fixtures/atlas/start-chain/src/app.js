import pkg from '../package.json';
import { save } from './store.js';

export function run() {
  save({ name: pkg.name });
}
