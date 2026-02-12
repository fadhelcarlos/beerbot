import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  create as createJwt,
  getNumericDate,
} from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface OrderRow {
  id: string;
  user_id: string;
  venue_id: string;
  tap_id: string;
  status: string;
  expires_at: string | null;
  qr_code_token: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Authenticate user via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const qrSecret = Deno.env.get("QR_TOKEN_SECRET")!;

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
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const orderId: string | undefined = body.order_id;

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Service role client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the order
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, venue_id, tap_id, status, expires_at, qr_code_token")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const orderRow = order as OrderRow;

    // Verify the order belongs to the requesting user
    if (orderRow.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Only generate QR tokens for paid orders
    if (orderRow.status !== "paid" && orderRow.status !== "ready_to_redeem") {
      return new Response(
        JSON.stringify({
          error: "Order is not eligible for QR token generation",
          code: "INVALID_ORDER_STATUS",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // If a token already exists, return it (idempotent)
    if (orderRow.qr_code_token) {
      return new Response(
        JSON.stringify({ qr_token: orderRow.qr_code_token }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Determine expiration — match order.expires_at, or default to 15 minutes
    const expiresAt = orderRow.expires_at
      ? new Date(orderRow.expires_at)
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
        order_id: orderRow.id,
        tap_id: orderRow.tap_id,
        venue_id: orderRow.venue_id,
        user_id: user.id,
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
      .eq("id", orderId);

    if (updateError) {
      console.error("Failed to store QR token:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to store QR token" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Log the event
    await supabaseAdmin.from("order_events").insert({
      order_id: orderId,
      event_type: "qr_token_generated",
      metadata: { expires_at: expiresAt.toISOString() },
    });

    return new Response(
      JSON.stringify({ qr_token: token }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
