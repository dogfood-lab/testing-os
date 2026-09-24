# cargo-widest-test

An Atlas fixture for where to start reading a Rust workspace whose CI runs
only its tests and that installs nothing, the shape asset-forge has. hull's
caps.rs holds a unit test and reaches schema; testkit's integration test
tests/family.rs reaches hull, export and schema. The path starts at the
integration test, which reaches the most parts.
