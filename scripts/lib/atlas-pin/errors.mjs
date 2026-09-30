/**
 * The codes atlas-pin-bump answers with, in the org's error shape: a stable
 * code, a message naming what was found, and a hint naming what to do. A
 * usage error and a failure of the tool itself print one; a repository that
 * needs a person carries one for each reason. Keep each value one sentence.
 */
export const CODES = {
  PIN_BUMP_USAGE: 'The command line is not one the tool takes.',
  PIN_BUMP_FAILED: 'The tool failed on this clone.',
  PIN_BUMP_NOT_A_CLONE: 'The path is not the top of a git checkout.',
  PIN_BUMP_DIRTY_TREE: 'The working tree has uncommitted changes.',
  PIN_BUMP_NO_DEFAULT_BRANCH: 'The clone does not record which branch is the default.',
  PIN_BUMP_NOT_DEFAULT_BRANCH: 'The clone is not on its default branch.',
  PIN_BUMP_NO_MAP: 'The repository has no committed Atlas map.',
  PIN_BUMP_NO_CHECK_STEP: 'No workflow runs atlas check.',
  PIN_BUMP_UNREADABLE_FORM: 'A workflow uses Atlas in a form this tool does not move.',
  PIN_BUMP_NEWER_PIN: 'A workflow pins a newer Atlas than the target.',
  PIN_BUMP_NEWER_MAP: 'The map was made by a newer Atlas than the target.',
  PIN_BUMP_ENGINE_FAILED: 'The target engine could not make or check the map.',
  PIN_BUMP_ENGINE_MISMATCH: 'The new map was made by another engine than the target.',
  PIN_BUMP_NO_IDENTITY: 'Git has no identity to commit with in this clone.',
  PIN_BUMP_BRANCH_EXISTS: 'The pin branch exists and does not hold this change.',
  PIN_BUMP_COMMIT_FAILED: 'Git did not commit the change.',
  PIN_BUMP_COMMIT_DIFFERS: 'The commit holds another tree than the plan.',
  PIN_BUMP_PROOF_FAILED: 'atlas check failed on a clean clone of the branch.',
};

/**
 * @param {keyof typeof CODES} code
 * @param {string} message what was found, in this repository
 * @param {string} hint what a person does about it
 * @returns {{ code: string, message: string, hint: string }}
 */
export function problem(code, message, hint) {
  if (!(code in CODES)) throw new Error(`unknown atlas-pin-bump code ${code}`);
  return { code, message, hint };
}

/** One problem as the tool prints it, indented under its repository. */
export function formatProblem({ code, message, hint }, indent = '   ') {
  return `${indent}! ${code}  ${message}\n${indent}  hint: ${hint}\n`;
}
