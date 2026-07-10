# Production deployment checklist

Use this before pushing to GitHub and deploying to your host.

## 1. Code on GitHub (no secrets)

- Commit the repo **without** `server/.env` (already in `.gitignore`)
- Include `server/.env.example` and `server/.env.production.example`
- Never commit SMTP passwords, JWT secrets, or API keys

## 2. Generate secrets

On your machine:

```bash
openssl rand -base64 48   # → JWT_ACCESS_SECRET
openssl rand -base64 48   # → JWT_REFRESH_SECRET
```

Choose a strong `ADMIN_PASSWORD` (not the default).

## 3. Set environment on your host

Copy every variable from [`server/.env.production.example`](../server/.env.production.example) into your hosting dashboard.

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | Yes | `production` |
| `APP_URL` / `CLIENT_URL` | Yes | `https://your-domain.com` |
| `DATABASE_URL` | Yes | Neon/Railway/Render Postgres with `?sslmode=require` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Yes | Different random strings, 32+ chars |
| `ADMIN_PASSWORD` | Yes | Strong password (used on first seed) |
| `SMTP_PASS` | Yes | Gmail App Password |
| `CLOUDINARY_*` | Yes | All three for listing photos |
| `GOOGLE_CLIENT_ID` | Recommended | Real OAuth client (not placeholder) |
| `GOOGLE_CLIENT_SECRET` | Recommended | For redirect OAuth fallback |
| `GOOGLE_DEV_LOGIN` | Yes | Must be `false` or unset |

## 4. External services

### PostgreSQL (Neon recommended)

1. Create a project at [neon.tech](https://neon.tech)
2. Copy connection string with `?sslmode=require`
3. Set as `DATABASE_URL`

### Cloudinary

1. [cloudinary.com](https://cloudinary.com) → Dashboard
2. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. OAuth 2.0 Client ID → Web application
3. **JavaScript origins:** `https://your-domain.com`
4. **Redirect URI:** `https://your-domain.com/api/auth/google/callback`

### Gmail SMTP

1. Enable 2-Step Verification on the Gmail account
2. [App Passwords](https://myaccount.google.com/apppasswords) → create one for KeffiRooms
3. Set `SMTP_USER` and `SMTP_PASS`

## 5. Validate before deploy

```bash
# Temporarily point at production values (or set on host)
cd server
NODE_ENV=production npm run prod:check
```

Fix every **Blocker** until you see `✅ Production configuration looks good`.

## 6. Deploy & migrate

```bash
cd server && npm install
npm run db:migrate
npm run db:seed    # first deploy only — creates admin user
npm start
```

### Render

Use the included [`render.yaml`](../render.yaml). After connecting the repo:

1. Add all env vars in the Render dashboard
2. Attach a Postgres database or use Neon `DATABASE_URL`
3. Run **Shell** once: `cd server && npm run db:seed`

## 7. Post-deploy smoke test

- `GET https://your-domain.com/api/health` → `productionReady: true`
- Open `https://your-domain.com`
- Admin login at `/auth-admin.html` (OTP email)
- Agent register, listing upload (Cloudinary)
- Student email login + Google (if configured)

## Local development

Keep `NODE_ENV=development` in `server/.env`. Production checks are skipped; dev Google email sign-in works when `GOOGLE_CLIENT_ID` is empty.
