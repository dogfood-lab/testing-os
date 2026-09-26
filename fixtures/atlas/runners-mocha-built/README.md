# runners-mocha-built

An Atlas fixture for Mocha run over a compiled test tree: the test script
compiles src/ and test/ with tsconfig.test.json into dist-test/ and hands
Mocha a glob over dist-test, with a setup file it requires first. The two
specs Mocha runs are test/unit/*.test.ts, the sources of the built files;
the required setup file is not a test. codecomfy-vscode runs its tests
this way.
