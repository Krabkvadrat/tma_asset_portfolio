from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import PortfolioHistoryPoint, PortfolioResponse
from app.services.snapshots import compute_snapshot, ensure_today_snapshot, get_history

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

PERIOD_DAYS = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "1Y": 365,
}


@router.get("/", response_model=PortfolioResponse)
async def get_portfolio(
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    display_currency = user.display_currency if user else "EUR"

    total_value, breakdown = await compute_snapshot(db, user_id, display_currency)

    await ensure_today_snapshot(db, user_id, display_currency)

    return PortfolioResponse(
        total_value=total_value,
        display_currency=display_currency,
        breakdown=breakdown,
    )


@router.get("/history", response_model=list[PortfolioHistoryPoint])
async def get_portfolio_history(
    period: str = Query(default="30d"),
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    display_currency = user.display_currency if user else "EUR"

    await ensure_today_snapshot(db, user_id, display_currency)

    days = PERIOD_DAYS.get(period, 30)
    points = await get_history(db, user_id, display_currency, days)
    return [PortfolioHistoryPoint(**p) for p in points]
