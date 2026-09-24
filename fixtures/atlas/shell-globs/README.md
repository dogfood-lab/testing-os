# shell-globs

An Atlas fixture for a glob in an npm script that the shell expands before
the test runner sees it, the shape stillpoint and repo-dataset use. The root
package's test script is node --test src/**/*.test.js, unquoted: sh expands
** as one directory level, so on Linux it runs src/deep/b.test.js and none of
the other three. tools/ quotes its glob, so node expands it and runs both of
its tests. CI runs on ubuntu-latest; Matrix runs on Linux and Windows, where
npm hands the script to cmd, which expands nothing.
