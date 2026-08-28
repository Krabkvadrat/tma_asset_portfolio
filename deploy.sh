#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

# ── Helpers ──────────────────────────────────────────────────

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

# Last assignment wins, the way docker compose reads an env file.
env_value() { grep "^$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- || true; }

# A value still equal to the one shipped in .env.example has not been filled in
# yet. Comparing against that file keeps the placeholders in one place.
require_config() {
    for var in "$@"; do
        value=$(env_value "$ENV_FILE" "$var")
        example=$(env_value ".env.example" "$var")
        if [ -z "$value" ] || { [ -n "$example" ] && [ "$value" = "$example" ]; }; then
            red "Set a real $var in $ENV_FILE before deploying."
            exit 1
        fi
    done
}

# The named tunnel always serves the same hostname, so the public URL is a
# config value rather than something to fish out of the tunnel's logs. The
# value is hand-edited on the Pi, so tolerate what people actually type.
app_url() {
    host=$(env_value "$ENV_FILE" APP_HOSTNAME)
    host=${host%%#*}             # inline comment
    host=${host//[$'\r\n\t ']/}  # CR from a CRLF editor, stray whitespace
    host=${host#http://}
    host=${host#https://}
    host=${host%%/*}                # a path pasted along with the hostname
    [ -n "$host" ] || return 1
    echo "https://$host"
}

# cloudflared logs this once per edge connection: the local proof that the
# token was accepted and the tunnel is really attached. Without it the URL
# printed below would be an unverified echo of the config file.
tunnel_connected() {
    for _ in $(seq 1 15); do
        if docker compose -f "$COMPOSE_FILE" logs tunnel 2>/dev/null \
            | grep -q "Registered tunnel connection"; then
            return 0
        fi
        sleep 2
    done
    return 1
}

# ── Commands ─────────────────────────────────────────────────

cmd_up() {
    bold "Portfolio Tracker — Raspberry Pi Deploy"
    echo ""

    if [ ! -f "$ENV_FILE" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example "$ENV_FILE"
            green "Created $ENV_FILE from .env.example"
        else
            red "No $ENV_FILE found. Create one with at least BOT_TOKEN=your_token"
            exit 1
        fi
    fi

    # Without any one of these the stack comes up unreachable, so fail before
    # building rather than after.
    require_config BOT_TOKEN TUNNEL_TOKEN APP_HOSTNAME

    if ! url=$(app_url); then
        red "APP_HOSTNAME in $ENV_FILE is not a usable hostname."
        exit 1
    fi

    bold "Building and starting services..."
    docker compose -f "$COMPOSE_FILE" up --build -d

    echo ""
    bold "Waiting for the tunnel to register a connection..."
    if ! tunnel_connected; then
        red "The tunnel never connected — the app is NOT reachable. Check:"
        echo "  ./deploy.sh logs tunnel"
        exit 1
    fi

    green "============================================"
    green "  App is live at: $url"
    green "============================================"
    echo ""
    echo "To set this as your Telegram bot's menu button, run:"
    echo "  ./deploy.sh set-bot-url"
    echo ""
}

cmd_down() {
    bold "Stopping all services..."
    docker compose -f "$COMPOSE_FILE" down
    green "Done."
}

cmd_logs() {
    shift
    if [ $# -eq 0 ]; then
        docker compose -f "$COMPOSE_FILE" logs -f
    else
        docker compose -f "$COMPOSE_FILE" logs -f "$@"
    fi
}

cmd_status() {
    docker compose -f "$COMPOSE_FILE" ps
}

cmd_url() {
    if url=$(app_url); then
        echo "$url"
    else
        red "APP_HOSTNAME not set in $ENV_FILE."
        exit 1
    fi
}

cmd_set_bot_url() {
    if [ ! -f "$ENV_FILE" ]; then
        red "No $ENV_FILE found."
        exit 1
    fi

    require_config BOT_TOKEN APP_HOSTNAME
    BOT_TOKEN=$(env_value "$ENV_FILE" BOT_TOKEN)

    if ! url=$(app_url); then
        red "APP_HOSTNAME in $ENV_FILE is not a usable hostname."
        exit 1
    fi

    bold "Setting Telegram bot menu button to: $url"
    result=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton" \
        -H "Content-Type: application/json" \
        -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Open Portfolio\",\"web_app\":{\"url\":\"${url}\"}}}")

    if echo "$result" | grep -q '"ok":true'; then
        green "Done! Open your bot in Telegram and tap 'Open Portfolio'."
    else
        red "Failed to set menu button:"
        echo "$result"
    fi
}

cmd_rebuild() {
    bold "Rebuilding and restarting..."
    docker compose -f "$COMPOSE_FILE" up --build -d
    green "Done."
}

# ── Main ─────────────────────────────────────────────────────

case "${1:-up}" in
    up|start)       cmd_up ;;
    down|stop)      cmd_down ;;
    logs)           cmd_logs "$@" ;;
    status|ps)      cmd_status ;;
    url)            cmd_url ;;
    set-bot-url)    cmd_set_bot_url ;;
    rebuild)        cmd_rebuild ;;
    *)
        echo "Usage: ./deploy.sh [command]"
        echo ""
        echo "Commands:"
        echo "  up            Build and start all services (default)"
        echo "  down          Stop all services"
        echo "  rebuild       Rebuild and restart"
        echo "  logs [svc]    Follow logs (optionally for a specific service)"
        echo "  status        Show running containers"
        echo "  url           Print the app's public URL"
        echo "  set-bot-url   Set that URL as the Telegram bot menu button"
        ;;
esac
