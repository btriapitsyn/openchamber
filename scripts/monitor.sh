#!/bin/bash
TUNNEL_PROVIDER="${1:-cloudflare}"
TIMEOUT_MINUTES="${2:-300}"
INITIAL_URL="${3:-}"
START_TIME=$(date +%s)
TIMEOUT_SECONDS=$((TIMEOUT_MINUTES * 60))

echo "=========================================="
echo "OpenChamber is ready at: $INITIAL_URL"
echo "=========================================="

while true; do
    ELAPSED=$(($(date +%s) - START_TIME))
    REMAINING=$((TIMEOUT_SECONDS - ELAPSED))
    [ $REMAINING -le 0 ] && echo "Timeout reached." && exit 0

    # Print status every 5 mins
    if [ $(( ELAPSED % 300 )) -lt 10 ]; then
         echo "[$(date)] Remaining: $(( REMAINING / 60 )) min."
         echo "Connect at: $INITIAL_URL"
    fi

    # Check services (Ports 8080/9090) and restart if missing
    lsof -i :8080 > /dev/null 2>&1 || nohup opencode web --port 8080 >> opencode.log 2>&1 &
    lsof -i :9090 > /dev/null 2>&1 || nohup openchamber --port 9090 >> openchamber.log 2>&1 &

    sleep 10
done
