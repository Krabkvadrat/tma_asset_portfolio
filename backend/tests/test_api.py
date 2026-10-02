import pytest

from app.models import ExchangeRate
from conftest import auth, sync_engine


def seed_rate(base: str, quote: str, rate: float) -> None:
    with sync_engine.begin() as conn:
        conn.execute(ExchangeRate.__table__.insert().values(base=base, quote=quote, rate=rate))


def add_txn(client, name, amount, action="add", type_="cash", currency="EUR", user=1, **extra):
    return client.post("/api/transactions/", json={
        "type": type_, "action": action, "name": name, "amount": amount,
        "currency": currency, "date": "2026-01-01", **extra,
    }, headers=auth(user))


def test_health(client):
    assert client.get("/").json() == {"status": "ok"}


# --- Assets -----------------------------------------------------------------

def test_asset_crud(client):
    r = client.post("/api/assets/", json={
        "type": "deposits", "name": "Savings", "currency": "EUR", "amount": 1000,
        "bank": "Sber", "rate": "5%",
    }, headers=auth())
    assert r.status_code == 201
    asset = r.json()
    assert asset["bank"] == "Sber" and asset["amount"] == 1000

    r = client.put(f"/api/assets/{asset['id']}", json={"name": "Rainy day"}, headers=auth())
    assert r.status_code == 200 and r.json()["name"] == "Rainy day"

    assert client.delete(f"/api/assets/{asset['id']}", headers=auth()).status_code == 200
    assert client.get("/api/assets/", headers=auth()).json() == []


def test_changing_asset_amount_logs_adjustment(client):
    asset = client.post("/api/assets/", json={
        "type": "cash", "name": "Wallet", "currency": "EUR", "amount": 100,
    }, headers=auth()).json()

    client.put(f"/api/assets/{asset['id']}", json={"amount": 70}, headers=auth())

    [txn] = client.get("/api/transactions/", headers=auth()).json()
    assert (txn["action"], txn["amount"], txn["note"]) == ("remove", 30, "Manual adjustment")


def test_unknown_asset_is_404(client):
    assert client.put("/api/assets/999", json={"name": "x"}, headers=auth()).status_code == 404
    assert client.delete("/api/assets/999", headers=auth()).status_code == 404


# --- Transactions -----------------------------------------------------------

def test_add_creates_then_tops_up_asset(client):
    assert add_txn(client, "Wallet", 100).status_code == 201
    assert add_txn(client, "Wallet", 25.5).status_code == 201

    [asset] = client.get("/api/assets/", headers=auth()).json()
    assert asset["amount"] == 125.5
    assert len(client.get("/api/transactions/", headers=auth()).json()) == 2


def test_remove_withdraws_from_asset(client):
    add_txn(client, "Wallet", 100)
    asset_id = client.get("/api/assets/", headers=auth()).json()[0]["id"]

    assert add_txn(client, "", 40, action="remove", asset_id=asset_id).status_code == 201
    assert client.get("/api/assets/", headers=auth()).json()[0]["amount"] == 60


def test_overdraw_is_rejected_and_balance_kept(client):
    add_txn(client, "Wallet", 100)

    r = add_txn(client, "Wallet", 150, action="remove")
    assert r.status_code == 400
    assert client.get("/api/assets/", headers=auth()).json()[0]["amount"] == 100
    assert len(client.get("/api/transactions/", headers=auth()).json()) == 1


def test_remove_from_missing_asset_is_404(client):
    assert add_txn(client, "Nothing", 1, action="remove").status_code == 404


def test_transactions_newest_first(client):
    add_txn(client, "Wallet", 1)
    client.post("/api/transactions/", json={
        "type": "cash", "action": "add", "name": "Wallet", "amount": 2,
        "currency": "EUR", "date": "2026-02-01",
    }, headers=auth())
    dates = [t["date"] for t in client.get("/api/transactions/", headers=auth()).json()]
    assert dates == ["2026-02-01", "2026-01-01"]


# --- Settings ---------------------------------------------------------------

def test_settings_defaults_and_update(client):
    settings = {s["key"]: s["value"] for s in client.get("/api/settings/", headers=auth()).json()}
    assert settings["display_currency"] == "EUR"
    assert "debts" in settings["enabled_types"]
    assert "car" in settings["enabled_types"]

    client.put("/api/settings/", json={"key": "display_currency", "value": "USD"}, headers=auth())
    client.put("/api/settings/", json={"key": "include_debts", "value": False}, headers=auth())
    client.put("/api/settings/", json={"key": "include_debts", "value": True}, headers=auth())

    settings = {s["key"]: s["value"] for s in client.get("/api/settings/", headers=auth()).json()}
    assert settings["display_currency"] == "USD"
    assert settings["include_debts"] is True


# --- Portfolio --------------------------------------------------------------

def test_portfolio_converts_to_display_currency(client):
    seed_rate("USD", "EUR", 0.9)
    add_txn(client, "Wallet", 100)
    add_txn(client, "Dollars", 110, currency="USD", type_="bank_accounts")

    p = client.get("/api/portfolio/", headers=auth()).json()
    assert p["display_currency"] == "EUR"
    assert p["total_value"] == pytest.approx(199)
    by_type = {b["type"]: b["value"] for b in p["breakdown"]}
    assert by_type == pytest.approx({"cash": 100, "bank_accounts": 99})


def test_portfolio_labels_car(client):
    add_txn(client, "Corolla", 15000, type_="car")

    car = {b["type"]: b for b in client.get("/api/portfolio/", headers=auth()).json()["breakdown"]}["car"]
    assert (car["value"], car["label"], car["icon"]) == (15000, "Car", "🚗")


def test_portfolio_uses_inverse_rate(client):
    seed_rate("EUR", "USD", 2.0)
    add_txn(client, "Dollars", 10, currency="USD")
    assert client.get("/api/portfolio/", headers=auth()).json()["total_value"] == pytest.approx(5)


def test_history_has_today_and_filters_by_type(client):
    add_txn(client, "Wallet", 100)
    add_txn(client, "Coins", 20, type_="crypto")

    # Look at the latest point only: a run across UTC midnight yields two.
    points = client.get("/api/portfolio/history?period=7d", headers=auth()).json()
    assert points[-1]["value"] == 120

    points = client.get("/api/portfolio/history?period=7d&types=crypto", headers=auth()).json()
    assert points[-1]["value"] == 20


def test_empty_portfolio(client):
    assert client.get("/api/portfolio/", headers=auth()).json()["total_value"] == 0
    assert client.get("/api/portfolio/history", headers=auth()).json() == []


# --- Rates ------------------------------------------------------------------

def test_rates_list_and_refresh(client):
    seed_rate("USD", "EUR", 0.9)
    [rate] = client.get("/api/rates/", headers=auth()).json()
    assert (rate["base"], rate["quote"], rate["rate"]) == ("USD", "EUR", 0.9)
    assert client.post("/api/rates/refresh", headers=auth()).json() == {"ok": True, "rates_updated": 0}
