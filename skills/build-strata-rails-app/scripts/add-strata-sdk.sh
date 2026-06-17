#!/usr/bin/env sh
#
# add-strata-sdk.sh — install the Strata Government Digital Services SDK.
# Run from INSIDE the <APP_NAME>/ directory.
#
# Appends the Strata gem lines to the Gemfile, runs the bundle (via make build),
# then re-runs lint and test to confirm nothing broke.
#
# Markers the skill watches for:
#   SDK_ALREADY_PRESENT — Gemfile already references the strata gem; nothing to do
#   SDK_FAILED <step>   — the named step failed
#   SDK_OK              — gem added, bundle + lint + test green

set -u

if [ ! -f Gemfile ]; then
  echo "SDK_FAILED: no Gemfile in $(pwd) — are you inside the app directory?"
  exit 1
fi

# 1. Idempotency guard -------------------------------------------------------
if grep -q 'gem "strata"' Gemfile; then
  echo "SDK_ALREADY_PRESENT"
  exit 0
fi

# 2. Append the Strata gem block ---------------------------------------------
cat >> Gemfile <<'EOF'

# Strata Government Digital Services SDK Rails engine
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git"

# Strata gem only requires validates_timeliness version 7 for Rails 7 which is the minimum Strata Rails version.
gem "validates_timeliness", "~> 8.0"
EOF
echo "SDK: appended strata gem lines to Gemfile"

# 3. Bundle + re-verify ------------------------------------------------------
for target in "build" "lint" "test"; do
  echo "=== make $target ==="
  if ! make "$target"; then
    echo "SDK_FAILED: $target"
    exit 1
  fi
done

echo "SDK_OK"
exit 0
