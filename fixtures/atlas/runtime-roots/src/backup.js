import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function backup(repoDir, outputDir) {
  const backupDir = join(outputDir, `backup-${Date.now()}`);
  mkdirSync(join(backupDir, 'canon'), { recursive: true });
  mkdirSync(join(repoDir, 'canon'), { recursive: true });
  copyFileSync(join(repoDir, 'canon', 'rules.md'), join(backupDir, 'canon', 'rules.md'));
}
