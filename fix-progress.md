# BeerBot Priority Fixes - Progress Log

**Started:** 2026-02-11
**Tracking:** 20 issues from ralph-tui-issues.md (7 Immediate + 13 High Priority)

---

## Fix Status

### Immediate Priority (Before Testing) - ALL DONE

| # | Issue | File(s) | Status |
|---|-------|---------|--------|
| 1 | 2.1 - Inventory restoration race condition | `stripe-webhook/index.ts`, new migration | DONE |
| 2 | 2.2 - QR token single-use enforcement | `verify-qr-token/index.ts` | DONE |
| 3 | 2.5 - CHECK constraint on oz_remaining | New migration SQL | DONE |
| 4 | 2.6 - Memory leak in countdown timer | `app/(main)/order/redeem.tsx` | DONE |
| 5 | 3.11 - pending_payment orders never expire | New migration SQL (expire_stale_orders rewrite) | DONE |
| 6 | 8.1 - Stub QR screen | `app/(main)/order/qr.tsx` | DONE |
| 7 | 8.2 - Duplicate order prevention | New migration SQL (create_order_atomic rewrite) | DONE |

### High Priority (Before Beta) - ALL DONE

| # | Issue | File(s) | Status |
|---|-------|---------|--------|
| 8 | 2.3 - Dedicated webhook idempotency table | `stripe-webhook/index.ts`, new migration | DONE |
| 9 | 2.4 - QR expiration cross-check | `verify-qr-token/index.ts` | DONE |
| 10 | 3.1 - TOCTOU fix in create_order_atomic | New migration SQL | DONE |
| 11 | 3.2 - Biometric auth race condition | `app/(auth)/login.tsx` | DONE |
| 12 | 3.4 - QR generation error state/timeout | `app/(main)/order/redeem.tsx` | DONE |
| 13 | 3.5 - Service-role key → dedicated PLC API key | `pour-start/index.ts`, `pour-complete/index.ts` | DONE |
| 14 | 3.9 - Polling timeout refs tracked/cleaned | `app/(main)/order/payment.tsx` | DONE |
| 15 | 4.4 - Missing database indexes | New migration SQL | DONE |
| 16 | 4.6 - React Error Boundary | `components/ErrorBoundary.tsx`, `app/_layout.tsx` | DONE |
| 17 | 8.5 - Rate limiting on Edge Functions | `_shared/rate-limit.ts`, 3 Edge Functions | DONE |
| 18 | 8.6 - Client-side idempotency key | `lib/api/orders.ts` | DONE |
| 19 | 8.8 - Expiration cron → Stripe refund | New migration SQL, `process-expired-orders/index.ts` | DONE |
| 20 | 8.9 - EAS project ID for push notifications | `app.json` | DONE |

## Quality Gates
- `tsc --noEmit`: PASS (clean)
- `expo lint`: PASS (clean)

---

## Fix Details

### Fix 1: Inventory Restoration Race Condition (Issue 2.1)
**Problem:** `handlePaymentFailed()` in stripe-webhook used read-then-write for `oz_remaining`, causing race conditions under concurrent webhook failures.
**Solution:**
- Created `restore_tap_inventory(p_tap_id, p_oz_to_restore)` RPC function in new migration `20260211700000_immediate_fixes.sql`
- Updated `stripe-webhook/index.ts` to call `supabaseAdmin.rpc("restore_tap_inventory", ...)` instead of read-then-write
**Files changed:**
- `supabase/functions/stripe-webhook/index.ts` (lines 214-229 replaced)
- `supabase/migrations/20260211700000_immediate_fixes.sql` (new file, lines 1-20)

### Fix 2: QR Token Single-Use Enforcement (Issue 2.2)
**Problem:** `verify-qr-token` didn't verify the update actually affected a row, allowing a race where two concurrent requests could both succeed.
**Solution:**
- Added `{ count: "exact" }` option to the `.update()` call
- After update, check if `updateCount === 0` and return 409 Conflict ("Already redeemed")
**Files changed:**
- `supabase/functions/verify-qr-token/index.ts` (lines 183-215 modified)

### Fix 3: CHECK Constraint on oz_remaining (Issue 2.5)
**Problem:** `oz_remaining` decimal column had no CHECK constraint, allowing negative values from race conditions or bugs.
**Solution:** Added `ALTER TABLE taps ADD CONSTRAINT taps_oz_remaining_non_negative CHECK (oz_remaining >= 0)`
**Files changed:**
- `supabase/migrations/20260211700000_immediate_fixes.sql` (lines 22-27)

