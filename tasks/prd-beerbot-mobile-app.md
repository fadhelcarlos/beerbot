[PRD]
# PRD: BeerBot Mobile App - MVP V1.0

**Client:** GTECS PR LLC
**Product:** BeerBot Mobile App
**Prepared by:** Local Tech
**Version:** 1.0
**Date:** February 11, 2026

---

## Overview

BeerBot is a self-service automated beer dispensing system. Customers order and pay for beer through a mobile app, verify their legal drinking age, and receive a unique QR code tied to a specific tap station. They then walk to the assigned tap, scan the QR, and the system automatically pours their beer via PLC/Arduino integration -- no bartender required.

This PRD covers the **MVP first iteration**: the customer-facing mobile app and the backend API layer required to power it. The goal is not a "minimum viable" experience -- it is a **polished, production-grade mobile application** that delivers a seamless, delightful beer-ordering experience from download to first pour.

**What this MVP includes:**
- Complete customer mobile app (iOS + Android)
- Backend API with all integrations (Stripe, age verification, venue/tap management)
- QR-based order redemption flow (generation side -- the kiosk reads it)
- Real-time inventory awareness

**What this MVP includes:**
- Real-time temperature and pour telemetry visible in the app (via venue local backend -> cloud sync)

**What ships in subsequent phases (NOT this PRD):**
- Kiosk/tap station UI (10" touchscreen interface)
- Admin/staff web dashboard
- Sales reporting & CSV export
- Local backend (Raspberry Pi/Node.js) at each venue (required for kiosk + PLC bridge)
- PLC/Arduino GIGA direct communication layer
- RFID wallet system for offline/cash payments
- Phase 2 AI integration

---

## Goals

- Deliver a cross-platform mobile app (iOS + Android) that feels native, fast, and premium
- Enable end-to-end beer ordering: browse venue -> select beer -> verify age -> pay -> receive QR
- Integrate Stripe for secure payments with Apple Pay and Google Pay support
- Integrate third-party age verification (ID + selfie liveness) with opt-in persistence
- Implement GPS-based venue detection so the app "knows where you are"
- Generate cryptographically signed, tap-specific QR codes for order redemption
- Enforce inventory thresholds to prevent ordering when stock is low
- Build a backend API architecture that cleanly supports future kiosk, dashboard, and PLC layers
- Achieve a UI/UX quality level that makes users *want* to use the app over ordering at a bar

---

## System Architecture (Full Picture)

Understanding where the mobile app fits in the overall BeerBot ecosystem is critical for making the right design decisions. The client's existing hardware and planned architecture (sourced from client's technical conversations) is as follows:

```
                    ┌─────────────────────────────────┐
                    │         CLOUD (Internet)         │
                    │  ┌───────────┐  ┌────────────┐  │
                    │  │ Supabase  │  │   Stripe   │  │
                    │  │ (DB/Auth/ │  │ (Payments) │  │
                    │  │  Realtime)│  │            │  │
                    │  └─────┬─────┘  └─────┬──────┘  │
                    │        │              │          │
                    │  ┌─────┴──────────────┴──────┐  │
                    │  │    Supabase Edge Functions │  │
                    │  │  (Orders, Webhooks, Auth)  │  │
                    │  └────────────┬───────────────┘  │
                    └──────────────┼───────────────────┘
                                   │ HTTPS
                    ┌──────────────┼───────────────────┐
                    │   VENUE LAN  │  (Works offline)  │
                    │              │                    │
          ┌────────┴──┐    ┌──────┴──────┐             │
          │  Mobile   │    │ Local Server│             │
          │   App     │    │ (Rasp Pi /  │             │
          │ (Phone)   │    │  Node.js)   │             │
          └───────────┘    └──────┬──────┘             │
                                  │ HTTP + WebSocket    │
                    ┌─────────────┼─────────────┐      │
                    │             │             │       │
               ┌────┴────┐ ┌────┴────┐  ┌────┴────┐  │
               │ Kiosk   │ │Tap Mon. │  │ Arduino │  │
               │ (10")   │ │ (small) │  │  GIGA   │  │
               └─────────┘ └─────────┘  │  (PLC)  │  │
                                         └────┬────┘  │
                                              │        │
                                    ┌─────────┴──────┐ │
                                    │  Flow Meters   │ │
                                    │  Temp Sensors  │ │
                                    │  Solenoids     │ │
                                    │  (per tap)     │ │
                                    └────────────────┘ │
                    └──────────────────────────────────┘
```

### Hardware Context (Client's Existing Setup)
The client has an operational Arduino GIGA-based beer dispensing system with:
- **Flow meters** (Titan 300-010, NSF certified) -- pulse-based oz measurement per tap
- **Temperature sensors** (DS18B20) -- real-time keg/line temperature per tap
- **Solenoid valves** -- electronically controlled beer flow
- **Pour profile** -- multi-phase pour (pre-pour 0.4s, then A/B/C phases) to minimize foam
- **GIGA Display** -- currently shows oz being poured in real-time

