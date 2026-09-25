# explain-manifest

An Atlas fixture for what `atlas explain` says a file imports, the shape
repo-knowledge's CLI has: src/cli.js reads its version with
require('../package.json') and imports src/run.js. The manifest is read,
so the file-level Imports line names only src/run.js, and the Reads line
names the manifest.
