import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function artifactDir() {
  return process.env.ROOTS_ARTIFACT_DIR ?? join(homedir(), '.roots', 'artifacts');
}

export function writeArtifact(name) {
  writeFileSync(join(artifactDir(), name), '{}\n');
}
