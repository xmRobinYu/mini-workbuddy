#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-start}"

case "$ACTION" in
  start)
    agent="${RALPH_AGENT:-codex}"
    shift || true
    case "${1:-}" in
      claude|codex|opencode|atomcode)
        agent="$1"
        shift
        ;;
    esac

    model="${RALPH_MODEL:-}"
    if [[ -z "$model" && -n "${1:-}" && "${1:-}" != -* ]]; then
      model="$1"
      shift
    fi

    args=("$agent")
    if [[ -n "$model" ]]; then
      args+=("$model")
    fi
    args+=(--remote --detach --supervise)
    exec python3 "$SCRIPT_DIR/ralph.py" "${args[@]}" "$@"
    ;;
  stop)
    exec python3 "$SCRIPT_DIR/ralph.py" --stop
    ;;
  status)
    exec python3 "$SCRIPT_DIR/ralph.py" --status
    ;;
  *)
    echo "用法: $0 start [claude|codex|opencode|atomcode] [模型] [Ralph 参数]" >&2
    echo "      $0 {stop|status}" >&2
    exit 2
    ;;
esac
