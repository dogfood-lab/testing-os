import { test } from 'node:test';
import { verify } from '../lib/verify.js';
import { render } from '../site/app.js';

test('end to end', () => render(verify({})));
