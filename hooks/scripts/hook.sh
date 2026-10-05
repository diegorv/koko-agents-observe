#!/bin/bash
# Fast hook wrapper — reads stdin, backgrounds the node CLI, exits immediately.
# Claude Code hooks block until the command exits. By backgrounding node and
# redirecting all file descriptors, bash exits in ~2-5ms instead of ~50-100ms.
#
# Guard: if node is missing or the CLI script is unreadable, drain stdin, leave
# a breadcrumb in a fixed log file (this wrapper can't read config.mjs without
# node), and still exit 0 so Claude Code is never blocked by the hook.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$SCRIPT_DIR/observe_cli.mjs"
LOG_FILE="$HOME/.koko-agents-observe/logs/hook.log"

fail() {
  cat > /dev/null
  {
    mkdir -p "$(dirname "$LOG_FILE")"
    printf '[%s] hook.sh: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG_FILE"
  } 2> /dev/null
  exit 0
}

command -v node > /dev/null 2>&1 || fail "node not found in PATH"
[ -r "$CLI" ] || fail "observe_cli.mjs missing or unreadable at $CLI"

input=$(cat)
echo "$input" | node "$CLI" hook > /dev/null 2>&1 &
exit 0
