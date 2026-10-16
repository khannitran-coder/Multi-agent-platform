#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ] || [ ! -d node_modules ]; then
  echo 'Run bash scripts/install.sh first.' >&2
  exit 1
fi
npm run build
exec .venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port "${PORT:-8000}"
