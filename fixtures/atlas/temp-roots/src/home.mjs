import { homedir } from 'node:os';
import { join } from 'node:path';

export function jamHome() {
  return join(process.env.JAM_HOME ?? homedir(), '.jam');
}
