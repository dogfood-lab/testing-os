# built-tests

An Atlas fixture for a test run of a build's output, the shape repo-dataset
uses: tsc compiles src/ into dist/, which is not tracked, and the test
script is node --test dist/tests/**/*.test.js. What runs is the source each
built file comes from. CI runs on Linux, where sh expands ** as one level
and so runs only the test one directory down; Windows runs on Windows, where
node expands the glob and runs both.
