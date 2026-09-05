# Validation and E2E invariants

- Use `scripts/e2e-regression.mjs` for regional release evidence. Run preflight before live work, keep Global and CN credential environments isolated, and never point live tests at production.
- During implementation, run the smallest relevant unit, contract, or browser stage. Full Global/CN E2E is a once-per-final-SHA gate, not an inner development loop.
- Compact output must preserve complete failure diagnostics without accumulating successful runs: delete success logs immediately, retain at most three full failure logs for 24 hours, and print only a bounded tail plus their path. `npm run test:e2e:clean` safely removes retained logs and stale cache temp files without invalidating a successful static fingerprint. Never emit secret values.
- Reuse only deterministic static validation with an exact worktree, Node, dependency-install, and provider-selector fingerprint. CI and live external-state tests always run fresh.
- Preserve the first functional failure and every cleanup failure. After a fix, rerun the smallest failing stage and then its affected regional suite once.
- Cleanup and independent residue audits remain mandatory even after an earlier failure. Never weaken assertions, real-provider flags, credential isolation, or exact-target checks to make a suite pass.
- CI candidates must be immutable SHA values. A required exact-SHA CI run may replace the same duplicate local full run, but no PR merges until its regional live jobs, cleanup, and residue checks pass.
