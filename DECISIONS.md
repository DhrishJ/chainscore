# DECISIONS.md

Running log of assumptions and decisions made during the rebuild. Newest first.
Each entry: date, decision, reasoning, alternatives rejected.

## 2026-07-02: Phase 0

**D-007. Lighthouse baseline measured against local production build.**
Production real-user CWV data is not accessible from this environment, so the
baseline is `next build && next start` measured locally with Lighthouse. Before
and after comparisons will use the same method so the delta is meaningful even
if absolute numbers differ from production.

**D-006. Uncommitted working-tree model retrain left untouched.**
The working tree contains an undeployed 34-feature retrain (ROC 0.849 /
PR 0.598) still labeled `v4-xgb-cal`, plus Scroll/Avalanche explorer routing.
Per operating rule 2 (never regress or change the model without explicit
instruction), these six files are left exactly as found and excluded from all
Phase 0 commits. Decision on commit/version-bump/deploy belongs to the owner
at gate 0. See ARCHITECTURE.md section 4.1.

**D-005. No dependency upgrades in Phase 0 beyond additive dev tooling.**
npm audit shows 138 findings, mostly in the Solana wallet-adapter tree. Fixing
them requires either `audit fix --force` (breaking) or replacing the
wallet-adapter kitchen-sink package (a behavior change). Both are scheduled
for the hardening pass, not the foundation phase. Phase 0 only ADDS dev
dependencies (zod, vitest, playwright) and captures the baseline.

**D-004. Existing `/api/score` response shape frozen as the v1 contract.**
Backwards compatibility rule: the current JSON shape returned by
`GET /api/score/[address]` is treated as the public v1 contract from now on.
New fields may be added; nothing existing is renamed or removed.

**D-003. Test harness is Vitest + Playwright, per the brief.**
First tests target the pure logic that guards the money path: mlScorer
(borrower gate, new-wallet gate, determinism, score bounds), address
validation, and env parsing. Provider-dependent code gets integration tests in
Workstream B when the DataSource abstraction exists to mock against.

**D-002. Env module lives at `lib/env.ts`, not `src/env.ts`.**
The repo has no `src/` directory; everything imports from `@/lib/...`.
Creating `src/` for one file would break the layout convention. Same contract
as specified: zod-parsed once at module load, throws loudly on missing vars,
nothing else reads `process.env` directly.

**D-001. Supabase RLS verification deferred to owner-assisted step.**
The repo contains no Supabase project ref or dashboard credentials, only a
Postgres `DATABASE_URL`. Whether PostgREST is exposed with RLS off cannot be
determined from code. Flagged as a verify-with-dashboard item in
ARCHITECTURE.md 6.4; enforcement (RLS default-deny migration plus an
anon-client test) lands in Phase 1 Workstream G once project access is
confirmed.
