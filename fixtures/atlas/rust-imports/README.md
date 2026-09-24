# rust-imports

An Atlas fixture for how Rust names the code it uses, the shapes saints-mile
and commandui have. The game crate's binary declares a module in a mod.rs,
one in a file that owns a directory of its own, and one a #[path]
attribute places; it uses the core crate by the path its manifest gives it,
its own library by the package's name, a declared dependency, one no
manifest declares, and the standard library; it calls into modules by
paths spelled in code; and it includes a text file at compile time. A
widget reaches back up the tree with super::super.
