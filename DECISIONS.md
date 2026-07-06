# DECISIONS.md

Running log of assumptions and decisions made during the rebuild. Newest first.
Each entry: date, decision, reasoning, alternatives rejected.

## 2026-07-06: Autopilot Phase 0 (Facts Registry)

**D-034. The facts validator matches numbers; humans pin wording. Claims
are stored as display value + machine magnitude.**
A regex cannot judge that "analyzed" overstates what happened to 254,729
ingested borrower records when only 40,000 were fully analyzed. So the
enforcement split is: the validator guarantees no NUMBER appears publicly
without a verified registry entry of matching magnitude (exact at displayed
precision; percent claims match ratio-unit facts; "N+" lower bounds must be
covered by a verified fact and not understate it by more than half), and
the human-owned `definition` field pins the wording each number may carry,
reconciled at Gate 0 via FACTS_TODO.md. Contested site claims (250K+
borrowers analyzed, 8 networks, 25K+ liquidation events) are seeded as
registry rows with verified=false, so the validator blocks them today
rather than not knowing about them. The seed never overwrites a human's
verified flag on re-run. Rejected: LLM-based claim checking as the primary
gate (non-deterministic, not a control); allowing unregistered numbers
below some "smallness" threshold (that is how inflation starts).

## 2026-07-05: Phase 6 (hardening)

**D-033. Shared score cache as an L2 under the in-memory L1; per-key
ceilings mirrored into Redis (resolves D-018 and D-019).**
The scoring path now reads memory first, then Upstash (same credentials
and fail-open posture as D-031), so an envelope computed by one serverless
instance serves from cache on all of them, and last-known-good survives
instance recycling (7-day Redis TTL; freshness judged from computedAtMs,
not Redis expiry). A stale L1 deliberately re-reads L2 in case another
instance computed fresher. For D-019, ApiKey.rateLimitPerMin is mirrored
to Redis on every successful route auth (1h TTL, fire-and-forget) keyed by
a SHA-256 prefix, and edge middleware reads the mirror in the same
pipeline round trip as the counter, so exact per-key ceilings cost zero
extra latency. Until a key's first authenticated request, the default
ceiling (120/min) applies; a corrupt mirror value is bounds-checked and
ignored. The middleware v1 bucket also switched from raw bearer prefixes
to hash prefixes, removing secret material from Redis key names.

**D-032. The EVM wallet stack loads on interaction or idle, not at
hydration; the hero entrance animates transform only.**
Mobile Lighthouse against production: performance 53, LCP 8.0s, TBT
1,000ms, driven by ~1MB of wallet-stack script (wagmi, viem, RainbowKit,
WalletConnect, Coinbase SDK) mounting globally at hydration on every
route, plus the hero h1 (the LCP element) hiding behind an opacity
entrance animation. EvmGate defers the subtree to first
pointerdown/keydown or a 3.5s idle fallback (kept so returning users'
wallet autoconnect still runs without interaction). Wallet pages
force-mount via useRequireEvm and hold a shell during the chunk load.
Accepted trade-offs: a static connect placeholder can require a second
press if the user beats the idle timer (first press arms the mount);
components that mount pre-gate remount once when the providers arrive.
Rejected: nonce-based CSP-grade script deferral via dynamic rendering
(performance regression elsewhere), and slimming inside wagmi (upstream
tree, not ours to prune). The hero switches to a transform-only entrance:
LCP counts the first visible paint, so opacity-gated entrances add their
full duration to LCP by construction.

**D-031. Durable rate limiting via Upstash Redis REST, fixed-window,
fail-open (resolves the store half of D-013; D-019 stays open).**
The middleware limiter becomes a shared quota across all serverless/edge
instances when Upstash REST credentials are present (KV_* names from the
Vercel Marketplace integration or UPSTASH_* from a hand-created database),
and falls back to the per-instance in-memory limiter when they are absent,
so nothing regresses in dev or CI. Fixed window (one pipelined INCR+PEXPIRE
round trip per request) was chosen over sliding window: worst case admits
2x the budget at a window boundary, which is fine for abuse damping and
half the Redis cost. Fail-open on any Redis error or a 1s timeout: the
limiter protects the app, it must never become the reason the app is down.
The raw REST API is used instead of @upstash/redis or @upstash/ratelimit
to keep the edge bundle dependency-free. D-019 (exact per-key ceilings
from ApiKey.rateLimitPerMin inside middleware) remains open: it needs the
per-key limits mirrored into Redis, not just a shared counter.

