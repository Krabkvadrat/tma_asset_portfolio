from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://user:password@db:5432/portfolio"
    DATABASE_URL_SYNC: str = "postgresql+psycopg2://user:password@db:5432/portfolio"
    BOT_TOKEN: str
    ALLOWED_ORIGINS: str = "*"

    FIAT_RATE_API_URL: str = "https://api.exchangerate-api.com/v4/latest"
    COINGECKO_API_URL: str = "https://api.coingecko.com/api/v3"

    FIAT_CURRENCIES: list[str] = ["EUR", "USD", "RUB", "RSD"]
    CRYPTO_IDS: dict[str, str] = {"BTC": "bitcoin", "ETH": "ethereum"}

    FIAT_CACHE_TTL: int = 3600
    CRYPTO_CACHE_TTL: int = 300

    ALLOWED_USER_IDS: list[int] = [325222201]

    model_config = {"env_file": ["../.env", ".env"]}


settings = Settings()
