# Trip Planner

Trip Planner is a modern travel-planning workspace intended to replace the spreadsheet workflow for complex trips. The product will bring daily itineraries, places, alternative routes, maps, and read-only sharing into one focused application.

## Current status

Phase 1 — Supabase, authentication, database, and trip CRUD — is complete. Users can sign up, log in, log out, create trips, view their own trips, update trip settings, and delete trips. Each trip atomically receives its owner membership, primary Route A variant, and one day record per travel date.

Itinerary-item editing, maps, route comparison, sharing, and travel research remain intentionally deferred to their requested phases.

## Foundation stack

- Next.js 16 with the App Router and React 19
- Strict TypeScript
- Tailwind CSS 4
- shadcn/ui configuration with Lucide icons
- ESLint with the Next.js Core Web Vitals and TypeScript presets
- npm for dependency and lockfile management

The dependencies required by later planned phases are installed now so the project has a reproducible technical baseline: Supabase, TanStack Query, React Hook Form, Zod, dnd-kit, date-fns, and Google Maps for React.

## Architecture

The application is structured as a modular monolith:

```text
src/
  app/                 Next.js routes, layouts, and global styles
  components/ui/       Shared shadcn/ui primitives
  features/            Domain-oriented product modules
  lib/                  Shared infrastructure and utilities
    providers/          External service abstraction boundaries
      maps/
      places/
      routes/
      travel/
  types/                Cross-domain TypeScript types
  config/               Application configuration
supabase/
  migrations/           Versioned schema, functions, triggers, and RLS
```

`MapProvider`, `PlaceProvider`, `RouteProvider`, and `TravelProvider` contracts keep external vendor representations outside the core domain. Google-specific implementations will be added only in their corresponding phases.

## Local development

Requirements:

- Node.js 22 or newer
- npm 10 or newer

Install and start the development server:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.example` to `.env.local` and provide the Supabase values before using authentication or trip routes.

| Variable | Scope | Used from |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server | Phase 1 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server | Phase 1 |
| `NEXT_PUBLIC_SITE_URL` | Auth redirects | Phase 1 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser | Phase 3 |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Browser | Phase 3 |
| `GOOGLE_ROUTES_API_KEY` | Server only | Phase 5 |

Never expose the server-only Routes API key through a `NEXT_PUBLIC_` variable.

## Supabase setup

Create or link a Supabase project, configure the Phase 1 environment variables, and deploy migrations:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Generate types after every schema change:

```bash
supabase gen types typescript --linked > src/types/database.ts
```

In Supabase Authentication settings:

- Add the local URL (`http://localhost:3000`) and production URL to allowed redirect URLs.
- Keep email confirmation enabled for production. The `/auth/callback` route exchanges confirmation codes for cookie-backed sessions.

## Database and security model

- PostgreSQL UUIDs identify every entity.
- RLS is enabled on every public table.
- Trip reads require a matching `trip_members` row.
- MVP writes require an `owner` membership; frontend checks are not treated as authorization.
- Membership helper functions are `SECURITY DEFINER`, use an empty `search_path`, and expose only narrow boolean/ID results. This prevents recursive membership policies without granting table access.
- `create_trip` is the only client-accessible creation path. It validates input and creates the trip, membership, Route A, and trip days in one transaction.
- `updated_at` triggers cover trips and itinerary items.
- The auth-user trigger creates a profile for every new account.

The migration has indexes for ownership, membership lookup, variants, days, places, and ordered itinerary access.

## Quality checks

```bash
npm run lint
npm run build
```

## Phase 1 manual test

1. Set the three Phase 1 variables in `.env.local` and allow `http://localhost:3000/**` in Supabase Auth redirect URLs.
2. Run `npm install` and `npm run dev`, then open `http://localhost:3000`.
3. Create an account at `/signup`. If email confirmation is enabled, follow the email link; for a fully local Supabase stack, use Mailpit at `http://localhost:54324`.
4. Log in and create a trip with multiple dates.
5. Confirm the trip detail shows Route A and one numbered section for every date.
6. Refresh the page, update the title/timezone/currency, and confirm the data persists.
7. Log out and confirm `/trips` redirects to `/login`.
8. Create a second account in another browser profile. Paste the first account's trip URL and confirm it returns the not-found page. This verifies the RLS isolation path, not just frontend navigation.
9. Log back in as the owner, delete the test trip, and confirm it disappears from `/trips`.

For every completed phase, the handoff should include required configuration, migration/deployment actions, automated checks, and a phase-specific local manual test checklist.

## Planned phases

1. ✅ Supabase, authentication, database schema, RLS, and trip CRUD
2. Itinerary workspace and item reordering
3. Google Maps and Places API (New)
4. Alternative route variants
5. Google Routes API
6. Public read-only sharing
7. External travel research links
8. Responsive, accessibility, state, and deployment polish

Each phase is implemented and verified independently before work begins on the next.
