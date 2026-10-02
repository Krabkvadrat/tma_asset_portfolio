"""Shared test setup.

The tests wipe every table between runs, so they must never touch a real
database. By default they use a throwaway SQLite file; CI points them at a
disposable Postgres via DATABASE_URL / DATABASE_URL_SYNC. Anything that does
not look like a test database is refused before the app is even imported.
"""
import os
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

if "DATABASE_URL" not in os.environ:
    _db_file = Path(tempfile.mkdtemp(prefix="portfolio-tests-")) / "test.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_file}"
    os.environ["DATABASE_URL_SYNC"] = f"sqlite:///{_db_file}"
os.environ["BOT_TOKEN"] = "dev"
os.environ["ALLOWED_USER_IDS"] = "[]"
os.environ["ALLOWED_ORIGINS"] = "*"


def _assert_test_database(var: str) -> None:
    raw = os.environ.get(var)
    if not raw:
        pytest.exit(f"{var} must be set together with DATABASE_URL", returncode=2)
    url = make_url(raw)
    if url.get_backend_name() == "sqlite":
        return
    if "test" not in (url.database or ""):
        pytest.exit(
            f"Refusing to run: {var} points at database {url.database!r}. "
            "The tests delete all rows; use a database whose name contains 'test'.",
            returncode=2,
        )


_assert_test_database("DATABASE_URL")
_assert_test_database("DATABASE_URL_SYNC")

from fastapi.testclient import TestClient  # noqa: E402

from app import main as app_main  # noqa: E402
from app import models  # noqa: E402,F401
from app.database import Base, engine  # noqa: E402
from app.routers import rates as rates_router  # noqa: E402

sync_engine = create_engine(os.environ["DATABASE_URL_SYNC"])


def auth(user_id: int = 1) -> dict[str, str]:
    return {"X-Telegram-Init-Data": f"dev:{user_id}"}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Exchange-rate refresh calls external APIs; tests seed rates directly."""
    async def fake_refresh(session):
        return 0

    monkeypatch.setattr(app_main, "refresh_exchange_rates", fake_refresh)
    monkeypatch.setattr(rates_router, "refresh_exchange_rates", fake_refresh)


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.create_all(sync_engine)
    with sync_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    yield


def start_app() -> TestClient:
    return TestClient(app_main.app)


def stop_app(client: TestClient) -> None:
    # Pooled async connections belong to this client's event loop; drop them
    # before the loop goes away so the next client starts clean.
    client.portal.call(engine.dispose)


@pytest.fixture
def client():
    with start_app() as c:
        yield c
        stop_app(c)
