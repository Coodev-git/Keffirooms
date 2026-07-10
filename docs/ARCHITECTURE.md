# KeffiRooms — Architecture

## Overview

KeffiRooms is a student housing marketplace for NSUK Keffi, Nigeria. The production architecture separates concerns into:

- **Static frontend** — existing HTML/CSS/JS pages (preserved UI/UX)
- **Express API** — REST backend with JWT auth, RBAC, validation
- **PostgreSQL** — durable data store
- **Local file storage** — listing photos (S3-ready abstraction path)

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (index, seeker, agent, admin, chat, auth pages)   │
│  js/config.js → js/api.js → js/auth.js + page modules       │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS /api/*
┌───────────────────────────▼─────────────────────────────────┐
│  Express Server (server/src/index.js)                        │
│  ├── Middleware: helmet, cors, rate-limit, loadUser, JWT     │
│  ├── Routes: /api/auth, /api/listings, /api/admin, /api/*  │
│  └── Static: HTML, CSS, JS, /uploads                         │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
       PostgreSQL 16                 uploads/
```

## Folder Structure

```
keffirooms/
├── index.html, seeker.html, agent.html, admin.html, chat.html
├── auth-seeker.html, auth-agent.html, auth-admin.html
├── auth-callback.html, reset-password.html
├── css/                          # Unchanged styles
├── js/
│   ├── config.js                 # API base URL
│   ├── api.js                    # HTTP client + token refresh
│   ├── db.js                     # Utilities (GPS, theme, fmt)
│   ├── auth.js                   # Session + login flows
│   ├── seeker.js, agent.js, admin.js
├── server/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js              # App entry
│       ├── config/
│       ├── db/                   # schema.sql, migrate, seed, pool
│       ├── middleware/           # auth, upload, rate-limit, errors
│       ├── routes/               # auth, listings, admin, social
│       └── services/             # business logic
├── docs/                         # API, migration, deployment
├── docker-compose.yml            # PostgreSQL for local dev
└── package.json                  # Root scripts
```

## Authentication

| Method | Details |
|--------|---------|
| Email + password | bcrypt (12 rounds), min 8 chars |
| Google OAuth | Authorization code flow → JWT |
| JWT access | 15 min, Bearer header |
| Refresh token | 7 days, httpOnly cookie on `/api/auth` |
| Password reset | Token hashed in DB, 1h expiry |

### Roles (RBAC)

| Role | Permissions |
|------|-------------|
| `seeker` | Browse, favorites, inquiries, reviews |
| `agent` | Create listings (when `approved`), view own listings |
| `admin` | Verify listings, approve agents, KPI, audit log |

## Messaging (Phase 1)

WhatsApp remains the primary coordination channel (preserved UX). Backend stores:

- `inquiries` — seeker interest in a listing
- `conversations` + `messages` — async chat log (phase 1)
- **Phase 2 recommendation**: WebSocket (Socket.io) or Supabase Realtime for live admin↔seeker chat

## File Uploads

- Multer → `server/uploads/listings/`
- Served at `/uploads/listings/{filename}`
- GPS metadata stored in `listing_photos` table
- **Production**: migrate to S3/Cloudflare R2 with signed URLs

## Security Controls

- Helmet HTTP headers
- CORS restricted to `CLIENT_URL`
- Rate limiting (global + auth + upload)
- express-validator on all inputs
- Parameterized SQL (pg)
- No secrets in frontend
- Admin credentials from env seed only

## localStorage Usage (Post-Migration)

| Key | Purpose | Keep? |
|-----|---------|-------|
| `kr6_theme` | UI preference | Yes (client-only) |
| `kr6_terms_accepted` | Terms gate | Yes (client-only) |
| `kr6_access_token` | JWT access token | Yes (short-lived) |
| `kr6_session` | Session cache | sessionStorage |
| ~~kr6_listings~~ | Removed | API |
| ~~kr6_agents~~ | Removed | API |
| ~~kr6_reviews~~ | Removed | API |

## Scalability Path

1. **Now**: Single Node process + PostgreSQL + local disk
2. **Next**: Redis for sessions/rate-limit; S3 for images
3. **Later**: Read replicas, CDN, payment webhooks (Paystack/Flutterwave)
