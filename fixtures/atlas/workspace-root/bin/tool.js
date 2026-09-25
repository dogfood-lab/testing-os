#!/usr/bin/env node
import { run } from '../scripts/init.js';

run(process.argv[2] ?? 'demo');
