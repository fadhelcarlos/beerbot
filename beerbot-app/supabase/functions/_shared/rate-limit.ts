/**
 * Simple in-memory rate limiter for Supabase Edge Functions.
 * Uses a sliding window counter per key. Resets when the Edge Function
 * cold-starts, which is acceptable since cold starts are infrequent
 * and this provides defense against rapid-fire abuse.
 */

const store = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

/**
 * Returns a 429 Response if rate limit exceeded, or null if allowed.
 */
export function enforceRateLimit(
  userId: string,
  endpoint: string,
  maxRequests: number = 10,
  windowMs: number = 60_000,
): Response | null {
  const key = `${endpoint}:${userId}`;
  const result = checkRateLimit(key, maxRequests, windowMs);

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many requests. Please try again shortly.",
        code: "RATE_LIMITED",
        retry_after_ms: result.retryAfterMs,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
        },
      },
    );
  }

  return null;
}