**D-030. CSP enforcement ships as a two-header ratchet, not a one-shot
strict policy (supersedes the sequencing half of D-027).**
D-027 wanted a live violation stream before enforcing anything; the owner
asked for enforcement the same day the site went live, before any organic
traffic existed. The compromise: enforce the broad policy that had been
report-only (blocks foreign scripts/styles/fonts, object embeds, form
hijack; keeps unsafe-eval and connect-src https:/wss: because wallet SDKs
need eval today and roam across RPC hosts), and simultaneously ship the
next ratchet step as the new report-only candidate (wasm-unsafe-eval
instead of unsafe-eval, connect-src enumerated to the hosts the client
stack is actually built against: default viem RPCs for the five configured
chains, WalletConnect, Coinbase Wallet). A /api/csp-report collector turns
the report stream into greppable [csp-report] log lines, so ratchet
decisions stop depending on someone watching a browser console. Also fixed
in the same change: /embed/:address was unframeable by third parties
(X-Frame-Options: SAMEORIGIN + frame-ancestors 'self' on the catch-all),
which defeated the point of an embeddable widget; that route now overrides
with frame-ancestors * and the ALLOWALL sentinel. Nonce-based script-src
was rejected for now: it requires switching every page to dynamic
rendering, which is a performance regression the current threat model does
not justify.

**D-029. The v1 partner API deliberately sends no CORS headers.**
/api/v1 is a server-to-server API authenticated with bearer keys. Without
Access-Control-Allow-Origin headers, browsers refuse cross-origin reads by
default, which is exactly the posture we want: a partner cannot casually embed
their secret API key in front-end JavaScript and have it appear to work. An
explicit OPTIONS/deny handler was rejected as ceremony (the browser outcome is
identical); an allowlist was rejected because no browser-based partner use
case exists, and adding one later is additive. Documented in docs/API.md.

**D-028. npm audit now gates CI on critical findings (supersedes the
report-only half of D-005 and the deferral in D-026).**
The precondition both earlier decisions named is now met: the
@solana/wallet-adapter-wallets meta-package (about 40 wallet SDKs, most of the
vulnerable surface) was replaced with the two standalone adapters the UI
actually renders (Phantom, Solflare), and non-breaking `npm audit fix` was
applied. Audit went from 138 findings (2 critical / 21 high) to 54
(0 critical / 5 high). The gate is critical-only because every remaining high
requires a breaking upgrade: next itself (fix is Next 16), glob via dev-only
eslint-config-next, and ws under @solana-mobile inside wallet-adapter-react.
The disk-space risk D-026 cited is also gone (37 GB free at execution time);
the swap was verified with tsc, lint, 218 unit tests, and a production build
plus client-bundle secret scan. osv-scanner stays report-only for now since it
has no severity threshold flag in the action.

**D-027. CSP ships report-only before enforced.**
A web3 frontend loads wallet SDKs using eval and wasm, RainbowKit inline
styles, and RPC/WebSocket connections to many hosts. A strict enforced CSP
cannot be written safely without observing real violations against live wallet
flows, which need the deployed app. Report-only establishes the policy and
surfaces violations in the console breaking nothing; enforcement (drop
unsafe-eval, add nonces, tighten connect-src) follows once the stream is clean.

**D-026. Dependency-audit gate stays report-only through this pass.**
The Solana wallet-adapter tree still carries the bulk of the audit findings.
The perf work isolated it to the marketplace route but did not slim it
(replacing @solana/wallet-adapter-wallets with specific adapters is a behavior
change, and the near-full local disk makes dependency surgery risky to verify
now). Flipping npm audit / osv to gating is deferred until the tree is slimmed;
CI keeps reporting them.