### Architecture Decisions for MVP
- **Mobile app talks to cloud only** (Supabase) -- it does NOT communicate directly with the local hardware
- **Cloud <-> Local sync** happens via the local backend (Raspberry Pi), which is a *future phase* deliverable
- **For MVP**: tap data (temperature, oz_remaining, availability) is seeded/updated in Supabase by the venue operator (manual or via a simple sync script). Full real-time hardware telemetry integration comes with the local backend phase.
- **The PLC pour endpoint is a stub** -- designed to match the exact contract the GIGA will expect:
  - `startPour(tapId, targetOz, orderId)` with a signed token
  - The GIGA validates locally: order not used, tap correct, volume permitted, temperature OK
  - If connection lost mid-pour, GIGA completes safely and closes valve

### Temperature Gating (Critical Client Requirement)
The client explicitly requires: **if beer is not at serving temperature, the system must NOT serve.** In the full system, this is enforced at the GIGA (hardware) level. In the mobile app, temperature is displayed to the user and if a tap reports `temp_ok = false`, the beer should show as temporarily unavailable with message: "Cooling down -- check back shortly."

---

## Tech Stack (Recommended)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Mobile | **React Native + Expo** (SDK 52+) | Cross-platform, single codebase, native performance, OTA updates |
| Language | **TypeScript** (strict mode) | Type safety across frontend and backend |
| Navigation | **Expo Router** (file-based) | Native navigation patterns, deep linking support |
| State | **Zustand** + **TanStack Query** | Lightweight global state + server state caching |
| Backend | **Supabase** (Auth + DB + Edge Functions) | PostgreSQL, built-in auth, row-level security, realtime subscriptions |
| Payments | **Stripe SDK** (react-native-stripe-sdk) | Apple Pay, Google Pay, PCI compliance out of the box |
| Age Verification | **Veriff** or **Jumio** | Industry-standard ID + liveness, React Native SDKs available |
| QR Generation | **react-native-qrcode-svg** | Offline QR rendering, SVG quality |
| Location | **expo-location** | GPS with permission handling |
| Animations | **react-native-reanimated** + **Lottie** | 60fps animations for pouring states, transitions |
| Push Notifications | **Expo Notifications** | Order status updates, redemption reminders |
| Styling | **NativeWind** (Tailwind for RN) | Rapid, consistent styling with design tokens |

---

## Quality Gates

These commands must pass for every user story:

- `npx expo lint` -- Linting
- `npx tsc --noEmit` -- TypeScript type checking
- `npx jest --passWithNoTests` -- Unit tests (where applicable)
- `npx expo prebuild --clean` -- Build verification (periodic)

For UI stories, also include:
- Visual verification on iOS simulator and Android emulator
- Responsive layout verification across screen sizes (iPhone SE -> iPhone 16 Pro Max, small Android -> tablet)

---

## Database Schema (Core Entities)

```
users
  id (uuid, PK)
  email (text, unique)
  phone (text, nullable)
  full_name (text)
  age_verified (boolean, default false)
  age_verification_ref (text, nullable)    -- third-party reference ID
  age_verified_at (timestamptz, nullable)
  stripe_customer_id (text, nullable)
  created_at (timestamptz)
  updated_at (timestamptz)

venues
  id (uuid, PK)
  name (text)
  address (text)
  latitude (decimal)
  longitude (decimal)
  is_active (boolean, default true)
  mobile_ordering_enabled (boolean, default true)
  created_at (timestamptz)

taps
  id (uuid, PK)
  venue_id (uuid, FK -> venues)
  tap_number (int)
  beer_id (uuid, FK -> beers, nullable)
  status (enum: active, inactive, maintenance)
  oz_remaining (decimal)
  low_threshold_oz (decimal, default 120)
  temperature_f (decimal, nullable)        -- null if no sensor (from DS18B20)
  temp_ok (boolean, default true)          -- false = beer not at serving temp, block ordering
  temp_threshold_f (decimal, default 38)   -- max serving temp in Fahrenheit
  created_at (timestamptz)
  updated_at (timestamptz)

beers
  id (uuid, PK)
  name (text)
  style (text, nullable)
  abv (decimal, nullable)
  description (text, nullable)
  image_url (text, nullable)
  created_at (timestamptz)

tap_pricing
  id (uuid, PK)
  tap_id (uuid, FK -> taps)
  price_12oz (decimal)
  pour_size_oz (decimal, default 12)       -- backend-configurable
  currency (text, default 'usd')
  created_at (timestamptz)

orders
  id (uuid, PK)
  user_id (uuid, FK -> users)
  venue_id (uuid, FK -> venues)
  tap_id (uuid, FK -> taps)
  beer_id (uuid, FK -> beers)
  quantity (int)
  pour_size_oz (decimal)
  unit_price (decimal)
  total_amount (decimal)
  currency (text, default 'usd')
  status (enum: pending_payment, paid, ready_to_redeem, redeemed, pouring, completed, expired, cancelled, refunded)
  qr_code_token (text, unique, nullable)   -- signed JWT
  qr_expires_at (timestamptz, nullable)
  stripe_payment_intent_id (text, nullable)
  paid_at (timestamptz, nullable)
  redeemed_at (timestamptz, nullable)
  completed_at (timestamptz, nullable)
  expires_at (timestamptz, nullable)       -- auto-refund deadline
  created_at (timestamptz)
  updated_at (timestamptz)

order_events
  id (uuid, PK)
  order_id (uuid, FK -> orders)
  event_type (text)                        -- e.g., 'created', 'paid', 'redeemed', 'expired'
  metadata (jsonb, nullable)
  created_at (timestamptz)

admin_pour_logs
  id (uuid, PK)
  tap_id (uuid, FK -> taps)
  admin_user_id (uuid, nullable)
  pour_size_oz (decimal)
  master_code_used (boolean)
  reason (text, nullable)
  created_at (timestamptz)
```

