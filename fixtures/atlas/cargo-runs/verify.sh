#!/usr/bin/env bash
set -euo pipefail
cargo test
cargo build --release
./target/release/tally --version
