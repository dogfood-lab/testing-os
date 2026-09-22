/** Stable codes. The handbook is generated from this table; keep each value one sentence. */
export const ERRORS = {
  ATLAS_BOUNDARY_FILE_INVALID: 'The boundary file is not valid.',
  ATLAS_NO_BOUNDARY_FILE: 'There is no boundary file to map.',
  ATLAS_NOT_MAPPED: 'The structural artifact has not been written.',
  ATLAS_STRUCTURE_DRIFT: 'The committed structural map does not match this tree.',
  ATLAS_OVERLAP: 'A file belongs to more than one boundary.',
  ATLAS_BOUNDARY_EMPTY: 'An accepted boundary matches no files.',
  ATLAS_UNASSIGNED_NEW: 'A tracked file is unassigned and was not unassigned before.',
  ATLAS_FILE_MOVED: 'A tracked file changed boundary.',
};

export function formatFailure(code, details, { exitCode = 1, whatToDo } = {}) {
  const sentence = ERRORS[code];
  const action = whatToDo ?? 'run atlas map and commit atlas/, or revert the change';
  const lines = [`${code}  ${sentence}`];
  if (details.length > 0) {
    lines.push(`  what changed:   ${details[0]}`);
    for (const extra of details.slice(1)) lines.push(`                  ${extra}`);
  } else {
    lines.push('  what changed:   (none listed)');
  }
  lines.push(`  what to do:     ${action}`);
  lines.push(`exit ${exitCode}`);
  return `${lines.join('\n')}\n`;
}
