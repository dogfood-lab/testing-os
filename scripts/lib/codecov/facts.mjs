import { mapRepository } from '../../../packages/atlas/core/index.js';
import { buildArtifact } from '../../../packages/atlas/adapter/artifact.js';
import { readBoundaryFile } from '../../../packages/atlas/adapter/boundary-file.js';

/**
 * What Atlas knows about a repository's CI that the rollout needs: each
 * workflow's triggers and the test runs its steps make, with the runner
 * behind each, and the repository's parts. Mapped fresh from the working
 * tree, so the facts are this engine's, whatever version the repository's
 * committed map was made with. A repository with no boundary file is mapped
 * as one part.
 *
 * @param {string} root a checkout
 * @returns {{ workflows: Array<{ file: string, triggers: object[], tests: object[] }>, boundaries: Array<{ name: string, globs: string[] }> | null }}
 */
export function atlasFacts(root) {
  const read = readBoundaryFile(root);
  const boundaries = read.ok ? read.boundaries.map(({ name, globs, role }) => ({ name, globs, role })) : [{ name: 'repository', globs: ['**'], role: 'code' }];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '');
  return {
    workflows: structure.doors
      .filter((door) => !door.kind && typeof door.file === 'string' && door.file.startsWith('.github/workflows/'))
      .map((door) => ({ file: door.file, triggers: door.triggers ?? [], tests: door.tests ?? [] })),
    boundaries: read.ok ? boundaries : null,
  };
}
