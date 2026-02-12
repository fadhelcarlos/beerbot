-- High priority fixes (Before Beta) from code review
-- Covers issues: 2.3, 3.1, 4.4

-- ============================================================
-- Fix 2.3: Dedicated webhook idempotency table
-- Replaces fragile JSONB filter on order_events metadata
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_idempotency (
  stripe_event_id text PRIMARY KEY,
  event_type      text NOT NULL,
  processed_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Fix 3.1: Combine TOCTOU checks in create_order_atomic
-- Single UPDATE with WHERE clause eliminates race window
-- ============================================================

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_user_id    uuid,
  p_tap_id     uuid,
  p_quantity   integer DEFAULT 1,
  p_expires_minutes integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tap        RECORD;
  v_venue      RECORD;
  v_user       RECORD;
  v_pricing    RECORD;
  v_pour_size  decimal;
  v_total_oz   decimal;
  v_unit_price decimal;
  v_total_amt  decimal;
  v_order_id   uuid;
  v_expires_at timestamptz;
  v_pending    integer;
  v_rows_updated integer;
BEGIN
  -- Check for existing pending_payment orders from this user (prevent spamming)
  SELECT COUNT(*) INTO v_pending
  FROM orders
  WHERE user_id = p_user_id
    AND status = 'pending_payment'
    AND created_at > now() - interval '2 minutes';

  IF v_pending > 0 THEN
    RETURN jsonb_build_object('error', 'You already have a pending order. Please complete or wait for it to expire.', 'code', 'PENDING_ORDER_EXISTS');
  END IF;

  -- Lock the tap row to prevent concurrent inventory modifications
  SELECT t.id, t.venue_id, t.beer_id, t.status, t.oz_remaining,
         t.low_threshold_oz, t.temp_ok
  INTO v_tap
  FROM taps t
  WHERE t.id = p_tap_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Tap not found', 'code', 'TAP_NOT_FOUND');
  END IF;

  -- Validate tap is active
  IF v_tap.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Tap is not active', 'code', 'TAP_INACTIVE');
  END IF;

  -- Validate temperature is OK
  IF v_tap.temp_ok = false THEN
    RETURN jsonb_build_object('error', 'Beer is not at proper temperature', 'code', 'TEMP_NOT_OK');
  END IF;

  -- Validate venue is active and mobile ordering enabled
  SELECT v.id, v.is_active, v.mobile_ordering_enabled
  INTO v_venue
  FROM venues v
  WHERE v.id = v_tap.venue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Venue not found', 'code', 'VENUE_NOT_FOUND');
  END IF;

  IF v_venue.is_active = false THEN
    RETURN jsonb_build_object('error', 'Venue is not active', 'code', 'VENUE_INACTIVE');
  END IF;

  IF v_venue.mobile_ordering_enabled = false THEN
    RETURN jsonb_build_object('error', 'Mobile ordering is not enabled at this venue', 'code', 'MOBILE_ORDERING_DISABLED');
  END IF;

  -- Validate user is age verified
  SELECT u.id, u.age_verified
  INTO v_user
  FROM users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found', 'code', 'USER_NOT_FOUND');
  END IF;

  IF v_user.age_verified = false THEN
    RETURN jsonb_build_object('error', 'User has not completed age verification', 'code', 'AGE_NOT_VERIFIED');
  END IF;

  -- Get pricing for this tap
  SELECT tp.price_12oz, tp.pour_size_oz, tp.currency
  INTO v_pricing
  FROM tap_pricing tp
  WHERE tp.tap_id = p_tap_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No pricing found for this tap', 'code', 'NO_PRICING');
  END IF;

  v_pour_size := v_pricing.pour_size_oz;
  v_total_oz := v_pour_size * p_quantity;

  -- Calculate pricing
  v_unit_price := v_pricing.price_12oz;
  v_total_amt := v_unit_price * p_quantity;
  v_expires_at := now() + (p_expires_minutes || ' minutes')::interval;

  -- Fix 3.1: Single atomic UPDATE with WHERE clause combining all checks
  -- This eliminates the TOCTOU race between checking and updating
  UPDATE taps
  SET oz_remaining = oz_remaining - v_total_oz
  WHERE id = p_tap_id
    AND oz_remaining > low_threshold_oz
    AND oz_remaining - v_total_oz >= 0;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('error', 'Insufficient inventory or beer is running low', 'code', 'INSUFFICIENT_INVENTORY');
  END IF;

  -- Create the order
  INSERT INTO orders (
    user_id, venue_id, tap_id, beer_id,
    quantity, pour_size_oz, unit_price, total_amount, currency,
    status, expires_at
  )
  VALUES (
    p_user_id, v_tap.venue_id, p_tap_id, v_tap.beer_id,
    p_quantity, v_pour_size, v_unit_price, v_total_amt, v_pricing.currency,
    'pending_payment', v_expires_at
  )
  RETURNING id INTO v_order_id;

  -- Log 'created' event in order_events
  INSERT INTO order_events (order_id, event_type, metadata)
  VALUES (
    v_order_id,
    'created',
    jsonb_build_object(
      'tap_id', p_tap_id,
      'quantity', p_quantity,
      'pour_size_oz', v_pour_size,
      'total_amount', v_total_amt,
      'expires_at', v_expires_at
    )
  );

  -- Return the created order
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'venue_id', v_tap.venue_id,
    'tap_id', p_tap_id,
    'beer_id', v_tap.beer_id,
    'quantity', p_quantity,
    'pour_size_oz', v_pour_size,
    'unit_price', v_unit_price,
    'total_amount', v_total_amt,
    'currency', v_pricing.currency,
    'status', 'pending_payment',
    'expires_at', v_expires_at
  );
END;
$$;

-- ============================================================
-- Fix 4.4: Add missing database indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_expires_at ON orders(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created ON orders(user_id, status, created_at);

-- ============================================================
-- Fix 8.8: Connect expiration cron to Stripe refund
-- Replace the existing cron job to also invoke the
-- process-expired-orders Edge Function after expiring orders.
-- Uses pg_net (http extension) to call the Edge Function.
-- ============================================================

-- Enable pg_net for HTTP calls from SQL (available on Supabase Pro+)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create wrapper function that expires orders AND triggers refund processing
CREATE OR REPLACE FUNCTION expire_and_refund_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_supabase_url text;
  v_service_key text;
BEGIN
  -- Step 1: Expire stale orders in the database
  v_result := expire_stale_orders();

  -- Step 2: If any orders were expired, invoke the process-expired-orders
  -- Edge Function to handle Stripe refunds
  IF (v_result->>'expired_count')::int > 0 THEN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_key := current_setting('app.settings.service_role_key', true);

    -- Only attempt HTTP call if settings are configured
    IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/process-expired-orders',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_service_key,
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    END IF;
  END IF;
END;
$$;

-- Update the cron job to use the new wrapper function
-- (Unschedule old job first, then reschedule)
SELECT cron.unschedule('expire-stale-orders');

SELECT cron.schedule(
  'expire-stale-orders',
  '* * * * *',
  $$SELECT expire_and_refund_orders()$$
);
