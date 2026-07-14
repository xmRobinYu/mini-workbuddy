#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $0 -- <command...>" >&2
  exit 2
fi

if [[ "$1" == "--" ]]; then
  shift
fi

if [[ $# -eq 0 ]]; then
  echo "usage: $0 -- <command...>" >&2
  exit 2
fi

LOCK_DIR="${RALPH_RUNTIME_DIR:-${HOME}/logs/skillhub}"
CONFIG_FILE="${LOCK_DIR}/ralph-quality-config.json"
WAIT_LOG="${LOCK_DIR}/ralph-quality-lock.log"
QUALITY_WAIT_DIR="${LOCK_DIR}/ralph-quality-wait"
HAS_FLOCK=0

if command -v flock >/dev/null 2>&1; then
  HAS_FLOCK=1
fi

mkdir -p "${LOCK_DIR}"
mkdir -p "${QUALITY_WAIT_DIR}"

lock_try() {
  local fd="$1"
  if command -v flock >/dev/null 2>&1; then
    flock -n "${fd}"
    return $?
  fi

  python3 - "$fd" <<'PY'
import fcntl
import sys

fd = int(sys.argv[1])
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
    sys.exit(1)
sys.exit(0)
PY
}

max_slots="${RALPH_MAX_CONCURRENT_VALIDATIONS:-}"
if [[ -z "${max_slots}" && -f "${CONFIG_FILE}" ]]; then
  max_slots="$(
    python3 - <<'PY' "${CONFIG_FILE}" 2>/dev/null
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding="utf-8"))
    value = int(data.get("maxConcurrentValidations", 1))
except Exception:
    value = 1
print(value)
PY
  )"
fi

if [[ -z "${max_slots}" ]]; then
  max_slots=1
fi

if ! [[ "${max_slots}" =~ ^[0-9]+$ ]]; then
  max_slots=1
fi

if (( max_slots < 1 )); then
  max_slots=1
fi

chosen_slot=""
chosen_fd=""
chosen_lock_dir=""
echo "[$(date '+%F %T')] waiting for quality slot (max=${max_slots}): $*" >> "${WAIT_LOG}"

story_id="${RALPH_STORY_ID:-}"
wait_state_file=""
wait_total_before=0
wait_started_at="$(date +%s)"
wait_total=0
wait_seconds=0

if [[ -n "${story_id}" ]]; then
  safe_story_id="$(printf '%s' "${story_id}" | tr -c 'A-Za-z0-9._-' '_')"
  wait_state_file="${QUALITY_WAIT_DIR}/${safe_story_id}.json"
  if [[ -f "${wait_state_file}" ]]; then
    wait_total_before="$(
      python3 - <<'PY' "${wait_state_file}" 2>/dev/null
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding="utf-8"))
    value = int(data.get("totalWaitSeconds", 0))
except Exception:
    value = 0
print(value)
PY
    )"
  fi

  cat > "${wait_state_file}" <<JSON
{"storyId":"${story_id}","resource":"validation","waiting":true,"totalWaitSeconds":${wait_total_before},"currentWaitStartedAt":${wait_started_at},"updatedAt":${wait_started_at}}
JSON
fi

release_lock() {
  if [[ -n "${chosen_lock_dir}" && -d "${chosen_lock_dir}" ]]; then
    rm -f "${chosen_lock_dir}/pid" "${chosen_lock_dir}/command"
    rmdir "${chosen_lock_dir}" 2>/dev/null || true
  fi
}

clear_stale_lock() {
  local lock_dir="$1"
  local pid_file="${lock_dir}/pid"
  if [[ -f "${lock_dir}" ]]; then
    rm -f "${lock_dir}" 2>/dev/null || true
    return 0
  fi
  if [[ ! -d "${lock_dir}" ]]; then
    return 0
  fi
  if [[ ! -f "${pid_file}" ]]; then
    rm -rf "${lock_dir}" 2>/dev/null || true
    return 0
  fi
  local lock_pid
  lock_pid="$(cat "${pid_file}" 2>/dev/null || true)"
  if [[ -z "${lock_pid}" || ! "${lock_pid}" =~ ^[0-9]+$ ]]; then
    rm -rf "${lock_dir}" 2>/dev/null || true
    return 0
  fi
  if ! kill -0 "${lock_pid}" 2>/dev/null; then
    rm -rf "${lock_dir}" 2>/dev/null || true
  fi
}

trap release_lock EXIT

while [[ -z "${chosen_slot}" ]]; do
  for slot in $(seq 1 "${max_slots}"); do
    lock_file="${LOCK_DIR}/ralph-quality-slot-${slot}.lock"
    if command -v flock >/dev/null 2>&1; then
      if [[ -d "${lock_file}" ]]; then
        clear_stale_lock "${lock_file}"
      fi
      lock_target="${lock_file}"
      slot_fd=$((200 + slot))
      eval "exec ${slot_fd}>\"${lock_target}\""
      if flock -n "${slot_fd}"; then
        chosen_slot="${slot}"
        chosen_fd="${slot_fd}"
        break
      fi
      eval "exec ${slot_fd}>&-"
    else
      lock_dir="${lock_file}.d"
      clear_stale_lock "${lock_dir}"
      if mkdir "${lock_dir}" 2>/dev/null; then
        chosen_slot="${slot}"
        chosen_lock_dir="${lock_dir}"
        printf '%s\n' "$$" > "${lock_dir}/pid"
        printf '%s\n' "$*" > "${lock_dir}/command"
        break
      fi
    fi
  done
  if [[ -z "${chosen_slot}" ]]; then
    sleep 1
  fi
done

if [[ -n "${wait_state_file}" ]]; then
  acquired_at="$(date +%s)"
  wait_seconds=$(( acquired_at - wait_started_at ))
  if (( wait_seconds < 0 )); then
    wait_seconds=0
  fi
  wait_total=$(( wait_total_before + wait_seconds ))
  cat > "${wait_state_file}" <<JSON
{"storyId":"${story_id}","resource":"validation","waiting":false,"totalWaitSeconds":${wait_total},"lastWaitSeconds":${wait_seconds},"lastAcquiredAt":${acquired_at},"slot":${chosen_slot},"updatedAt":${acquired_at}}
JSON
fi

echo "[$(date '+%F %T')] acquired quality slot ${chosen_slot}/${max_slots}: $*" >> "${WAIT_LOG}"

set +e
"$@"
status=$?
set -e

echo "[$(date '+%F %T')] released quality slot ${chosen_slot}/${max_slots} (exit=${status}): $*" >> "${WAIT_LOG}"
if [[ -n "${wait_state_file}" ]]; then
  released_at="$(date +%s)"
  cat > "${wait_state_file}" <<JSON
{"storyId":"${story_id}","resource":"validation","waiting":false,"totalWaitSeconds":${wait_total:-$wait_total_before},"lastWaitSeconds":${wait_seconds:-0},"lastReleasedAt":${released_at},"slot":${chosen_slot},"updatedAt":${released_at}}
JSON
fi
if [[ -n "${chosen_fd}" ]]; then
  eval "exec ${chosen_fd}>&-"
fi
if [[ -n "${chosen_lock_dir}" ]]; then
  rmdir "${chosen_lock_dir}" 2>/dev/null || true
fi
exit "${status}"
