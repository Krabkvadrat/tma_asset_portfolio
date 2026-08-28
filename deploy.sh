#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

# ── Helpers ──────────────────────────────────────────────────

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

# The named tunnel always serves the same hostname, so the public URL is a
# config value rather than something to fish out of the tunnel's logs.
app_url() {
    host=$(grep "^APP_HOSTNAME=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
    if [ -z "$host" ] || [ "$host" = "portfolio.example.com" ]; then
        return 1
    fi
    echo "https://${host#https://}"
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

    # Validate BOT_TOKEN is set
    if grep -q "^BOT_TOKEN=your_bot_token_here" "$ENV_FILE" 2>/dev/null; then
        red "Please edit $ENV_FILE and set your real BOT_TOKEN before deploying."
        exit 1
    fi

    # Same for the tunnel: with the placeholder token cloudflared just
    # crash-loops on authentication.
    if grep -q "^TUNNEL_TOKEN=your_tunnel_token_here" "$ENV_FILE" 2>/dev/null; then
        red "Please edit $ENV_FILE and set your real TUNNEL_TOKEN before deploying."
        exit 1
    fi

    bold "Building and starting services..."
    docker compose -f "$COMPOSE_FILE" up --build -d

    echo ""
    if url=$(app_url); then
        green "============================================"
        green "  App is live at: $url"
        green "============================================"
        echo ""
        echo "To set this as your Telegram bot's menu button, run:"
        echo "  ./deploy.sh set-bot-url"
        echo ""
    else
        red "Set APP_HOSTNAME in $ENV_FILE to the hostname routed to this tunnel."
    fi
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

    BOT_TOKEN=$(grep "^BOT_TOKEN=" "$ENV_FILE" | cut -d= -f2-)
    if [ -z "$BOT_TOKEN" ] || [ "$BOT_TOKEN" = "your_bot_token_here" ]; then
        red "BOT_TOKEN not set in $ENV_FILE"
        exit 1
    fi

    if ! url=$(app_url); then
        red "APP_HOSTNAME not set in $ENV_FILE."
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
