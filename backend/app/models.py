from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(BigInteger, primary_key=True)
    display_currency = Column(String(10), default="EUR")
    created_at = Column(DateTime, server_default=func.now())

    assets = relationship("Asset", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("UserSetting", back_populates="user", cascade="all, delete-orphan")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    type = Column(String(30), nullable=False)
    name = Column(String(255), nullable=False)
    currency = Column(String(10), nullable=False)
    amount = Column(Numeric(20, 8), nullable=False)
    bank = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    rate = Column(String(20), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="assets")
    transactions = relationship("Transaction", back_populates="asset")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    type = Column(String(30), nullable=False)
    action = Column(String(10), nullable=False)
    amount = Column(Numeric(20, 8), nullable=False)
    currency = Column(String(10), nullable=False)
    bank = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="transactions")
    asset = relationship("Asset", back_populates="transactions")


class UserSetting(Base):
    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_setting"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    key = Column(String(50), nullable=False)
    value = Column(JSON)

    user = relationship("User", back_populates="settings")


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (
        UniqueConstraint("user_id", "date", "display_currency", name="uq_snapshot_per_day"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    display_currency = Column(String(10), nullable=False)
    total_value = Column(Numeric(20, 8), nullable=False)
    breakdown = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (UniqueConstraint("base", "quote", name="uq_exchange_rate"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    base = Column(String(10), nullable=False)
    quote = Column(String(10), nullable=False)
    rate = Column(Numeric(20, 8), nullable=False)
    fetched_at = Column(DateTime, server_default=func.now())
