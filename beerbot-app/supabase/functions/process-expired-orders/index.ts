import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

interface ExpiredOrder {
  id: string;
  user_id: string;
  venue_id: string;
  tap_id: string;
  quantity: number;
  pour_size_oz: number;
  total_amount: number;
  currency: string;
  status: string;
  stripe_payment_intent_id: string | null;
}

interface RefundResult {
  order_id: string;
  success: boolean;
  refund_id?: string;
  error?: string;
}

Deno.serve(async (req) => {
  // This function is called by pg_cron via Supabase scheduled invocations
  // or can be triggered manually. Only POST allowed.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Call the database function to expire stale orders
    // This atomically finds ready_to_redeem orders past expiration,
    // marks them 'expired', logs events, and restores tap inventory
    const { data: expireResult, error: expireError } = await supabaseAdmin
      .rpc("expire_stale_orders");

    if (expireError) {
      console.error("Error calling expire_stale_orders:", expireError);
      return new Response(
        JSON.stringify({ error: "Failed to expire stale orders" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const expiredCount = (expireResult as { expired_count: number })
      ?.expired_count ?? 0;

    // Step 2: Find all expired orders that have a Stripe payment intent
    // and have not yet been refunded (status = 'expired', not 'refunded')
    const { data: ordersToRefund, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, user_id, venue_id, tap_id, quantity, pour_size_oz, total_amount, currency, status, stripe_payment_intent_id",
      )
      .eq("status", "expired")
      .not("stripe_payment_intent_id", "is", null);

    if (fetchError) {
      console.error("Error fetching expired orders:", fetchError);
      return new Response(
        JSON.stringify({
          expired_count: expiredCount,
          error: "Failed to fetch expired orders for refund",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const orders = (ordersToRefund ?? []) as ExpiredOrder[];

    if (orders.length === 0) {
      return new Response(
        JSON.stringify({
          expired_count: expiredCount,
          refunded_count: 0,
          results: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Step 3: Process refunds for each expired order
    const results: RefundResult[] = [];

    for (const order of orders) {
      const result = await processRefund(
        order,
        stripe,
        supabaseAdmin,
      );
      results.push(result);
    }

    const refundedCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        expired_count: expiredCount,
        refunded_count: refundedCount,
        failed_count: failedCount,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error in process-expired-orders:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

async function processRefund(
  order: ExpiredOrder,
  stripe: Stripe,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<RefundResult> {
  try {
    // Check if a refund event already exists for this order (idempotency)
    const { count: existingRefundCount } = await supabaseAdmin
      .from("order_events")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("event_type", "refunded");

    if (existingRefundCount && existingRefundCount > 0) {
      // Already processed — update status to refunded if not already
      await supabaseAdmin
        .from("orders")
        .update({ status: "refunded" })
        .eq("id", order.id);

      return {
        order_id: order.id,
        success: true,
        refund_id: "already_refunded",
      };
    }

    // Issue full refund via Stripe using the payment intent ID
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id!,
      reason: "requested_by_customer",
    });

    // On successful refund: update order status to 'refunded'
    await supabaseAdmin
      .from("orders")
      .update({ status: "refunded" })
      .eq("id", order.id);

    // Log 'refunded' event in order_events
    await supabaseAdmin.from("order_events").insert({
      order_id: order.id,
      event_type: "refunded",
      metadata: {
        stripe_refund_id: refund.id,
        amount_refunded: refund.amount,
        currency: refund.currency,
        reason: "order_expired",
        payment_intent_id: order.stripe_payment_intent_id,
      },
    });

    return {
      order_id: order.id,
      success: true,
      refund_id: refund.id,
    };
  } catch (err) {
    // Handle Stripe refund failures gracefully
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `Refund failed for order ${order.id}:`,
      errorMessage,
    );

    // Log the failure for manual review
    await supabaseAdmin.from("order_events").insert({
      order_id: order.id,
      event_type: "refund_failed",
      metadata: {
        error: errorMessage,
        payment_intent_id: order.stripe_payment_intent_id,
        requires_manual_review: true,
      },
    });

    return {
      order_id: order.id,
      success: false,
      error: errorMessage,
    };
  }
}