### Fix 4: Memory Leak in Countdown Timer (Issue 2.6)
**Problem:** `useCountdown` hook returned early without cleanup when `expiresAt` was falsy. If `expiresAt` changed from truthy to falsy mid-interval, the interval leaked.
**Solution:**
- Store interval in a `useRef` so it persists across renders
- Always clear existing interval at the start of the effect (handles expiresAt transitions)
- Reset remaining to `null` when expiresAt becomes falsy
**Files changed:**
- `app/(main)/order/redeem.tsx` (useCountdown hook, lines 60-100 rewritten)

### Fix 5: pending_payment Orders Never Expire (Issue 3.11)
**Problem:** `expire_stale_orders()` only processed `ready_to_redeem` orders. Orders stuck in `pending_payment` (PaymentIntent created but abandoned) lingered indefinitely, holding Stripe card authorizations.
**Solution:** Added a second loop in `expire_stale_orders()` that cancels `pending_payment` orders older than 5 minutes, restores inventory, and logs events.
**Files changed:**
- `supabase/migrations/20260211700000_immediate_fixes.sql` (lines 29-108, full rewrite of expire_stale_orders)

### Fix 6: Stub QR Screen (Issue 8.1)
**Problem:** `app/(main)/order/qr.tsx` was a non-functional placeholder ("coming soon"). The actual QR display lives in `redeem.tsx`. If any future code navigates to `/order/qr`, users would see a dead-end.
**Solution:** Replaced stub with a redirect component that forwards to `redeem.tsx` (with orderId param) or falls back to venues list.
**Files changed:**
- `app/(main)/order/qr.tsx` (full rewrite, 21 lines)

### Fix 7: Duplicate Order Prevention (Issue 8.2)
**Problem:** `create_order_atomic` didn't prevent a user from spamming the order button, creating multiple concurrent `pending_payment` orders that all deplete inventory.
**Solution:** Added a check at the start of `create_order_atomic` that queries for existing `pending_payment` orders from the same user within the last 2 minutes. Returns `PENDING_ORDER_EXISTS` error code if found.
**Files changed:**
- `supabase/migrations/20260211700000_immediate_fixes.sql` (lines 110-end, full rewrite of create_order_atomic with new check)

### Fix 8: Dedicated Webhook Idempotency Table (Issue 2.3)
**Problem:** Webhook idempotency checked `order_events` with a fragile JSONB metadata filter that could miss duplicates.
**Solution:**
- Created `webhook_idempotency` table with `stripe_event_id` as PRIMARY KEY (unique constraint)
- Updated `stripe-webhook/index.ts` to INSERT into the table before processing (unique constraint rejects concurrent duplicates)
**Files changed:**
- `supabase/migrations/20260211800000_high_priority_fixes.sql` (new table)
- `supabase/functions/stripe-webhook/index.ts` (idempotency check rewritten)

### Fix 9: QR Expiration Cross-Check (Issue 2.4)
**Problem:** JWT `exp` claim was verified, but `order.qr_expires_at` was never checked. Old tokens could be valid after a new QR was generated.
**Solution:** Added explicit check: if `qr_expires_at` exists and has passed, return 410 Gone.
**Files changed:**
- `supabase/functions/verify-qr-token/index.ts` (added qr_expires_at to SELECT and cross-check)

### Fix 10: TOCTOU Fix in Order Creation (Issue 3.1)
**Problem:** `create_order_atomic` checked inventory with separate SELECT then UPDATE, allowing two near-threshold orders to both pass validation.
**Solution:** Combined into single `UPDATE taps SET oz_remaining = oz_remaining - v_total_oz WHERE ... AND oz_remaining > low_threshold_oz AND oz_remaining - v_total_oz >= 0` then checked `ROW_COUNT`.
**Files changed:**
- `supabase/migrations/20260211800000_high_priority_fixes.sql` (full rewrite of create_order_atomic)

### Fix 11: Biometric Auth Race Condition (Issue 3.2)
**Problem:** After biometric auth, `getSession()` was called but auth store may not have synced yet, causing redirect check to fail.
**Solution:** Changed `getSession()` to `refreshSession()` which actively refreshes the token and triggers the auth state listener. Added 100ms delay to let Zustand store sync.
**Files changed:**
- `app/(auth)/login.tsx` (handleBiometricLogin rewritten)

### Fix 12: QR Generation Error State/Timeout (Issue 3.4)
**Problem:** If QR data fails to generate, screen shows infinite spinner with no timeout or error state.
**Solution:** Added `qrTimedOut` state with 15-second timeout. When timed out, shows "Failed to generate QR code" with guidance to go back.
**Files changed:**
- `app/(main)/order/redeem.tsx` (added timeout effect and error fallback UI)

