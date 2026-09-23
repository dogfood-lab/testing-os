#!/usr/bin/env bash
# The verify stage a door runs: its commands are the door's too.
set -euo pipefail
python scripts/check.py