---

## User Stories

### EPIC 1: Onboarding & Authentication

---

#### US-001: App Launch & Welcome Screen
**Description:** As a new user, I want to see a polished welcome screen when I first open the app so that I understand what BeerBot does and feel confident using it.

**Acceptance Criteria:**
- [ ] Animated splash screen with BeerBot branding (Lottie animation)
- [ ] Welcome carousel (2-3 slides): "Order your beer", "Verify your age", "Scan & Pour"
- [ ] "Get Started" CTA button navigates to registration
- [ ] "I already have an account" link navigates to login
- [ ] Carousel supports swipe gestures with smooth page indicators
- [ ] All text and assets render correctly on both iOS and Android

---

#### US-002: User Registration
**Description:** As a new user, I want to create an account with my email so that I can place orders and track my history.

**Acceptance Criteria:**
- [ ] Registration form with fields: full name, email, password
- [ ] Client-side validation: email format, password minimum 8 characters, name required
- [ ] Password strength indicator (weak/medium/strong)
- [ ] "Show/hide password" toggle on password field
- [ ] Submit triggers Supabase auth signup
- [ ] On success: auto-login and navigate to venue selection
- [ ] On failure: display specific error (e.g., "Email already registered")
- [ ] Loading state on submit button (disabled + spinner)
- [ ] Keyboard-aware scroll so fields aren't hidden behind keyboard

---

#### US-003: User Login
**Description:** As a returning user, I want to log in with my email and password so that I can access my account.

**Acceptance Criteria:**
- [ ] Login form with email and password fields
- [ ] Client-side validation before submission
- [ ] "Show/hide password" toggle
- [ ] "Forgot password?" link (triggers Supabase password reset email)
- [ ] On success: navigate to venue selection (or last-used venue if available)
- [ ] On failure: display error ("Invalid credentials", "Account not found")
- [ ] Biometric login option (Face ID / fingerprint) if user has logged in before
- [ ] Persist session with secure token storage (expo-secure-store)
- [ ] Auto-login on app relaunch if valid session exists

---

#### US-004: Forgot Password Flow
**Description:** As a user who forgot my password, I want to reset it via email so that I can regain access to my account.

**Acceptance Criteria:**
- [ ] Email input field with validation
- [ ] "Send Reset Link" button triggers Supabase password reset
- [ ] Success message: "Check your email for a reset link"
- [ ] Deep link from email opens the app's password reset screen
- [ ] New password form with confirmation field
- [ ] On success: auto-login and navigate to home

---

### EPIC 2: Venue Discovery & Selection

---

#### US-005: GPS-Based Venue Detection
**Description:** As a user at a BeerBot venue, I want the app to automatically detect my location and show the nearest venue so that I can start ordering immediately.

**Acceptance Criteria:**
- [ ] On venue selection screen, request location permission (graceful handling if denied)
- [ ] If granted: query venues sorted by proximity to current coordinates
- [ ] Display nearest venue prominently at top with distance badge (e.g., "0.1 mi away")
- [ ] If user is within 200m of a venue, auto-suggest it with a "You're here!" indicator
- [ ] If location denied: fall back to full venue list (alphabetical)
- [ ] Pull-to-refresh to re-check location and reload venues
- [ ] Show venue cards with: name, address, distance, active tap count, thumbnail image

---

#### US-006: Manual Venue Selection
**Description:** As a user, I want to browse and search the full venue list so that I can select a venue even without GPS.

**Acceptance Criteria:**
- [ ] Scrollable list of all active venues
- [ ] Search bar with real-time filtering by venue name or address
- [ ] Each venue card shows: name, address, number of active taps, image
- [ ] Tapping a venue navigates to that venue's beer menu
- [ ] Empty state if no venues match search: "No venues found"
- [ ] Venues with `mobile_ordering_enabled = false` show as "In-person only" (greyed out, not tappable)

---

#### US-007: Venue Detail Header
**Description:** As a user who selected a venue, I want to see venue information at the top of the beer menu so that I know I'm ordering from the right place.

**Acceptance Criteria:**
- [ ] Venue name displayed prominently
- [ ] Venue address shown below name
- [ ] "Change venue" affordance (back arrow or explicit button)
- [ ] If user's GPS is far from selected venue, show subtle warning: "You're not at this venue -- you'll need to visit to redeem"
- [ ] Collapsible header that shrinks on scroll to maximize beer list space

---

### EPIC 3: Beer Menu & Selection

---

#### US-008: Beer List by Venue
**Description:** As a user at a venue, I want to see all available beers with their details so that I can choose what to order.

