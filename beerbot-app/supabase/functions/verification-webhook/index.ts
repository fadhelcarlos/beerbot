import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface VeriffWebhookPayload {
  id: string;
  feature: string;
  code: number;
  action: string;
  vendorData: string;
  verification: {
    id: string;
    code: number;
    person: {
      firstName: string;
      lastName: string;
      dateOfBirth: string;
    };
    status: string;
    reason: string | null;
    reasonCode: number | null;
    decisionTime: string;
    acceptanceTime: string;
  };
  technicalData: {
    ip: string;
  };
}

// Veriff decision codes
const DECISION_APPROVED = 9001;
const DECISION_DECLINED = 9102;
const DECISION_RESUBMIT = 9103;
const DECISION_EXPIRED = 9104;

async function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed.toLowerCase() === signature.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-hmac-signature, x-auth-client",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const veriffApiSecret = Deno.env.get("VERIFF_API_SECRET")!;

    const rawBody = await req.text();
    const hmacSignature = req.headers.get("x-hmac-signature");

    // Verify webhook authenticity via HMAC
    const isValid = await verifySignature(rawBody, hmacSignature, veriffApiSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload: VeriffWebhookPayload = JSON.parse(rawBody);
    const userId = payload.vendorData;
    const sessionId = payload.verification.id;
    const decisionCode = payload.verification.code;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    if (decisionCode === DECISION_APPROVED) {
      // Approved: update user's age_verified status
      // Only store status, timestamp, and reference ID — NO personal data
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({
          age_verified: true,
          age_verification_ref: sessionId,
          age_verified_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Error updating user verification:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update user" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Update attempt status
      await supabaseAdmin
        .from("verification_attempts")
        .update({ status: "approved" })
        .eq("session_id", sessionId);
    } else if (decisionCode === DECISION_DECLINED) {
      // Declined: do NOT update age_verified, allow retry
      await supabaseAdmin
        .from("verification_attempts")
        .update({ status: "declined" })
        .eq("session_id", sessionId);
    } else if (decisionCode === DECISION_RESUBMIT) {
      // Resubmission requested
      await supabaseAdmin
        .from("verification_attempts")
        .update({ status: "resubmit" })
        .eq("session_id", sessionId);
    } else if (decisionCode === DECISION_EXPIRED) {
      // Session expired
      await supabaseAdmin
        .from("verification_attempts")
        .update({ status: "expired" })
        .eq("session_id", sessionId);
    } else {
      // Unknown decision code — log but don't fail
      console.warn("Unknown Veriff decision code:", decisionCode);
      await supabaseAdmin
        .from("verification_attempts")
        .update({ status: "unknown" })
        .eq("session_id", sessionId);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
