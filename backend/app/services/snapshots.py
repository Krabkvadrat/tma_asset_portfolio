import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Asset, ExchangeRate

logger = logging.getLogger(__name__)

ASSET_TYPE_META = {
    "deposits": {"label": "Deposits", "icon": "🏦", "color": "#3B82F6"},
    "bank_accounts": {"label": "Bank Accounts", "icon": "🏧", "color": "#6366F1"},
    "cash": {"label": "Cash", "icon": "💵", "color": "#10B981"},
    "crypto": {"label": "Crypto", "icon": "₿", "color": "#EC4899"},
    "stocks_bonds": {"label": "Stocks/Bonds", "icon": "📈", "color": "#F59E0B"},
    "real_estate": {"label": "Real Estate", "icon": "🏠", "color": "#06B6D4"},
    "car": {"label": "Car", "icon": "🚗", "color": "#8B5CF6"},
    "debts": {"label": "Debts", "icon": "🤝", "color": "#84CC16"},
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
