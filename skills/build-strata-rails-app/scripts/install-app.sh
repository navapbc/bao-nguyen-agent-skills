#!/usr/bin/env sh
#
# install-app.sh <APP_NAME> — validate the name, guard against an existing
# directory, and apply the Rails application template.
# Folds the old "check existing dir" and "apply template" steps.
#
# Markers the skill watches for:
#   INVALID_NAME       — name does not match ^[a-z0-9_-]+$
#   DIR_EXISTS         — a directory named <APP_NAME>/ already exists
#   INSTALL_OK <name>  — template applied successfully

set -u

APP_NAME="${1:-}"

if [ -z "$APP_NAME" ]; then
  echo "INVALID_NAME: no app name provided (usage: install-app.sh <APP_NAME>)"
  exit 1
fi

# 1. Validate name -----------------------------------------------------------
case "$APP_NAME" in
  *[!a-z0-9_-]*)
    echo "INVALID_NAME: '$APP_NAME' — use lowercase letters, digits, dashes, underscores only."
    exit 1
    ;;
esac

# 2. Existing-directory guard ------------------------------------------------
# Trailing slash forces directory resolution; ls exits non-zero if absent.
if ls -ld -- "$APP_NAME/" >/dev/null 2>&1; then
  echo "DIR_EXISTS: a directory named '$APP_NAME/' already exists — rename or remove it first."
  exit 1
fi

# 3. Apply the template ------------------------------------------------------
echo "INSTALL: applying Rails template into ./$APP_NAME"
if nava-platform app install \
    --template-uri https://github.com/navapbc/template-application-rails \
    --data app_local_port=3000 \
    . "$APP_NAME"; then
  echo "INSTALL_OK $APP_NAME"
  exit 0
else
  echo "INSTALL_FAILED: nava-platform app install failed — see output above."
  exit 1
fi
