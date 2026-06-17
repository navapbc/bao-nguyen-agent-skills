#!/usr/bin/env sh
#
# preflight.sh — environment checks for scaffolding a Strata Rails app.
# Folds the old "check/install CLI" and "check Docker / Postgres port / git" steps.
#
# Prints labeled status lines. On a condition the user must resolve, prints a
# NEEDS_* marker and exits non-zero so the calling skill can stop and ask.
# On full success prints PREFLIGHT_OK and exits 0.
#
# Markers the skill watches for:
#   NEEDS_UV         — nava-platform CLI missing and uv not installed
#   NEEDS_DOCKER     — Docker daemon not running
#   NEEDS_PORT_FREE  — port 5432 held by a process we won't auto-stop
#   PREFLIGHT_OK     — all checks passed

set -u

# 1. nava-platform CLI -------------------------------------------------------
if nava-platform --help >/dev/null 2>&1; then
  echo "CLI: nava-platform already installed"
else
  echo "CLI: nava-platform not found — attempting install via uv"
  if uv --version >/dev/null 2>&1; then
    if uv tool install git+https://github.com/navapbc/platform-cli; then
      if nava-platform --help >/dev/null 2>&1; then
        echo "CLI: nava-platform installed"
      else
        echo "NEEDS_UV: installed via uv but nava-platform still not on PATH (restart shell / check ~/.local/bin)"
        exit 1
      fi
    else
      echo "NEEDS_UV: 'uv tool install' failed — see output above"
      exit 1
    fi
  else
    echo "NEEDS_UV: uv is not installed. Install it (https://docs.astral.sh/uv/getting-started/installation/) then re-run."
    exit 1
  fi
fi

# 2. Docker daemon -----------------------------------------------------------
if docker ps >/dev/null 2>&1; then
  echo "DOCKER: daemon running"
else
  echo "NEEDS_DOCKER: Docker daemon not running — start Docker Desktop then re-run."
  exit 1
fi

# 3. Postgres port 5432 ------------------------------------------------------
PG_PIDS=$(lsof -iTCP:5432 -sTCP:LISTEN -t 2>/dev/null || true)
if [ -z "$PG_PIDS" ]; then
  echo "PORT: 5432 free"
else
  PG_CMD=$(lsof -iTCP:5432 -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1}')
  case "$PG_CMD" in
    com.docke* | docker | docker-proxy)
      echo "PORT: 5432 held by Docker ($PG_CMD) — stopping the container"
      CONTAINER=$(docker ps --filter "publish=5432" -q)
      if [ -n "$CONTAINER" ]; then
        docker stop $CONTAINER >/dev/null 2>&1
      fi
      # re-check
      if [ -n "$(lsof -iTCP:5432 -sTCP:LISTEN -t 2>/dev/null || true)" ]; then
        echo "NEEDS_PORT_FREE: docker container stopped but 5432 still busy"
        exit 1
      fi
      echo "PORT: 5432 freed"
      ;;
    postgres)
      echo "NEEDS_PORT_FREE: native postgres on 5432 — do NOT auto-stop. Ask user to stop it (e.g. 'brew services stop postgresql@16') then re-run."
      exit 1
      ;;
    *)
      echo "NEEDS_PORT_FREE: 5432 held by '${PG_CMD:-unknown}' — ask user to free the port then re-run."
      exit 1
      ;;
  esac
fi

# 4. git repository ----------------------------------------------------------
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "GIT: already inside a git repo"
else
  echo "GIT: not a repo — running git init"
  git init >/dev/null
  echo "GIT: initialized"
fi

echo "PREFLIGHT_OK"
exit 0
