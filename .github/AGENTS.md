# CI workflow invariants

- Same-repository pull requests authored by the repository owner run the exact candidate SHA through the full Global and CN live suites in parallel after static validation. Every other pull request receives no repository or environment secrets and uses build-only validation.
- Keep one stable aggregate verification job suitable for branch protection. It fails unless static validation and the correct internal-live or fork-build matrix pass.
- Serialize candidate runs with `cancel-in-progress: false` so a newer commit cannot interrupt cleanup in an already-started live suite. Regional jobs preserve their `always()` cleanup and residue steps.
- Do not duplicate deterministic static gates or placeholder builds when an exact-SHA live job already performs the equivalent real-provider build and isolation checks.
- Never print secrets, point live tests at production, weaken exact-SHA checks, or remove environment protection to reduce duration.
