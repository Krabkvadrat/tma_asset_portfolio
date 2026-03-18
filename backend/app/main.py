import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, async_session, engine
from app.routers import assets, portfolio, rates, settings as settings_router, transactions
from app.services.exchange_rates import refresh_exchange_rates

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        from app import models  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)

    # Seed exchange rates on startup
    try:
        async with async_session() as session:
            count = await refresh_exchange_rates(session)
            logger.info("Startup: loaded %d exchange rates", count)
    except Exception:
        logger.exception("Startup: failed to load exchange rates (will retry on first request)")

    yield


app = FastAPI(title="Portfolio Tracker API", lifespan=lifespan)

origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets.router)
app.include_router(transactions.router)
app.include_router(portfolio.router)
app.include_router(rates.router)
app.include_router(settings_router.router)


@app.get("/")
async def root():
    return {"status": "ok"}
