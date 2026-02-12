import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import {
  create as createJwt,
  getNumericDate,
} from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface OrderRow {
  id: string;
  user_id: string;
  venue_id: string;
  tap_id: string;
  beer_id: string;
  quantity: number;
  pour_size_oz: number;
  status: string;
  stripe_payment_intent_id: string | null;
  expires_at: string | null;
  qr_code_token: string | null;
}

Deno.serve(async (req) => {
  // Stripe webhooks are always POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const qrSecret = Deno.env.get("QR_TOKEN_SECRET")!;

    // Get the raw request body and Stripe signature header
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Verify webhook signature using Stripe SDK
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        stripeWebhookSecret,
      );
    } catch {
      console.error("Webhook signature verification failed");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Service role client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Idempotency check: skip if this event ID was already processed
    const { count: existingCount } = await supabaseAdmin
      .from("order_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", `stripe_${event.type}`)
      .filter("metadata->>stripe_event_id", "eq", event.id);

    if (existingCount && existingCount > 0) {
      // Already processed this event — return 200 to acknowledge
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Route by event type
    if (event.type === "payment_intent.succeeded") {
      await handlePaymentSucceeded(event, supabaseAdmin, qrSecret);
    } else if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailed(event, supabaseAdmin);
    } else if (event.type === "charge.refunded") {
      await handleChargeRefunded(event, supabaseAdmin);
    } else {
      // Unhandled event type — log and acknowledge
      console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

// ---------- Event Handlers ----------

async function handlePaymentSucceeded(
  event: Stripe.Event,
  supabaseAdmin: ReturnType<typeof createClient>,
  qrSecret: string,
): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const orderId = paymentIntent.metadata.order_id;

  if (!orderId) {
    console.error("No order_id in PaymentIntent metadata");
    return;
  }

  // Fetch the order
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error("Order not found for payment_intent.succeeded:", orderId);
    return;
  }

  const orderRow = order as OrderRow;

  // Idempotent: if already paid or beyond, skip
  if (
    orderRow.status !== "pending_payment" &&
    orderRow.status !== "paid"
  ) {
    console.log(`Order ${orderId} already in status ${orderRow.status}, skipping`);
    return;
  }

  // Update order status to 'paid' with paid_at timestamp
  await supabaseAdmin
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  // Log payment succeeded event
  await supabaseAdmin.from("order_events").insert({
    order_id: orderId,
    event_type: "stripe_payment_intent.succeeded",
    metadata: {
      stripe_event_id: event.id,
      payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    },
  });

  // Generate QR token and update status to ready_to_redeem
  await generateQrTokenForOrder(orderRow, supabaseAdmin, qrSecret);
}

async function handlePaymentFailed(
  event: Stripe.Event,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const orderId = paymentIntent.metadata.order_id;

  if (!orderId) {
    console.error("No order_id in PaymentIntent metadata");
    return;
  }

  // Fetch the order to get quantity and pour size for inventory restoration
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error("Order not found for payment_intent.payment_failed:", orderId);
    return;
  }

  const orderRow = order as OrderRow;

  // Idempotent: if already cancelled or beyond, skip
  if (orderRow.status === "cancelled" || orderRow.status === "refunded") {
    console.log(`Order ${orderId} already in status ${orderRow.status}, skipping`);
    return;
  }

  // Update order status to 'cancelled'
  await supabaseAdmin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);

  // Restore oz_remaining on the tap (read-then-write since Supabase JS
  // doesn't support SET oz_remaining = oz_remaining + X directly)
  const restoreOz = orderRow.quantity * orderRow.pour_size_oz;
  const { data: tap } = await supabaseAdmin
    .from("taps")
    .select("oz_remaining")
    .eq("id", orderRow.tap_id)
    .single();

  if (tap) {
    const newOz = Number(tap.oz_remaining) + restoreOz;
    await supabaseAdmin
      .from("taps")
      .update({ oz_remaining: newOz })
      .eq("id", orderRow.tap_id);
  }

  // Log payment failed event
  await supabaseAdmin.from("order_events").insert({
    order_id: orderId,
    event_type: "stripe_payment_intent.payment_failed",
    metadata: {
      stripe_event_id: event.id,
      payment_intent_id: paymentIntent.id,
      failure_code: paymentIntent.last_payment_error?.code ?? null,
      failure_message: paymentIntent.last_payment_error?.message ?? null,
    },
  });
}

async function handleChargeRefunded(
  event: Stripe.Event,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = charge.payment_intent as string | null;

  if (!paymentIntentId) {
    console.error("No payment_intent on refunded charge");
    return;
  }

  // Find the order by stripe_payment_intent_id
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .single();

  if (orderError || !order) {
    console.error("Order not found for charge.refunded, PI:", paymentIntentId);
    return;
  }

  const orderRow = order as OrderRow;

  // Idempotent: if already refunded, skip
  if (orderRow.status === "refunded") {
    console.log(`Order ${orderRow.id} already refunded, skipping`);
    return;
  }

  // Update order status to 'refunded'
  await supabaseAdmin
    .from("orders")
    .update({ status: "refunded" })
    .eq("id", orderRow.id);

  // Log refund event
  await supabaseAdmin.from("order_events").insert({
    order_id: orderRow.id,
    event_type: "stripe_charge.refunded",
    metadata: {
      stripe_event_id: event.id,
      charge_id: charge.id,
      payment_intent_id: paymentIntentId,
      amount_refunded: charge.amount_refunded,
      currency: charge.currency,
    },
  });
}

// ---------- QR Token Generation (inline, mirrors generate-qr-token Edge Function) ----------

async function generateQrTokenForOrder(
  order: OrderRow,
  supabaseAdmin: ReturnType<typeof createClient>,
  qrSecret: string,
): Promise<void> {
  // If a token already exists, just ensure status is ready_to_redeem
  if (order.qr_code_token) {
    await supabaseAdmin
      .from("orders")
      .update({ status: "ready_to_redeem" })
      .eq("id", order.id);
    return;
  }

  // Determine expiration — match order.expires_at, or default to 15 minutes
  const expiresAt = order.expires_at
    ? new Date(order.expires_at)
    : new Date(Date.now() + 15 * 60 * 1000);

  // Import the HMAC key for JWT signing
  const encoder = new TextEncoder();
  const keyData = encoder.encode(qrSecret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  // Create the JWT
  const token = await createJwt(
    { alg: "HS256", typ: "JWT" },
    {
      order_id: order.id,
      tap_id: order.tap_id,
      venue_id: order.venue_id,
      user_id: order.user_id,
      exp: getNumericDate(expiresAt),
      iat: getNumericDate(new Date()),
    },
    cryptoKey,
  );

  // Store the token and update order status to ready_to_redeem
  const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update({
      qr_code_token: token,
      qr_expires_at: expiresAt.toISOString(),
      status: "ready_to_redeem",
    })
    .eq("id", order.id);

  if (updateError) {
    console.error("Failed to store QR token:", updateError);
    return;
  }

  // Log the QR token generation event
  await supabaseAdmin.from("order_events").insert({
    order_id: order.id,
    event_type: "qr_token_generated",
    metadata: { expires_at: expiresAt.toISOString() },
  });
}
