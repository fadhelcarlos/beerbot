import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface CreateOrderBody {
  tap_id: string;
  quantity?: number;
}

interface OrderResult {
  order_id: string;
  venue_id: string;
  tap_id: string;
  beer_id: string;
  quantity: number;
  pour_size_oz: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  status: string;
  expires_at: string;
  error?: string;
  code?: string;
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
    const body: CreateOrderBody = await req.json();

    if (!body.tap_id) {
      return new Response(
        JSON.stringify({ error: "tap_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const quantity = body.quantity ?? 1;
    if (quantity < 1 || !Number.isInteger(quantity)) {
      return new Response(
        JSON.stringify({ error: "quantity must be a positive integer" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Service role client for the atomic RPC call (SECURITY DEFINER function)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Call the atomic order creation RPC
    const { data, error } = await supabaseAdmin.rpc("create_order_atomic", {
      p_user_id: user.id,
      p_tap_id: body.tap_id,
      p_quantity: quantity,
      p_expires_minutes: 15,
    });

    if (error) {
      console.error("RPC error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = data as OrderResult;

    // RPC returns error info in the JSON if validation failed
    if (result.error) {
      const statusMap: Record<string, number> = {
        TAP_NOT_FOUND: 404,
        VENUE_NOT_FOUND: 404,
        USER_NOT_FOUND: 404,
        NO_PRICING: 404,
        TAP_INACTIVE: 409,
        TEMP_NOT_OK: 409,
        VENUE_INACTIVE: 409,
        MOBILE_ORDERING_DISABLED: 409,
        AGE_NOT_VERIFIED: 403,
        INVENTORY_LOW: 409,
        INSUFFICIENT_INVENTORY: 409,
      };
      const status = statusMap[result.code ?? ""] ?? 400;
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status, headers: { "Content-Type": "application/json" } },
      );
    }

    // Return the created order
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
