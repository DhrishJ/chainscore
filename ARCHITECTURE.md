# ChainScore Architecture (Phase 0 audit)

Audited 2026-07-02 against commit `3e9840a` (master, deployed to chainscore.dev).
This document is blunt by instruction. Severity tags: CRITICAL, HIGH, MODERATE, LOW.

## 1. What this is

An off-chain DeFi credit-scoring layer. A wallet address goes in, a 300 to 850
score comes out, computed at request time from live provider data and a
calibrated XGBoost model evaluated inline in TypeScript. There is also a
peer-to-peer loan marketplace (listings, applications, loans, reviews) that is
partially wired and currently cannot work end to end (see 5.3).

## 2. Runtime topology

- Next.js 14 App Router on Vercel. No middleware.ts, no vercel.json.
- Postgres on Supabase, accessed only through Prisma over `DATABASE_URL`
  (direct connection string). No supabase-js client anywhere, no service-role
  key in the codebase.
- No queue, no cron, no background workers. Everything happens in request
  handlers.
- No structured logging, no request IDs, no error tracking. `console.*` only.

## 3. Scoring data flow

Two entry points compute scores with duplicated orchestration code:

1. `app/score/[address]/page.tsx` (server component, ~360 lines): resolves ENS,
   fans out to providers, calls `computeScore`, renders.
2. `app/api/score/[address]/route.ts` (API route): same fan-out, returns JSON.
   `revalidate = 3600`.

Per EVM score request, the fan-out is 6 to 7 upstream calls in parallel:

| Call | Provider | File |
|---|---|---|
| First transaction | Etherscan v2 (Blockscout/Snowtrace for Scroll/Avalanche in working tree) | `lib/data/etherscan.ts` |
| Tx history (last 10,000) | same | same |
| Token balances, portfolio flags | Alchemy SDK | `lib/data/alchemy.ts` |
| Aave borrows/repays/liquidations | The Graph gateway | `lib/data/thegraph.ts` |
| Compound activity | The Graph gateway | same |
| Uniswap LP | The Graph gateway | same |
| ENS forward/reverse | Alchemy RPC via viem | route/page |

Solana has a parallel path (`lib/data/helius.ts`, `lib/data/solanaScorer.ts`)
with a separate heuristic scorer, not the ML model.

Provider failures degrade to zero-filled inputs with an `errors` map that sets
`limitedData` flags on factors. A provider outage therefore silently deflates
scores rather than failing loudly (MODERATE: a risk consumer cannot distinguish
"bad wallet" from "Etherscan was down" except by the limitedData flag per factor;
there is no top-level data-completeness signal).

## 4. Model serving

- Artifacts: `ml/model.json` (XGBoost booster dump) + `ml/model_meta.json`
  (feature names, factor groups, Platt calibration lookup, score band, grade
  cutoffs, distribution deciles). Bundled into the serverless function via
  `outputFileTracingIncludes` in next.config.js.
- `lib/data/mlScorer.ts` loads the JSON once per lambda and walks the trees in
  TypeScript. One prediction pass produces the margin and per-feature
  contributions; contributions group into 4 factor families that render as the
  UI bars. Headline score and bars derive from the same pass, by construction.
- Attribution method is path-based credit (Saabas), not SHAP. Fine for UI,
  but do not label it SHAP in user-facing copy. Training-side SHAP values in
  `model/METRICS.md` are real SHAP.
- Calibration: raw sigmoid(margin) mapped through an exported Platt lookup to a
  PD, then PD to score via points-to-double-odds band, then meta-derived grade
  cutoffs and percentile deciles.
- Borrower-only gate: wallets with zero Aave/Compound borrows get
  `noBorrowHistory: true` and score 0 rather than a fabricated number. Honest,
  and consistent with the training population (borrowers only).
- Deployed model: `v4-xgb-cal`, 30 features, ROC-AUC 0.823, PR-AUC 0.517,
  Brier 0.0654 (from `model/FINAL_STATUS.md`, full 40K balanced set).
- Determinism: given identical inputs and artifacts the score is reproducible.
  But inputs are live provider responses with no as_of stamping, so scores are
  not reproducible in the audit sense. `model_version` is returned but
  `feature_set_version` and `as_of` are not (target of Workstream C/E).

### 4.1 Uncommitted working-tree state (decision needed, HIGH)

The working tree contains an internally consistent, newer retrain that was
never committed or deployed:

- `ml/model.json`, `ml/model_meta.json`: new booster and band
  (offset 196.6 / factor 104.2, matching the Phase 5/6 run in
  `model/METRICS.md`: ROC-AUC 0.849, PR-AUC 0.598 held out).