**Acceptance Criteria:**
- [ ] Display list of beers assigned to active taps at this venue
- [ ] Each beer card shows: beer name, style, price (12oz), availability status, temperature
- [ ] Availability badge with color coding: green = "Available", yellow = "Low", red/grey = "Out"
- [ ] Temperature displayed if sensor data exists, "N/A" otherwise
- [ ] "Out" beers are visually dimmed and not tappable
- [ ] "Low" beers show warning: "Limited -- order at the station for best availability"
- [ ] If `temp_ok = false` for a tap: show "Cooling down" badge (blue/ice icon), beer is not orderable
- [ ] Tapping an available beer opens the order configuration screen
- [ ] Real-time data: beer list refreshes on pull-to-refresh and auto-updates via Supabase realtime subscription
- [ ] Empty state if no beers available: "No beers on tap right now. Check back soon!"

---

#### US-009: Beer Detail & Order Configuration
**Description:** As a user, I want to select how many beers I want and see a clear price breakdown before proceeding.

**Acceptance Criteria:**
- [ ] Beer name, style, ABV, and description displayed at top
- [ ] Beer image (or attractive placeholder) shown prominently
- [ ] Serving size shown as "12 oz" (fixed, not selectable by user)
- [ ] Quantity selector: stepper control (- / + buttons), range 1-6, default 1
- [ ] Live price calculation: unit price x quantity = total (formatted as currency)
- [ ] Assigned tap number shown: "Tap #3"
- [ ] "Add to Order" / "Continue" CTA button with total price
- [ ] If inventory drops below threshold while user is on this screen, show alert and navigate back
- [ ] Temperature and availability shown as live data

---

### EPIC 4: Age Verification

---

#### US-010: Age Verification Gate
**Description:** As a user proceeding to payment, I want to verify my age so that the system confirms I'm of legal drinking age.

**Acceptance Criteria:**
- [ ] If `user.age_verified = true`: skip verification, proceed to payment
- [ ] If not verified: show age verification required screen with explanation
- [ ] Clear messaging: "We need to verify you're 21+ before your first purchase"
- [ ] "Verify My Age" CTA button launches third-party verification SDK (Veriff/Jumio)
- [ ] Privacy notice: "Your ID photo is processed securely by [Provider] and is not stored by BeerBot"
- [ ] Option shown: "Remember my verification for future orders" (checkbox, default on)
- [ ] Loading state while verification processes

---

#### US-011: Third-Party Verification Flow
**Description:** As a user, I want the ID + selfie verification to be fast and clear so that I can complete it without confusion.

**Acceptance Criteria:**
- [ ] Launch Veriff/Jumio SDK in-app (not external browser)
- [ ] SDK handles: ID photo capture, selfie capture, liveness check
- [ ] On success: update `user.age_verified = true`, store provider reference ID and timestamp
- [ ] On failure: display reason if available ("ID not readable", "Liveness check failed")
- [ ] Allow retry on failure (up to 3 attempts)
- [ ] On success with "remember" enabled: user never sees verification again
- [ ] On success without "remember": verify once per session (or configurable period)
- [ ] No ID images stored locally or in BeerBot's database -- only verification status, timestamp, and provider reference ID
- [ ] Handle edge cases: camera permission denied, SDK crash, network timeout

---

### EPIC 5: Payment

---

#### US-012: Payment Method Selection
**Description:** As a verified user, I want to pay quickly using Apple Pay, Google Pay, or a saved card so that the checkout is frictionless.

**Acceptance Criteria:**
- [ ] Order summary displayed: beer name, quantity, unit price, total, tax (if applicable), assigned tap
- [ ] Apple Pay button shown on iOS if available
- [ ] Google Pay button shown on Android if available
- [ ] "Pay with card" option as fallback (Stripe card element)
- [ ] If user has a saved payment method: show it as default with option to change
- [ ] "Save this card for future orders" checkbox (if using card, default on)
- [ ] Stripe Payment Intent created on backend before presenting payment sheet
- [ ] Payment amount uses Stripe's `payment_intent.amount` as source of truth (not client-calculated)

---

#### US-013: Payment Processing & Confirmation
**Description:** As a user, I want immediate feedback when my payment succeeds or fails so that I know whether to head to the tap.

**Acceptance Criteria:**
- [ ] On payment initiation: show processing state (animated spinner/Lottie)
- [ ] Backend creates Stripe Payment Intent with metadata: order_id, user_id, venue_id, tap_id
- [ ] On Stripe webhook `payment_intent.succeeded`: update order status to `paid` -> `ready_to_redeem`
- [ ] Generate signed QR token (JWT with order_id, tap_id, venue_id, expiration)
- [ ] On success: navigate to QR/redemption screen with celebration animation
- [ ] On failure: display error ("Payment declined", "Try another method"), remain on payment screen
- [ ] On network error: show retry option, do NOT create duplicate charges
- [ ] Idempotency key used on all Stripe API calls to prevent double-charging

---

#### US-014: Redemption Timeout & Auto-Refund
**Description:** As a user who paid but hasn't redeemed, I want to be protected by an automatic refund after a timeout so that I'm not charged for beer I didn't receive.

**Acceptance Criteria:**
- [ ] Order has `expires_at` timestamp set at payment time (configurable, e.g., 15 minutes)
- [ ] Countdown timer visible on the QR screen: "Redeem within 14:32"
- [ ] Push notification at 5 minutes remaining: "Your beer is waiting! Redeem soon."
- [ ] Push notification at 1 minute: "Last chance! Your order expires in 60 seconds."
- [ ] If timer expires without redemption: backend marks order as `expired`
- [ ] Stripe refund triggered automatically on expiration
- [ ] User sees "Order expired - you have not been charged" message
- [ ] Expired orders recorded in `order_events` for audit trail

