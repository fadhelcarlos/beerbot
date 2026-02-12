import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PourCompleteRequest {
  order_id: string;
  tap_id: string;
  actual_oz_poured: number;
}

interface OrderRow {
  id: string;
  user_id: string;
  venue_id: string;
  tap_id: string;
  status: string;
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
    const body: PourCompleteRequest = await req.json();
    const { order_id, tap_id, actual_oz_poured } = body;

    if (!order_id || !tap_id || actual_oz_poured === undefined) {
      return new Response(
        JSON.stringify({
          error: "order_id, tap_id, and actual_oz_poured are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ----------------------------------------------------------------
    // 1. Fetch and validate the order
    // ----------------------------------------------------------------
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, user_id, venue_id, tap_id, status, quantity, pour_size_oz",
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

    // Verify tap_id matches
    if (orderRow.tap_id !== tap_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Tap ID does not match order",
          code: "TAP_MISMATCH",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Order must be in 'pouring' state
    if (orderRow.status !== "pouring") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Order is not in pouring state (status: ${orderRow.status})`,
          code: "INVALID_ORDER_STATUS",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // ----------------------------------------------------------------
    // 2. Update order to 'completed'
    // ----------------------------------------------------------------
    const now = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "completed",
        completed_at: now,
      })
      .eq("id", order_id)
      .eq("status", "pouring"); // Optimistic lock

    if (updateError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update order status",
          code: "UPDATE_FAILED",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // ----------------------------------------------------------------
    // 3. Log events
    // ----------------------------------------------------------------
    const expectedOz = orderRow.quantity * orderRow.pour_size_oz;
    const variance = actual_oz_poured - expectedOz;

    // Log completed event in order_events
    await supabaseAdmin.from("order_events").insert({
      order_id,
      event_type: "completed",
      metadata: {
        tap_id,
        actual_oz_poured,
        expected_oz: expectedOz,
        variance_oz: variance,
        completed_at: now,
        source: "plc_pour_complete",
      },
    });

    // Log to admin_pour_logs
    await supabaseAdmin.from("admin_pour_logs").insert({
      tap_id,
      admin_user_id: orderRow.user_id,
      pour_size_oz: actual_oz_poured,
      master_code_used: false,
      reason: "plc_pour_complete",
    });

    // ----------------------------------------------------------------
    // 4. Return success
    // ----------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        order_id,
        status: "completed",
        actual_oz_poured,
        expected_oz: expectedOz,
        variance_oz: variance,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error in pour-complete:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
