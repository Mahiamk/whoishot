# WhoIsHot


Opt-in campus rating contests. See [SPEC.md](SPEC.md) for the full product spec.

Monorepo layout:

- `backend/` — FastAPI + SQLAlchemy 2.0 + Alembic (API at `/api/v1/*`)
- `frontend/` — React 18 + Vite + TypeScript + Tailwind + shadcn/ui

## Backend

```sh
cd backend
cp .env.example .env   # first time only — see below
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Health check: http://localhost:8000/api/v1/health

### Config

Backend config is read from environment variables, loaded from `backend/.env`
(gitignored). [`backend/.env.example`](backend/.env.example) documents every
variable with dev + production guidance; copy it to `.env` and edit.

| Variable       | Default                      | Notes                                          |
| -------------- | ----------------------------- | ----------------------------------------------- |
| `DATABASE_URL` | `sqlite:///./whoishot.db`  | Postgres in production (`postgresql://...`)     |

| `JWT_SECRET`   | `change-me-in-production`     | Long random value in production — signs auth tokens |
| `CORS_ORIGINS` | `http://localhost:5173`       | Comma-separated allowed origins                 |
| `FRONTEND_URL` | `http://localhost:5173`       | Used to build links in emails                   |
| `ADMIN_EMAIL`  | unset                         | Auto-promoted to admin on startup, if set        |
| `SMTP_HOST`    | unset                         | Unset = emails print to console (dev)            |
| `SMTP_PORT`    | `587`                         |                                                  |
| `SMTP_USER`    | unset                         |                                                  |
| `SMTP_PASSWORD`| unset                         |                                                  |
| `SMTP_FROM`    | `no-reply@whoishot.local`     |                                                  |

**Production**: set `DATABASE_URL` to a Postgres connection string (the
`psycopg2-binary` driver is already in `requirements.txt`), generate a real
`JWT_SECRET` (`python3 -c "import secrets; print(secrets.token_hex(32))"`),
point `CORS_ORIGINS`/`FRONTEND_URL` at your real domain, configure `SMTP_*`
for your provider, and run behind gunicorn instead of the dev server, e.g.
`gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000`
(gunicorn is in `requirements.txt`). Never commit `.env` — only `.env.example`.

Tests:

```sh
cd backend
.venv/bin/pytest tests
```

Migrations:

```sh
cd backend
.venv/bin/alembic revision --autogenerate -m "message"
.venv/bin/alembic upgrade head
```

## Frontend

```sh
cd frontend
cp .env.example .env   # first time only
npm install
npm run dev
```

App: http://localhost:5173

Config: [`frontend/.env.example`](frontend/.env.example) documents
`VITE_API_URL` (defaults to `http://localhost:8000/api/v1`; point it at your
deployed API URL in production).

Routes: `/` (landing), `/login`, `/register`, `/contest/:joinCode`,
`/contest/:joinCode/board`, `/c/:contestantId` (profile),
`/join/:joinCode` (become contestant), `/me` (account), `/admin` (admin only).

Production build: `npm run build` (output in `frontend/dist/`), served by
any static host (Vercel, Netlify, nginx, etc). `VITE_API_URL` is baked in
at build time — set it before running `npm run build` for production.
