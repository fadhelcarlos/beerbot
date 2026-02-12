-- US-003: Configure Supabase Auth and Row Level Security
-- Enable RLS on all tables and create access policies

-- ============================================================
-- Auto-create user profile on auth signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Enable RLS on ALL tables
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE beers ENABLE ROW LEVEL SECURITY;
ALTER TABLE taps ENABLE ROW LEVEL SECURITY;
ALTER TABLE tap_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_pour_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- users: SELECT/UPDATE own row only
-- ============================================================

CREATE POLICY "users_select_own"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- venues: publicly readable (anon + authenticated)
-- ============================================================

CREATE POLICY "venues_select_all"
  ON venues FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- beers: publicly readable (anon + authenticated)
-- ============================================================

CREATE POLICY "beers_select_all"
  ON beers FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- taps: publicly readable (anon + authenticated)
-- ============================================================

CREATE POLICY "taps_select_all"
  ON taps FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- tap_pricing: publicly readable (anon + authenticated)
-- ============================================================

CREATE POLICY "tap_pricing_select_all"
  ON tap_pricing FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- orders: SELECT/INSERT by owning user only
-- ============================================================

CREATE POLICY "orders_select_own"
  ON orders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "orders_insert_own"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- order_events: SELECT by order owner (via join to orders)
-- ============================================================

CREATE POLICY "order_events_select_own"
  ON order_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_events.order_id
        AND orders.user_id = auth.uid()
    )
  );

-- ============================================================
-- admin_pour_logs: service_role only (no policies for anon/authenticated)
-- RLS is enabled but no policies exist for app users,
-- meaning only service_role key (which bypasses RLS) can access.
-- ============================================================
