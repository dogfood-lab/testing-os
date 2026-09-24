import { verify } from '../lib/verify.js';
import { persist } from './persist.js';

export function run() {
  persist(verify({}));
}
