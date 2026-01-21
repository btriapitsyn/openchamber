#!/bin/bash
TUNNEL_PROVIDER="${1:-cloudflare}"
TIMEOUT_MINUTES="${2:-300}"
URL_WEB="${3:-}"
URL_CHAMBER="${4:-}"
URL_TTY="${5:-}"
OPENCHAMBER_UI_PASSWORD="${OPENCHAMBER_UI_PASSWORD:-}"

START_TIME=$(date +%s)
TIMEOUT_SECONDS=$((TIMEOUT_MINUTES * 60))

echo "=========================================="
echo "Opencode Web (Official): $URL_WEB"
echo "OpenChamber (Web UI):    $URL_CHAMBER"
echo "Opencode Core (WiTTY):   $URL_TTY"
echo "=========================================="

while true; do
    ELAPSED=$(($(date +%s) - START_TIME))
    REMAINING=$((TIMEOUT_SECONDS - ELAPSED))
    [ $REMAINING -le 0 ] && echo "Timeout reached." && exit 0

    # Print status every 5 mins
    if [ $(( ELAPSED % 300 )) -lt 10 ]; then
         echo "[$(date)] Remaining: $(( REMAINING / 60 )) min."
         echo "  Web:     $URL_WEB"
         echo "  Chamber: $URL_CHAMBER"
         echo "  TTY:     $URL_TTY"
    fi

    # Check services (Ports 8080/9090/3000) and restart if missing
    lsof -i :8080 > /dev/null 2>&1 || nohup opencode web --port 8080 >> opencode.log 2>&1 &
    if [ -n "${OPENCHAMBER_UI_PASSWORD:-}" ]; then
        lsof -i :9090 > /dev/null 2>&1 || nohup openchamber --port 9090 --ui-password "$OPENCHAMBER_UI_PASSWORD" >> openchamber.log 2>&1 &
    else
        lsof -i :9090 > /dev/null 2>&1 || nohup openchamber --port 9090 >> openchamber.log 2>&1 &
    fi
    lsof -i :3000 > /dev/null 2>&1 || nohup wetty --port 3000 --base / --command opencode >> wetty.log 2>&1 &

    sleep 10
done