---

### EPIC 6: QR Code & Redemption

---

#### US-015: QR Code Display Screen
**Description:** As a user who paid, I want to see my QR code with clear instructions so that I know exactly which tap to go to and what to do.

**Acceptance Criteria:**
- [ ] Large, scannable QR code rendered center-screen (react-native-qrcode-svg)
- [ ] QR encodes a signed JWT token (not a raw order ID)
- [ ] Below QR: "Go to Tap #[X]" in large, bold text
- [ ] Visual tap indicator/illustration showing which tap station to visit
- [ ] Step-by-step instructions: "1. Walk to Tap #3  2. Scan this code  3. Enjoy your beer!"
- [ ] Countdown timer showing time remaining to redeem
- [ ] Order summary: beer name, quantity, venue name
- [ ] Screen brightness auto-maximized for QR scannability
- [ ] Screen stays awake (prevent auto-lock) while on this screen
- [ ] "View Order Details" expandable section with full order info
- [ ] If order is redeemed (status changes): screen transitions to "Pouring..." state

---

#### US-016: Order Status Real-Time Updates
**Description:** As a user waiting for my beer, I want to see live status updates so that I know what's happening with my order.

**Acceptance Criteria:**
- [ ] Subscribe to order status changes via Supabase realtime
- [ ] Status progression displayed visually (stepper/progress bar):
  - Paid -> Ready to Redeem -> Scanned -> Pouring -> Complete
- [ ] "Pouring" state: show animated pouring illustration (Lottie animation)
- [ ] "Complete" state: celebration animation, "Enjoy your beer!" message
- [ ] "Expired" state: show expiration message with refund confirmation
- [ ] Each status change triggers a subtle haptic feedback
- [ ] "Done" button on complete state returns to venue beer menu

---

### EPIC 7: Order History

---

#### US-017: Order History List
**Description:** As a user, I want to view my past orders so that I can see my purchase history and reorder favorites.

**Acceptance Criteria:**
- [ ] Chronologically sorted list (newest first) of all user orders
- [ ] Each order card shows: beer name, venue name, date/time, quantity, total, status badge
- [ ] Status badges: color-coded (green = completed, yellow = active, red = expired/cancelled, blue = refunded)
- [ ] Tapping an order opens order detail view
- [ ] Pagination or infinite scroll for users with many orders
- [ ] Empty state for new users: "Your order history will appear here after your first pour!"
- [ ] Pull-to-refresh to reload

---

#### US-018: Order Detail View
**Description:** As a user, I want to see the full details of a past order including its timeline.

**Acceptance Criteria:**
- [ ] Full order info: beer name, style, venue, tap #, quantity, pour size, price, total
- [ ] Order timeline showing all status transitions with timestamps (from `order_events`)
- [ ] Payment info: last 4 digits of card or "Apple Pay" / "Google Pay"
- [ ] Stripe receipt link if available
- [ ] "Reorder" button if the same beer is still available at the same venue
- [ ] For active orders: show QR code and countdown (navigate to US-015 screen)

---

### EPIC 8: User Profile & Settings

---

#### US-019: Profile Screen
**Description:** As a user, I want to manage my account settings from a profile screen.

**Acceptance Criteria:**
- [ ] Display: full name, email, verification status badge (verified/unverified)
- [ ] "Edit Profile" option: change name (email change requires re-verification)
- [ ] "Payment Methods" section: list saved cards, add new, delete existing
- [ ] "Age Verification" section: show status, option to re-verify
- [ ] "Order History" link (navigates to US-017)
- [ ] "Sign Out" button with confirmation dialog
- [ ] "Delete Account" option (GDPR-compliant, requires confirmation + re-auth)
- [ ] App version number displayed at bottom

---

#### US-020: Saved Payment Methods Management
**Description:** As a user, I want to manage my saved payment methods so that checkout is fast.

**Acceptance Criteria:**
- [ ] List all saved Stripe payment methods (card brand, last 4, expiry)
- [ ] Default payment method marked with indicator
- [ ] Swipe-to-delete or explicit delete button with confirmation
- [ ] "Add Payment Method" button opens Stripe card element
- [ ] Set as default option on each card

---

### EPIC 9: Low Inventory & Edge Cases

---

#### US-021: Low Inventory Handling
**Description:** As a user, I want clear messaging when a beer is running low so that I understand why I might need to order in person.

**Acceptance Criteria:**
- [ ] When `oz_remaining <= low_threshold_oz` for a tap: beer shows "Low" badge in beer list
- [ ] "Low" beers display message: "Limited stock -- order directly at the station for best availability"
- [ ] Payment is BLOCKED for low-inventory beers (backend enforces, not just UI)
- [ ] If inventory drops below threshold during order flow: show alert, navigate back to beer list
- [ ] "Out" beers (0 remaining): fully disabled, greyed out, "Sold Out" badge
- [ ] Inventory updates in real-time via Supabase realtime subscription

---

#### US-022: Offline & Error State Handling
**Description:** As a user, I want graceful handling of network errors and edge cases so that the app never feels broken.

