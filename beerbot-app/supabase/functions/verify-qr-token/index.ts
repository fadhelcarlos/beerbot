import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify as verifyJwt } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

interface QrPayload {
  order_id: string;
  tap_id: string;
  venue_id: string;
  user_id: string;
  exp: number;
  iat: number;
}

interface OrderRow {
  id: string;
  user_id: string;
  venue_id: string;
  tap_id: string;
  status: string;
  qr_code_token: string | null;
  qr_expires_at: string | null;
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
    // Authenticate caller via JWT (could be venue staff or admin)
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

    // Rate limit: max 20 verify attempts per minute per user
    const rateLimitResp = enforceRateLimit(user.id, "verify-qr-token", 20, 60_000);
    if (rateLimitResp) return rateLimitResp;

    // Parse request body
    const body = await req.json();
    const token: string | undefined = body.qr_token;

    if (!token) {
      return new Response(
        JSON.stringify({ error: "qr_token is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Import the HMAC key for JWT verification
    const encoder = new TextEncoder();
    const keyData = encoder.encode(qrSecret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    // Verify the JWT signature and expiration
    let payload: QrPayload;
    try {
      payload = (await verifyJwt(token, cryptoKey)) as unknown as QrPayload;
    } catch {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Invalid or expired QR token",
          code: "INVALID_TOKEN",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Service role client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the order and validate it matches the token
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, venue_id, tap_id, status, qr_code_token, qr_expires_at")
      .eq("id", payload.order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Order not found",
          code: "ORDER_NOT_FOUND",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const orderRow = order as OrderRow;

    // Verify the token matches the one stored on the order
    if (orderRow.qr_code_token !== token) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Token does not match order",
          code: "TOKEN_MISMATCH",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Cross-check qr_expires_at — even if JWT exp is valid, the DB expiry may have passed
    // (e.g., a new QR was generated for the same order, invalidating the old one)
    if (orderRow.qr_expires_at && new Date(orderRow.qr_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "QR code has expired",
          code: "QR_EXPIRED",
        }),
        { status: 410, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check that the order is in a redeemable state
    if (orderRow.status !== "ready_to_redeem") {
      const codeMap: Record<string, string> = {
        redeemed: "ALREADY_REDEEMED",
        pouring: "ALREADY_REDEEMED",
        completed: "ALREADY_REDEEMED",
        expired: "ORDER_EXPIRED",
        cancelled: "ORDER_CANCELLED",
        refunded: "ORDER_REFUNDED",
      };
      const code = codeMap[orderRow.status] ?? "INVALID_ORDER_STATUS";
      return new Response(
        JSON.stringify({
          valid: false,
          error: `Order cannot be redeemed (status: ${orderRow.status})`,
          code,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Verify payload fields match the order
    if (
      orderRow.venue_id !== payload.venue_id ||
      orderRow.tap_id !== payload.tap_id ||
      orderRow.user_id !== payload.user_id
    ) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Token payload does not match order",
          code: "PAYLOAD_MISMATCH",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Mark the order as redeemed (single-use: status change prevents reuse)
    // Use count option to verify exactly one row was updated (race condition guard)
    const { error: updateError, count: updateCount } = await supabaseAdmin
      .from("orders")
      .update(
        {
          status: "redeemed",
          redeemed_at: new Date().toISOString(),
        },
        { count: "exact" },
      )
      .eq("id", payload.order_id)
      .eq("status", "ready_to_redeem"); // Optimistic lock: only update if still ready_to_redeem

    if (updateError) {
      console.error("Failed to update order status:", updateError);
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Failed to redeem order",
          code: "UPDATE_FAILED",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // If no rows were updated, a concurrent request already redeemed this order
    if (updateCount === 0) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Order has already been redeemed",
          code: "ALREADY_REDEEMED",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Log the redemption event
    await supabaseAdmin.from("order_events").insert({
      order_id: payload.order_id,
      event_type: "redeemed",
      metadata: {
        verified_by: user.id,
        redeemed_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        valid: true,
        order_id: payload.order_id,
        tap_id: payload.tap_id,
        venue_id: payload.venue_id,
        user_id: payload.user_id,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
