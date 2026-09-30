# start-steps

Atlas fixtures for the arrows of "Where to start", one repository per
directory. Every arrow is an import or a call of the file before it.

In siblings/ the command's entry, src/cli.js, calls three files of its own
part in turn: banner.js and load.js, which import nothing, and run.js, which
imports score.js. banner.js does not lead to load.js, so the path goes from
the entry through run.js to score.js, and banner.js and load.js are listed
beside the path as files the entry also calls.

In lazy/ a pull request runs the package with `python -m app`. Its
__main__.py calls describe() in flags.py, which imports nothing, and then
launch() in the package's __init__.py, whose body imports .ui only when it
runs. The path goes from __main__.py into __init__.py and on through that
lazy import to ui.py and the file it imports; flags.py is beside the path.

handed/ is lazy/ with launch handed out by the package's module
`__getattr__`, a function whose work this map does not record. The path
still goes from __main__.py into __init__.py, the file the call to launch
resolves to, never from flags.py, and on from __init__.py only by what it
imports, since no call into ui.py is recorded.

In library/ a Rust binary uses its own package's library, whose root
declares `commands`, which declares `plan`, the module that calls into
another crate. The path goes from lib.rs to commands/mod.rs and then to
commands/plan.rs, each a module the one before declares, never from lib.rs
straight to a module it does not declare. (The binary's step into its
library's root is the library edge, not an import.)
