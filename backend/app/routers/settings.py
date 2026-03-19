from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Asset, PortfolioSnapshot, Transaction, User, UserSetting
from app.routers.assets import ensure_user
from app.schemas import UserSettingResponse, UserSettingUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_SETTINGS: dict[str, object] = {
    "enabled_types": ["deposits", "bank_accounts", "cash", "crypto", "stocks_bonds"],
    "currencies": ["EUR", "USD"],
    "banks": {
        "deposits": ["Tinkoff", "Sber"],
        "bank_accounts": ["Tinkoff", "Sber", "Alpha"],
    },
}


@router.get("/", response_model=list[UserSettingResponse])
async def get_settings(
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await ensure_user(db, user_id)

    result = await db.execute(
        select(UserSetting).where(UserSetting.user_id == user_id)
    )
    settings = {s.key: s for s in result.scalars().all()}

    out: list[UserSettingResponse] = []
    for key, default_value in DEFAULT_SETTINGS.items():
        if key in settings:
            s = settings[key]
            out.append(UserSettingResponse(key=s.key, value=s.value))
        else:
            out.append(UserSettingResponse(key=key, value=default_value))

    display_currency = user.display_currency or "EUR"
    if "display_currency" in settings:
        s = settings["display_currency"]
        out.append(UserSettingResponse(key=s.key, value=s.value))
    else:
        out.append(UserSettingResponse(key="display_currency", value=display_currency))

    return out


@router.put("/", response_model=UserSettingResponse)
async def update_setting(
    body: UserSettingUpdate,
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await ensure_user(db, user_id)

    if body.key == "display_currency":
        user.display_currency = body.value
        await db.commit()
        return UserSettingResponse(id=0, user_id=user_id, key="display_currency", value=body.value)

    result = await db.execute(
        select(UserSetting).where(
            UserSetting.user_id == user_id,
            UserSetting.key == body.key,
        )
    )
    setting = result.scalar_one_or_none()

    if setting is not None:
        setting.value = body.value
    else:
        setting = UserSetting(user_id=user_id, key=body.key, value=body.value)
        db.add(setting)

    await db.commit()
    await db.refresh(setting)
    return UserSettingResponse(id=setting.id, user_id=setting.user_id, key=setting.key, value=setting.value)


@router.delete("/reset-data")
async def reset_all_data(
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(Transaction).where(Transaction.user_id == user_id))
    await db.execute(delete(Asset).where(Asset.user_id == user_id))
    await db.execute(delete(PortfolioSnapshot).where(PortfolioSnapshot.user_id == user_id))
    await db.commit()
    return {"ok": True}
