"""One-off: log removals for assets deleted before deletions were journaled.

Older versions deleted an asset without a transaction, so its top-ups still
count in every past day of the history chart. Their transactions survive
with asset_id = NULL, so the leftover per (user, type, currency) is known;
the deletion date is not, and is estimated:

  1. from the old daily snapshots: the first day after the asset's last
     transaction when that category's value dropped;
  2. otherwise the date of that last transaction (earliest possible date;
     also right when the asset was deleted on that same day).

Dry run by default: prints what it would insert. Re-running after --apply
finds nothing, since the leftovers then net to zero.

    docker compose -f docker-compose.prod.yml exec backend \\
        python -m scripts.backfill_deleted_assets [--apply]
"""
import argparse
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine, insert, select
from sqlalchemy.engine import Connection

from app.models import PortfolioSnapshot, Transaction

NOTE = "Asset deleted (backfill)"


@dataclass
class Removal:
    user_id: int
    type: str
    currency: str
    amount: Decimal
    date: date
    source: str


def _snapshot_drop_day(conn: Connection, user_id: int, asset_type: str, after: date) -> tuple[date, str] | None:
    """First snapshot day after `after` when the category's value fell."""
    rows = conn.execute(
        select(PortfolioSnapshot.date, PortfolioSnapshot.display_currency, PortfolioSnapshot.breakdown)
        .where(PortfolioSnapshot.user_id == user_id)
        .order_by(PortfolioSnapshot.date.asc())
    ).all()
    if not rows:
        return None
    # Values are only comparable within one display currency; use the most common one.
    currency = Counter(r.display_currency for r in rows).most_common(1)[0][0]

    previous = None
    for day, display_currency, breakdown in rows:
        if display_currency != currency or breakdown is None:
            continue
        value = sum(float(i["value"]) for i in breakdown if i.get("type") == asset_type)
        if previous is not None and day > after and value < previous - 1e-9:
            return day, f"snapshot: {asset_type} {previous:,.2f} -> {value:,.2f} {currency}"
        previous = value
    return None


def find_removals(conn: Connection) -> list[Removal]:
    rows = conn.execute(
        select(Transaction.user_id, Transaction.type, Transaction.currency,
               Transaction.action, Transaction.amount, Transaction.date)
        .where(Transaction.asset_id.is_(None))
    ).all()

    net: dict[tuple, Decimal] = defaultdict(Decimal)
    last_day: dict[tuple, date] = {}
    for user_id, type_, currency, action, amount, day in rows:
        key = (user_id, type_, currency)
        net[key] += amount if action == "add" else -amount
        last_day[key] = max(last_day.get(key, day), day)

    removals = []
    for key, amount in sorted(net.items()):
        if amount <= 0:
            continue
        user_id, type_, currency = key
        found = _snapshot_drop_day(conn, user_id, type_, last_day[key])
        if found:
            day, source = found
        else:
            day, source = last_day[key], "last transaction (no snapshot drop found)"
        removals.append(Removal(user_id, type_, currency, amount, day, source))
    return removals


def apply(conn: Connection, removals: list[Removal]) -> None:
    for r in removals:
        conn.execute(insert(Transaction).values(
            user_id=r.user_id, asset_id=None, type=r.type, action="remove",
            amount=r.amount, currency=r.currency, note=NOTE, date=r.date,
        ))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="insert the removals (default: dry run)")
    args = parser.parse_args()

    engine = create_engine(os.environ["DATABASE_URL_SYNC"])
    with engine.begin() as conn:
        removals = find_removals(conn)
        if not removals:
            print("Nothing to backfill.")
            return
        for r in removals:
            print(f"user {r.user_id}: remove {r.amount.normalize():f} {r.currency} from {r.type} "
                  f"on {r.date}  [{r.source}]")
        if args.apply:
            apply(conn, removals)
            print(f"Inserted {len(removals)} removal(s).")
        else:
            print("Dry run; nothing written. Re-run with --apply to insert.")


if __name__ == "__main__":
    main()
