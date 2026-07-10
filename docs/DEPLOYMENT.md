# Deployment Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or Docker)
- Domain with HTTPS (production)
- Google Cloud OAuth credentials (optional, for Google login)

## Local Development

```bash
# 1. Clone and install
cd keffirooms
npm run setup

# 2. Configure environment
cp server/.env.example server/.env
# Edit JWT secrets and admin password in server/.env

# 3. Start API + static frontend
npm run dev
```

Open http://localhost:3000

Default admin (after seed):
- Email: `keffirooms@gmail.com` (or `ADMIN_EMAIL` in `.env`)
- Login: http://localhost:3000/auth-admin.html — enter `keffirooms@gmail.com`, then the 6-digit OTP from email
- **Gmail:** enable 2-Step Verification, create an [App Password](https://myaccount.google.com/apppasswords), set `SMTP_PASS` in `server/.env`
- Test delivery: `cd server && npm run test:smtp`

## Docker PostgreSQL Only

```bash
docker compose up -d postgres
cd server && npm install
cp .env.example .env
npm run db:migrate && npm run db:seed
npm run dev
```

## Production (VPS — e.g. DigitalOcean, AWS EC2)

### 1. Server setup

```bash
sudo apt update && sudo apt install -y nodejs npm nginx postgresql
```

### 2. Database

```bash
sudo -u postgres createuser keffirooms -P
sudo -u postgres createdb keffirooms -O keffirooms
```

Set `DATABASE_URL=postgresql://keffirooms:PASSWORD@localhost:5432/keffirooms`

### 3. Application

```bash
git clone <repo> /var/www/keffirooms
cd /var/www/keffirooms/server
npm ci --omit=dev
cp .env.example .env
# Set production values:
# NODE_ENV=production
# JWT_ACCESS_SECRET=<openssl rand -base64 48>
# JWT_REFRESH_SECRET=<openssl rand -base64 48>
# ADMIN_PASSWORD=<strong password>
# CLIENT_URL=https://yourdomain.com
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
# GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback

npm run db:migrate
npm run db:seed
```

### 4. Process manager (PM2)

```bash
npm install -g pm2
cd /var/www/keffirooms/server
pm2 start src/index.js --name keffirooms
pm2 save && pm2 startup
```

### 5. Nginx reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo certbot --nginx -d yourdomain.com
```

### 6. Google OAuth

1. Create project at https://console.cloud.google.com/
2. APIs & Services → Credentials → OAuth 2.0 Client
3. Authorized redirect URI: `https://yourdomain.com/api/auth/google/callback`
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`

## Production (Railway / Render)

1. Add PostgreSQL plugin
2. Set environment variables from `.env.example`
3. Build command: `cd server && npm install`
4. Start command: `cd server && npm run db:migrate && npm run db:seed && npm start`
5. Set `CLIENT_URL` and `APP_URL` to your deployed URL

## Backups

```bash
pg_dump $DATABASE_URL > backup-$(date +%F).sql
```

Schedule daily backups. Back up `server/uploads/` alongside the database.

## Health Check

```bash
curl https://yourdomain.com/api/health
```

## Post-Deploy Checklist

- [ ] Change default admin password
- [ ] Rotate JWT secrets
- [ ] Verify HTTPS on all routes
- [ ] Test agent registration → admin approval → listing → verification flow
- [ ] Test seeker signup → contact → inquiry created in DB
- [ ] Configure firewall (only 80/443 public)
- [ ] Set up uptime monitoring
