#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PID_FILE=".server.pid"
stopped=0

if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found"
else
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "Stopped server (PID: $PID)"
        stopped=1
    else
        echo "Process not running (stale PID file)"
    fi
    rm -f "$PID_FILE"
fi

fallback_pids=$(pgrep -f "node server.js" || true)
if [ -n "$fallback_pids" ]; then
    for pid in $fallback_pids; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            echo "Stopped server (PID: $pid)"
            stopped=1
        fi
    done
elif [ "$stopped" -eq 0 ]; then
    echo "No matching node process found"
fi
