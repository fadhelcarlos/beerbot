-- US-005: Atomic order creation RPC function
-- Validates inventory + creates order + decrements oz_remaining in a single transaction

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
BEGIN
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

  -- Validate sufficient inventory (must be above low threshold after pour)
  IF v_tap.oz_remaining <= v_tap.low_threshold_oz THEN
    RETURN jsonb_build_object('error', 'Beer is running low and ordering is temporarily unavailable', 'code', 'INVENTORY_LOW');
  END IF;

  IF v_tap.oz_remaining - v_total_oz < 0 THEN
    RETURN jsonb_build_object('error', 'Insufficient inventory for this order', 'code', 'INSUFFICIENT_INVENTORY');
  END IF;

  -- Calculate pricing
  v_unit_price := v_pricing.price_12oz;
  v_total_amt := v_unit_price * p_quantity;
  v_expires_at := now() + (p_expires_minutes || ' minutes')::interval;

  -- Decrement inventory atomically
  UPDATE taps
  SET oz_remaining = oz_remaining - v_total_oz
  WHERE id = p_tap_id;

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
