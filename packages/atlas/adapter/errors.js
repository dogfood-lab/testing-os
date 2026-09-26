/** Stable codes. The handbook is generated from this table; keep each value one sentence. */
export const ERRORS = {
  ATLAS_BOUNDARY_FILE_INVALID: 'The boundary file is not valid.',
  ATLAS_INIT_WOULD_OVERWRITE: 'Init will not overwrite a boundary file.',
  ATLAS_NO_BOUNDARY_FILE: 'There is no boundary file to map.',
  ATLAS_NOT_MAPPED: 'The structural artifact has not been written.',
  ATLAS_STATISTICS_UNDATED: 'A statistical section has no date.',
  ATLAS_STRUCTURE_DRIFT: 'The committed structural map does not match this tree.',
  ATLAS_OVERLAP: 'A file belongs to more than one boundary.',
  ATLAS_BOUNDARY_EMPTY: 'A boundary matches no files.',
  ATLAS_UNASSIGNED_NEW: 'A tracked file is unassigned and was not unassigned before.',
  ATLAS_FILE_MOVED: 'A tracked file changed boundary.',
  ATLAS_EXPLAIN_NO_MAP: 'There is no committed map to explain from.',
  ATLAS_EXPLAIN_UNKNOWN_PATH: 'The path is not in the committed map.',
  ATLAS_DIFF_NO_BASE: 'The base ref carries no map.',
  ATLAS_SIDECAR_NOT_A_REPOSITORY: 'The directory the sidecar answers for is not in a git repository.',
  ATLAS_SIDECAR_NO_MAP: 'The repository has no map.',
  ATLAS_SIDECAR_MAP_UNREADABLE: 'The map is not valid JSON.',
  ATLAS_SIDECAR_MAP_FORMAT: 'The map is not in a format this engine reads.',
  ATLAS_SIDECAR_MAP_FOREIGN: "The map names a commit that is not in this checkout's history.",
  ATLAS_SIDECAR_INVALID_ARGUMENTS: 'The tool was called with arguments it does not take.',
  ATLAS_SIDECAR_CACHE_INSIDE: 'The refresh cache would be inside the repository.',
  ATLAS_SIDECAR_REFRESH_FAILED: 'The refresh could not map the checkout.',
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
