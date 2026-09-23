# spawn-helpers

An Atlas fixture. scripts/gate.mjs hands each stage's command line to a
helper of its own, run(), which passes it to execSync, and one to sh(), a
helper in scripts/lib/sh.mjs that passes it to spawnSync with shell: true.
Two command lines name their script through join(ROOT, ...), one takes an
argument from the command line, and one comes from the environment.
