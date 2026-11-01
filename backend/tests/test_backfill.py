from datetime import date
from decimal import Decimal

from app.models import Asset, PortfolioSnapshot, Transaction
from conftest import auth, sync_engine
from scripts.backfill_deleted_assets import NOTE, apply, find_removals


def txn(user, type_, currency, action, amount, day, asset_id=None):
    with sync_engine.begin() as conn:
        conn.execute(Transaction.__table__.insert().values(
            user_id=user, asset_id=asset_id, type=type_, action=action,
            amount=amount, currency=currency, date=date.fromisoformat(day),
        ))


def snapshot(user, day, currency="EUR", **values):
    breakdown = [{"type": t, "value": v} for t, v in values.items()]
    with sync_engine.begin() as conn:
        conn.execute(PortfolioSnapshot.__table__.insert().values(
            user_id=user, date=date.fromisoformat(day), display_currency=currency,
            total_value=sum(values.values()), breakdown=breakdown,
        ))


def run():
    with sync_engine.begin() as conn:
        return find_removals(conn)


def test_deletion_date_comes_from_snapshot_drop(client):
    # Legacy delete: the asset's txns lost their asset_id and no removal was logged.
    txn(1, "cash", "USD", "add", 300, "2026-03-01")
    txn(1, "cash", "USD", "remove", 100, "2026-03-05")
    snapshot(1, "2026-03-01", cash=270, crypto=50)
    snapshot(1, "2026-03-05", cash=180, crypto=50)  # the logged removal itself
    snapshot(1, "2026-03-10", cash=180, crypto=40)  # another category moving
    snapshot(1, "2026-03-20", cash=0, crypto=40)    # the deletion

    [r] = run()
    assert (r.user_id, r.type, r.currency, r.amount) == (1, "cash", "USD", Decimal(200))
    assert r.date == date(2026, 3, 20) and r.source.startswith("snapshot")


def test_without_snapshots_uses_last_transaction_day(client):
    txn(1, "crypto", "BTC", "add", Decimal("0.5"), "2026-02-01")
    txn(1, "crypto", "BTC", "add", Decimal("0.25"), "2026-02-10")

    [r] = run()
    assert (r.amount, r.date) == (Decimal("0.75"), date(2026, 2, 10))
    assert r.source.startswith("last transaction")


def test_snapshots_in_a_rare_currency_are_ignored(client):
    txn(1, "cash", "EUR", "add", 100, "2026-03-01")
    for day in ("2026-03-02", "2026-03-03", "2026-03-04"):
        snapshot(1, day, cash=100)
    snapshot(1, "2026-03-05", currency="RUB", cash=1)  # looks like a drop, other currency
    snapshot(1, "2026-03-06", cash=0)

    [r] = run()
    assert r.date == date(2026, 3, 6)


def test_live_and_new_style_deletions_are_left_alone(client):
    # Asset still exists: its txns keep asset_id.
    client.post("/api/transactions/", json={
        "type": "cash", "action": "add", "name": "Wallet", "amount": 50,
        "currency": "EUR", "date": "2026-01-01",
    }, headers=auth(1))
    # Deleted after this change: a removal was logged, so it nets to zero.
    client.post("/api/transactions/", json={
        "type": "deposits", "action": "add", "name": "Old", "amount": 70,
        "currency": "EUR", "date": "2026-01-01",
    }, headers=auth(1))
    old_id = [a["id"] for a in client.get("/api/assets/", headers=auth(1)).json() if a["name"] == "Old"][0]
    assert client.delete(f"/api/assets/{old_id}", headers=auth(1)).status_code == 200

    assert run() == []


def test_apply_inserts_removals_once_and_fixes_history(client):
    txn(1, "cash", "EUR", "add", 100, "2026-03-01")
    txn(2, "cash", "EUR", "add", 40, "2026-03-01")

    removals = run()
    assert [(r.user_id, r.amount) for r in removals] == [(1, Decimal(100)), (2, Decimal(40))]
    with sync_engine.begin() as conn:
        apply(conn, removals)

    assert run() == []
    with sync_engine.connect() as conn:
        rows = conn.execute(Transaction.__table__.select().where(Transaction.note == NOTE)).all()
    assert {(r.user_id, r.action, r.date) for r in rows} == {
        (1, "remove", date(2026, 3, 1)), (2, "remove", date(2026, 3, 1)),
    }
    # Nothing outside the transactions table is touched.
    with sync_engine.connect() as conn:
        assert conn.execute(Asset.__table__.select()).all() == []
