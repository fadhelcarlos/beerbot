-- Dev/testing bypass for Stripe payment flow
-- This function simulates a successful payment for testing without Stripe.
-- To revert: DROP FUNCTION dev_confirm_payment(uuid);

CREATE OR REPLACE FUNCTION dev_confirm_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_qr_token text;
  v_expires_at timestamptz;
BEGIN
  -- Fetch the order
  SELECT id, user_id, venue_id, tap_id, beer_id, status, expires_at
  INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Order not found', 'code', 'ORDER_NOT_FOUND');
  END IF;

  -- Only process pending_payment orders
  IF v_order.status != 'pending_payment' THEN
    RETURN jsonb_build_object('error', 'Order is not pending payment', 'code', 'INVALID_STATUS', 'current_status', v_order.status);
  END IF;

  -- Generate a dev QR token (not a real JWT, just a unique identifier)
  v_qr_token := 'dev_' || encode(gen_random_bytes(32), 'hex');
  v_expires_at := COALESCE(v_order.expires_at, now() + interval '15 minutes');

  -- Update order: pending_payment -> ready_to_redeem
  UPDATE orders
  SET status = 'ready_to_redeem',
      paid_at = now(),
      qr_code_token = v_qr_token,
      qr_expires_at = v_expires_at,
      stripe_payment_intent_id = 'dev_pi_' || replace(p_order_id::text, '-', '')
  WHERE id = p_order_id;

  -- Log payment events
  INSERT INTO order_events (order_id, event_type, metadata)
  VALUES
    (p_order_id, 'dev_payment_confirmed', jsonb_build_object('mode', 'dev_bypass', 'confirmed_at', now())),
    (p_order_id, 'qr_token_generated', jsonb_build_object('expires_at', v_expires_at, 'mode', 'dev_bypass'));

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'ready_to_redeem',
    'qr_code_token', v_qr_token,
    'qr_expires_at', v_expires_at
  );
END;
$$;
