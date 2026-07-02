# DECISIONS.md

Running log of assumptions and decisions made during the rebuild. Newest first.
Each entry: date, decision, reasoning, alternatives rejected.

## 2026-07-02: Phase 1 (Workstream B + G basics)

**D-013. IP rate limiting is per-instance best effort until a durable store exists.**
The middleware limiter keeps its window state in instance memory. On Vercel
each serverless instance counts independently, so the effective ceiling is
(instances x limit). That still stops naive scraping and cost amplification.
A durable limiter (Upstash Redis or similar) needs a new paid service, which
is an owner decision, deferred to Workstream E.

**D-012. Alchemy transfers are the independent second tx-history source.**
alchemy_getAssetTransfers reports value transfers, not strictly transactions,
so counts can differ slightly from an explorer txlist. Accepted because the
activity features tolerate small deltas, mismatches surface through the
reconciliation log rather than silently, and infrastructure independence from
the Etherscan family is the point.

**D-011. Notifications endpoints stay unauthenticated in Phase 1, documented.**
GET and mark-read PATCH on /api/notifications/[address] are open. Requiring a
wallet signature to read a notification bell is unacceptable UX; the correct
fix is a SIWE session, which is full Workstream G scope. Recorded as a known
gap; notification content should meanwhile avoid sensitive detail.

**D-010. Lender listing PATCH restricted to cancellation.**
The old endpoint accepted any status string, letting a lender set arbitrary
lifecycle states (including DEFAULTED). Now only EXPIRED (cancel) is allowed;
every other transition belongs to the accept/repay flows. This is a deliberate
behavior tightening, not an accidental regression.

**D-009. Write-route request contract changed for the replay fix.**
Write endpoints now require { nonceId, signature } referencing a
server-issued nonce instead of a client-invented { message, signature }. This
is a breaking change to those request bodies, accepted because the old shape
was the vulnerability itself and the only known clients (the app's own pages)
were updated in the same change. GET response contracts are untouched.

**D-008. AuthNonce table ships as schema plus code; the db push needs owner action.**
The permission layer (correctly) blocked `prisma db push` against the live
Supabase database. The schema change is additive (one new table). Until the
owner runs `npx prisma db push` (or approves it), the nonce endpoint returns
500 and marketplace writes fail closed, which is strictly safer than the
replayable flow they replace.

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
