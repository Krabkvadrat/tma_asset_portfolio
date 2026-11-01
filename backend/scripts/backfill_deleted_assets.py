"""One-off: log removals for assets deleted before deletions were journaled.

Older versions deleted an asset without a transaction, so its top-ups still
count in every past day of the history chart. Their transactions survive
with asset_id = NULL, so the leftover per (user, type, currency) is known;
the deletion date is not, and is estimated:

  1. from the old daily snapshots: the first day after the asset's last
     transaction when that category fell by at least half the leftover's
     value (smaller dips are rate or price moves) and no live asset of that
     category had a logged change that day;
  2. otherwise the day of that last transaction (the earliest it can be;
     also exactly right if the asset was deleted the same day).

Limits: two deleted assets with the same type and currency can't be told
apart and get one entry at the later date. A negative leftover (e.g. from an
old currency change, which logged nothing) gets an "add" on the last
transaction day. Check the dry run before applying.

Dry run by default: prints what it would insert. Re-running after --apply
finds nothing, since the leftovers then net to zero. The script ships in the
backend image, so deploy this version first, then run:

    docker compose -f docker-compose.prod.yml exec backend \\
        python -m scripts.backfill_deleted_assets [--apply]
"""
import argparse
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine, func, insert, select
from sqlalchemy.engine import Connection

from app.models import ExchangeRate, PortfolioSnapshot, Transaction
from app.services.snapshots import _resolve_rate

NOTE = "Asset deleted (backfill)"
# Notes only the current code writes.
NEW_STYLE_NOTES = ("Asset deleted", "Currency changed")
# A drop must be at least this share of the leftover's value to count as the deletion.
MIN_DROP_SHARE = 0.5


@dataclass
class Fix:
    user_id: int
    type: str
    currency: str
    action: str
    amount: Decimal
    date: date
    source: str
    txn_count: int


def _deletion_day(
    conn: Connection, user_id: int, asset_type: str, after: date,
    leftover: Decimal, currency: str, rates: dict,
) -> tuple[date, str] | None:
    """First snapshot day after `after` when the category fell by about the leftover."""
    rows = conn.execute(
        select(PortfolioSnapshot.date, PortfolioSnapshot.display_currency, PortfolioSnapshot.breakdown)
        .where(PortfolioSnapshot.user_id == user_id)
        .order_by(PortfolioSnapshot.date.asc())
    ).all()
    if not rows:
        return None
    # Values are only comparable within one display currency; use the most common one.
    display = Counter(r.display_currency for r in rows).most_common(1)[0][0]
    min_drop = float(leftover) * _resolve_rate(rates, currency, display) * MIN_DROP_SHARE

    # Days a live asset of this category changed: a drop then isn't the deletion.
    live_days = {
        d if isinstance(d, date) else date.fromisoformat(str(d)[:10])
        for (d,) in conn.execute(
            select(func.date(Transaction.created_at)).where(
                Transaction.user_id == user_id, Transaction.type == asset_type,
                Transaction.asset_id.is_not(None),
            )
        )
    }

    previous = None
    for day, display_currency, breakdown in rows:
        if display_currency != display or breakdown is None:
            continue
        value = sum(float(i["value"]) for i in breakdown if i.get("type") == asset_type)
        if (previous is not None and day > after and day not in live_days
                and previous - value >= min_drop):
            return day, f"snapshot: {asset_type} {previous:,.2f} -> {value:,.2f} {display}"
        previous = value
    return None


def find_fixes(conn: Connection) -> list[Fix]:
    rates = {(r.base, r.quote): float(r.rate) for r in conn.execute(select(ExchangeRate))}
    # When the new code went live: snapshots stopped being written, and its own
    # notes started appearing. Rows after that don't describe legacy assets.
    markers = [
        conn.execute(select(func.max(PortfolioSnapshot.created_at))).scalar(),
        conn.execute(
            select(func.min(Transaction.created_at)).where(Transaction.note.in_(NEW_STYLE_NOTES))
        ).scalar(),
    ]
    markers = [m for m in markers if m is not None]
    cutoff = min(markers) if markers else None

    rows = conn.execute(
        select(Transaction.user_id, Transaction.type, Transaction.currency, Transaction.action,
               Transaction.amount, Transaction.date, Transaction.created_at)
        .where(Transaction.asset_id.is_(None))
    ).all()

    net: dict[tuple, Decimal] = defaultdict(Decimal)
    count: Counter = Counter()
    last_day: dict[tuple, date] = {}
    for user_id, type_, currency, action, amount, day, created_at in rows:
        key = (user_id, type_, currency)
        net[key] += amount if action == "add" else -amount
        count[key] += 1
        # Only legacy rows say when the legacy asset was last touched.
        if cutoff is not None and created_at is not None and created_at > cutoff:
            continue
        # Dates are user-entered and may be back-dated; the row existed from created_at.
        seen = max(day, created_at.date()) if created_at is not None else day
        last_day[key] = max(last_day.get(key, seen), seen)

    fixes = []
    for key, amount in sorted(net.items()):
        if amount == 0 or key not in last_day:
            continue
        user_id, type_, currency = key
        if amount < 0:
            fixes.append(Fix(user_id, type_, currency, "add", -amount, last_day[key],
                             "negative leftover; last transaction day", count[key]))
            continue
        found = _deletion_day(conn, user_id, type_, last_day[key], amount, currency, rates)
        if found:
            day, source = found
        else:
            day, source = last_day[key], "last transaction (no matching snapshot drop)"
        fixes.append(Fix(user_id, type_, currency, "remove", amount, day, source, count[key]))
    return fixes


def apply(conn: Connection, fixes: list[Fix]) -> None:
    for f in fixes:
        conn.execute(insert(Transaction).values(
            user_id=f.user_id, asset_id=None, type=f.type, action=f.action,
            amount=f.amount, currency=f.currency, note=NOTE, date=f.date,
        ))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="insert the fixes (default: dry run)")
    args = parser.parse_args(argv)

    engine = create_engine(os.environ["DATABASE_URL_SYNC"])
    with engine.begin() as conn:
        fixes = find_fixes(conn)
        if not fixes:
            print("Nothing to backfill.")
            return
        for f in fixes:
            print(f"user {f.user_id}: {f.action} {f.amount.normalize():f} {f.currency} "
                  f"in {f.type} on {f.date}  [{f.source}; {f.txn_count} orphaned txns]")
        if args.apply:
            apply(conn, fixes)
            print(f"Inserted {len(fixes)} transaction(s).")
        else:
            print("Dry run; nothing written. Re-run with --apply to insert.")


if __name__ == "__main__":
    main()
