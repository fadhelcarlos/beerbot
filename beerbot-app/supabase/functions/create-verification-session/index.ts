import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFF_API_URL = "https://stationapi.veriff.com/v1";
const MAX_ATTEMPTS_PER_DAY = 5;

interface VeriffSessionResponse {
  status: string;
  verification: {
    id: string;
    url: string;
    vendorData: string;
    host: string;
    status: string;
    sessionToken: string;
  };
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
    // Authenticate the user via their JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const veriffApiKey = Deno.env.get("VERIFF_API_KEY")!;
    const veriffApiSecret = Deno.env.get("VERIFF_API_SECRET")!;

    // Create a client with the user's JWT for identity verification
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

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

    // Use service_role client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if already verified
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("age_verified")
      .eq("id", user.id)
      .single();

    if (profile?.age_verified) {
      return new Response(
        JSON.stringify({ error: "User is already age-verified" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Rate limit: max 5 attempts per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count } = await supabaseAdmin
      .from("verification_attempts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneDayAgo);

    if ((count ?? 0) >= MAX_ATTEMPTS_PER_DAY) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded. Maximum 5 verification attempts per day.",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create Veriff session
    const veriffPayload = {
      verification: {
        callback: `${supabaseUrl}/functions/v1/verification-webhook`,
        person: {
          firstName: user.user_metadata?.full_name?.split(" ")[0] ?? "",
          lastName: user.user_metadata?.full_name?.split(" ").slice(1).join(" ") ?? "",
        },
        vendorData: user.id,
        timestamp: new Date().toISOString(),
      },
    };

    const veriffRes = await fetch(`${VERIFF_API_URL}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-CLIENT": veriffApiKey,
      },
      body: JSON.stringify(veriffPayload),
    });

    if (!veriffRes.ok) {
      const errText = await veriffRes.text();
      console.error("Veriff API error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to create verification session" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const veriffData: VeriffSessionResponse = await veriffRes.json();

    // Log the attempt using service_role (bypasses RLS)
    await supabaseAdmin.from("verification_attempts").insert({
      user_id: user.id,
      session_id: veriffData.verification.id,
      status: "pending",
    });

    // Return session URL and token to the mobile app — no sensitive data
    return new Response(
      JSON.stringify({
        session_url: veriffData.verification.url,
        session_id: veriffData.verification.id,
        session_token: veriffData.verification.sessionToken,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
