import { greet } from '../src/core/engine.js';
import { handle } from '../src/api/server.js';

if (greet('a') !== 'HELLO A!') throw new Error('greet');
if (handle({ name: 'a' }).status !== 200) throw new Error('handle');