- `ml/feature_schema.json` and `lib/data/mlScorer.ts`: feature vector grows
  from 30 to 34 (adds borrow_velocity, liquidation_rate, net_unpaid_borrows,
  defi_tenure_ratio).
- `lib/data/etherscan.ts` + `lib/data/coverage.generated.json`: routes Scroll
  to Blockscout and Avalanche to Snowtrace instead of Etherscan v2 (which does
  not serve them on the free tier).

Problem: the working-tree model still calls itself `v4-xgb-cal` while being a
different model than the deployed `v4-xgb-cal`. Two models, one version string,
no way to tell them apart in logs. Whatever is decided at gate 0, the version
string must be bumped (for example `v5-xgb-cal-34f`) before this ever ships.

## 5. Data layer

### 5.1 Prisma models

`Wallet`, `ScoreSnapshot`, `LoanListing`, `LoanApplication`, `Loan`, `Review`,
`Notification`. No migrations directory exists; the schema has presumably been
pushed with `prisma db push` (no migration history, MODERATE: no reviewable
migration trail, and `migrate dev` will want to baseline).

### 5.2 Money as Float

Loan amounts, APR, collateral, and fees are `Float` columns. Floating-point
money in a lending marketplace is wrong (LOW today because the marketplace is
inert, HIGH if it ever activates). Should be `Decimal`.

### 5.3 Dead write path

`lib/scoreSync.ts` (`syncWalletScore`) is exported and never called. Nothing in
the codebase ever creates `Wallet` or `ScoreSnapshot` rows. Consequences:

- Score history is never recorded, so any "historical score timeline" feature
  has no data.
- `POST /api/listings` requires an existing `Wallet` row with score >= 500, so
  no one can ever create a listing through the current code. The marketplace
  is effectively decorative.
- `lib/recentScores.ts` is a module-level in-memory singleton: per-lambda,
  lost on every cold start, inconsistent across concurrent instances.

### 5.4 Old heuristic scorer still present

`lib/data/scorer.ts` is the pre-ML weighted-heuristic scorer. Nothing imports
it except (potentially) stale code. It should be deleted or clearly quarantined
to avoid someone wiring the wrong `computeScore` (both files export the same
symbol name).

## 6. Security findings

### 6.1 Signature replay on all marketplace writes (CRITICAL)

`POST /api/listings`, `POST /api/listings/[id]/apply`, `PATCH
/api/applications/[id]` (and related routes) verify a client-supplied
`(address, message, signature)` triple with `verifyMessage`, but never check
the message CONTENT. The server does not issue nonces, does not track used
nonces, does not check expiry, and does not bind the message to the action or
payload. Therefore:

- Any signature ever captured (from network logs, a malicious dapp, or a
  previous legitimate request) authorizes ANY marketplace action for that
  address, forever.
- `buildSignMessage` embeds only a date, and nothing verifies even that.
- Same weakness on the Solana path (`verifySolanaSignature`).

Fix direction (Workstream G): server-issued single-use nonce with expiry,
message template validated server-side, payload hash bound into the message.

### 6.2 Helius API key shipped to the client (HIGH)

