# KeffiRooms

Verified student housing platform with trust-capture technology — NSUK lodges, agent listings, admin trust controls.

## Quick Start

**Important:** Open the app at **http://localhost:3000** — not Live Server, not by double-clicking HTML files.

```bash
# 1. Install server dependencies
cd server && npm install && cp .env.example .env

# 2. Start PostgreSQL (pick one option below)

# Option A — Docker (recommended)
docker compose up -d postgres

# Option B — Homebrew (macOS, no Docker)
brew install postgresql@16
brew services start postgresql@16
createuser keffirooms -s 2>/dev/null || true
createdb keffirooms -O keffirooms 2>/dev/null || true

# 3. Create tables + admin user
npm run db:migrate
npm run db:seed

# 4. Start the app (serves UI + API together)
npm run dev
```

Open **http://localhost:3000** in your browser.

**Default admin:** `keffirooms@gmail.com` — sign in at `/auth-admin.html` with a one-time email code (OTP). Set `SMTP_*` in `server/.env` for Gmail delivery; without SMTP, the code is logged in the server console during development.

### Troubleshooting "Failed to fetch"

| Cause | Fix |
|-------|-----|
| Opened HTML via Live Server (`:5500`) or `file://` | Use **http://localhost:3000** after `npm run dev` |
| Server not running | `cd server && npm run dev` |
| PostgreSQL not running | `docker compose up -d postgres` then migrate |

Check API health: http://localhost:3000/api/health — `database` should be `"ok"`.

## Production & GitHub

Before pushing to GitHub and deploying:

1. **Do not commit** `server/.env` (secrets stay on your host only).
2. Follow **[Production checklist](docs/PRODUCTION.md)** — generate JWT secrets, set Cloudinary, SMTP, Google OAuth.
3. Validate config: `npm run prod:check` (with production env vars set).
4. Deploy template: `server/.env.production.example` + optional `render.yaml`.

The server **refuses to start** in `NODE_ENV=production` if JWT, database, HTTPS URLs, SMTP, or Cloudinary are missing.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Migration Plan](docs/MIGRATION.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Production checklist](docs/PRODUCTION.md)
- [Changelog](docs/CHANGELOG.md)

## Stack

- Frontend: HTML, CSS, vanilla JavaScript (original UI preserved)
- Backend: Node.js, Express.js
- Database: PostgreSQL
- Auth: JWT + bcrypt + Google OAuth

## Roles

| Role | Pages |
|------|-------|
| Student | `auth-seeker.html` → `seeker.html` |
| Agent | `auth-agent.html` → `agent.html` |
| Admin | `auth-admin.html` → `admin.html` |
