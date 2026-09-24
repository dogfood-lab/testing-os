# start-door

Atlas fixtures for "Where to start", one repository per directory. In
release/ the widest door is a release, and the pull request runs a gate
script and the core package's tests; the path starts from the pull request's
door, passes over the tests and the helper script, and begins at the entry of
the package the pull request reaches. In tie/ a deploy and CI each reach one
part, and the page says which it follows and why.
