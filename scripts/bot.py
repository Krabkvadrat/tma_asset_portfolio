#!/usr/bin/env python3
"""Re-points the Telegram Mini App menu button at the current tunnel URL.

Quick tunnels are handed a new random hostname every time cloudflared starts,
so the menu button goes stale on its own and the Mini App opens a dead link.
Sending /start to the bot re-reads the current hostname and fixes the button.

Updates arrive by long polling rather than a webhook on purpose: registering a
webhook would require the very URL that keeps changing, so a stale webhook
could never repair itself.
"""

import json
import os
import time
import urllib.error
import urllib.request

BOT_TOKEN = os.environ["BOT_TOKEN"]
TUNNEL_HOST = os.environ.get("TUNNEL_HOST", "tunnel")
TUNNEL_METRICS_PORT = os.environ.get("TUNNEL_METRICS_PORT", "2000")
BUTTON_TEXT = os.environ.get("BUTTON_TEXT", "Open Portfolio")
POLL_TIMEOUT = int(os.environ.get("POLL_TIMEOUT", "30"))

QUICKTUNNEL_URL = f"http://{TUNNEL_HOST}:{TUNNEL_METRICS_PORT}/quicktunnel"


def log(message):
    print(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {message}", flush=True)


def allowed_user_ids():
    """Empty set means "anyone", matching the backend's ALLOWED_USER_IDS."""
    raw = os.environ.get("ALLOWED_USER_IDS", "").strip()
    if not raw:
        return set()
    try:
        return {int(user_id) for user_id in json.loads(raw)}
    except (ValueError, TypeError) as exc:
        raise SystemExit(f"ALLOWED_USER_IDS={raw!r} is not a JSON array of ids: {exc}")


def api(method, **params):
    """Call the Bot API. Telegram reports failures in the body, so error
    responses are parsed rather than raised."""
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{BOT_TOKEN}/{method}",
        data=json.dumps(params).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=POLL_TIMEOUT + 15) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        return json.load(exc)


def current_tunnel_url():
    """Ask cloudflared which hostname this run was assigned."""
    with urllib.request.urlopen(QUICKTUNNEL_URL, timeout=5) as response:
        hostname = json.load(response).get("hostname", "").strip()

    if not hostname:
        return None
    return hostname if hostname.startswith("https://") else f"https://{hostname}"


def repoint_menu_button(chat_id):
    try:
        url = current_tunnel_url()
    except (urllib.error.URLError, OSError, ValueError) as exc:
        log(f"could not read the tunnel hostname: {exc}")
        api("sendMessage", chat_id=chat_id, text="Can't reach the tunnel. Is the stack up?")
        return

    if url is None:
        api("sendMessage", chat_id=chat_id, text="Tunnel is still starting. Try again shortly.")
        return

    # No chat_id here: this sets the default button for every chat, which is
    # what deploy.sh set-bot-url does too.
    result = api(
        "setChatMenuButton",
        menu_button={
            "type": "web_app",
            "text": BUTTON_TEXT,
            "web_app": {"url": url},
        },
    )

    if result.get("ok"):
        log(f"menu button now points at {url}")
        api("sendMessage", chat_id=chat_id, text=f"Menu button updated:\n{url}")
    else:
        log(f"telegram rejected the update: {result}")
        api("sendMessage", chat_id=chat_id, text=f"Telegram rejected it: {result.get('description')}")


def is_start_command(text):
    # Telegram appends @botname when the command is sent in a group.
    return text.strip().split("@")[0].split()[0].lower() == "/start" if text.strip() else False


def handle(update, allowed):
    message = update.get("message") or {}
    text = message.get("text") or ""

    if not is_start_command(text):
        return

    user_id = (message.get("from") or {}).get("id")
    chat_id = (message.get("chat") or {}).get("id")

    if allowed and user_id not in allowed:
        log(f"ignoring /start from unauthorized user {user_id}")
        return

    log(f"/start from {user_id}")
    repoint_menu_button(chat_id)


def drop_backlog():
    """Skip commands queued while the bot was down, so a restart doesn't
    replay a /start from yesterday."""
    result = api("getUpdates", offset=-1, timeout=0)
    updates = result.get("result") or []
    return updates[-1]["update_id"] + 1 if updates else 0


def main():
    allowed = allowed_user_ids()
    if allowed:
        log(f"responding to /start from {sorted(allowed)}")
    else:
        log("ALLOWED_USER_IDS is empty — responding to /start from anyone")

    # getUpdates and webhooks are mutually exclusive; a leftover webhook would
    # make every poll fail with 409.
    api("deleteWebhook")

    offset = drop_backlog()
    log("waiting for /start")

    while True:
        try:
            result = api("getUpdates", offset=offset, timeout=POLL_TIMEOUT, allowed_updates=["message"])
        except (urllib.error.URLError, OSError, ValueError) as exc:
            log(f"getUpdates failed ({exc}), retrying")
            time.sleep(5)
            continue

        if not result.get("ok"):
            log(f"getUpdates returned an error: {result.get('description')}")
            time.sleep(5)
            continue

        for update in result.get("result") or []:
            offset = update["update_id"] + 1
            try:
                handle(update, allowed)
            except Exception as exc:  # one bad update must not kill the loop
                log(f"failed to handle update {update.get('update_id')}: {exc}")


if __name__ == "__main__":
    main()