**Acceptance Criteria:**
- [ ] No internet: show banner "You're offline -- some features may be unavailable"
- [ ] API errors: show user-friendly messages (never raw error codes)
- [ ] Payment screen: if network drops mid-payment, show "Checking payment status..." and poll
- [ ] QR screen: works offline (QR is generated client-side from token)
- [ ] Session expired: auto-redirect to login with message "Please sign in again"
- [ ] Retry logic on all API calls (exponential backoff, max 3 retries)
- [ ] All loading states have skeleton screens (not blank screens or generic spinners)

---

### EPIC 10: Backend API & Integrations

---

#### US-023: Supabase Project Setup & Auth
**Description:** As a developer, I want the Supabase project configured with auth, RLS policies, and database schema so that the app has a secure foundation.

**Acceptance Criteria:**
- [ ] Supabase project created with PostgreSQL database
- [ ] All tables from schema section created with proper types, constraints, and indexes
- [ ] Row Level Security (RLS) enabled on all tables
- [ ] RLS policies: users can only read/write their own data; venues/beers/taps are public read
- [ ] Supabase Auth configured with email/password provider
- [ ] Password reset email template customized with BeerBot branding
- [ ] Environment variables configured for Supabase URL and anon key
- [ ] Database migrations tracked in version control

---

#### US-024: Venues & Taps API
**Description:** As a developer, I want API endpoints for venues and taps so that the mobile app can fetch location and beer data.

**Acceptance Criteria:**
- [ ] `GET /venues` -- list all active venues (public, no auth required)
- [ ] `GET /venues?lat=X&lng=Y` -- list venues sorted by proximity
- [ ] `GET /venues/:id/taps` -- list active taps with beer, price, availability, temperature
- [ ] Taps include computed `availability_status`: "available" / "low" / "out" based on `oz_remaining` vs `low_threshold_oz`
- [ ] Realtime subscription available on `taps` table for live inventory/temperature updates
- [ ] Response times < 200ms for venue list queries
- [ ] Proper error responses (404 for invalid venue, etc.)

---

#### US-025: Orders API & QR Token Generation
**Description:** As a developer, I want order creation and QR token generation endpoints so that the mobile app can process the full order lifecycle.

**Acceptance Criteria:**
- [ ] `POST /orders` -- create order (requires auth, validates: age verified, inventory available, venue active, mobile ordering enabled)
- [ ] Order creation is atomic: validates inventory, creates order, decrements `oz_remaining` in a single transaction
- [ ] `GET /orders/:id` -- get order detail (owner only via RLS)
- [ ] `GET /orders` -- get user's order history (paginated, owner only)
- [ ] QR token generated as JWT signed with server secret, containing: `order_id`, `tap_id`, `venue_id`, `exp` (expiration)
- [ ] QR token is single-use: once scanned and redeemed, cannot be reused
- [ ] Order expiration: background job (or Supabase pg_cron) marks orders as expired and triggers refund after timeout

---

#### US-026: Stripe Integration
**Description:** As a developer, I want Stripe payment processing with webhooks so that payments are secure and reliable.

**Acceptance Criteria:**
- [ ] Supabase Edge Function: `create-payment-intent` -- creates Stripe Payment Intent with order metadata
- [ ] Payment Intent uses idempotency keys to prevent double charges
- [ ] Stripe webhook endpoint handles: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
- [ ] On success webhook: update order status, generate QR token
- [ ] On failure webhook: update order status, notify user
- [ ] Stripe Customer created/linked on first payment for saved card support
- [ ] Apple Pay and Google Pay enabled in Stripe dashboard
- [ ] Auto-refund Edge Function: triggered by order expiration, calls Stripe Refund API
- [ ] All Stripe operations logged in `order_events`
- [ ] Test mode configuration for development, live mode for production

---

#### US-027: Age Verification Integration
**Description:** As a developer, I want third-party age verification integration so that users can prove they're 21+.

**Acceptance Criteria:**
- [ ] Veriff (or Jumio) SDK integrated in React Native app
- [ ] Backend Edge Function to create verification session with provider
- [ ] Webhook endpoint to receive verification result from provider
- [ ] On success: update `user.age_verified = true`, store reference ID and timestamp
- [ ] On failure: update status, allow retry
- [ ] Only store: verification status (boolean), timestamp, provider reference ID
- [ ] Do NOT store ID images or personal data from verification provider
- [ ] Rate limiting on verification attempts (max 5 per day per user)

---

#### US-028: PLC Command Stub Endpoint
**Description:** As a developer, I want a stub endpoint for PLC/Arduino GIGA communication so that the kiosk/local backend can be integrated in the next phase. The contract must match the GIGA's expected interface.

**Acceptance Criteria:**
- [ ] `POST /taps/:id/pour` -- accepts signed token, validates order, updates status to "pouring"
- [ ] Request payload matches GIGA contract: `{ order_id, tap_id, quantity, pour_size_oz, token }`
- [ ] Response payload matches GIGA expectation: `{ success: true, pour_command: { order_id, tap_id, quantity, pour_size_oz, signed_token_with_expiration } }`
- [ ] Validates: token signature, token not expired, order status is `ready_to_redeem`, tap matches, `temp_ok = true`
- [ ] On valid: updates order to "redeemed" -> "pouring", returns pour command
- [ ] On invalid: returns descriptive error codes matching GIGA error handling:
  - `WRONG_TAP` -- QR scanned at wrong tap (include correct tap number in response)
  - `EXPIRED` -- QR/order expired
  - `ALREADY_REDEEMED` -- QR already used
  - `TEMP_NOT_READY` -- beer not at serving temperature
  - `INVENTORY_LOW` -- insufficient oz remaining
