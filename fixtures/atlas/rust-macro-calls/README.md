# rust-macro-calls

An Atlas fixture for calls a Rust program makes inside a macro's
arguments, which the grammar leaves as tokens: main prints what
config::load() returns, asserts engine::run(), builds a vec of draw(), and
formats a method called on a value, which names nothing the reader can
follow.
