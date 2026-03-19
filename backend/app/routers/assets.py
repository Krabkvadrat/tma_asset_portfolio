from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from decimal import Decimal
from datetime import datetime

from app.auth import get_current_user
from app.database import get_db
from app.models import Asset, Transaction, User
from app.schemas import AssetCreate, AssetResponse, AssetUpdate
from app.services.snapshots import take_snapshot

router = APIRouter(prefix="/api/assets", tags=["assets"])


async def ensure_user(session: AsyncSession, user_id: int) -> User:
    result = await session.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(user_id=user_id)
        session.add(user)
        await session.flush()
    return user


@router.get("/", response_model=list[AssetResponse])
async def list_assets(
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Asset).where(Asset.user_id == user_id))
    return result.scalars().all()


@router.post("/", response_model=AssetResponse, status_code=201)
async def create_asset(
    body: AssetCreate,
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_user(db, user_id)
    asset = Asset(user_id=user_id, **body.model_dump())
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: int,
    body: AssetUpdate,
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if asset is None or asset.user_id != user_id:
        raise HTTPException(status_code=404, detail="Asset not found")

    old_amount = float(asset.amount)
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(asset, field, value)
    new_amount = float(asset.amount)

    if old_amount != new_amount:
        diff = new_amount - old_amount
        txn = Transaction(
            user_id=user_id,
            asset_id=asset.id,
            type=asset.type,
            action="add" if diff > 0 else "remove",
            amount=Decimal(str(abs(diff))),
            currency=asset.currency,
            bank=asset.bank,
            note="Manual adjustment",
            date=datetime.utcnow().date(),
        )
        db.add(txn)

    await db.commit()
    await db.refresh(asset)

    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if user:
        await take_snapshot(db, user_id, user.display_currency or "EUR")
        await db.commit()

    return asset


@router.delete("/{asset_id}")
async def delete_asset(
    asset_id: int,
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if asset is None or asset.user_id != user_id:
        raise HTTPException(status_code=404, detail="Asset not found")
    await db.delete(asset)
    await db.commit()

    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if user:
        await take_snapshot(db, user_id, user.display_currency or "EUR")
        await db.commit()

    return {"ok": True}
