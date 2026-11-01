import asyncio
from datetime import date, datetime, timedelta

import httpx
import pytest

from app.models import ExchangeRate, HistoricalRate
from app.services import history as history_service
from app.services.history import _fetch_day as real_fetch_day
from conftest import auth, sync_engine


def today() -> date:
    return datetime.utcnow().date()


def ago(days: int) -> str:
    return (today() - timedelta(days=days)).isoformat()


def day_ago(days: int) -> date:
    return today() - timedelta(days=days)


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
    assert sorted(calls) == [day_ago(2), day_ago(1)]

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
    monkeypatch.setattr(history_service, "RATES_ARCHIVE_START", day_ago(1))
    add_txn(client, "Wallet", 100, ago(5))

    history(client, "7d")
    assert calls == [day_ago(1)]


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


def test_today_point_matches_portfolio_total(client):
    with sync_engine.begin() as conn:
        conn.execute(ExchangeRate.__table__.insert().values(base="USD", quote="EUR", rate=0.9))
    add_txn(client, "Wallet", 100, ago(4))
    add_txn(client, "Dollars", 50, ago(2), currency="USD")

    total = client.get("/api/portfolio/", headers=auth()).json()["total_value"]
    assert history(client, "7d")[ago(0)] == pytest.approx(total)


def test_changing_currency_moves_the_balance(client):
    add_txn(client, "Wallet", 100, ago(3), currency="USD")
    asset_id = client.get("/api/assets/", headers=auth()).json()[0]["id"]
    seed_historical(ago(3), EUR=1, USD=2.0)

    assert client.put(f"/api/assets/{asset_id}", json={"currency": "EUR"}, headers=auth()).status_code == 200
    assert client.delete(f"/api/assets/{asset_id}", headers=auth()).status_code == 200

    points = history(client, "7d")
    assert points[ago(3)] == pytest.approx(50)
    # Once deleted, nothing is left in either currency.
    assert points[ago(0)] == 0
    txns = client.get("/api/transactions/", headers=auth()).json()
    assert {(t["action"], t["currency"], t["amount"]) for t in txns} == {
        ("add", "USD", 100), ("remove", "USD", 100), ("add", "EUR", 100), ("remove", "EUR", 100),
    }


def test_removal_by_id_uses_assets_currency(client):
    add_txn(client, "Dollars", 100, ago(3), currency="USD")
    asset_id = client.get("/api/assets/", headers=auth()).json()[0]["id"]

    txn = add_txn(client, "", 40, ago(1), action="remove", currency="EUR", type_="cash", asset_id=asset_id)
    assert txn["currency"] == "USD"


def test_rates_cached_concurrently_do_not_break_the_request(client, monkeypatch):
    async def racing_fetch(http, day):
        # Another request stores the same day while this one is fetching.
        seed_historical(day.isoformat(), EUR=1, USD=2.0)
        return {"EUR": 1.0, "USD": 2.0}

    monkeypatch.setattr(history_service, "_fetch_day", racing_fetch)
    add_txn(client, "Dollars", 100, ago(2), currency="USD")

    points = history(client, "7d")
    assert points[ago(2)] == pytest.approx(50)


def test_failed_days_are_not_retried_right_away(client, monkeypatch):
    calls = []

    async def failing_fetch(http, day):
        calls.append(day)
        return None

    monkeypatch.setattr(history_service, "_fetch_day", failing_fetch)
    add_txn(client, "Wallet", 100, ago(2))

    history(client, "7d")
    assert len(calls) == 2
    history(client, "7d")
    assert len(calls) == 2


def test_slow_rate_source_does_not_hold_the_chart(client, monkeypatch):
    async def slow_fetch(http, day):
        await asyncio.sleep(30)

    monkeypatch.setattr(history_service, "_fetch_day", slow_fetch)
    monkeypatch.setattr(history_service, "FETCH_DEADLINE", 0.2)
    add_txn(client, "Wallet", 100, ago(2))

    assert history(client, "7d")[ago(2)] == 100


def test_sampled_days_stay_put_from_day_to_day():
    start = date(2026, 1, 1)
    monday = history_service._sample_days(start, start + timedelta(days=364), 365)
    tuesday = history_service._sample_days(start + timedelta(days=1), start + timedelta(days=365), 365)
    # Apart from the window edges and "today", both days pick the same dates.
    assert set(monday[1:-1]) & set(tuesday) == set(monday[1:-1])


@pytest.mark.parametrize("body", [{"eur": None}, {"eur": [1, 2]}, {"usd": {}}, "not json"])
def test_malformed_rate_responses_are_ignored(body):
    def handler(request):
        if body == "not json":
            return httpx.Response(200, text=body)
        return httpx.Response(200, json=body)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await real_fetch_day(http, date(2026, 1, 1))

    assert asyncio.run(run()) is None


def test_rate_response_is_parsed():
    def handler(request):
        return httpx.Response(200, json={"date": "2026-01-01", "eur": {"usd": 1.1, "btc": 0.00001, "bad": "x"}})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await real_fetch_day(http, date(2026, 1, 1))

    assert asyncio.run(run()) == {"USD": 1.1, "BTC": 0.00001}
