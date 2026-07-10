-- KeffiRooms Production Schema
-- PostgreSQL 14+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUMS ──
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('seeker', 'agent', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_status AS ENUM ('pending', 'approved', 'denied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM ('pending', 'verified', 'rejected', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inquiry_status AS ENUM ('open', 'coordinating', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'authorized', 'captured', 'refunded', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_action AS ENUM ('submitted', 'approved', 'rejected', 'flagged', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── USERS ──
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE,
  phone           VARCHAR(20) UNIQUE,
  password_hash   VARCHAR(255),
  role            user_role NOT NULL DEFAULT 'seeker',
  name            VARCHAR(120) NOT NULL,
  google_id       VARCHAR(255) UNIQUE,
  avatar_url      TEXT,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  recovery_phone  VARCHAR(20),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_or_phone_or_google CHECK (
    email IS NOT NULL OR phone IS NOT NULL OR google_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- ── AGENT PROFILES ──
CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status            agent_status NOT NULL DEFAULT 'pending',
  business_name     VARCHAR(120),
  verification_notes TEXT,
  is_promoted_admin BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_status ON agent_profiles(status);

CREATE SEQUENCE IF NOT EXISTS listing_serial_seq START WITH 1001;

-- ── LISTINGS ──
CREATE TABLE IF NOT EXISTS listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number INTEGER UNIQUE NOT NULL DEFAULT nextval('listing_serial_seq'),
  agent_id      UUID NOT NULL REFERENCES users(id),
  title       VARCHAR(200) NOT NULL,
  type        VARCHAR(80) NOT NULL,
  price       INTEGER NOT NULL CHECK (price > 0),
  description TEXT,
  area        VARCHAR(100) NOT NULL,
  landmark    VARCHAR(200),
  distance    VARCHAR(80) NOT NULL,
  amenities   JSONB NOT NULL DEFAULT '[]',
  status      listing_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_agent ON listings(agent_id);
CREATE INDEX IF NOT EXISTS idx_listings_area ON listings(area);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);

-- ── LISTING PHOTOS ──
CREATE TABLE IF NOT EXISTS listing_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  gps_lat      DECIMAL(10, 6),
  gps_lng      DECIMAL(10, 6),
  gps_acc      VARCHAR(20),
  device       VARCHAR(40),
  captured_at  TIMESTAMPTZ,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_photos_listing ON listing_photos(listing_id);

-- ── FAVORITES (saved listings) ──
CREATE TABLE IF NOT EXISTS favorites (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

-- ── INQUIRIES / APPLICATIONS ──
CREATE TABLE IF NOT EXISTS inquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES listings(id),
  seeker_id   UUID REFERENCES users(id),
  status      inquiry_status NOT NULL DEFAULT 'open',
  message     TEXT,
  guest_phone VARCHAR(20),
  guest_name  VARCHAR(120),
  contacted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_listing ON inquiries(listing_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_seeker ON inquiries(seeker_id);

-- ── CONVERSATIONS & MESSAGES (phase 1: async, phase 2: WebSocket) ──
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id  UUID UNIQUE REFERENCES inquiries(id) ON DELETE CASCADE,
  listing_id  UUID NOT NULL REFERENCES listings(id),
  seeker_id   UUID REFERENCES users(id),
  status      VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID REFERENCES users(id),
  sender_role     VARCHAR(20) NOT NULL DEFAULT 'system',
  body            TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- ── REVIEWS ──
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID REFERENCES listings(id),
  inquiry_id  UUID REFERENCES inquiries(id),
  seeker_id   UUID REFERENCES users(id),
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  fee_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id);

-- ── VERIFICATION REQUESTS (listing audit trail) ──
CREATE TABLE IF NOT EXISTS verification_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  admin_id    UUID REFERENCES users(id),
  action      verification_action NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_listing ON verification_requests(listing_id);

-- ── ADMIN ACTIONS (audit log) ──
CREATE TABLE IF NOT EXISTS admin_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES users(id),
  action_type VARCHAR(60) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id   UUID,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_id, created_at DESC);

-- ── PAYMENTS (future-ready) ──
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id      UUID REFERENCES inquiries(id),
  amount          INTEGER NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'NGN',
  status          payment_status NOT NULL DEFAULT 'pending',
  provider        VARCHAR(40),
  provider_ref    VARCHAR(120),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── REFRESH TOKENS ──
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ── PASSWORD RESET ──
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── OTP CODES (admin login, future 2FA) ──
CREATE TABLE IF NOT EXISTS otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   VARCHAR(255) NOT NULL,
  purpose     VARCHAR(40) NOT NULL DEFAULT 'admin_login',
  attempts    SMALLINT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_user ON otp_codes(user_id, purpose, created_at DESC);

-- ── UPDATED_AT TRIGGER ──
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_users_updated ON users;
CREATE TRIGGER tr_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS tr_agent_profiles_updated ON agent_profiles;
CREATE TRIGGER tr_agent_profiles_updated BEFORE UPDATE ON agent_profiles
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS tr_listings_updated ON listings;
CREATE TRIGGER tr_listings_updated BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS tr_inquiries_updated ON inquiries;
CREATE TRIGGER tr_inquiries_updated BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS tr_conversations_updated ON conversations;
CREATE TRIGGER tr_conversations_updated BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS tr_payments_updated ON payments;
CREATE TRIGGER tr_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Upgrade: serial numbers for existing databases
DO $$ BEGIN
  ALTER TABLE listings ADD COLUMN serial_number INTEGER UNIQUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE listings SET serial_number = nextval('listing_serial_seq') WHERE serial_number IS NULL;

DO $$ BEGIN
  ALTER TABLE listings ALTER COLUMN serial_number SET DEFAULT nextval('listing_serial_seq');
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_serial ON listings(serial_number);

-- Upgrade: optional recovery phone for login
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_phone VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_recovery_phone
  ON users(recovery_phone) WHERE recovery_phone IS NOT NULL;
