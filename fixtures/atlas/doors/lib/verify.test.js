// A file whose test-shaped name is the point: it imports lib/verify.js, so
// the map counts one test reaching lib, and imports nothing in tools.
import { verify } from './verify.js';

export const subject = verify;
