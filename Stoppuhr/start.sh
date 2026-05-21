#!/bin/sh
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "Intervall-Timer: http://127.0.0.1:${PORT}/index.html"
echo "Beenden mit Strg+C"
exec python3 -m http.server "$PORT"
