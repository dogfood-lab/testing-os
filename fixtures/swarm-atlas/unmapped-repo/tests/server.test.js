import { handle } from '../src/server.js';

if (handle({ name: 'a' }).status !== 200) throw new Error('handle');
