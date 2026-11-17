#!/usr/bin/env bash
# Runs Claude Code headlessly, one LOOP.md iteration per call, until a DONE file appears.
# Usage: ./run-loop.sh [max_iterations]
# Safety: --dangerously-skip-permissions lets Claude run any command without asking.
# Only use it inside a container/VM or a disposable machine. Otherwise remove that flag
# and use --permission-mode acceptEdits (it will still pause for shell commands).
set -euo pipefail
MAX=${1:-60}
mkdir -p logs
for i in $(seq 1 "$MAX"); do
  if [[ -f DONE ]]; then echo "DONE file found. Stopping."; break; fi
  echo "=== Iteration $i  $(date) ==="
  claude -p "Read CLAUDE.md, then do exactly ONE iteration of LOOP.md (orient, pick, plan, do, verify, record, commit). If a stop condition is met, create the DONE file." \
    --dangerously-skip-permissions \
    2>&1 | tee "logs/iter-$i.log"
  sleep 5
done