**D-025. Disk exhaustion on the dev machine, not a code problem.**
The C: drive sits near 100 percent, causing non-deterministic ENOSPC build
failures locally. tsc, lint, and the unit suite (disk-light) are the local
gates; the authoritative build and e2e/a11y verification run in CI on a clean
machine. The owner should free disk space.

## 2026-07-05: Phase 5 (Workstream A, first increment)

**D-024. Local Lighthouse lab numbers are not a credible before/after here.**
Three home-page mobile runs on this loaded dev machine ranged perf 0.47 to
0.52, LCP 6.9 to 9.6s, TBT 1040 to 1740ms. Too noisy to certify a CWV delta.
The perf claim rests on the deterministic build instead (home First Load JS
120 kB, Solana 123 kB chunk isolated to the marketplace route). Real CWV
certification waits for the Vercel preview deploy, which is blocked on the DB.

**D-023. Solana button loads on every page after hydration, not on interaction.**
LazySolanaButton is in the global Navbar, so its dynamic chunk still fetches
post-hydration on every page. This removes the adapter tree from First Load JS
(the LCP win) but not from total main-thread work. Loading it only on user
intent is a further optimization, deferred.

**D-022. Everything on the retrospective traces to reports/backtest/latest.json.**
The data story imports the reproducible backtest artifact; every number
(recall 88%, FPR 48%, ROC 0.849, weakest chain computed at runtime) comes from
it, honoring the no-fabricated-numbers rule. runBacktest writes latest.json as
the stable source.

## 2026-07-04: Phase 4 (Workstream E)

**D-021. Live integrity wiring covers 2 of 4 detectors; the other 2 need data the fan-out does not yet retain.**
scoreEvmWallet runs wash-trading and burst-timing on the tx records already
fetched (zero extra provider cost). Instant-repay needs lending events with
block numbers and Sybil needs entity data; the live fan-out does not retain
either, so those detectors receive no input and contribute zero. This is a
real partial integration, documented, not a stub. Richer lending-event
capture is a follow-on enrichment.

**D-020. v1 is EVM only; Solana returns 501.**
The envelope integrity path is EVM-only (the Solana scorer is a separate
heuristic). Rather than return a different shape under the same schema, v1
fails Solana explicitly with 501 until a Solana envelope is designed.

**D-019. Per-key rate limiting is coarse at the edge, exact ceiling deferred.**
Middleware keys the v1 bucket on the bearer token so a key cannot multiply
its budget across IPs, but it applies a fixed ceiling because Prisma is not
edge-compatible and the per-key ApiKey.rateLimitPerMin lives in the DB. Exact
per-key enforcement needs the shared store from D-013.

**D-018. Score cache is per-instance, like the rate limiter.**
Same tradeoff and same planned upgrade (shared Redis/Upstash). The cache
never invents a score: fresh served direct, stale served flagged with its
original as_of, last-known-good only under degradation. Latency measured on
the service-controlled path (compose + cache), excluding provider network.

## 2026-07-02: Phase 3 (Workstream D + F)

**D-017. Detector penalty is applied downstream, never inside the model.**
Manipulation signals fold into a 0..1 penalty that lowers a score toward the
floor (applyIntegrityPenalty), applied after the model prediction. The model
artifact and its calibration stay untouched, so the model remains reproducible
and the penalty is auditable and reversible. A penalty never zeroes a score.

**D-016. Merges require multiple corroborating signals; no single-signal merge.**
The merge threshold (0.85) is set above the strongest single pairwise signal
(bridge_hop 0.75), so at least two independent signals are needed to merge.
This is the structural defense against A6 forced-merge defamation. Medium
links (0.5 to 0.85) are surfaced to scoring as probabilities but never
hard-applied.

**D-015. Entity resolution runs on data ChainScore already fetches.**
The resolver consumes enriched TxRecords (funding, transfers, timing) and
cross-chain hints, not a new paid data source. Bridge tracing uses claimed
bridge destinations rather than deep bridge-contract decoding, which is a
Workstream E enrichment if precision proves insufficient.

**D-014. Detectors lean toward under-flagging.**
A false manipulation flag on an honest wallet defames it, so thresholds are
conservative and detectors express uncertainty through graded severity rather
than a hair-trigger boolean. The honest-wallet fixture must stay unflagged in
tests as a regression guard.

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
