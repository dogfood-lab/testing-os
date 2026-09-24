# cargo-start

An Atlas fixture for where to start reading a Rust command whose CI only
tests it, the shape saints-mile has. The binary calls into the library,
which holds unit tests in a #[cfg(test)] module and is tested from tests/;
CI runs cargo test on pull requests.
