# Trip Planner

Trip Planner is a modern travel-planning workspace intended to replace the spreadsheet workflow for complex trips. The product will bring daily itineraries, places, alternative routes, maps, and read-only sharing into one focused application.

## Current status

Phase 0 — Project Foundation — is complete. The repository currently provides the application shell and architecture boundaries only. Authentication, persistence, itinerary editing, Google Maps, route variants, sharing, and travel research are intentionally deferred to their requested phases.

## Foundation stack

- Next.js 16 with the App Router and React 19
- Strict TypeScript
- Tailwind CSS 4
- shadcn/ui configuration with Lucide icons
- ESLint with the Next.js Core Web Vitals and TypeScript presets
- npm for dependency and lockfile management

The dependencies required by later planned phases are installed now so the project has a reproducible technical baseline: Supabase, TanStack Query, React Hook Form, Zod, dnd-kit, date-fns, and Google Maps for React. They are not wired into the application during Phase 0.

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
  migrations/           Versioned database migrations (from Phase 1)
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

Copy `.env.example` to `.env.local`. No environment variables are required for the Phase 0 landing page.

| Variable | Scope | Used from |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server | Phase 1 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server | Phase 1 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser | Phase 3 |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Browser | Phase 3 |
| `GOOGLE_ROUTES_API_KEY` | Server only | Phase 5 |

Never expose the server-only Routes API key through a `NEXT_PUBLIC_` variable.

## Quality checks

```bash
npm run lint
npm run build
```

## Planned phases

1. Supabase, authentication, database schema, RLS, and trip CRUD
2. Itinerary workspace and item reordering
3. Google Maps and Places API (New)
4. Alternative route variants
5. Google Routes API
6. Public read-only sharing
7. External travel research links
8. Responsive, accessibility, state, and deployment polish

Each phase is implemented and verified independently before work begins on the next.
