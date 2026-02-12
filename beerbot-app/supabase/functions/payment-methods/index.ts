import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

interface UserRow {
  id: string;
  stripe_customer_id: string | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Authenticate user via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
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
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Service role client for privileged reads
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user's stripe_customer_id
    const { data: userProfile, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (userError || !userProfile) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    const userData = userProfile as UserRow;

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Parse request body
    const { action, payment_method_id } = await req.json();

    // ─── LIST payment methods ───
    if (action === "list") {
      if (!userData.stripe_customer_id) {
        // No Stripe customer yet — no saved payment methods
        return jsonResponse({ payment_methods: [], default_payment_method: null });
      }

      // Fetch customer to get default payment method
      const customer = await stripe.customers.retrieve(
        userData.stripe_customer_id,
      );

      const defaultPmId =
        typeof customer !== "string" && !customer.deleted
          ? typeof customer.invoice_settings?.default_payment_method === "string"
            ? customer.invoice_settings.default_payment_method
            : customer.invoice_settings?.default_payment_method?.id ?? null
          : null;

      // List all card payment methods for the customer
      const methods = await stripe.paymentMethods.list({
        customer: userData.stripe_customer_id,
        type: "card",
      });

      const payment_methods = methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? "unknown",
        last4: pm.card?.last4 ?? "????",
        exp_month: pm.card?.exp_month ?? 0,
        exp_year: pm.card?.exp_year ?? 0,
        is_default: pm.id === defaultPmId,
      }));

      return jsonResponse({
        payment_methods,
        default_payment_method: defaultPmId,
      });
    }

    // ─── DETACH (delete) a payment method ───
    if (action === "detach") {
      if (!payment_method_id) {
        return jsonResponse(
          { error: "payment_method_id is required" },
          400,
        );
      }

      // Verify the payment method belongs to this customer
      const pm = await stripe.paymentMethods.retrieve(payment_method_id);
      if (pm.customer !== userData.stripe_customer_id) {
        return jsonResponse({ error: "Payment method not found" }, 404);
      }

      await stripe.paymentMethods.detach(payment_method_id);

      return jsonResponse({ success: true });
    }

    // ─── SET DEFAULT payment method ───
    if (action === "set_default") {
      if (!payment_method_id) {
        return jsonResponse(
          { error: "payment_method_id is required" },
          400,
        );
      }

      if (!userData.stripe_customer_id) {
        return jsonResponse({ error: "No Stripe customer found" }, 400);
      }

      // Verify the payment method belongs to this customer
      const pm = await stripe.paymentMethods.retrieve(payment_method_id);
      if (pm.customer !== userData.stripe_customer_id) {
        return jsonResponse({ error: "Payment method not found" }, 404);
      }

      // Update customer's default payment method
      await stripe.customers.update(userData.stripe_customer_id, {
        invoice_settings: {
          default_payment_method: payment_method_id,
        },
      });

      return jsonResponse({ success: true, default_payment_method: payment_method_id });
    }

    // ─── CREATE SETUP INTENT for adding a new card ───
    if (action === "create_setup_intent") {
      // Create or retrieve Stripe customer
      let customerId = userData.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { supabase_user_id: user.id },
        });
        customerId = customer.id;

        await supabaseAdmin
          .from("users")
          .update({ stripe_customer_id: customerId })
          .eq("id", user.id);
      }

      // Create SetupIntent for saving a card without charging
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
      });

      // Create ephemeral key for the mobile SDK
      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: "2024-06-20" },
      );

      return jsonResponse({
        setup_intent_client_secret: setupIntent.client_secret,
        ephemeral_key: ephemeralKey.secret,
        customer_id: customerId,
      });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("Unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
