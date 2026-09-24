# rust-sequence

An Atlas fixture for the order of work in a Rust binary, the shape
saints-mile's main.rs has. main loads its settings from a module it
declares, prints usage and returns early when asked, builds the engine
from the library by a type it imports, runs a local function that
validates, then runs the engine through a module it imports, which records
telemetry through a path spelled from its crate root, and draws
through a function it imports. CI runs the binary.
