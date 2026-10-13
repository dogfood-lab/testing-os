import { readFileSync } from 'node:fs';

// Reads beside itself by a relative path, as ai-jam-sessions'
// test_tools_local.py opens app.py: it runs from its own folder.
const notes = JSON.parse(readFileSync('notes.json', 'utf8'));
if (notes.length === 0) process.exit(1);
