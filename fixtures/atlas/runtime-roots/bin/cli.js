#!/usr/bin/env node
import { join } from 'node:path';
import { writeArtifact } from '../src/artifacts.js';
import { backup } from '../src/backup.js';
import { create } from '../src/new.js';
import { writeRecord } from '../src/records.js';
import { saveSession } from '../src/session.js';

const ROOT = join(import.meta.dirname, '..');
const args = { cwd: process.cwd(), output: process.argv[3] };
backup(process.cwd(), args.output);
create(args);
await saveSession({ savePath: args.output });
writeArtifact('run.json');
writeRecord({ id: 'run' }, ROOT);