### Fix 13: Service-Role Key Replacement (Issue 3.5)
**Problem:** `pour-start` and `pour-complete` compared Bearer token directly to service-role key, exposing it in transit.
**Solution:** Added `PLC_API_KEY` env var support. Functions check `PLC_API_KEY` first, falling back to service-role key for backwards compatibility.
**Files changed:**
- `supabase/functions/pour-start/index.ts` (auth check updated)
- `supabase/functions/pour-complete/index.ts` (auth check updated)

### Fix 14: Polling Timeout Refs (Issue 3.9)
**Problem:** 30-second polling timeout and 5-second pay fallback timeout were not tracked in refs, causing potential state updates on unmounted components.
**Solution:** Added `pollingTimeoutRef` and `payFallbackTimeoutRef` refs. Updated `cleanupPolling()` to clear all timeouts. Both refs cleaned up on unmount.
**Files changed:**
- `app/(main)/order/payment.tsx` (added refs, updated cleanup)

### Fix 15: Missing Database Indexes (Issue 4.4)
**Problem:** Missing indexes on `orders.expires_at`, `orders.stripe_payment_intent_id`, and composite `(status, expires_at)`.
**Solution:** Added 4 indexes: `expires_at`, `stripe_payment_intent_id`, `(status, expires_at)`, and `(user_id, status, created_at)`.
**Files changed:**
- `supabase/migrations/20260211800000_high_priority_fixes.sql`

### Fix 16: React Error Boundary (Issue 4.6)
**Problem:** No Error Boundary wrapping the app. Any component crash would crash the entire app.
**Solution:** Created `ErrorBoundary` class component with branded error UI and "Try Again" button. Wrapped `RootLayout` in it.
**Files changed:**
- `components/ErrorBoundary.tsx` (new file)
- `app/_layout.tsx` (wrapped with ErrorBoundary)

### Fix 17: Rate Limiting on Edge Functions (Issue 8.5)
**Problem:** No per-user rate limits on `create-order`, `create-payment-intent`, or `verify-qr-token`.
**Solution:** Created shared in-memory rate limiter (`_shared/rate-limit.ts`) using sliding window counters. Applied to 3 Edge Functions with appropriate limits (5/min for orders, 10/min for payments, 20/min for QR verify).
**Files changed:**
- `supabase/functions/_shared/rate-limit.ts` (new file)
- `supabase/functions/create-order/index.ts` (added rate limit check)
- `supabase/functions/create-payment-intent/index.ts` (added rate limit check)
- `supabase/functions/verify-qr-token/index.ts` (added rate limit check)

### Fix 18: Client-Side Idempotency Key (Issue 8.6)
**Problem:** `createOrder()` didn't send an idempotency key. Double-tap on slow network could create 2 orders.
**Solution:** Generate unique idempotency key client-side and pass as `Idempotency-Key` header.
**Files changed:**
- `lib/api/orders.ts` (added idempotency key generation)

### Fix 19: Expiration Cron → Stripe Refund (Issue 8.8)
**Problem:** `expire_stale_orders` SQL function expired orders but didn't trigger Stripe refunds. The `process-expired-orders` Edge Function handles refunds but wasn't called by the cron job.
**Solution:** Created `expire_and_refund_orders()` wrapper that calls `expire_stale_orders()` then invokes the Edge Function via `pg_net.http_post` if any orders were expired. Updated cron job to use the wrapper. Also fixed refund reason from `requested_by_customer` to `requested_by_merchant` (issue 4.5).
**Files changed:**
- `supabase/migrations/20260211800000_high_priority_fixes.sql` (pg_net extension + wrapper function + cron update)
- `supabase/functions/process-expired-orders/index.ts` (fixed refund reason)

### Fix 20: EAS Project ID for Push Notifications (Issue 8.9)
**Problem:** `app.json` missing `extra.eas.projectId`, causing push token registration to fail.
**Solution:** Added `extra.eas.projectId` placeholder to `app.json`. Must be replaced with actual project ID after running `eas init`.
**Files changed:**
- `app.json` (added extra.eas.projectId)

---

## Next Priority Tier: Medium Priority (Before Launch)

| # | Issue | Description |
|---|-------|-------------|
| 21 | 3.3 | Add `.catch()` to deep link handler |
| 22 | 3.8 | Add explanatory text for disabled order button |
| 23 | 3.10 | Handle session expiration in redeem screen |
| 24 | 4.1 | Tighten verification rate limiting |
| 25 | 4.2 | Add audit logging for payment method changes |
| 26 | 4.3 | Fix verification polling cleanup |
| 27 | 4.5 | Correct Stripe refund reason (**DONE** - fixed as part of Fix 19) |
| 28 | 6.1 | Add skeleton loaders to payment and redeem screens |
| 29 | 6.5 | Verify GDPR-compliant account deletion |
| 30 | 8.4 | Fix duplicate admin_pour_logs inserts |
| 31 | 8.7 | Document pg_cron Pro plan requirement |
