import fs from 'node:fs';
import path from 'node:path';

// A new starter is a new directory beside the others: the name is only known
// at run time, so the path stops partway through it.
export function createStarter(name: string) {
  const targetDir = path.resolve(`packages/starter-${name}`);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join('packages', name, 'package.json'), '{}\n');
}
