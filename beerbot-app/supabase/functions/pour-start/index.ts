import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify as verifyJwt } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface QrPayload {
  order_id: string;
  tap_id: string;
  venue_id: string;
  user_id: string;
  exp: number;
  iat: number;
}

interface PourStartRequest {
  order_id: string;
  tap_id: string;
  quantity: number;
  pour_size_oz: number;
  token: string;
}

interface TapRow {
  id: string;
  tap_number: number;
  temp_ok: boolean;
  oz_remaining: number;
}

interface OrderRow {
  id: string;
  user_id: string;
  venue_id: string;
  tap_id: string;
  status: string;
  qr_code_token: string | null;
  quantity: number;
  pour_size_oz: number;
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
    // Authenticate via service-role key (PLC/Raspberry Pi backend uses service-role)
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
    const plcApiKey = Deno.env.get("PLC_API_KEY");

    // Verify the caller using a dedicated PLC API key (preferred) or service-role key (fallback)
    const providedKey = authHeader.replace("Bearer ", "");
    const isValidKey = plcApiKey
      ? providedKey === plcApiKey
      : providedKey === supabaseServiceKey;

    if (!isValidKey) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Service role client for all operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: PourStartRequest = await req.json();
    const { order_id, tap_id, quantity, pour_size_oz, token } = body;

    if (!order_id || !tap_id || !token) {
      return new Response(
        JSON.stringify({
          error: "order_id, tap_id, and token are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ----------------------------------------------------------------
    // 1. Verify the JWT token signature and expiration
    // ----------------------------------------------------------------
    const encoder = new TextEncoder();
    const keyData = encoder.encode(qrSecret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    let payload: QrPayload;
    try {
      payload = (await verifyJwt(token, cryptoKey)) as unknown as QrPayload;
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Token is invalid or expired",
          code: "EXPIRED",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // ----------------------------------------------------------------
    // 2. Validate tap_id matches the token's tap_id
    // ----------------------------------------------------------------
    if (payload.tap_id !== tap_id) {
      // Fetch the correct tap to include its tap_number in the error
      const { data: correctTap } = await supabaseAdmin
        .from("taps")
        .select("tap_number")
        .eq("id", payload.tap_id)
        .single();

      const correctTapNumber = correctTap?.tap_number ?? "unknown";

      return new Response(
        JSON.stringify({
          success: false,
          error: `Wrong tap. This order should be redeemed at Tap #${correctTapNumber}`,
          code: "WRONG_TAP",
          correct_tap_id: payload.tap_id,
          correct_tap_number: correctTapNumber,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ----------------------------------------------------------------
    // 3. Fetch and validate the order
    // ----------------------------------------------------------------
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, user_id, venue_id, tap_id, status, qr_code_token, quantity, pour_size_oz",
      )
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Order not found",
          code: "ORDER_NOT_FOUND",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const orderRow = order as OrderRow;

    // Verify token matches stored qr_code_token
    if (orderRow.qr_code_token !== token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Token does not match order",
          code: "INVALID_TOKEN",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check order status is ready_to_redeem
    if (orderRow.status !== "ready_to_redeem") {
      if (
        orderRow.status === "redeemed" ||
        orderRow.status === "pouring" ||
        orderRow.status === "completed"
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "This order has already been redeemed",
            code: "ALREADY_REDEEMED",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: `Order cannot be poured (status: ${orderRow.status})`,
          code: "INVALID_ORDER_STATUS",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // ----------------------------------------------------------------
    // 4. Validate tap conditions (temp_ok, oz_remaining)
    // ----------------------------------------------------------------
    const { data: tap, error: tapError } = await supabaseAdmin
      .from("taps")
      .select("id, tap_number, temp_ok, oz_remaining")
      .eq("id", tap_id)
      .single();

    if (tapError || !tap) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Tap not found",
          code: "TAP_NOT_FOUND",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const tapRow = tap as TapRow;

    if (!tapRow.temp_ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Tap temperature is not ready",
          code: "TEMP_NOT_READY",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    const requiredOz =
      (quantity ?? orderRow.quantity) *
      (pour_size_oz ?? orderRow.pour_size_oz);

    if (tapRow.oz_remaining < requiredOz) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Insufficient inventory on this tap",
          code: "INVENTORY_LOW",
          oz_remaining: tapRow.oz_remaining,
          oz_required: requiredOz,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // ----------------------------------------------------------------
    // 5. Update order: ready_to_redeem -> redeemed -> pouring
    // ----------------------------------------------------------------
    const now = new Date().toISOString();

    // First transition: ready_to_redeem -> redeemed (optimistic lock)
    const { error: redeemError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "redeemed",
        redeemed_at: now,
      })
      .eq("id", order_id)
      .eq("status", "ready_to_redeem");

    if (redeemError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update order status",
          code: "UPDATE_FAILED",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Log redeemed event
    await supabaseAdmin.from("order_events").insert({
      order_id,
      event_type: "redeemed",
      metadata: {
        redeemed_at: now,
        source: "plc_pour_start",
      },
    });

    // Second transition: redeemed -> pouring
    const { error: pouringError } = await supabaseAdmin
      .from("orders")
      .update({ status: "pouring" })
      .eq("id", order_id)
      .eq("status", "redeemed");

    if (pouringError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to transition to pouring",
          code: "UPDATE_FAILED",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Log pouring event
    await supabaseAdmin.from("order_events").insert({
      order_id,
      event_type: "pouring",
      metadata: {
        tap_id,
        tap_number: tapRow.tap_number,
        quantity: quantity ?? orderRow.quantity,
        pour_size_oz: pour_size_oz ?? orderRow.pour_size_oz,
        source: "plc_pour_start",
      },
    });

    // Log to admin_pour_logs
    await supabaseAdmin.from("admin_pour_logs").insert({
      tap_id,
      admin_user_id: orderRow.user_id,
      pour_size_oz: requiredOz,
      master_code_used: false,
      reason: "plc_pour_start",
    });

    // ----------------------------------------------------------------
    // 6. Return pour_command payload for the PLC/GIGA
    // ----------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        pour_command: {
          order_id,
          tap_id,
          tap_number: tapRow.tap_number,
          quantity: quantity ?? orderRow.quantity,
          pour_size_oz: pour_size_oz ?? orderRow.pour_size_oz,
          total_oz: requiredOz,
          user_id: orderRow.user_id,
          venue_id: orderRow.venue_id,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error in pour-start:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
