import hashlib
import hmac
import json
from urllib.parse import urlencode

import pytest
from fastapi import HTTPException

from app.auth import validate_init_data
from app.config import settings

TOKEN = "123:secret"


def signed_init_data(user_id: int, token: str = TOKEN) -> str:
    fields = {"auth_date": "1700000000", "user": json.dumps({"id": user_id})}
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_valid_signature_returns_user_id():
    assert validate_init_data(signed_init_data(42), TOKEN) == 42


def test_tampered_signature_is_rejected():
    with pytest.raises(HTTPException) as exc:
        validate_init_data(signed_init_data(42, token="other:token"), TOKEN)
    assert exc.value.status_code == 401


def test_missing_hash_is_rejected():
    with pytest.raises(HTTPException) as exc:
        validate_init_data("user=%7B%22id%22%3A1%7D", TOKEN)
    assert exc.value.status_code == 401


def test_dev_shortcut_only_works_with_dev_token():
    assert validate_init_data("dev:7", "dev") == 7
    with pytest.raises(HTTPException):
        validate_init_data("dev:7", TOKEN)


def test_user_outside_allow_list_is_forbidden(monkeypatch):
    monkeypatch.setattr(settings, "ALLOWED_USER_IDS", [1])
    assert validate_init_data(signed_init_data(1), TOKEN) == 1
    with pytest.raises(HTTPException) as exc:
        validate_init_data(signed_init_data(2), TOKEN)
    assert exc.value.status_code == 403


def test_api_requires_auth_header(client):
    assert client.get("/api/assets/").status_code == 401
