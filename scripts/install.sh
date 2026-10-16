#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local/npm-cache .local/pip-cache
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install --cache-dir .local/pip-cache -r requirements.lock.txt
npm ci --cache .local/npm-cache --no-audit --no-fund
npm run build
