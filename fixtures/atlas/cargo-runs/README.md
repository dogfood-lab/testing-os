# cargo-runs

An Atlas fixture for what cargo runs and what it only checks, the shapes
saints-mile, asset-forge and commandui have. The root package is also the
workspace, with a member crate; each holds unit tests in a #[cfg(test)]
module, and the root package has an integration test. CI checks, lints,
formats and tests the workspace and builds one package; verify.sh tests
and then runs the built binary by its path. The release runs one binary
by name and publishes the member crate. The desktop workflow builds a
Tauri app through its package script, whose beforeBuildCommand builds the
web half first.
