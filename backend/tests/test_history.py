from datetime import date, datetime, timedelta

import pytest

from app.models import ExchangeRate, HistoricalRate
from app.services import history as history_service
from conftest import auth, sync_engine

TODAY = datetime.utcnow().date()


def ago(days: int) -> str:
    return (TODAY - timedelta(days=days)).isoformat()


def add_txn(client, name, amount, day, action="add", type_="cash", currency="EUR", user=1, **extra):
    r = client.post("/api/transactions/", json={
        "type": type_, "action": action, "name": name, "amount": amount,
        "currency": currency, "date": day, **extra,
    }, headers=auth(user))
    assert r.status_code == 201, r.text
    return r.json()


def seed_historical(day: str, **per_eur: float) -> None:
    with sync_engine.begin() as conn:
        for currency, rate in per_eur.items():
            conn.execute(HistoricalRate.__table__.insert().values(
                date=date.fromisoformat(day), currency=currency, per_eur=rate,
            ))


def history(client, period="30d", types=None, user=1):
    url = f"/api/portfolio/history?period={period}"
    if types is not None:
        url += f"&types={types}"
    r = client.get(url, headers=auth(user))
    assert r.status_code == 200, r.text
    return {p["date"]: p["value"] for p in r.json()}


def test_history_is_rebuilt_from_transactions(client):
    add_txn(client, "Wallet", 100, ago(10))
    add_txn(client, "Wallet", 50, ago(3))
    asset_id = client.get("/api/assets/", headers=auth()).json()[0]["id"]
    add_txn(client, "", 30, ago(1), action="remove", asset_id=asset_id)

    points = history(client)
    # Starts on the first transaction, not 30 days back.
    assert min(points) == ago(10) and max(points) == ago(0)
    assert len(points) == 11
    assert points[ago(10)] == points[ago(4)] == 100
    assert points[ago(3)] == points[ago(2)] == 150
    assert points[ago(1)] == points[ago(0)] == 120


def test_history_uses_each_days_rates(client):
    with sync_engine.begin() as conn:
        conn.execute(ExchangeRate.__table__.insert().values(base="USD", quote="EUR", rate=0.9))
    seed_historical(ago(2), EUR=1, USD=2.0)
    add_txn(client, "Dollars", 100, ago(2), currency="USD")

    points = history(client, "7d")
    assert points[ago(2)] == pytest.approx(50)
    # No rates for yesterday: the latest earlier day's rates are reused.
    assert points[ago(1)] == pytest.approx(50)
    # Today uses the live rate, matching the headline total.
    assert points[ago(0)] == pytest.approx(90)


def test_fetched_rates_are_cached(client, monkeypatch):
    calls = []

    async def fake_fetch(http, day):
        calls.append(day)
        return {"EUR": 1.0, "USD": 4.0, "XYZ": 7.0}

    monkeypatch.setattr(history_service, "_fetch_day", fake_fetch)
    add_txn(client, "Dollars", 100, ago(2), currency="USD")

    points = history(client, "7d")
    assert points[ago(2)] == pytest.approx(25)
    assert sorted(calls) == [TODAY - timedelta(days=2), TODAY - timedelta(days=1)]

    calls.clear()
    history(client, "7d")
    assert calls == []

    with sync_engine.connect() as conn:
        stored = {r.currency for r in conn.execute(HistoricalRate.__table__.select())}
    assert stored == {"EUR", "USD"}


def test_days_before_rate_archive_are_not_fetched(client, monkeypatch):
    calls = []

    async def fake_fetch(http, day):
        calls.append(day)
        return None

    monkeypatch.setattr(history_service, "_fetch_day", fake_fetch)
    monkeypatch.setattr(history_service, "RATES_ARCHIVE_START", TODAY - timedelta(days=1))
    add_txn(client, "Wallet", 100, ago(5))

    history(client, "7d")
    assert calls == [TODAY - timedelta(days=1)]


def test_history_filters_by_type(client):
    add_txn(client, "Wallet", 100, ago(5))
    add_txn(client, "Coins", 20, ago(3), type_="crypto")

    points = history(client, "7d", types="crypto")
    assert min(points) == ago(3)
    assert set(points.values()) == {20}


def test_deleting_asset_ends_its_history(client):
    add_txn(client, "Wallet", 100, ago(5))
    asset_id = client.get("/api/assets/", headers=auth()).json()[0]["id"]

    assert client.delete(f"/api/assets/{asset_id}", headers=auth()).status_code == 200

    removal = client.get("/api/transactions/", headers=auth()).json()[0]
    assert (removal["action"], removal["amount"], removal["note"], removal["date"]) == (
        "remove", 100, "Asset deleted", ago(0),
    )
    points = history(client, "7d")
    assert points[ago(1)] == 100 and points[ago(0)] == 0


def test_long_periods_are_sampled(client):
    add_txn(client, "Wallet", 100, ago(400))

    points = history(client, "1Y")
    assert len(points) <= history_service.MAX_POINTS
    assert max(points) == ago(0) and min(points) >= ago(364)


def test_history_excludes_other_users(client):
    add_txn(client, "Mine", 10, ago(3), user=1)
    add_txn(client, "Theirs", 1000, ago(3), user=2)

    assert set(history(client, "7d", user=1).values()) == {10}
