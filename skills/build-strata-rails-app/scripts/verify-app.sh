#!/usr/bin/env sh
#
# verify-app.sh — prepare and verify the generated app.
# Run from INSIDE the <APP_NAME>/ directory.
# Folds the old "run make targets in order" step.
#
# Runs each make target in order, stops on the first failure.
#
# Markers the skill watches for:
#   VERIFY_FAILED <target> — the named make target failed
#   VERIFY_OK              — all targets passed

set -u

if [ ! -f Makefile ]; then
  echo "VERIFY_FAILED: no Makefile in $(pwd) — are you inside the app directory?"
  exit 1
fi

for target in ".env" "init-db" "build" "precompile-assets" "lint" "test"; do
  echo "=== make $target ==="
  if ! make "$target"; then
    echo "VERIFY_FAILED: $target"
    exit 1
  fi
done

echo "VERIFY_OK"
exit 0
