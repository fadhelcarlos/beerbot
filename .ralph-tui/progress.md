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