- [ ] Endpoint is authenticated (service-to-service token, not user auth)
- [ ] `POST /taps/:id/pour-complete` -- called by local backend when GIGA reports pour finished, updates order to "completed"
- [ ] This is a STUB -- actual communication flows through local backend (Raspberry Pi) -> GIGA in production
- [ ] All pour commands logged in `order_events` and `admin_pour_logs`

---

## Functional Requirements

- **FR-01:** The system must require email/password authentication for all order-related actions
- **FR-02:** The system must detect user GPS location and sort venues by proximity
- **FR-03:** The system must display real-time beer availability (Available / Low / Out) per tap
- **FR-04:** The system must display beer temperature when sensor data exists, "N/A" otherwise
- **FR-05:** The system must enforce age verification before first purchase via third-party provider
- **FR-06:** The system must allow users to opt-in to persistent age verification (skip on future orders)
- **FR-07:** The system must process payments through Stripe with Apple Pay and Google Pay support
- **FR-08:** The system must generate a cryptographically signed, tap-specific, time-limited QR code per paid order
- **FR-09:** The system must block mobile ordering when `oz_remaining <= low_threshold_oz` for a tap
- **FR-10:** The system must display "Order directly at the station" message when inventory is low
- **FR-11:** The system must automatically refund orders not redeemed within the configurable timeout period
- **FR-12:** The system must prevent QR reuse (single-scan enforcement)
- **FR-13:** The system must reject QR codes scanned at the wrong tap and indicate the correct tap
- **FR-14:** The system must update inventory (`oz_remaining`) atomically after each pour
- **FR-15:** The system must log all order state transitions in an audit trail (`order_events`)
- **FR-16:** The system must support saved payment methods via Stripe Customer objects
- **FR-17:** The system must handle all Stripe webhooks (success, failure, refund) with idempotency
- **FR-18:** The system must support biometric login (Face ID / fingerprint) for returning users
- **FR-19:** The system must keep the screen awake and brightness maximized on the QR display screen
- **FR-20:** The system must provide real-time order status updates via Supabase realtime subscriptions
- **FR-21:** The system must only show 12oz serving size to customers (backend `pour_size_oz` field supports admin override for future use)
- **FR-22:** The system must validate venue, tap, payment status, verification, and expiration before any pour command
- **FR-23:** The system must display temperature status per tap and show "Cooling down" when `temp_ok = false`, blocking ordering for that tap
- **FR-24:** The system must expose a PLC stub endpoint with error codes that match the Arduino GIGA's expected contract (WRONG_TAP, EXPIRED, ALREADY_REDEEMED, TEMP_NOT_READY, INVENTORY_LOW)
- **FR-25:** The system must support a `pour-complete` callback endpoint for the local backend to report when a pour finishes, closing the order lifecycle

---

## Non-Goals (Out of Scope for V1.0)

- **Kiosk/Tap Station UI** -- The 10" touchscreen interface is a separate project phase
- **Admin/Staff Dashboard** -- Web dashboard for order management, inventory, reports ships separately
- **PLC/Arduino Direct Communication** -- Only a stub endpoint is provided; hardware integration is a separate phase
- **Sales Reporting & CSV Export** -- Dashboard feature, not mobile app
- **Multiple Pour Sizes for Customers** -- Only 12oz visible; admin override exists in backend but no UI in V1
- **AI Integration** -- Phase 2 feature per client specification
- **RFID Wallet / Offline Credits** -- The client plans RFID cards as a local "wallet" for offline/cash scenarios (balance stored locally, staff recharges via admin card or PIN). This is powerful for events but requires the local backend and is out of scope for V1 mobile app
- **Local Backend Server (Raspberry Pi)** -- The venue-local Node.js server that bridges cloud <-> GIGA ships with the kiosk phase. For MVP, tap data is synced to Supabase via operator input or lightweight script
- **Social Login** (Google, Apple Sign-In) -- Can be added post-launch; email/password is V1
- **Multi-language Support** -- English only for V1 (Spanish can follow)
- **Tipping** -- Not in current specification
- **Promotional Pricing / Discounts** -- Future feature
- **Push Notification Marketing** -- Only transactional notifications (order status) in V1

---

## Technical Considerations

### Security
- All QR tokens are signed JWTs with short expiration (server secret, not client-generated)
- Stripe handles all PCI compliance; no card data touches our servers
- Age verification images processed by third-party; BeerBot stores only status
- Row Level Security on all Supabase tables
- Service-to-service authentication for PLC/kiosk endpoints
- Rate limiting on auth endpoints, verification attempts, and order creation

### Performance
- Supabase edge functions run close to users (global CDN)
- Beer list uses realtime subscriptions (no polling)
- QR generation is client-side (instant, works offline)
- Image assets cached aggressively with expo-image
- Skeleton screens on all loading states

