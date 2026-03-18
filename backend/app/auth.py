import hashlib
import hmac
import json
from urllib.parse import parse_qs, unquote

from fastapi import Depends, Header, HTTPException, status

from app.config import settings


def validate_init_data(init_data: str, bot_token: str) -> int:
    if bot_token == "dev" and init_data.startswith("dev:"):
        return int(init_data.split(":", 1)[1])

    parsed = parse_qs(init_data, keep_blank_values=True)

    if "hash" not in parsed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing hash in initData",
        )

    received_hash = parsed.pop("hash")[0]

    data_check_pairs = []
    for key in sorted(parsed.keys()):
        value = parsed[key][0]
        data_check_pairs.append(f"{key}={value}")
    data_check_string = "\n".join(data_check_pairs)

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid initData signature",
        )

    user_data = parsed.get("user")
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing user in initData",
        )

    user_json = json.loads(unquote(user_data[0]))
    user_id = int(user_json["id"])

    if settings.ALLOWED_USER_IDS and user_id not in settings.ALLOWED_USER_IDS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return user_id


async def get_current_user(
    x_telegram_init_data: str | None = Header(None),
    authorization: str | None = Header(None),
) -> int:
    init_data = x_telegram_init_data or authorization
    if not init_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication header",
        )
    return validate_init_data(init_data, settings.BOT_TOKEN)
