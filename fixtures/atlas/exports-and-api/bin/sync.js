#!/usr/bin/env node
import { openIssue, openPull } from '../src/apply.js';
import { report } from '../src/own.js';

await openIssue('acme', process.argv[2], process.env.GITHUB_TOKEN);
await openPull(null, 'acme', process.argv[2]);
await report(null, { repo: { owner: 'acme', repo: 'this' } });