`components/SolanaWalletProvider.tsx` uses `NEXT_PUBLIC_HELIUS_API_KEY`, which
is inlined into the public JS bundle. Anyone can extract it and burn the quota
or run up the bill. Needs rotation and a server-side proxy for whatever the
client needed it for. (`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is fine; that
one is public by design.)

### 6.3 No rate limiting anywhere (HIGH)

Every route is anonymous and unlimited. `GET /api/score/[address]` triggers 6+
paid upstream calls; a trivial loop over random addresses is a cost-amplification
and quota-exhaustion attack, and also lets anyone bulk-scrape scores to
reverse-engineer the model. Next's fetch cache (revalidate 3600) only dampens
repeat lookups of the same address.

### 6.4 Supabase surface unknown from the repo (POTENTIALLY HIGH, verify)

Prisma connects directly to Postgres, so RLS is irrelevant to the app's own
queries. But Supabase projects expose PostgREST and, if RLS is disabled on
Prisma-managed tables (the default for tables created outside Supabase's
dashboard), the anon key grants direct read/write to every table. This cannot
be verified from the repo. Action: check the dashboard, enable RLS default-deny
on all tables (the app is unaffected since it connects as the postgres role),
or disable the Data API entirely.

### 6.5 No security headers, no CORS policy (MODERATE)

next.config.js sets no headers. No CSP, HSTS, X-Content-Type-Options,
Referrer-Policy, or Permissions-Policy. No explicit CORS (Next defaults are
same-origin for API routes, which is acceptable, but partner API plans in
Workstream E need an explicit allowlist).

### 6.6 Weak input validation on write routes (MODERATE)

`POST /api/listings` checks field presence with falsiness, then
`parseFloat`/`parseInt` without bounds: negative amounts, NaN from
non-numeric strings (passes the truthiness check, then stores NaN or throws a
raw Prisma 500), absurd APRs, and past `expiresAt` all pass. Pagination params
are unbounded. zod at every boundary is the fix (Workstream G).

### 6.7 Dependency vulnerabilities (MODERATE, baseline captured)

`npm audit`: 138 total (2 critical, 21 high, 92 moderate, 23 low) across 1,924
resolved packages. The critical/high items (protobufjs, shell-quote, axios, ws,
lodash) are almost entirely inside the `@solana/wallet-adapter-*` dependency
tree, which is enormous and drags in wallet SDKs for dozens of wallets. Next.js
14.2.35 itself has open advisories whose fixes land in later majors; upgrading
Next is a Phase 6 decision, not a Phase 0 one.

Crypto/signing-adjacent dependencies: viem (EVM signature verification,
maintained), wagmi/RainbowKit (client wallet UX, maintained),
tweetnacl 1.0.3 (ed25519 verify; unmaintained since 2020 but stable and widely
audited; consider @noble/ed25519 which is maintained and already in the viem
dependency tree), bs58, @solana/web3.js, alchemy-sdk. None handle private keys
server-side. No custody anywhere. Correct.

Biggest supply-chain lever: the Solana wallet-adapter tree. If Solana wallet
connect UX is not core, replacing `@solana/wallet-adapter-wallets` (the
kitchen-sink package) with the one or two adapters actually used would remove
hundreds of packages and most of the audit findings.

### 6.8 Env hygiene (MODERATE)

`process.env` is read ad hoc in 10+ files, always with `|| ''` fallbacks, so a
missing key degrades silently into invalid request URLs instead of failing at
boot. `.env` files are correctly gitignored and no secrets are committed (spot
check of git history for key patterns came back clean; full gitleaks history
scan runs in CI from Phase 0 onward).

## 7. Bottlenecks and structural gaps

1. Request-time fan-out scoring: cold score latency is the sum of the slowest
   provider (seconds). No feature persistence, no incremental updates. This is
   what Workstreams C and E replace.
2. Tx history capped at the last 10,000 transactions in one page; very active
   wallets get truncated features (unmeasured bias).
3. Single tx-history provider per chain (Etherscan v2 committed; working tree
   adds Blockscout/Snowtrace for 2 chains but still exactly one source per
   chain, no fallback). Workstream B.
4. No tests, no CI, no lint gate beyond `next lint` run manually. `strict` is
   on and the build passes clean, which is the one bright spot.
5. Duplicated scoring orchestration between page and API route (~200 lines
   copy-pasted): they can and will drift.
6. `getChain()` silently falls back to Ethereum for unknown slugs: a typo'd
   chain param scores the wrong chain instead of erroring (LOW but insidious).
7. In-memory recent-scores ticker is cosmetic-only reliability.
8. No API versioning; `/api/score` is the de facto public contract.

## 8. Target architecture (where the workstreams take this)

- B: `DataSource` interface with per-chain prioritized adapters, fallback,
  reconciliation, completeness scoring, central rate limiting and caching.
- C: point-in-time feature store keyed by (wallet, chain, as_of_block),
  backtest engine, leakage tests. Retrospective reads backtest output only.
- D: entity graph (Entity, EntityMembership, MergeAudit) with confidence
  scores, reversible merges.
- E: versioned `/api/v1/score` with auth, rate limits, OpenAPI, webhooks,
  cache with stale flags; `/api/score` kept alive with a deprecation header.
- F: THREAT_MODEL.md, cost-to-game weighting, manipulation detectors feeding
  a risk penalty.
- G: nonce-based SIWE-style auth for writes, zod everywhere, headers, RLS
  default-deny, secret scanning, key rotation.

---

# Post-rebuild architecture (updated 2026-07-05)

Everything above is the original Phase 0 audit, kept for the record. This
section describes the system after the phased rebuild (branch
`rebuild/phase-0-1`, PR #1). It supersedes the audit where they disagree.

## Delivered subsystems

- **Ingestion (`lib/ingest/`)**: a `TxHistorySource` abstraction with
  prioritized per-chain adapters (Etherscan v2, Snowtrace, Alchemy transfers),
  automatic failover with exponential backoff and jitter, an outbound
  per-provider rate limiter, opt-in cross-source reconciliation logging, and a
  `data_completeness` score attached to every result. Kills the single-provider
  dependency; Avalanche now has a working non-Etherscan primary.
- **Model serving (`lib/data/mlScorer.ts`)**: unchanged in shape but upgraded to
  `v5-xgb-cal` (34 features, ROC 0.849 / PR 0.599 on the fixed holdout). One
  prediction pass yields the headline score, the factor bars, and the top signed
  feature contributions.
- **Point-in-time feature store + backtest (`lib/featureStore.ts`,
  `lib/backtest/`)**: reconstructable-as-of feature snapshots, a backtest engine
  that scores through the exact serving path with a zero-lookahead guarantee
  (`LookaheadError`, proven by tests), weighted ROC/PR/Brier/ECE/reliability and
  chain/cohort slices, reproducible via `npm run backtest`.
- **Entity resolution (`lib/entity/`)**: multi-signal pairwise scoring,
  high-confidence-only clustering, medium links surfaced as probabilities,
  reversible audited merges, dust-defamation guardrails.
- **Adversarial integrity (`lib/integrity/`, `lib/monitoring/`)**: wash-trade,
  Sybil-funding, burst-timing, and instant-repay detectors folding into a graded
  penalty applied downstream of the model; score-distribution drift and farming
  monitors. Documented in THREAT_MODEL.md and COST_TO_GAME.md.
- **Real-time API (`lib/scoring/`, `app/api/v1/`)**: a versioned, cached,
  authenticated `/api/v1/score` returning a full envelope (model score,
  integrity penalty, provenance, freshness), signed score-change webhooks, an
  OpenAPI 3.1 spec, and graceful degradation to last-known-good. The legacy
  `/api/score` stays alive with a Deprecation header.
- **Security (`lib/env.*`, `lib/authNonce.ts`, `lib/apiKey.ts`,
  `lib/validation.ts`, `lib/rateLimit.ts`, `middleware.ts`, `next.config.js`)**:
  zod-validated env, replay-safe nonce auth for writes, hashed API keys, zod at
  every boundary, IP and per-key rate limiting, security headers plus a
  report-only CSP, a build-time client-bundle secret scan, and gitleaks in CI.
- **Frontend (`app/`, `components/`)**: the Solana wallet tree lazy-loaded off
  the critical path, the interactive liquidation retrospective reading real
  backtest output, score explainability (radar + contribution waterfall), score
  provenance, shareable card (copy link, download PNG, embed, Farcaster frame),
  a command palette, reduced-motion support, and an axe a11y gate in CI.

## Phase 0 findings, resolution status

| Finding | Status |
|---|---|
| 6.1 Signature replay on all writes (CRITICAL) | Fixed: server-issued single-use expiring nonces (`lib/authNonce.ts`) |
| 6.2 Helius key in client bundle (HIGH) | Fixed in code: server-side `/api/solana-rpc` proxy; key still needs rotation (owner) |
| 6.3 No rate limiting (HIGH) | Fixed: IP + per-key limits in `middleware.ts` (per-instance; durable store pending, D-013) |
| 6.4 Supabase RLS unknown (HIGH) | Open: the project no longer resolves; re-assess on the new database |
| 6.5 No security headers / CORS (MODERATE) | Fixed: headers set; CSP enforced (broad tier) with stricter candidate report-only + /api/csp-report collector (D-030); v1 API sends no CORS headers by design (D-029) |
| 6.6 Weak input validation (MODERATE) | Fixed: zod at every route boundary (`lib/validation.ts`) |
| 6.7 Dependency vulnerabilities (MODERATE) | Fixed: Solana tree slimmed to Phantom+Solflare, 0 critical findings, npm audit gates CI on critical (D-028); remaining highs need breaking upgrades |
| 6.8 Env hygiene (MODERATE) | Fixed: single zod-validated read point |
| 5.2 Money as Float | Open: marketplace is inert; convert to Decimal if it activates |
| 5.3 Dead write path (scoreSync unused) | Open: needs the database to populate Wallet/ScoreSnapshot |
| 5.4 Old heuristic scorer present | Fixed: `lib/data/scorer.ts` and `etherscan.ts` removed |
| 7.1 Request-time fan-out latency | Addressed: cache + envelope; cold path still provider-bound |
| 7.5 Duplicated scoring orchestration | Addressed: shared `lib/scoring/live.ts` for the v1 path |
| 7.8 No API versioning | Fixed: `/api/v1` with the legacy route deprecated |

## Still open (tracked in DECISIONS.md and DEPLOYMENT.md)

Durable shared store for cache and rate limits (D-013/D-018), exact per-key
limits (D-019), and the next CSP ratchet step: promoting the report-only
candidate (wasm-unsafe-eval, enumerated connect-src) into the enforced header
once the [csp-report] log stream from real wallet flows is quiet (D-030).
