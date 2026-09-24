# tauri-ci-start

An Atlas fixture for where to start reading a CI that builds a Tauri app's
web half and only checks and unit-tests its Rust half, the shape
xrpl-creator-capsule has. CI runs a bundling script by name that imports
nothing, builds the web half with vite, runs cargo check on the crate, and
runs cargo test, which runs the unit tests the library and one command
module hold. Its boundary file keeps the crate a part of its own; the test
also maps it as one part with the library's tests taken out, the shape
capsule has.
