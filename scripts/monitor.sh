#!/bin/bash
# ==============================================================================
# OpenCode Monitor & Self-Heal Script
# ==============================================================================
# This script monitors OpenCode (TTY), OpenChamber, and OpenCode Web services,
# automatically restarting them if they crash. It also manages the tunnel connections.
#
# Usage: ./monitor.sh <tunnel_provider> <timeout_minutes> <url_tty> <url_chamber> <url_web>
#
# Arguments:
#   tunnel_provider: "ngrok" or "cloudflare"
#   timeout_minutes: Auto-shutdown timeout in minutes
#   url_tty: Initial tunnel URL for OpenCode TTY
#   url_chamber: Initial tunnel URL for OpenChamber
#   url_web: Initial tunnel URL for OpenCode Web
# ==============================================================================

set -uo pipefail

TUNNEL_PROVIDER="${1:-cloudflare}"
TIMEOUT_MINUTES="${2:-300}"
URL_TTY="${3:-}"
URL_CHAMBER="${4:-}"
URL_WEB="${5:-}"

echo "=============================================="
echo "OpenCode Monitor & Self-Heal"
echo "=============================================="
echo "Tunnel Provider: $TUNNEL_PROVIDER"
echo "Timeout: $TIMEOUT_MINUTES minute(s)"
echo "----------------------------------------------"
echo "OpenCode TTY URL:  $URL_TTY"
echo "OpenChamber URL:   $URL_CHAMBER"
echo "OpenCode Web URL:  $URL_WEB"
echo "=============================================="
echo ""

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
TTY_PORT=7681
OPENCHAMBER_PORT=9090
OPENCODE_WEB_PORT=8080

START_TIME=$(date +%s)
TIMEOUT_SECONDS=$((TIMEOUT_MINUTES * 60))

# ------------------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------------------

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

check_port() {
    local port=$1
    lsof -i :"$port" > /dev/null 2>&1
}

get_remaining_time() {
    local elapsed=$(($(date +%s) - START_TIME))
    local remaining=$((TIMEOUT_SECONDS - elapsed))
    echo $remaining
}

format_time() {
    local seconds=$1
    local minutes=$((seconds / 60))
    local hours=$((minutes / 60))
    minutes=$((minutes % 60))

    if [ $hours -gt 0 ]; then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m"
    fi
}

# ------------------------------------------------------------------------------
# Service Management
# ------------------------------------------------------------------------------

restart_opencode_tty() {
    log "Restarting OpenCode TTY on port $TTY_PORT..."
    pkill -f "ttyd" 2>/dev/null || true
    sleep 2

    if [ -n "${OPENCHAMBER_UI_PASSWORD:-}" ]; then
        log "Restarting TTY with password protection."
        nohup stdbuf -oL ttyd -c "user:${OPENCHAMBER_UI_PASSWORD}" -p $TTY_PORT bash -c "cd \$HOME && exec opencode" >> opencode_tty.log 2>&1 &
    else
        nohup stdbuf -oL ttyd -p $TTY_PORT bash -c "cd \$HOME && exec opencode" >> opencode_tty.log 2>&1 &
    fi
    sleep 5

    if check_port $TTY_PORT; then
        log "OpenCode TTY restarted successfully"
        return 0
    else
        log "ERROR: Failed to restart OpenCode TTY"
        return 1
    fi
}

restart_openchamber() {
    log "Restarting OpenChamber on port $OPENCHAMBER_PORT..."
    pkill -f "openchamber" 2>/dev/null || true
    sleep 2
    if [ -n "${OPENCHAMBER_UI_PASSWORD:-}" ]; then
        nohup stdbuf -oL openchamber --port $OPENCHAMBER_PORT --ui-password "$OPENCHAMBER_UI_PASSWORD" >> openchamber.log 2>&1 &
    else
        nohup stdbuf -oL openchamber --port $OPENCHAMBER_PORT >> openchamber.log 2>&1 &
    fi
    sleep 5

    if check_port $OPENCHAMBER_PORT; then
        log "OpenChamber restarted successfully"
        return 0
    else
        log "ERROR: Failed to restart OpenChamber"
        return 1
    fi
}

restart_opencode_web() {
    log "Restarting OpenCode Web on port $OPENCODE_WEB_PORT..."
    # Note: "opencode web" might be matched by "opencode" so we use full command in pkill if possible or handle order
    pkill -f "opencode web" 2>/dev/null || true
    sleep 2
    if [ -n "${OPENCHAMBER_UI_PASSWORD:-}" ]; then
        OPENCODE_SERVER_PASSWORD="$OPENCHAMBER_UI_PASSWORD" nohup stdbuf -oL opencode web --port $OPENCODE_WEB_PORT >> opencode_web.log 2>&1 &
    else
        nohup stdbuf -oL opencode web --port $OPENCODE_WEB_PORT >> opencode_web.log 2>&1 &
    fi
    sleep 5

    if check_port $OPENCODE_WEB_PORT; then
        log "OpenCode Web restarted successfully"
        return 0
    else
        log "ERROR: Failed to restart OpenCode Web"
        return 1
    fi
}

