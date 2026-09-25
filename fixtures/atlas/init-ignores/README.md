# init-ignores

Two repositories atlas init adopts. extension/ is a VS Code extension with a
.vscodeignore and a .npmignore and no files list, and runs prettier --check .;
init must keep atlas/ out of the VSIX, the npm package and prettier's check.
listed/ declares files in its manifest, so its .npmignore decides nothing and
is left alone, and it has no prettier. cli2/ checks its Markdown with
markdownlint-cli2, whose config's ignores must gain atlas/; mdlint/ runs
markdownlint-cli from a workflow, which reads .markdownlintignore.
