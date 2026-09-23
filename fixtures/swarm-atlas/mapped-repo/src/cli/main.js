import { handle } from '../api/server.js';

console.log(handle({ name: process.argv[2] ?? 'world' }).body);
