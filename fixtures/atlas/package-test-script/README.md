# package-test-script

An Atlas fixture for a package tested only by its own test script, the
shape armature's npm launcher has: `launcher/package.json`'s `test` is
`node bin/tool.mjs --self-test`, and CI runs `npm test` in `launcher/`. No
test file imports the launcher, yet a workflow tests it, so the page says
how rather than that no test touches it.
