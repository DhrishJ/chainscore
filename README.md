# ChainScore

An off-chain DeFi credit-scoring layer. A wallet address goes in, a 300 to 850
score comes out, computed at request time from live provider data and a
calibrated XGBoost model evaluated inline in TypeScript. It is not a lending
protocol: there is a peer-to-peer loan marketplace UI in the codebase, but per
`ARCHITECTURE.md` section 5.3 the write path that would let it operate end to
end is not wired up yet. The product is the score and the partner API that
serves it.

## Tech stack

- Next.js 14 (App Router) on Vercel, TypeScript, Tailwind CSS
- shadcn/ui components (`components/ui/`)
- Prisma over Postgres (Supabase-hosted)
- viem / wagmi / RainbowKit for EVM wallet connect, `@solana/wallet-adapter-*`
  for Solana
- Vitest (unit) and Playwright (e2e) for tests
- A calibrated XGBoost model, trained separately in Python, served inline in
  TypeScript (no Python runtime in production)

## Prerequisites

- Node.js 20 or newer, npm
- A Postgres connection string (Supabase project recommended; see
  `RUNBOOK.md` for provisioning). Until `DATABASE_URL` points at a live
  database, DB-backed features (score history, marketplace writes, API key
  auth, webhooks) fail closed.
- Provider API keys: Etherscan, Alchemy, The Graph, Helius (see the table
  below)

## Local setup

```bash
npm install
cp .env.local.example .env.local   # then fill in real values
npx prisma generate
npx prisma db push
npm run dev
```

`npx prisma db push` applies every model in `prisma/schema.prisma` (it is all
additive, no destructive migrations). `npm run dev` serves the app at
`http://localhost:3000`. `lib/env.server.ts` and `lib/env.client.ts` parse
`.env.local` at boot and fail loudly (not silently) if a required variable is
missing.

## Environment variables

| Variable | Required | Used for |
|---|---|---|
| `DATABASE_URL` | Yes (server) | Postgres connection string for Prisma. DB-backed features fail closed without it. |
| `ETHERSCAN_API_KEY` | Yes (server) | Tx history / first-transaction lookups via Etherscan v2 (and chain-specific explorers in the working tree's coverage table). |
| `ALCHEMY_API_KEY` | Yes (server) | Token balances, portfolio flags, and EVM RPC (ENS resolution) via the Alchemy SDK. |
| `THEGRAPH_API_KEY` | Yes (server) | Aave/Compound/Uniswap subgraph queries via The Graph gateway. |
| `HELIUS_API_KEY` | Yes (server) | Solana RPC/data, called server-side through `/api/solana-rpc` (see `THREAT_MODEL.md`/`ARCHITECTURE.md` for why this moved off the client). |
| `NEXT_PUBLIC_APP_URL` | No (client) | Base URL used for OG image generation and similar absolute-URL needs. Optional; callers fall back to historical defaults if unset. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | No (client) | WalletConnect/RainbowKit project ID. Public by design. |

`lib/env.server.ts` also accepts an optional `INGEST_RECONCILE` flag (enables
cross-source ingest reconciliation logging; doubles provider load for sampled
reads, leave it off unless you're debugging source drift).

Do not add `NEXT_PUBLIC_HELIUS_API_KEY`. It was historically shipped to the
client and has since been removed in favor of the server-side
`/api/solana-rpc` proxy; `scripts/check-client-secrets.mjs` treats any Helius
key showing up in the client bundle as a build-failing regression. See
`RUNBOOK.md` for the key-rotation history.

## Scripts

| Script | Command | What it does |
|---|---|---|
| `dev` | `npm run dev` | Runs the Next.js dev server. |
| `build` | `npm run build` | `prisma generate && next build`, then scans the compiled client bundle for leaked server secrets (`scripts/check-client-secrets.mjs`). Fails the build on a match. |
| `start` | `npm run start` | Serves the production build (`next start`). |
| `lint` | `npm run lint` | `next lint`. |
| `typecheck` | `npm run typecheck` | `tsc --noEmit`. |
| `test` | `npm run test` | Runs the Vitest unit suite once. |
| `test:watch` | `npm run test:watch` | Vitest in watch mode. |
| `test:e2e` | `npm run test:e2e` | Playwright end-to-end tests. |
| `test:ci` | `npm run test:ci` | Vitest, then Playwright, back to back (what CI runs). |
| `backtest` | `npm run backtest` | Runs the point-in-time backtest engine against `data/backtest/holdout.json` and writes `reports/backtest/latest.json` (the file `/retrospective` reads). |
| `loadtest` | `npm run loadtest` | Concurrency/latency harness against a running server's `/api/v1/score/{address}`. Needs `CHAINSCORE_API_KEY`. |
| `check:client-secrets` | `npm run check:client-secrets` | Runs just the secret scan against an already-built `.next/static` (also runs automatically as part of `build`). |

Two scripts exist without a package.json alias and are run directly:

- `python scripts/export-backtest-holdout.py` (produces
  `data/backtest/holdout.json` from local training-pipeline data; a
  prerequisite for `npm run backtest`)
- `npx tsx scripts/mintApiKey.ts "Partner Name" [rateLimitPerMin]` (mints a
  partner API key)
- `npx tsx scripts/benchScoring.ts` (in-process latency benchmark for the
  cache/envelope path, excluding provider network time)

## Where the model lives

The serving model is two JSON artifacts, not a running Python process:

- `ml/model.json`, the XGBoost booster dump (or a logistic-regression
  fallback), bundled into the Vercel serverless function via
  `outputFileTracingIncludes` in `next.config.js`.
- `ml/model_meta.json`, feature names, factor groupings, the Platt
  calibration lookup, the score band, grade cutoffs, and score-distribution
  deciles.

`lib/data/mlScorer.ts` loads both once per lambda and walks the trees in
TypeScript. One prediction pass produces the margin and per-feature
contributions, so the headline score and the on-page factor bars always agree
(no second, drifting heuristic scorer). The pipeline: features -> model
margin + contributions -> sigmoid -> Platt-calibrated PD -> 300 to 850 score
via a points-to-double-odds band -> grade/percentile from the meta-derived
cutoffs and deciles. See `ARCHITECTURE.md` section 4 for the full data flow
and `LABELS.md` for what the model is trained to predict.

## Public API

The versioned partner API (`/api/v1/score/{address}`, `/api/v1/webhooks`) is
documented in `docs/API.md`, with the full machine-readable contract at
`/api/v1/openapi` (source: `public/openapi.json`). It requires a bearer API
key (`Authorization: Bearer cs_live_...`), minted with
`scripts/mintApiKey.ts`. The older unversioned `GET /api/score/[address]` and
the `app/score/[address]` page remain the public v1 contract for the existing
web client (frozen shape per `DECISIONS.md` D-004) and stay unauthenticated.

## Further reading

- `ARCHITECTURE.md`, the Phase 0 audit: runtime topology, scoring data flow,
  model serving, data layer, and every known security/structural finding.
- `RUNBOOK.md`, operational procedures (DB provisioning, key rotation,
  minting API keys, backtests, load tests, incident response).
- `DEPLOYMENT.md`, deploy-readiness checklist, current blockers, deploy
  steps, and post-deploy verification.
- `THREAT_MODEL.md`, how an adversary would try to fake a good ChainScore,
  and what defends against it.
- `LABELS.md`, the exact definition of the positive class the model
  predicts, and its known limitations.
