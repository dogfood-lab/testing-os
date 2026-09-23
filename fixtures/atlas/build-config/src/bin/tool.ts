import { greet } from '../index.js';

process.stdout.write(`${greet(process.argv[2] ?? 'world')}\n`);