restart_tunnels() {
    log "Restarting tunnels ($TUNNEL_PROVIDER)..."

    if [ "$TUNNEL_PROVIDER" = "ngrok" ]; then
        pkill -f "ngrok" 2>/dev/null || true
        sleep 2
        # Complex to manage multiple ngrok tunnels without config file.
        # For now, attempting to restore single tunnel logic or just warn.
        log "WARNING: Multi-tunnel restart for ngrok not fully supported in this script version."
        # Attempt to start tunnels again (blindly)
        nohup ngrok http 127.0.0.1:$OPENCHAMBER_PORT --log=stdout > tunnel_chamber.log 2>&1 &
        nohup ngrok http 127.0.0.1:$OPENCODE_WEB_PORT --log=stdout > tunnel_web.log 2>&1 &
        nohup ngrok http 127.0.0.1:$TTY_PORT --log=stdout > tunnel_tty.log 2>&1 &
        sleep 10
    else
        pkill -f "cloudflared" 2>/dev/null || true
        sleep 2
        nohup cloudflared tunnel --url http://127.0.0.1:$TTY_PORT > tunnel_tty.log 2>&1 &
        nohup cloudflared tunnel --url http://127.0.0.1:$OPENCHAMBER_PORT > tunnel_chamber.log 2>&1 &
        nohup cloudflared tunnel --url http://127.0.0.1:$OPENCODE_WEB_PORT > tunnel_web.log 2>&1 &
        sleep 15

        # Get new URLs
        URL_TTY=$(grep -o 'https://[-a-z0-9.]*trycloudflare.com' tunnel_tty.log 2>/dev/null | tail -n 1)
        URL_CHAMBER=$(grep -o 'https://[-a-z0-9.]*trycloudflare.com' tunnel_chamber.log 2>/dev/null | tail -n 1)
        URL_WEB=$(grep -o 'https://[-a-z0-9.]*trycloudflare.com' tunnel_web.log 2>/dev/null | tail -n 1)
    fi

    log "Tunnels restarted."
    echo ""
    echo "=============================================="
    echo "NEW ACCESS URLS:"
    echo "OpenCode TTY:  $URL_TTY"
    echo "OpenChamber:   $URL_CHAMBER"
    echo "OpenCode Web:  $URL_WEB"
    echo "=============================================="
    echo ""
}

check_tunnels() {
    if [ "$TUNNEL_PROVIDER" = "ngrok" ]; then
        pgrep -f "ngrok" > /dev/null 2>&1
    else
        pgrep -f "cloudflared" > /dev/null 2>&1
    fi
}

# ------------------------------------------------------------------------------
# Graceful Shutdown
# ------------------------------------------------------------------------------

shutdown() {
    log "Initiating graceful shutdown..."

    # Kill all services
    pkill -f "ttyd" 2>/dev/null || true
    pkill -f "opencode" 2>/dev/null || true
    pkill -f "openchamber" 2>/dev/null || true
    pkill -f "opencode web" 2>/dev/null || true
    pkill -f "ngrok" 2>/dev/null || true
    pkill -f "cloudflared" 2>/dev/null || true

    log "All services stopped"
    exit 0
}

# Trap signals for graceful shutdown
trap shutdown SIGTERM SIGINT

# ==============================================================================
# Main Monitoring Loop
# ==============================================================================

log "Starting monitoring loop..."
echo ""

# Write initial URLs to GitHub Step Summary (if running in GitHub Actions)
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
        echo "## OpenChamber for Actions"
        echo ""
        echo "| Service | URL |"
        echo "|---------|-----|"
        echo "| **OpenCode TTY** | $URL_TTY |"
        echo "| **OpenChamber** | $URL_CHAMBER |"
        echo "| **OpenCode Web** | $URL_WEB |"
        echo ""
        echo "_Timeout: ${TIMEOUT_MINUTES} minutes_"
    } >> "$GITHUB_STEP_SUMMARY"
fi

# Status display interval (every 5 minutes = 300 seconds)
LAST_STATUS_TIME=0
STATUS_INTERVAL=300

while true; do
    REMAINING=$(get_remaining_time)

    # Check for timeout
    if [ "$REMAINING" -le 0 ]; then
        log "Timeout reached. Initiating graceful shutdown..."
        shutdown
    fi

    # Periodic status update (every 5 minutes)
    CURRENT_TIME=$(date +%s)
    if [ $((CURRENT_TIME - LAST_STATUS_TIME)) -ge $STATUS_INTERVAL ]; then
        echo ""
        echo "=============================================="
        log "Status Update"
        echo "Time remaining: $(format_time "$REMAINING")"
        echo "OpenCode TTY:  $URL_TTY"
        echo "OpenChamber:   $URL_CHAMBER"
        echo "OpenCode Web:  $URL_WEB"
        echo "=============================================="
        echo ""
        LAST_STATUS_TIME=$CURRENT_TIME
    fi

    # Check OpenCode TTY
    if ! check_port $TTY_PORT; then
        log "OpenCode TTY not responding on port $TTY_PORT"
        restart_opencode_tty
    fi

    # Check OpenChamber
    if ! check_port $OPENCHAMBER_PORT; then
        log "OpenChamber not responding on port $OPENCHAMBER_PORT"
        restart_openchamber
    fi

    # Check OpenCode Web
    if ! check_port $OPENCODE_WEB_PORT; then
        log "OpenCode Web not responding on port $OPENCODE_WEB_PORT"
        restart_opencode_web
    fi

    # Check Tunnel Process (Basic check)
    if ! check_tunnels; then
        log "Tunnel processes not running"
        restart_tunnels
    fi

    # Sleep before next check
    sleep 5
done