### Scalability
- Multi-venue architecture from day one (venue_id on all core tables)
- Database indexes on: `orders.user_id`, `orders.venue_id`, `orders.status`, `taps.venue_id`
- Supabase handles connection pooling and autoscaling
- Stateless backend (Edge Functions) scales horizontally

### Deployment
- Expo EAS Build for iOS and Android binaries
- Expo EAS Update for OTA JavaScript updates (bug fixes without app store review)
- Supabase manages database migrations, edge functions, and auth
- Environment-based config: development, staging, production

---

## Success Metrics

| Metric | Target |
|--------|--------|
| App crash rate | < 0.5% of sessions |
| Order completion rate (start -> paid) | > 80% |
| Average time: app open -> QR displayed | < 90 seconds (returning verified user) |
| Payment success rate | > 95% |
| Age verification pass rate (first attempt) | > 85% |
| QR redemption rate (paid orders actually redeemed) | > 90% |
| App Store rating | > 4.5 stars |
| Cold start time | < 2 seconds |
| API response time (p95) | < 300ms |

---

## Open Questions

1. **Age Verification Provider:** Veriff vs Jumio -- both have React Native SDKs. Recommend Veriff for better pricing at scale and smoother mobile UX. Final selection should be confirmed with client.
2. **Redemption Timeout Duration:** Spec says "configurable" -- recommend 15 minutes as default. Should be venue-configurable.
3. **Tax Handling:** Does the beer price include tax, or should tax be calculated and displayed separately? Puerto Rico has specific tax rules that may apply.
4. **Legal Compliance:** Puerto Rico alcohol delivery/self-service laws should be reviewed. The client (GTECS PR LLC) is based in PR.
5. **Push Notification Provider:** Expo Notifications is recommended for simplicity. If the client needs advanced notification features, consider migrating to Firebase Cloud Messaging later.
6. **Beer Images:** Will the client provide beer/brand images, or should we use a placeholder system initially?
7. **Venue Images:** Same question -- does the client have venue photography?
8. **Multiple Beers Per Order:** Current spec implies one beer type per order. Should users be able to order multiple different beers in a single transaction? (Recommend single-beer-per-order for V1 simplicity, aligned with the one-tap-per-QR redemption model.)
9. **Serving Temperature Threshold:** Client's ChatGPT conversation suggests 38F as the cutoff. Should this be configurable per venue/tap, or is 38F a universal default?
10. **Flow Meter Calibration Factor:** The Titan 300-010 delivers ~6,800-7,200 pulses/liter. The exact `pulsesPerOz` will be calibrated per tap. The backend `pour_size_oz` field must support decimal precision for accurate pours.
11. **Local Backend Sync Strategy for MVP:** Until the Raspberry Pi local backend is built, how will tap data (temperature, oz_remaining) get into Supabase? Options: (A) manual entry via Supabase dashboard, (B) a lightweight cron script on the GIGA/Pi that POSTs to Supabase, (C) seed with static data for launch demo. Recommend option B as a thin bridge.

---

## Appendix: Hardware Integration Contract (for Future Phases)

This section documents the interface contract between the cloud backend and the Arduino GIGA (via the local Raspberry Pi backend). It is included here so that all API endpoints and data structures built in V1 are **forward-compatible** with the hardware integration.

### GIGA State Tags (Read by Local Backend via WebSocket)
```json
{
  "tap[1].tempF": 36.2,
  "tap[1].tempOk": true,
  "tap[1].pouring": false,
  "tap[1].pouredOz": 0.0,
  "tap[1].ozRemaining": 450.0,
  "tap[1].errorCode": null,
  "system.mode": "idle"
}
```

### GIGA Commands (Sent by Local Backend via HTTP)
```json
// Start pour
POST /api/pour/start
{
  "tapId": 1,
  "targetOz": 12.0,
  "orderId": "uuid-here",
  "token": "signed-jwt-here"
}

// Stop pour (emergency)
POST /api/pour/stop
{ "tapId": 1 }

// Response
{ "success": true, "message": "Pouring 12.0 oz on tap 1" }
```

### Pour Flow Sequence
```
Mobile App                Cloud (Supabase)           Local Backend (Pi)        GIGA (PLC)
    │                          │                          │                      │
    ├─ Pay via Stripe ────────>│                          │                      │
    │                          ├─ Create order ──────────>│ (future sync)        │
    │                          ├─ Generate QR token       │                      │
    │<─ QR code ───────────────┤                          │                      │
    │                          │                          │                      │
    │ [User walks to tap, scans QR on kiosk]              │                      │
    │                          │                          │                      │
    │                          │<─ Validate QR ───────────┤                      │
    │                          ├─ OK, pour authorized ───>│                      │
    │                          │                          ├─ startPour() ───────>│
    │                          │                          │                      ├─ Open valve
    │                          │                          │<─ WebSocket: oz ─────┤  Count pulses
    │                          │                          │<─ pouredOz: 12.0 ───┤  Close valve
    │                          │<─ pour-complete ─────────┤                      │
    │<─ Realtime: "completed" ─┤                          │                      │
    │                          │                          │                      │
```

This contract ensures that every API endpoint, QR token structure, and order status transition we build in V1 will plug directly into the hardware layer without refactoring.

[/PRD]
