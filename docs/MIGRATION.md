# Migration Roadmap

## Phase 0 — Audit (Complete)

### localStorage inventory (removed from data path)

| Key | Was used for | Replaced by |
|-----|--------------|-------------|
| `kr6_listings` | All listings | `GET /api/listings` |
| `kr6_agents` | Agent registry | `users` + `agent_profiles` tables |
| `kr6_seekers` | Seeker registry | `users` table (role=seeker) |
| `kr6_reviews` | Satisfaction reviews | `reviews` table |
| `kr6_loved` | Saved listings | `favorites` table |
| `kr6_session` | Auth state | JWT + `sessionStorage` cache |
| Hardcoded admin PIN | Admin login | Env-seeded admin + bcrypt |

### Security issues fixed

- Plaintext PINs in localStorage → bcrypt hashes in PostgreSQL
- Hardcoded credentials in `db.js` → server environment variables
- Client-side-only auth guards → JWT + server RBAC
- Base64 photos in localStorage → disk upload + URL references
- Fake Google login → real OAuth flow
- Random ratings → removed (reviews from DB when implemented)

## Phase 1 — Production MVP (This release)

- [x] PostgreSQL schema
- [x] Express API with JWT
- [x] Email/password auth for all roles
- [x] Google OAuth for seekers
- [x] Listing CRUD via API
- [x] Admin verification queue
- [x] Agent approval workflow
- [x] File uploads with GPS metadata
- [x] Inquiries + conversation records
- [x] Reviews API
- [x] Favorites API
- [x] Frontend API client layer
- [x] Preserve all existing pages and styling

## Phase 2 — Hardening (Recommended next)

- [ ] Email delivery (SendGrid/Resend) for password reset
- [ ] Paystack/Flutterwave payment records
- [ ] S3/R2 image storage + image optimization
- [ ] Redis session/rate-limit store
- [ ] Admin audit log UI
- [ ] Real-time chat (WebSocket)
- [ ] Mobile PWA + service worker
- [ ] Data migration script from old localStorage export

## Phase 3 — Scale

- [ ] Horizontal scaling behind load balancer
- [ ] CDN for static assets and images
- [ ] Full-text search (PostgreSQL tsvector or Meilisearch)
- [ ] Analytics dashboard
- [ ] SMS OTP for Nigerian phone verification

## Migrating Existing localStorage Data

If users have data in the old prototype:

1. Export from browser console:
   ```javascript
   copy(JSON.stringify({
     listings: localStorage.getItem('kr6_listings'),
     agents: localStorage.getItem('kr6_agents'),
     seekers: localStorage.getItem('kr6_seekers'),
   }))
   ```
2. Run a one-time import script (create `server/src/db/import-legacy.js`) mapping:
   - agents → `users` + `agent_profiles`
   - listings → `listings` + re-upload photos from base64
3. Notify users to re-register passwords (cannot migrate plaintext PINs securely)

## Rollback Plan

Keep a git tag `pre-production-mvp` on the localStorage-only version. Frontend can fall back only if API is unavailable — not recommended for production.
