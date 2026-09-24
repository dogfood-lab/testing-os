# rust-tests

An Atlas fixture for how a Rust crate is tested, the shapes saints-mile and
asset-forge have. One crate is tested from its tests/ directory, which
imports it; one holds its only tests in a #[cfg(test)] module inside its
library, marked #[tokio::test] as a runtime's tests are; one has no test.
