-- BeerBot initial database schema
-- US-002: Create all tables, enums, constraints, and indexes

-- ============================================================
-- Custom ENUM types
-- ============================================================

CREATE TYPE tap_status AS ENUM ('active', 'inactive', 'maintenance');

CREATE TYPE order_status AS ENUM (
  'pending_payment',
  'paid',
  'ready_to_redeem',
  'redeemed',
  'pouring',
  'completed',
  'expired',
  'cancelled',
  'refunded'
);

-- ============================================================
-- Helper: auto-update updated_at timestamp
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- users
-- ============================================================

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text UNIQUE NOT NULL,
  phone           text,
  full_name       text,
  age_verified    boolean NOT NULL DEFAULT false,
  age_verification_ref text,
  age_verified_at timestamptz,
  stripe_customer_id text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- venues
-- ============================================================

CREATE TABLE venues (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  address                 text NOT NULL,
  latitude                decimal NOT NULL,
  longitude               decimal NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  mobile_ordering_enabled boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- beers
-- ============================================================

CREATE TABLE beers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  style       text NOT NULL,
  abv         decimal NOT NULL,
  description text NOT NULL,
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- taps
-- ============================================================

CREATE TABLE taps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tap_number       integer NOT NULL,
  beer_id          uuid REFERENCES beers(id) ON DELETE SET NULL,
  status           tap_status NOT NULL DEFAULT 'active',
  oz_remaining     decimal NOT NULL DEFAULT 0,
  low_threshold_oz decimal NOT NULL DEFAULT 120,
  temperature_f    decimal,
  temp_ok          boolean NOT NULL DEFAULT true,
  temp_threshold_f decimal NOT NULL DEFAULT 38,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER taps_updated_at
  BEFORE UPDATE ON taps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- tap_pricing
-- ============================================================

CREATE TABLE tap_pricing (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tap_id        uuid NOT NULL REFERENCES taps(id) ON DELETE CASCADE,
  price_12oz    decimal NOT NULL,
  pour_size_oz  decimal NOT NULL DEFAULT 12,
  currency      text NOT NULL DEFAULT 'usd',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- orders
-- ============================================================

CREATE TABLE orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id                uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tap_id                  uuid NOT NULL REFERENCES taps(id) ON DELETE CASCADE,
  beer_id                 uuid NOT NULL REFERENCES beers(id) ON DELETE CASCADE,
  quantity                integer NOT NULL DEFAULT 1,
  pour_size_oz            decimal NOT NULL,
  unit_price              decimal NOT NULL,
  total_amount            decimal NOT NULL,
  currency                text NOT NULL DEFAULT 'usd',
  status                  order_status NOT NULL DEFAULT 'pending_payment',
  qr_code_token           text UNIQUE,
  qr_expires_at           timestamptz,
  stripe_payment_intent_id text,
  paid_at                 timestamptz,
  redeemed_at             timestamptz,
  completed_at            timestamptz,
  expires_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- order_events
-- ============================================================

CREATE TABLE order_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- admin_pour_logs
-- ============================================================

CREATE TABLE admin_pour_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tap_id          uuid NOT NULL REFERENCES taps(id) ON DELETE CASCADE,
  admin_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pour_size_oz    decimal NOT NULL,
  master_code_used boolean NOT NULL DEFAULT false,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_venue_id ON orders(venue_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_qr_code_token ON orders(qr_code_token);
CREATE INDEX idx_taps_venue_id ON taps(venue_id);
