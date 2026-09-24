# bootstrap-writes

An Atlas fixture for writes that happen only when the file is absent, the
shape vocal-synth-engine's bench-gate.mjs uses. scripts/bench-gate.mjs writes
tests/__bench__/baseline.json only when it does not exist, and reads it
otherwise; scripts/seed.mjs writes data/seed.json in the catch of a try that
reads it; tools/prime.py writes data/prime.json after returning early when
it exists. Each file is committed, so CI reads it and writes none of them.
