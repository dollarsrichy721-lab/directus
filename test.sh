#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

MODE=""
OUTPUT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output_path)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    base|new)
      MODE="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

run_tests() {
  local files="$1"
  if [[ -n "$OUTPUT_PATH" ]]; then
    pnpm -C api exec vitest run --reporter=junit --outputFile="$OUTPUT_PATH" $files
  else
    pnpm -C api exec vitest run $files
  fi
}

case "$MODE" in
  base)
    echo "[base] running existing tests"
    run_tests "src/logger/redact-query.test.ts src/logger/logs-stream.test.ts"
    ;;
  new)
    echo "[new] running new problem tests"
    run_tests "src/request-id-correlation.test.ts"
    ;;
  *)
    echo "usage: ./test.sh {base|new}"
    exit 1
    ;;
esac
