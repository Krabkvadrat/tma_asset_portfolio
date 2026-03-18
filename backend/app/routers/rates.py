from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import ExchangeRate
from app.schemas import ExchangeRateResponse
from app.services.exchange_rates import refresh_exchange_rates

router = APIRouter(prefix="/api/rates", tags=["rates"])


@router.get("/", response_model=list[ExchangeRateResponse])
async def list_rates(
    _user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ExchangeRate))
    return result.scalars().all()


@router.post("/refresh")
async def refresh_rates(
    _user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await refresh_exchange_rates(db)
    return {"ok": True, "rates_updated": count}
