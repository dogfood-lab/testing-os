#!/usr/bin/env bash
set -euo pipefail
version=$(cat VERSION)
tmp=$(mktemp)
sed "s/^version: .*/version: ${version}/" CITATION.cff > "${tmp}"
mv "${tmp}" CITATION.cff
echo "released ${version}" | tee -a notes/releases.md
python - <<'PY'
open("VERSION", "w").write("a here-document is another program")
PY
echo done > /dev/null 2>&1
