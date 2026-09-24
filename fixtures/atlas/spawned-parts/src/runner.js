import { spawn } from 'node:child_process';

export function runJob(pythonPath) {
  return spawn(pythonPath, ['-m', 'jobs', '--once'], { stdio: 'inherit' });
}
