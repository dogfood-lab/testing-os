import fs from 'node:fs';
import path from 'node:path';

// A scratch file beside the test, named at run time and removed after.
const scratch = path.resolve(import.meta.dirname, `../_scratch-${process.pid}.json`);
fs.writeFileSync(scratch, '{}\n');
fs.rmSync(scratch);
