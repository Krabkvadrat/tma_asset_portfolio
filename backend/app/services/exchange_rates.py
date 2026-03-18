import logging
from datetime import datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import ExchangeRate

logger = logging.getLogger(__name__)

CRYPTO_SYMBOLS = set(settings.CRYPTO_IDS.keys())


async def _upsert_rate(session: AsyncSession, base: str, quote: str, rate: float) -> None:
    result = await session.execute(
        select(ExchangeRate).where(
            ExchangeRate.base == base,
            ExchangeRate.quote == quote,
        )
    )
    existing = result.scalar_one_or_none()
    now = datetime.utcnow()
    if existing is not None:
        existing.rate = Decimal(str(rate))
        existing.fetched_at = now
    else:
        session.add(ExchangeRate(
            base=base, quote=quote,
            rate=Decimal(str(rate)), fetched_at=now,
        ))


async def _fetch_fiat_rates(client: httpx.AsyncClient, session: AsyncSession) -> int:
    """Fetch fiat cross-rates from exchangerate-api.com (free, no key required).

    Only stores pairs between configured FIAT_CURRENCIES to avoid
    flooding the DB with ~160 currencies per base.
    """
    fiat = settings.FIAT_CURRENCIES
    count = 0

    for base in fiat:
        try:
            resp = await client.get(f"{settings.FIAT_RATE_API_URL}/{base}")
            resp.raise_for_status()
            data = resp.json()
            api_rates = data.get("rates", {})

            for quote in fiat:
                if quote == base:
                    continue
                if quote in api_rates:
                    await _upsert_rate(session, base, quote, api_rates[quote])
                    count += 1

            logger.info("Fetched fiat rates for base=%s (%d pairs)", base, len(fiat) - 1)
        except httpx.HTTPError as exc:
            logger.warning("Failed to fetch fiat rates for %s: %s", base, exc)
        except (KeyError, ValueError) as exc:
            logger.warning("Unexpected fiat API response for %s: %s", base, exc)

    return count


async def _fetch_crypto_rates(client: httpx.AsyncClient, session: AsyncSession) -> int:
    """Fetch crypto prices from CoinGecko free API (no key required).

    GET /api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=eur,usd,rub
    Returns: {"bitcoin":{"eur":38500,"usd":42000,"rub":3780000}, ...}
    """
    ids_str = ",".join(settings.CRYPTO_IDS.values())
    fiat_lower = ",".join(c.lower() for c in settings.FIAT_CURRENCIES)
    symbol_by_id = {v: k for k, v in settings.CRYPTO_IDS.items()}
    count = 0

    try:
        resp = await client.get(
            f"{settings.COINGECKO_API_URL}/simple/price",
            params={"ids": ids_str, "vs_currencies": fiat_lower},
        )
        resp.raise_for_status()
        data = resp.json()

        for coin_id, prices in data.items():
            symbol = symbol_by_id.get(coin_id)
            if not symbol:
                continue

            for fiat_cur in settings.FIAT_CURRENCIES:
                price = prices.get(fiat_cur.lower())
                if price is not None and price > 0:
                    await _upsert_rate(session, symbol, fiat_cur, price)
                    await _upsert_rate(session, fiat_cur, symbol, 1.0 / price)
                    count += 2

        # Cross-rates between cryptos (e.g. BTC/ETH) via USD pivot
        crypto_usd: dict[str, float] = {}
        for coin_id, prices in data.items():
            symbol = symbol_by_id.get(coin_id)
            if symbol and "usd" in prices and prices["usd"] > 0:
                crypto_usd[symbol] = prices["usd"]

        symbols = list(crypto_usd.keys())
        for i, a in enumerate(symbols):
            for b in symbols[i + 1:]:
                cross = crypto_usd[a] / crypto_usd[b]
                await _upsert_rate(session, a, b, cross)
                await _upsert_rate(session, b, a, 1.0 / cross)
                count += 2

        logger.info("Fetched crypto rates from CoinGecko (%d pairs)", count)
    except httpx.HTTPError as exc:
        logger.warning("Failed to fetch crypto rates from CoinGecko: %s", exc)
    except (KeyError, ValueError) as exc:
        logger.warning("Unexpected CoinGecko response: %s", exc)

    return count


async def refresh_exchange_rates(session: AsyncSession) -> int:
    """Fetch and cache all exchange rates (fiat + crypto)."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        fiat_count = await _fetch_fiat_rates(client, session)
        crypto_count = await _fetch_crypto_rates(client, session)

    await session.commit()
    total = fiat_count + crypto_count
    logger.info("Exchange rate refresh complete: %d rates updated", total)
    return total


async def get_rate(session: AsyncSession, base: str, quote: str) -> float:
    """Look up a cached rate, refreshing if stale or missing."""
    if base == quote:
        return 1.0

    result = await session.execute(
        select(ExchangeRate).where(
            ExchangeRate.base == base,
            ExchangeRate.quote == quote,
        )
    )
    row = result.scalar_one_or_none()

    if row is not None:
        is_crypto = base in CRYPTO_SYMBOLS or quote in CRYPTO_SYMBOLS
        ttl = settings.CRYPTO_CACHE_TTL if is_crypto else settings.FIAT_CACHE_TTL
        if row.fetched_at and (datetime.utcnow() - row.fetched_at) < timedelta(seconds=ttl):
            return float(row.rate)

    await refresh_exchange_rates(session)

    result = await session.execute(
        select(ExchangeRate).where(
            ExchangeRate.base == base,
            ExchangeRate.quote == quote,
        )
    )
    row = result.scalar_one_or_none()
    if row is not None:
        return float(row.rate)

    # Try inverse
    result = await session.execute(
        select(ExchangeRate).where(
            ExchangeRate.base == quote,
            ExchangeRate.quote == base,
        )
    )
    inverse = result.scalar_one_or_none()
    if inverse is not None and float(inverse.rate) != 0:
        return 1.0 / float(inverse.rate)

    logger.warning("No rate found for %s/%s — defaulting to 1.0", base, quote)
    return 1.0
