import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

interface OrderRow {
  id: string;
  user_id: string;
  venue_id: string;
  tap_id: string;
  beer_id: string;
  total_amount: number;
  currency: string;
  status: string;
  stripe_payment_intent_id: string | null;
}

interface UserRow {
  id: string;
  email: string;
  stripe_customer_id: string | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Authenticate user via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    // User JWT client for identity
    const supabaseUser = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 10 payment intent attempts per minute per user
    const rateLimitResp = enforceRateLimit(user.id, "create-payment-intent", 10, 60_000);
    if (rateLimitResp) return rateLimitResp;

    // Parse request body
    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Service role client for privileged reads/writes
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the order and verify ownership
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found", code: "ORDER_NOT_FOUND" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const orderData = order as OrderRow;

    // Verify the order belongs to the requesting user
    if (orderData.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "NOT_ORDER_OWNER" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify order is in correct status for payment
    if (orderData.status !== "pending_payment") {
      return new Response(
        JSON.stringify({
          error: `Order is not pending payment (status: ${orderData.status})`,
          code: "INVALID_ORDER_STATUS",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // If a PaymentIntent already exists for this order, retrieve it instead of creating a new one
    if (orderData.stripe_payment_intent_id) {
      const stripe = new Stripe(stripeSecretKey, {
        apiVersion: "2024-06-20",
        httpClient: Stripe.createFetchHttpClient(),
      });

      const existingIntent = await stripe.paymentIntents.retrieve(
        orderData.stripe_payment_intent_id,
      );

      // Create ephemeral key for the existing customer
      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: existingIntent.customer as string },
        { apiVersion: "2024-06-20" },
      );

      return new Response(
        JSON.stringify({
          client_secret: existingIntent.client_secret,
          ephemeral_key: ephemeralKey.secret,
          customer_id: existingIntent.customer as string,
          payment_intent_id: existingIntent.id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch user profile for Stripe customer creation
    const { data: userProfile, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, email, stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (userError || !userProfile) {
      return new Response(
        JSON.stringify({ error: "User not found", code: "USER_NOT_FOUND" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userData = userProfile as UserRow;

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Create or retrieve Stripe Customer
    let customerId = userData.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      customerId = customer.id;

      // Store the Stripe customer ID on the user record
      await supabaseAdmin
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Convert total_amount to cents (Stripe uses smallest currency unit)
    const amountInCents = Math.round(orderData.total_amount * 100);

    // Create PaymentIntent with idempotency key (order_id)
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: orderData.currency,
        customer: customerId,
        metadata: {
          order_id: orderData.id,
          user_id: user.id,
          venue_id: orderData.venue_id,
          tap_id: orderData.tap_id,
        },
        automatic_payment_methods: { enabled: true },
      },
      {
        idempotencyKey: `order_${order_id}`,
      },
    );

    // Store payment intent ID on the order
    await supabaseAdmin
      .from("orders")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", order_id);

    // Log payment_intent_created event
    await supabaseAdmin.from("order_events").insert({
      order_id: order_id,
      event_type: "payment_intent_created",
      metadata: {
        payment_intent_id: paymentIntent.id,
        amount: amountInCents,
        currency: orderData.currency,
      },
    });

    // Create ephemeral key for the mobile SDK
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2024-06-20" },
    );

    return new Response(
      JSON.stringify({
        client_secret: paymentIntent.client_secret,
        ephemeral_key: ephemeralKey.secret,
        customer_id: customerId,
        payment_intent_id: paymentIntent.id,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
