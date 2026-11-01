"""Portfolio value over time, rebuilt from the transaction log.

Every balance change is a dated transaction, so the holdings on any past day
are the sum of transactions up to that day. Each day is valued at that day's
exchange rates; today uses the live rates and the real asset balances, so the
last point matches the total on screen.
"""
import asyncio
import logging
import math
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Asset, HistoricalRate, Transaction
from app.services.snapshots import _load_rates, _resolve_rate

logger = logging.getLogger(__name__)

# Long periods are sampled so a chart never needs more than this many days of rates.
MAX_POINTS = 92
# The daily rate archive starts here; earlier days use the nearest known rates.
RATES_ARCHIVE_START = date(2024, 3, 2)
FETCH_CONCURRENCY = 8
FETCH_TIMEOUT = 5.0
# A chart request waits at most this long for missing rates; the rest load next time.
FETCH_DEADLINE = 8.0
# Days that failed to load are not retried for this many seconds.
FAILED_RETRY_AFTER = 3600

_failed_until: dict[date, float] = {}


def _tracked_currencies() -> set[str]:
    return set(settings.FIAT_CURRENCIES) | set(settings.CRYPTO_IDS.keys())


async def _fetch_day(client: httpx.AsyncClient, day: date) -> dict[str, float] | None:
    """Units of each currency per 1 EUR on that day, or None if unavailable."""
    for template in settings.HISTORICAL_RATE_URLS:
        url = template.format(date=day.isoformat())
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            rates = resp.json()["eur"]
            return {code.upper(): float(v) for code, v in rates.items() if isinstance(v, (int, float)) and v > 0}
        except (httpx.HTTPError, KeyError, ValueError, TypeError, AttributeError) as exc:
            logger.info("Historical rates for %s unavailable at %s: %s", day, url, exc)
    return None


async def _fetch_missing(days: list[date]) -> dict[date, dict[str, float]]:
    """Fetch rates for the given days, giving up on whatever is not back in time."""
    now = time.monotonic()
    days = [d for d in days if _failed_until.get(d, 0) <= now]
    if not days:
        return {}

    semaphore = asyncio.Semaphore(FETCH_CONCURRENCY)
    found: dict[date, dict[str, float]] = {}

    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT) as client:
        async def fetch(day: date) -> None:
            async with semaphore:
                rates = await _fetch_day(client, day)
            if rates:
                found[day] = rates
            else:
                _failed_until[day] = time.monotonic() + FAILED_RETRY_AFTER

        tasks = [asyncio.create_task(fetch(d)) for d in days]
        _, pending = await asyncio.wait(tasks, timeout=FETCH_DEADLINE)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.wait(pending)
            logger.warning("Historical rates: %d days not fetched in time", len(pending))

    return found


async def _load_historical_rates(
    session: AsyncSession, days: list[date]
) -> dict[date, dict[str, float]]:
    """Cached per-EUR rates for the given days, fetching the missing ones."""
    result = await session.execute(
        select(HistoricalRate.date, HistoricalRate.currency, HistoricalRate.per_eur)
        .where(HistoricalRate.date.in_(days))
    )
    cached: dict[date, dict[str, float]] = defaultdict(dict)
    for day, currency, per_eur in result.all():
        cached[day][currency] = float(per_eur)

    missing = [d for d in days if d not in cached and d >= RATES_ARCHIVE_START]
    if not missing:
        return cached

    # Don't hold a database transaction open while waiting on the network.
    await session.commit()
    fetched = await _fetch_missing(missing)
    if not fetched:
        return cached

    tracked = _tracked_currencies()
    for day, rates in fetched.items():
        rates = {c: r for c, r in rates.items() if c in tracked}
        rates["EUR"] = 1.0
        cached[day] = rates
        for currency, per_eur in rates.items():
            session.add(HistoricalRate(date=day, currency=currency, per_eur=Decimal(str(per_eur))))
    try:
        await session.commit()
    except IntegrityError:
        # Another request cached the same day first; its rows are equivalent.
        await session.rollback()

    return cached


def _sample_days(start: date, today: date, days: int) -> list[date]:
    """Every step-th calendar day in the window, plus today.

    Anchored to the calendar rather than to today, so the same days are
    picked (and their cached rates reused) from one day to the next.
    """
    step = max(1, math.ceil(days / MAX_POINTS))
    result = [
        start + timedelta(days=i) for i in range(days)
        if (start + timedelta(days=i)).toordinal() % step == 0
    ]
    if not result or result[-1] != today:
        result.append(today)
    return result


async def get_history(
    session: AsyncSession, user_id: int, display_currency: str, days: int,
    types: set[str] | None = None,
) -> list[dict]:
    """Daily portfolio value for the last N days, in the display currency.

    With types, only those asset categories are summed. Days before the
    first transaction are left out, so the chart starts when tracking began.
    """
    today = datetime.utcnow().date()
    start = today - timedelta(days=days - 1)

    # Plain rows, not ORM objects: the rate cache commits, which would expire them.
    query = select(
        Transaction.date, Transaction.action, Transaction.amount, Transaction.currency
    ).where(Transaction.user_id == user_id).order_by(Transaction.date.asc())
    asset_query = select(Asset.currency, Asset.amount).where(Asset.user_id == user_id)
    if types is not None:
        query = query.where(Transaction.type.in_(types))
        asset_query = asset_query.where(Asset.type.in_(types))
    txns = [(d, action, float(amount), currency)
            for d, action, amount, currency in (await session.execute(query)).all()]
    assets = [(currency, float(amount))
              for currency, amount in (await session.execute(asset_query)).all()]

    if not txns and not assets:
        return []

    first_day = min(txns[0][0], today) if txns else today
    sample = [d for d in _sample_days(start, today, days) if d >= first_day]

    current_rates = await _load_rates(session)
    past_days = [d for d in sample if d < today]
    historical = await _load_historical_rates(session, past_days) if past_days else {}

    def value_on(balances: dict[str, float], day_rates: dict[str, float] | None) -> float:
        total = 0.0
        for currency, amount in balances.items():
            if amount == 0:
                continue
            if day_rates and currency in day_rates and display_currency in day_rates:
                rate = day_rates[display_currency] / day_rates[currency]
            else:
                rate = _resolve_rate(current_rates, currency, display_currency)
            total += amount * rate
        return total

    points = []
    balances: dict[str, float] = defaultdict(float)
    i = 0
    # A day without fetched rates reuses the latest earlier day's rates.
    last_rates: dict[str, float] | None = None
    for day in sample:
        if day == today:
            current = defaultdict(float)
            for currency, amount in assets:
                current[currency] += amount
            points.append({"date": day.isoformat(), "value": value_on(current, None)})
            continue
        while i < len(txns) and txns[i][0] <= day:
            _, action, amount, currency = txns[i]
            balances[currency] += amount if action == "add" else -amount
            i += 1
        if day in historical:
            last_rates = historical[day]
        points.append({"date": day.isoformat(), "value": value_on(balances, last_rates)})

    return points
