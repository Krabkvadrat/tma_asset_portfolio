# Portfolio Tracker — Telegram Mini App

A Telegram Mini App (TMA) for tracking personal financial assets across bank deposits, bank accounts, cash, crypto, and stocks/bonds.

## Architecture

```
Telegram WebView → React/Vite Frontend → FastAPI Backend → PostgreSQL
```

- **Frontend**: React 19, Vite, Zustand, Telegram WebApp SDK
- **Backend**: Python 3.12, FastAPI, SQLAlchemy (async), Alembic
- **Database**: PostgreSQL 16
- **Deployment**: Docker Compose with Nginx reverse proxy

## Quick Start

### Development

1. Copy `.env.example` to `.env` and set `BOT_TOKEN=dev` for local development:

```bash
cp .env.example .env
```

2. Start the database:

```bash
docker compose up db -d
```

3. Start the backend:

```bash
cd backend
pip install -r requirements.txt
BOT_TOKEN=dev DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/portfolio uvicorn app.main:app --reload
```

4. Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

The app will be available at http://localhost:3000 with API proxied to the backend.

### Production (Docker Compose)

```bash
cp .env.example .env
# Edit .env with your real BOT_TOKEN
docker compose up --build -d
```

The app will be available at http://localhost (port 80) via Nginx.

### Raspberry Pi (auto-deploy)

Pushing to `main` auto-deploys to the Pi via GitHub Actions, with a health check
and automatic rollback. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for how it
works and the one-time setup.

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Settings (pydantic-settings)
│   │   ├── database.py          # Async SQLAlchemy setup
│   │   ├── auth.py              # Telegram initData HMAC validation
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── routers/             # API route handlers
│   │   │   ├── assets.py
│   │   │   ├── transactions.py
│   │   │   ├── portfolio.py
│   │   │   ├── settings.py
│   │   │   └── rates.py
│   │   └── services/
│   │       └── exchange_rates.py
│   ├── alembic/                 # Database migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main app shell
│   │   ├── api.js               # API client
│   │   ├── store.js             # Zustand state store
│   │   ├── constants.js         # Shared constants
│   │   ├── styles.js            # Shared styles
│   │   ├── components/          # Reusable components
│   │   │   ├── ChartSVG.jsx
│   │   │   ├── DonutChart.jsx
│   │   │   └── Modal.jsx
│   │   └── pages/               # Tab pages
│   │       ├── Portfolio.jsx
│   │       ├── Assets.jsx
│   │       ├── Add.jsx
│   │       ├── History.jsx
│   │       └── Settings.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── Dockerfile
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
├── .env.example
└── mock.jsx                     # Original UI prototype
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portfolio` | Total value, breakdown by type |
| GET | `/api/portfolio/history?period=30d` | Time-series data for chart |
| GET | `/api/assets` | All assets for the current user |
| POST | `/api/assets` | Create a new asset |
| PUT | `/api/assets/:id` | Update an asset |
| DELETE | `/api/assets/:id` | Delete an asset |
| GET | `/api/transactions` | Transaction history |
| POST | `/api/transactions` | Log add/withdraw transaction |
| GET | `/api/settings` | User settings |
| PUT | `/api/settings` | Update user settings |
| GET | `/api/rates` | Current exchange rates |
| POST | `/api/rates/refresh` | Refresh exchange rates |

## Authentication

All API requests include the Telegram `initData` via the `X-Telegram-Init-Data` header. The backend validates the HMAC-SHA256 signature against the bot token.

For development, set `BOT_TOKEN=dev` and use `dev:1` as the init data (where `1` is the user ID).
