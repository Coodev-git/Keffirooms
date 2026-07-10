# Changelog — Production Architecture Migration

## Summary

Converted KeffiRooms from a client-only localStorage prototype to a full-stack application with Node.js, Express, PostgreSQL, JWT authentication, and secure file uploads — while preserving the existing UI, branding, pages, and user flows.

## New Files

### Backend (`server/`)
- `package.json` — Express, pg, bcrypt, JWT, multer, helmet, rate-limit
- `.env.example` — environment template
- `src/index.js` — application entry, static file serving
- `src/config/index.js` — centralized configuration
- `src/db/schema.sql` — full PostgreSQL schema (14 tables)
- `src/db/pool.js`, `migrate.js`, `seed.js`
- `src/middleware/` — auth, loadUser, upload, validate, rateLimit, errorHandler
- `src/routes/` — auth, listings, admin, social
- `src/services/` — auth, listing, admin, message, review

### Frontend
- `js/config.js` — API configuration
- `js/api.js` — HTTP client with token refresh
- `auth-seeker.html` — student login/register + Google
- `auth-callback.html` — OAuth token handler
- `reset-password.html` — password reset flow

### Infrastructure
- `docker-compose.yml` — PostgreSQL 16 for local dev
- `package.json` (root) — setup/dev scripts
- `.gitignore`

### Documentation
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/MIGRATION.md`
- `docs/DEPLOYMENT.md`
- `docs/CHANGELOG.md` (this file)

## Modified Files

| File | Changes |
|------|---------|
| `js/db.js` | Removed localStorage DB; kept utilities, theme, GPS |
| `js/auth.js` | API login/register, JWT session, Google redirect |
| `js/seeker.js` | API listings, favorites, inquiries |
| `js/agent.js` | Multipart listing upload to API |
| `js/admin.js` | All admin operations via API |
| `auth-agent.html` | Email/password instead of PIN |
| `auth-admin.html` | Email/password instead of hardcoded PIN |
| `index.html` | API stats/featured/reviews; seeker → auth-seeker |
| `seeker.html`, `agent.html`, `admin.html` | Added config.js + api.js scripts |
| `chat.html` | API reviews and messages |
| `admin.html` | Removed duplicate inline localStorage admin logic |

## Removed / Deprecated

- `DB` object and `saveDB()` in client
- IndexedDB photo queue (replaced by direct multipart upload)
- Hardcoded `ADMIN_PIN`, `ADMIN_EMAIL` in client `db.js`
- Plaintext agent PIN storage
- Fake `seekerGoogleLogin()` session stub
- Duplicate `contactViaWhatsApp` and `admTab` definitions
- Random star ratings on listing cards

## Database Tables

`users`, `agent_profiles`, `listings`, `listing_photos`, `favorites`, `inquiries`, `conversations`, `messages`, `reviews`, `verification_requests`, `admin_actions`, `payments`, `refresh_tokens`, `password_reset_tokens`

## Breaking Changes for Users

- Must create accounts with email + password (old PINs not migrated)
- Data from old localStorage does not auto-transfer
- App must be served via the Node server (not `file://`)

## Client-only State (intentionally kept)

- `kr6_theme` — dark/light preference
- `kr6_terms_accepted` — terms acceptance flag
- `kr6_access_token` — JWT access token
- `sessionStorage` — session cache, chat listing context
