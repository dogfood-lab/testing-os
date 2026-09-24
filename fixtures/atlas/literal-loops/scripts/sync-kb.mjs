import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT_DIR = path.join(REPO, 'src', 'kb');

const built = { presets: [], nodes: [] };
const targets = [
  { file: path.join(OUT_DIR, 'presets.json'), data: built.presets },
  { file: path.join(OUT_DIR, 'nodes.json'), data: built.nodes },
];
for (const { file, data } of targets) {
  const next = JSON.stringify(data, null, 2);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === next) continue;
  fs.writeFileSync(file, next);
}
