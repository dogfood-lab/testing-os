#!/usr/bin/env node
import { readFileSync } from 'node:fs';

function load(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`cannot read ${path}`);
  }
}

console.log(load(process.argv[2] ?? 'package.json').length);
