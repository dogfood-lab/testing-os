#!/usr/bin/env node
if (process.argv.includes('--node-selftest')) {
  console.log('launcher ok');
} else {
  try {
    await import('node:child_process');
  } catch {
    throw new Error('launcher cannot start python');
  }
}
