# Trip Planner

Trip Planner is a modern travel-planning workspace intended to replace the spreadsheet workflow for complex trips. The product will bring daily itineraries, places, alternative routes, maps, and read-only sharing into one focused application.

## Current status

Phase 2 — the core trip planner — is complete. The authenticated `/trips/[tripId]` route is one responsive editing workspace for desktop, tablet, and mobile browsers. It supports grouped-day itinerary editing, optional times, typed car-rental details, ordering, keyboard navigation, selection, replace-style copy/paste, fill, and copy-to-day operations. A provider-ready map region remains visible without loading Google APIs.

Live Maps and Places, route alternatives, directions, sharing, export, and travel research remain intentionally deferred to later phases.

## Foundation stack

- Next.js 16 with the App Router and React 19
- Strict TypeScript
- Tailwind CSS 4
- shadcn/ui configuration with Lucide icons
- ESLint with the Next.js Core Web Vitals and TypeScript presets
- npm for dependency and lockfile management

Phase 2 uses Supabase, TanStack Query, React Hook Form, Zod, and date-fns. Provider packages may be installed, but the Phase 2 planner does not initialize Google Maps or make Maps/Places requests.

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

### Planner structure

```text
src/features/itinerary/
  actions.ts                     Validated server mutations
  data.ts                        Route A, ordered days, and ordered item loading
  schema.ts                      Item and type-specific validation
  queries.ts                     TanStack Query cache and optimistic rollback
  grid-interactions.ts           Navigation, selection, fill, and clipboard format
  mutation-helpers.ts            Time normalization and independent-copy rows
  components/
    planner-workspace.tsx        Shared responsive ARIA grid and map shell
    planner-item-form.tsx        Add/edit/delete Sheet form
    item-details-editor.tsx      Typed detail editing
```

The server actions use the signed-in Supabase client. Database RLS remains the authority for writes; client-side controls are not an authorization boundary.

### Matrix projection

The spreadsheet is a projection of normalized records, not a database table shape:

| Matrix column | Persisted source                  |
| ------------- | --------------------------------- |
| Date, Day     | `trip_days`                       |
| City          | `itinerary_items.type = location` |
| Activities    | `activity`                        |
| Transport     | `transport`, `flight`, `train`    |
| Hotel         | `hotel`                           |
| Car rental    | `car_rental`                      |
| Meals         | `meal`                            |
| Notes         | `note`                            |

A day may contain multiple items in every category. `start_time` and `end_time` are nullable and appear inline only when present. Copies insert independent rows with new IDs and destination `sort_order` values.

### Planner controls

- Arrow keys move between cells.
- `Tab` and `Shift+Tab` move forward and backward through the grid.
- `Enter` opens the first item in a populated cell or adds to an empty cell.
- `Escape` cancels an open item editor.
- Double-click opens a desktop cell/item editor; touch layouts use the selected cell's Add row and each item's actions menu.
- `Ctrl/Cmd+C` and `Ctrl/Cmd+V` copy and replace destination category contents. Paste never appends to existing destination items.
- Desktop pointer selection supports ranges and a distinct fill handle. Tablet/mobile avoid ambiguous drag gestures and expose copy commands in More.
- Item menus and `Alt+ArrowUp/ArrowDown` provide deterministic ordering without drag latency.

The item editor focuses the title, supports normal Tab order, submits with Enter, and allows either time to be cleared.

### Responsive behavior

- Desktop uses an approximately 58/42 resizable matrix/map split with frozen Date and Day columns.
- Tablet landscape uses a compact 56/44 split with a 380px minimum map width and in-pane matrix scrolling.
- Tablet portrait and mobile use a full-width matrix plus a persistent 100px map peek. The map expands in an overlay Sheet without changing routes or losing grid selection.
- Mobile controls are touch-safe, forms use at least 16px input text, and safe-area insets are respected.
- The map is an intentional Phase 3 empty state and has no provider scripts or requests.

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

| Variable                               | Scope          | Used from |
| -------------------------------------- | -------------- | --------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser/server | Phase 1   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server | Phase 1   |
| `NEXT_PUBLIC_SITE_URL`                 | Auth redirects | Phase 1   |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`      | Browser        | Phase 3   |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`       | Browser        | Phase 3   |
| `GOOGLE_ROUTES_API_KEY`                | Server only    | Phase 5   |

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
npm test
npx tsc --noEmit
npm run lint
npm run build
```

The itinerary tests cover optional and cleared times, typed car-rental validation, copy independence, ordering, RLS usage, keyboard movement, range/fill calculations, clipboard validation, optimistic rollback hooks, and responsive/state contracts.

## Phase 2 manual verification

1. Set the three Phase 1 variables in `.env.local` and allow `http://localhost:3000/**` in Supabase Auth redirect URLs.
2. Run `npm install` and `npm run dev`, then open `http://localhost:3000`.
3. Create an account at `/signup`. If email confirmation is enabled, follow the email link; for a fully local Supabase stack, use Mailpit at `http://localhost:54324`.
4. Log in and create a trip with multiple dates.
5. Open `/trips/[tripId]`, add two items to one category/day cell, leave both times empty on one item, and refresh.
6. Edit and clear start/end times, add valid pickup/return car-rental details, and confirm all changes persist.
7. Copy a populated category cell to another day. Confirm existing destination-category items are replaced, IDs differ, and editing the copy does not change the source.
8. Reorder items with the item menu or `Alt+ArrowUp/ArrowDown`, refresh, and confirm the order persists.
9. Check arrow, Tab, Shift+Tab, Enter, Escape, copy/paste, Copy to days, Copy previous day, and unsupported clipboard feedback.
10. At 1280, 1440, and 1920px, confirm the map remains visible, the divider resizes, frozen columns work, and the page has no global horizontal overflow.
11. At 1024×768, 834×1194, and 768×1024, confirm compact split/portrait peek behavior, touch-sized controls, contained matrix scrolling, and overlay Sheets.
12. At 390×844, 393×852, and 430×932, confirm sticky columns, horizontal matrix scrolling, 16px editor inputs, safe-area spacing, map expansion, and preserved selection.
13. In browser network/devtools, confirm the planner loads no Google scripts and makes no Maps or Places API requests.
14. Log out and confirm `/trips` redirects to `/login`. With a second account, confirm the first account's trip cannot be read or mutated through direct URLs/actions.
15. Confirm trip create/update/delete and Route A/day generation still work.

For every completed phase, the handoff should include required configuration, migration/deployment actions, automated checks, and a phase-specific local manual test checklist.

## Planned phases

1. ✅ Supabase, authentication, database schema, RLS, and trip CRUD
2. ✅ Core itinerary workspace, editing interactions, and responsive layouts
3. Google Maps and Places API (New)
4. Alternative route variants
5. Google Routes API
6. Public read-only sharing
7. External travel research links
8. Offline, conflict, and deployment polish

Each phase is implemented and verified independently before work begins on the next.

### Explicitly deferred from Phase 2

- Live Google Maps and Places API integration
- Place search, provider pins, and selected-place details
- Alternative route variants and route comparison
- Google Routes API directions
- Public sharing and itinerary export
- Travel research integrations
- Offline-first synchronization and multi-user conflict resolution
