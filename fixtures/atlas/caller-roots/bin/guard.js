#!/usr/bin/env node
import { exportAll } from '../src/export.js';
import { saveEnv } from '../src/env.js';
import { record } from '../src/store.js';

const args = { out: process.argv[3] };
record('started');
exportAll(args, {});
saveEnv();
