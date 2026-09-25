# action-inputs

An Atlas fixture for a file handed to a local action as an input, the
shape accessibility-suite's a11y-gate job has: `uses:
./.github/actions/gate` `with: baseline: docs/baseline.json`, and the
action's step passes `--baseline ${{ inputs.baseline }}` on. Another job
writes the baseline by hand. The gate job reads the file, though its
workflow also writes it.
