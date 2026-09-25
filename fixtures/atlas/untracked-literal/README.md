# untracked-literal

An Atlas fixture for writes to a literal place the repository ignores, the
shape asset-forge's export example has. examples/export_all.rs makes
output/ and writes a file per name under it, and scripts/report.mjs, which
CI runs, makes reports/ and writes a file named at run time under it;
.gitignore ignores both. Each is a place, output nobody keeps, never a path
built at run time. scripts/state.mjs makes a directory under the home
directory or, failing that, under ".", and writes under an absolute Windows
path: neither is a place of this repository. scripts/db.mjs makes the
directory above the database a parameter names, a file the map names as a
place, never as a directory.
