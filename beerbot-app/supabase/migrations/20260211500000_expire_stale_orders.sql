-- US-010: Order Expiration and Auto-Refund system
-- Database function to expire stale orders + pg_cron scheduling

-- ============================================================
-- expire_stale_orders(): Find and expire orders that have
-- passed their expiration time while still in 'ready_to_redeem'
-- ============================================================

CREATE OR REPLACE FUNCTION expire_stale_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_order RECORD;
  v_expired_ids uuid[] := '{}';
  v_count integer := 0;
BEGIN
  -- Find all orders that are ready_to_redeem but past their expiration
  FOR v_expired_order IN
    SELECT id, tap_id, quantity, pour_size_oz
    FROM orders
    WHERE status = 'ready_to_redeem'
      AND expires_at IS NOT NULL
      AND expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Update order status to 'expired'
    UPDATE orders
    SET status = 'expired'
    WHERE id = v_expired_order.id;

    -- Log 'expired' event in order_events
    INSERT INTO order_events (order_id, event_type, metadata)
    VALUES (
      v_expired_order.id,
      'expired',
      jsonb_build_object(
        'expired_at', now(),
        'reason', 'redemption_timeout'
      )
    );

    -- Restore oz_remaining on the tap (add back the ordered amount)
    UPDATE taps
    SET oz_remaining = oz_remaining + (v_expired_order.quantity * v_expired_order.pour_size_oz)
    WHERE id = v_expired_order.tap_id;

    v_expired_ids := v_expired_ids || v_expired_order.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'expired_count', v_count,
    'expired_order_ids', to_jsonb(v_expired_ids)
  );
END;
$$;

-- ============================================================
-- pg_cron: Schedule expire_stale_orders to run every minute
-- Note: pg_cron extension must be enabled in Supabase project
-- settings (Database > Extensions). On Supabase hosted, pg_cron
-- is available on Pro plan and above.
-- ============================================================

-- Enable the pg_cron extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage to postgres role (needed on some Supabase setups)
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule the job to run every minute
SELECT cron.schedule(
  'expire-stale-orders',       -- job name
  '* * * * *',                 -- every minute
  $$SELECT expire_stale_orders()$$
);
