#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PID_FILE=".server.pid"
LOG_DIR="logs"

mkdir -p "$LOG_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
    echo "Server already running (PID: $(cat $PID_FILE))"
    exit 0
fi

nohup node server.js > "$LOG_DIR/server.log" 2>&1 &
echo $! > "$PID_FILE"
echo "Started server (PID: $!)"
