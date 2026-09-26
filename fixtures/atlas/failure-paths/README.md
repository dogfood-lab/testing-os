# failure-paths

An Atlas fixture for the error-handling constructs a file holds, each with
its kind, line and the function it sits in: a `catch` and a `throw` in
JavaScript, an `except` and a `raise` in Python, and an `Err` a Rust function
builds and one it matches. A test file's own constructs are not counted.
