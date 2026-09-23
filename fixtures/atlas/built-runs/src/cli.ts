import { check } from './check.js';

process.exitCode = check(process.argv.slice(2)) ? 0 : 1;
