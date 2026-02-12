# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **Expo SDK 54** with New Architecture enabled, TypeScript strict mode
- **Entry point**: `expo-router/entry` (set in `package.json` `main` field) — no `App.tsx` or `index.ts`
- **File-based routing**: `app/` directory with Expo Router v6. Route groups: `(auth)` for unauthenticated screens, `(main)` for authenticated screens
- **NativeWind v4**: Configured via `babel.config.js` (preset), `metro.config.js` (withNativeWind wrapper), `tailwind.config.js`, and `global.css`. Import `../global.css` in root `_layout.tsx`
- **Design tokens**: BeerBot palette in `tailwind.config.js` — `brand` (amber/gold #f59e0b), `dark` (navy #1a1a2e)
- **State management**: Zustand stores in `lib/stores/`, TanStack Query client in `lib/query-client.ts`
- **Types**: Shared API types in `types/api.ts`
- **Database**: Supabase migrations in `supabase/migrations/`, seed data in `supabase/seed.sql`. Custom enums: `tap_status`, `order_status`. Auto-updated `updated_at` via trigger function.
- **Deep link scheme**: `beerbot://` (configured in `app.json`)
- **Path aliases**: `@/*` maps to project root via `tsconfig.json` `paths`

---

## 2026-02-11 - US-001
- What was implemented:
  - Scaffolded Expo project with SDK 54+ and TypeScript strict mode
  - Installed and configured NativeWind v4 with Tailwind CSS and BeerBot design tokens (amber/gold brand palette, dark navy theme)
  - Installed and configured Expo Router v6 with file-based navigation and auth layout groups `(auth)` and `(main)`
  - Installed Zustand for global state management (auth store created)
  - Installed TanStack Query for server state caching (query client configured)
  - Installed react-native-reanimated and lottie-react-native for animations
  - Installed expo-location, expo-secure-store, expo-notifications
  - Installed react-native-qrcode-svg and react-native-svg for QR generation
  - Configured app.json with BeerBot branding (name, slug, scheme `beerbot://`, dark theme, iOS/Android permissions)
  - Created folder structure: `app/(auth)/`, `app/(main)/`, `lib/`, `components/`, `hooks/`, `types/`
  - `npx tsc --noEmit` passes
  - `npx expo lint` passes
- Files changed:
  - `package.json` — main entry changed to `expo-router/entry`, all deps added
  - `app.json` — BeerBot branding, scheme, plugins, permissions
  - `tsconfig.json` — strict mode, path aliases, NativeWind types
  - `babel.config.js` — NativeWind preset
  - `metro.config.js` — NativeWind metro wrapper
  - `tailwind.config.js` — BeerBot design tokens
  - `global.css` — Tailwind directives
  - `nativewind-env.d.ts` — NativeWind type reference
  - `eslint.config.js` — Expo ESLint flat config
  - `app/_layout.tsx` — Root layout with QueryClientProvider
  - `app/index.tsx` — Entry redirect to auth/welcome
  - `app/(auth)/_layout.tsx` — Auth stack layout
  - `app/(auth)/welcome.tsx` — Placeholder welcome screen
  - `app/(main)/_layout.tsx` — Main stack layout
  - `app/(main)/venues/index.tsx` — Placeholder venues screen
  - `lib/stores/auth-store.ts` — Zustand auth store
  - `lib/query-client.ts` — TanStack Query client config
  - `components/ThemedText.tsx` — Base themed text component
  - `hooks/useAppState.ts` — App state change hook
  - `types/api.ts` — Full API types (Venue, Beer, Tap, TapWithBeer, Order, OrderStatus)
  - Removed: `App.tsx`, `index.ts` (replaced by Expo Router)
- **Learnings:**
  - NativeWind v4 requires three config files: babel preset, metro wrapper, and tailwind config with `nativewind/preset`
  - `expo lint` auto-installs eslint + eslint-config-expo if not present; it scans `app/`, `src/`, `components/` dirs — directories with only non-TS files (e.g., `.gitkeep`) cause a lint error
  - Expo Router typed routes via `experiments.typedRoutes: true` in `app.json`
  - Expo SDK 54 uses React 19.1, react-native 0.81
---

## 2026-02-11 - US-002
- What was implemented:
  - Created `supabase/migrations/` and `supabase/` directory structure
  - Single consolidated migration `20260211000000_initial_schema.sql` with all 8 tables:
    - `users` — uuid PK, unique email, age verification fields, stripe_customer_id, updated_at trigger
    - `venues` — uuid PK, name, address, lat/lng, is_active, mobile_ordering_enabled
    - `beers` — uuid PK, name, style, abv, description, image_url
    - `taps` — uuid PK, FK to venues/beers, tap_number, status enum, oz_remaining, temperature fields, updated_at trigger
    - `tap_pricing` — uuid PK, FK to taps, price_12oz, pour_size_oz, currency
    - `orders` — uuid PK, FKs to users/venues/taps/beers, quantity, pricing, status enum, QR fields, Stripe fields, timestamps, updated_at trigger
    - `order_events` — uuid PK, FK to orders, event_type, jsonb metadata
    - `admin_pour_logs` — uuid PK, FKs to taps/users, pour_size_oz, master_code_used, reason
  - Custom PostgreSQL enums: `tap_status` (active/inactive/maintenance), `order_status` (9 states)
  - Shared `update_updated_at()` trigger function for auto-updating timestamps
  - 5 indexes: orders.user_id, orders.venue_id, orders.status, orders.qr_code_token, taps.venue_id
  - Seed data in `supabase/seed.sql`: 1 venue (The Hoppy Spot), 3 beers (IPA, Stout, Wheat), 3 taps with pricing
  - `npx tsc --noEmit` passes (SQL files don't affect TypeScript)
- Files changed:
  - `supabase/migrations/20260211000000_initial_schema.sql` — full schema migration (new)
  - `supabase/seed.sql` — development seed data (new)
- **Learnings:**
  - SQL migrations are pure SQL files outside the TypeScript compilation scope, so they don't affect `tsc --noEmit`
  - Using deterministic UUIDs in seed data (e.g., `00000000-0000-0000-0000-000000000001`) makes cross-referencing FKs in seed files easy and reproducible
  - Supabase convention: migrations in `supabase/migrations/` with timestamp prefix, seed data in `supabase/seed.sql`
  - The `types/api.ts` TypeScript types already match the database schema 1:1 (established in US-001)
---

