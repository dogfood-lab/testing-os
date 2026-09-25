# private-publish

An Atlas fixture for a publish npm refuses, the shape accessibility-suite
has: the root `package.json` is `"private": true`, and a workflow run by
hand still runs `npm publish` at the root. A private package is never
published, so the page says nothing publishes to npm.
