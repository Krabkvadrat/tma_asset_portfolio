from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AssetCreate(BaseModel):
    type: str
    name: str
    currency: str
    amount: float
    bank: Optional[str] = None
    note: Optional[str] = None
    rate: Optional[str] = None


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    amount: Optional[float] = None
    bank: Optional[str] = None
    note: Optional[str] = None
    rate: Optional[str] = None


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: str
    currency: str
    amount: float
    bank: Optional[str] = None
    note: Optional[str] = None
    rate: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class TransactionCreate(BaseModel):
    asset_id: Optional[int] = None
    type: str
    action: str
    name: str = ""
    amount: float
    currency: str
    bank: Optional[str] = None
    note: Optional[str] = None
    date: date


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    action: str
    amount: float
    currency: str
    bank: Optional[str] = None
    note: Optional[str] = None
    date: date
    created_at: datetime


class UserSettingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    value: Any


class UserSettingUpdate(BaseModel):
    key: str
    value: Any


class ExchangeRateResponse(BaseModel):
    base: str
    quote: str
    rate: float
    fetched_at: datetime


class PortfolioResponse(BaseModel):
    total_value: float
    breakdown: list[dict]
    display_currency: str


class PortfolioHistoryPoint(BaseModel):
    date: str
    value: float
