#!/usr/bin/env bash
# The one green light: build every package, lint, typecheck, run every suite.
# Stops at the first failure. Prints "GATE GREEN" only when all of it passed.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm -r build
pnpm -r lint
pnpm -r typecheck
pnpm -r test
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then tree="tree clean"; else tree="tree dirty"; fi
echo "GATE GREEN at $(git rev-parse --short HEAD 2>/dev/null || echo 'no-commit') — ${tree}"
