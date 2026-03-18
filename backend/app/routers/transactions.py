from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Asset, Transaction, User
from app.routers.assets import ensure_user
from app.schemas import TransactionCreate, TransactionResponse
from app.services.snapshots import take_snapshot

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("/", response_model=list[TransactionResponse])
async def list_transactions(
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    body: TransactionCreate,
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_user(db, user_id)

    asset: Asset | None = None

    if body.action == "add":
        result = await db.execute(
            select(Asset).where(
                Asset.user_id == user_id,
                Asset.type == body.type,
                Asset.currency == body.currency,
                Asset.name == body.name,
            )
        )
        asset = result.scalar_one_or_none()
        if asset is not None:
            asset.amount = asset.amount + Decimal(str(body.amount))
        else:
            asset = Asset(
                user_id=user_id,
                type=body.type,
                name=body.name,
                currency=body.currency,
                amount=body.amount,
                bank=body.bank,
                note=body.note,
            )
            db.add(asset)
            await db.flush()

    elif body.action == "remove":
        if body.asset_id:
            result = await db.execute(
                select(Asset).where(Asset.id == body.asset_id, Asset.user_id == user_id)
            )
        else:
            result = await db.execute(
                select(Asset).where(
                    Asset.user_id == user_id,
                    Asset.type == body.type,
                    Asset.currency == body.currency,
                    Asset.name == body.name,
                )
            )
        asset = result.scalar_one_or_none()
        if asset is None:
            raise HTTPException(status_code=404, detail="Asset not found for withdrawal")
        withdraw = Decimal(str(body.amount))
        if withdraw > asset.amount:
            raise HTTPException(status_code=400, detail=f"Insufficient balance ({asset.amount})")
        asset.amount = asset.amount - withdraw

    txn = Transaction(
        user_id=user_id,
        asset_id=asset.id if asset else None,
        type=body.type,
        action=body.action,
        amount=body.amount,
        currency=body.currency,
        bank=body.bank,
        note=body.note,
        date=body.date,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)

    # Update today's portfolio snapshot after the balance change
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if user:
        await take_snapshot(db, user_id, user.display_currency or "EUR")
        await db.commit()

    return txn
