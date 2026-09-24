import { status } from './git.js';
import { runJob } from './runner.js';

runJob(process.env.PYTHON ?? 'python3');
status(['status', '--short']);
