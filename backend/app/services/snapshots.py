import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Asset, ExchangeRate, PortfolioSnapshot, User

logger = logging.getLogger(__name__)

ASSET_TYPE_META = {
    "deposits": {"label": "Deposits", "icon": "🏦", "color": "#3B82F6"},
    "bank_accounts": {"label": "Bank Accounts", "icon": "🏧", "color": "#6366F1"},
    "cash": {"label": "Cash", "icon": "💵", "color": "#10B981"},
    "crypto": {"label": "Crypto", "icon": "₿", "color": "#EC4899"},
    "stocks_bonds": {"label": "Stocks/Bonds", "icon": "📈", "color": "#F59E0B"},
}


def _resolve_rate(
    rates: dict[tuple[str, str], float], base: str, quote: str
) -> float:
    if base == quote:
        return 1.0
    if (base, quote) in rates:
        return rates[(base, quote)]
    if (quote, base) in rates and rates[(quote, base)] != 0:
        return 1.0 / rates[(quote, base)]
    return 1.0


async def _load_rates(session: AsyncSession) -> dict[tuple[str, str], float]:
    result = await session.execute(select(ExchangeRate))
    return {(r.base, r.quote): float(r.rate) for r in result.scalars().all()}


async def compute_snapshot(
    session: AsyncSession, user_id: int, display_currency: str
) -> tuple[float, list[dict]]:
    """Compute current portfolio total and breakdown without saving."""
    result = await session.execute(select(Asset).where(Asset.user_id == user_id))
    assets = result.scalars().all()

    rates = await _load_rates(session)

    total = 0.0
    breakdown_map: dict[str, float] = {}

    for asset in assets:
        rate = _resolve_rate(rates, asset.currency, display_currency)
        converted = float(asset.amount) * rate
        total += converted
        breakdown_map[asset.type] = breakdown_map.get(asset.type, 0.0) + converted

    breakdown = []
    for asset_type, value in breakdown_map.items():
        meta = ASSET_TYPE_META.get(asset_type, {})
        breakdown.append({
            "type": asset_type,
            "value": float(value),
            "label": meta.get("label", asset_type),
            "color": meta.get("color", "#888888"),
            "icon": meta.get("icon", ""),
        })

    return float(total), breakdown


async def take_snapshot(
    session: AsyncSession, user_id: int, display_currency: str, snapshot_date: date | None = None
) -> PortfolioSnapshot | None:
    """Compute and upsert a portfolio snapshot for the given date (defaults to today)."""
    if snapshot_date is None:
        snapshot_date = datetime.utcnow().date()

    total_value, breakdown = await compute_snapshot(session, user_id, display_currency)

    if total_value == 0:
        return None

    result = await session.execute(
        select(PortfolioSnapshot).where(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.date == snapshot_date,
            PortfolioSnapshot.display_currency == display_currency,
        )
    )
    existing = result.scalar_one_or_none()

    if existing is not None:
        existing.total_value = Decimal(str(total_value))
        existing.breakdown = breakdown
        snapshot = existing
    else:
        snapshot = PortfolioSnapshot(
            user_id=user_id,
            date=snapshot_date,
            display_currency=display_currency,
            total_value=Decimal(str(total_value)),
            breakdown=breakdown,
        )
        session.add(snapshot)

    await session.flush()
    return snapshot


async def ensure_today_snapshot(
    session: AsyncSession, user_id: int, display_currency: str
) -> None:
    """Take today's snapshot if one doesn't already exist."""
    today = datetime.utcnow().date()
    result = await session.execute(
        select(PortfolioSnapshot.id).where(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.date == today,
            PortfolioSnapshot.display_currency == display_currency,
        )
    )
    if result.scalar_one_or_none() is None:
        await take_snapshot(session, user_id, display_currency, today)
        await session.commit()


async def get_history(
    session: AsyncSession, user_id: int, display_currency: str, days: int
) -> list[dict]:
    """Return snapshots for the last N days."""
    start_date = datetime.utcnow().date() - timedelta(days=days - 1)
    result = await session.execute(
        select(PortfolioSnapshot)
        .where(and_(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.display_currency == display_currency,
            PortfolioSnapshot.date >= start_date,
        ))
        .order_by(PortfolioSnapshot.date.asc())
    )
    snapshots = result.scalars().all()
    return [
        {"date": s.date.isoformat(), "value": float(s.total_value)}
        for s in snapshots
    ]
