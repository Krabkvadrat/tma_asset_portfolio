from datetime import date, datetime
from decimal import Decimal

import pytest

from app.models import Asset, ExchangeRate, PortfolioSnapshot, Transaction, User
from conftest import auth, sync_engine
from scripts.backfill_deleted_assets import NOTE, apply, find_fixes, main


@pytest.fixture(autouse=True)
def users(clean_db):
    # Postgres enforces the users foreign key on rows inserted directly.
    with sync_engine.begin() as conn:
        conn.execute(User.__table__.insert(), [{"user_id": 1}, {"user_id": 2}])


def txn(user, type_, currency, action, amount, day, asset_id=None, created=None, note=None):
    with sync_engine.begin() as conn:
        conn.execute(Transaction.__table__.insert().values(
            user_id=user, asset_id=asset_id, type=type_, action=action,
            amount=amount, currency=currency, date=date.fromisoformat(day), note=note,
            created_at=datetime.fromisoformat(created or day),
        ))


def snapshot(user, day, currency="EUR", **values):
    breakdown = [{"type": t, "value": v} for t, v in values.items()]
    with sync_engine.begin() as conn:
        conn.execute(PortfolioSnapshot.__table__.insert().values(
            user_id=user, date=date.fromisoformat(day), display_currency=currency,
            total_value=sum(values.values()), breakdown=breakdown,
            created_at=datetime.fromisoformat(day).replace(hour=23),
        ))


def run():
    with sync_engine.begin() as conn:
        return find_fixes(conn)


def all_txns():
    with sync_engine.connect() as conn:
        return conn.execute(Transaction.__table__.select().order_by(Transaction.id)).all()


def test_deletion_date_comes_from_snapshot_drop(client):
    # Legacy delete: the asset's txns lost their asset_id and no removal was logged.
    txn(1, "cash", "EUR", "add", 300, "2026-03-01")
    txn(1, "cash", "EUR", "remove", 100, "2026-03-05")
    snapshot(1, "2026-03-01", cash=300, crypto=50)
    snapshot(1, "2026-03-05", cash=200, crypto=50)  # the logged removal itself
    snapshot(1, "2026-03-10", cash=200, crypto=10)  # another category moving
    snapshot(1, "2026-03-20", cash=0, crypto=10)    # the deletion

    [f] = run()
    assert (f.user_id, f.type, f.currency, f.action, f.amount) == (1, "cash", "EUR", "remove", Decimal(200))
    assert f.date == date(2026, 3, 20) and f.source.startswith("snapshot")


def test_rate_dips_are_not_mistaken_for_the_deletion(client):
    with sync_engine.begin() as conn:
        conn.execute(ExchangeRate.__table__.insert().values(base="USD", quote="EUR", rate=0.9))
    txn(1, "cash", "USD", "add", 200, "2026-03-01")
    snapshot(1, "2026-03-02", cash=180.0)
    snapshot(1, "2026-03-03", cash=179.5)  # USD dipped
    snapshot(1, "2026-03-20", cash=0)

    assert run()[0].date == date(2026, 3, 20)


def test_live_asset_changes_are_not_mistaken_for_the_deletion(client):
    txn(1, "cash", "EUR", "add", 100, "2026-03-01")              # deleted later
    txn(1, "cash", "EUR", "add", 500, "2026-03-01", asset_id=None)
    with sync_engine.begin() as conn:
        conn.execute(Asset.__table__.insert().values(
            id=7, user_id=1, type="cash", name="Live", currency="EUR", amount=0,
        ))
    txn(1, "cash", "EUR", "add", 500, "2026-03-01", asset_id=7)
    txn(1, "cash", "EUR", "remove", 500, "2026-03-04", asset_id=7)
    snapshot(1, "2026-03-02", cash=1100)
    snapshot(1, "2026-03-04", cash=600)   # live asset emptied
    snapshot(1, "2026-03-09", cash=0)     # the deletion

    [f] = run()
    assert (f.amount, f.date) == (Decimal(600), date(2026, 3, 9))


def test_without_snapshots_uses_last_transaction_day(client):
    txn(1, "crypto", "BTC", "add", Decimal("0.5"), "2026-02-01")
    txn(1, "crypto", "BTC", "add", Decimal("0.25"), "2026-02-10")

    [f] = run()
    assert (f.amount, f.date, f.txn_count) == (Decimal("0.75"), date(2026, 2, 10), 2)
    assert f.source.startswith("last transaction")


def test_back_dated_transaction_counts_from_when_it_was_entered(client):
    txn(1, "cash", "EUR", "add", 100, "2026-01-01", created="2026-03-10")

    [f] = run()
    assert f.date == date(2026, 3, 10)


def test_new_style_rows_do_not_move_a_legacy_deletion(client):
    txn(1, "cash", "EUR", "add", 100, "2026-02-01")                     # legacy, deleted
    snapshot(1, "2026-10-30", cash=0)                                   # old code's last snapshot
    txn(1, "cash", "EUR", "add", 50, "2026-11-01")                      # new asset...
    txn(1, "cash", "EUR", "remove", 50, "2026-11-02", note="Asset deleted")  # ...deleted now

    [f] = run()
    assert (f.amount, f.date) == (Decimal(100), date(2026, 2, 1))


def test_negative_leftover_gets_an_add(client):
    # Old currency change (unlogged) then adjust and delete: EUR side is negative.
    txn(1, "cash", "EUR", "remove", 10, "2026-03-01")

    [f] = run()
    assert (f.action, f.amount, f.date) == ("add", Decimal(10), date(2026, 3, 1))


def test_snapshots_in_a_rare_currency_or_without_breakdown_are_ignored(client):
    txn(1, "cash", "EUR", "add", 100, "2026-03-01")
    for day in ("2026-03-02", "2026-03-03", "2026-03-04"):
        snapshot(1, day, cash=100)
    snapshot(1, "2026-03-05", currency="RUB", cash=1)
    with sync_engine.begin() as conn:
        conn.execute(PortfolioSnapshot.__table__.insert().values(
            user_id=1, date=date(2026, 3, 6), display_currency="EUR", total_value=0, breakdown=None,
        ))
    snapshot(1, "2026-03-07", cash=0)

    assert run()[0].date == date(2026, 3, 7)


def test_live_and_new_style_deletions_are_left_alone(client):
    for name, type_ in (("Wallet", "cash"), ("Old", "deposits")):
        client.post("/api/transactions/", json={
            "type": type_, "action": "add", "name": name, "amount": 50,
            "currency": "EUR", "date": "2026-01-01",
        }, headers=auth(1))
    old_id = [a["id"] for a in client.get("/api/assets/", headers=auth(1)).json() if a["name"] == "Old"][0]
    assert client.delete(f"/api/assets/{old_id}", headers=auth(1)).status_code == 200

    assert run() == []


def test_dry_run_writes_nothing_and_apply_runs_once(client, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL_SYNC", sync_engine.url.render_as_string(hide_password=False))
    txn(1, "cash", "EUR", "add", 100, "2026-03-01")
    txn(2, "cash", "EUR", "add", 40, "2026-03-01")
    before = all_txns()

    main([])
    assert all_txns() == before
    assert "Dry run" in capsys.readouterr().out

    main(["--apply"])
    after = all_txns()
    assert after[:len(before)] == before
    assert {(r.user_id, r.action, r.amount, r.note) for r in after[len(before):]} == {
        (1, "remove", 100, NOTE), (2, "remove", 40, NOTE),
    }

    main(["--apply"])
    assert all_txns() == after
    assert "Nothing to backfill" in capsys.readouterr().out.splitlines()[-1]
