# App route and workspace invariants

## Public auth routes and dev-server route state

- `/login` and `/signup` are permanent public App Router routes. After changing, adding, removing, or renaming anything under `src/app`, verify both with `npm run check:auth-routes`; a valid check returns `200` and the expected form heading for each route.
- Do not add temporary browser-verification pages under `src/app`. Use existing routes, component fixtures outside the route tree, or a disposable copy/worktree so a long-lived Next.js dev server cannot retain a stale route tree.
- This repository uses webpack for `npm run dev` because stale Turbopack route state has repeatedly made every nested route return `404` while `/` still returned `200`. Do not remove `--webpack` without proving repeated route add/remove/rename cycles keep `/login` and `/signup` healthy.
- If `/` works but `/login`, `/signup`, `/trips`, and other nested routes all return `404`, treat the running dev server as stale: stop it, restart `npm run dev`, and rerun `npm run check:auth-routes`. Do not rewrite or duplicate valid route files to work around that process state.

## Workspace CSS

- `html`, `body`, the trips shell, and planner page must enforce the one-visual-viewport contract. The global header, app bar, context bar, and bottom navigation are non-scrolling flex siblings; only the intended Matrix, panel, or overlay scrolls.
- Every flex/grid child that owns Matrix or map height uses `min-height: 0`; map panes clip their contents. Do not compensate for bottom gaps with margins, padding, spacer rows, or viewport-height arithmetic.
- Preserve Safari Matrix compositing and top-boundary handoff behavior. Horizontal overscroll stays contained, but the shell must recover from a keyboard-panned viewport and settle with `window.scrollY` at 0 and no persistent bottom strip.
- Verify 768px, 820px, and 1024px widths in both relevant orientations. Assert that the document does not exceed `innerHeight`, a forced `window.scrollTo` leaves `scrollY` at 0, and the workspace reaches the viewport bottom or mobile tab bar top.
