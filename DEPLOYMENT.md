# DEPLOYMENT.md

Deploy-readiness checklist for ChainScore. Read the blockers section first;
none of them are optional polish, they are the difference between a working
deploy and a broken one.

## BLOCKERS before first deploy

**(a) The configured Supabase project no longer resolves (NXDOMAIN).**
The `DATABASE_URL` this environment was previously configured with points at
a Supabase host that no longer resolves. A new Supabase project (or other
Postgres instance) is required, and `npx prisma db push` must be run against
it before any DB-backed feature will work. See `RUNBOOK.md` ("Provisioning
the database") for the exact steps, including the pooler-vs-direct-host
note. Until this is fixed, `DATABASE_URL` failing means the app still boots
(env parsing only checks the variable is present, not that it connects) but
every Prisma call fails at request time: score history, marketplace writes,
partner API key auth, and webhooks are all effectively down.

**(b) Rotate the exposed Helius key and remove `NEXT_PUBLIC_HELIUS_API_KEY`
from the environment.**
`NEXT_PUBLIC_HELIUS_API_KEY` was historically read by
`components/SolanaWalletProvider.tsx` and inlined into the public client
bundle (`ARCHITECTURE.md` section 6.2). The client path now goes through the
server-side `/api/solana-rpc` proxy instead, and
`scripts/check-client-secrets.mjs` fails the build if a Helius key value
ever shows up in `.next/static` again. That only protects future builds.
Before deploying: rotate the old Helius key at the Helius dashboard (treat
it as burned), and make sure `NEXT_PUBLIC_HELIUS_API_KEY` is not set as an
environment variable anywhere (Vercel project settings, `.env.local`); only
the server-only `HELIUS_API_KEY` should exist.

**(c) Enable Scroll on the Alchemy app for Scroll tx coverage.**
Per `lib/ingest/config.ts`, the old `blockscout.scroll.io` instance used for
Scroll tx history was retired (it now redirects to Scrollscan, which needs
its own API key). Alchemy can serve Scroll instead
(`lib/ingest/adapters/alchemyTransfers.ts` already maps chain id `534352` to
`scroll-mainnet`), but only once the Scroll network is toggled on for this
project's Alchemy app in the Alchemy dashboard (a free-tier toggle, not a
paid upgrade). Without this, Scroll tx-history coverage is degraded
(`dataCompleteness` drops, `degradedSources` includes it) rather than
missing outright, but it should be enabled before relying on Scroll scores.

**(d) Set all required env vars in Vercel.**
`lib/env.server.ts` parses `DATABASE_URL`, `ETHERSCAN_API_KEY`,
`ALCHEMY_API_KEY`, `THEGRAPH_API_KEY`, `HELIUS_API_KEY` at boot and throws
loudly if any is missing or empty, so a missing var fails the build/boot
rather than degrading silently. `lib/env.client.ts` optionally reads
`NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. Set all of
these in the Vercel project's environment variables (Production and Preview)
before the first real deploy; see the table in `README.md` for what each is
for.

## Deploy steps

1. Push the rebuild work to `origin/master` (or merge the rebuild branch
   into `master` if working from a fork/PR; the local `master` here already
   contains every commit from `origin/rebuild/phase-0-1` plus all later
   phases, so pushing `master` is sufficient once the blockers above are
   resolved).
2. Vercel builds via `npm run build`, which runs `prisma generate && next
   build`, then `scripts/check-client-secrets.mjs` against the compiled
   output. A build that completes with `[check-client-secrets] OK: no server
   secrets in client output` in the logs has passed the secret scan; a
   non-zero exit here means a server secret leaked into the client bundle
   and the deploy should not proceed.
3. Once deployed, verify the two cheapest health signals by hand:
   - `GET /` returns `200`.
   - `GET /api/v1/openapi` returns the OpenAPI 3.1 document (this repo has
     no dedicated `/api/health` route; these two are the closest equivalent
     to a health check today).

## Post-deploy verification

- `GET /` returns `200`.
- `/retrospective` renders real numbers (it reads `reports/backtest/latest.json`
  directly; if that file is stale or missing, regenerate it per `RUNBOOK.md`
  "Reproducing a backtest" before relying on the page).
- `GET /api/v1/score/{address}` without an `Authorization` header returns
  `401`.
- `GET /api/v1/score/{address}` with a valid `Authorization: Bearer
  cs_live_...` header (minted per `RUNBOOK.md`) returns `200` with the full
  envelope (`score`, `grade`, `factors`, `integrity`, `dataCompleteness`,
  `degradedSources`, `asOf`, etc.) and the `X-ChainScore-Model-Version` /
  `X-ChainScore-Cached` response headers.
- Security headers are present on responses: `Strict-Transport-Security`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Frame-Options:
  SAMEORIGIN`, and a `Content-Security-Policy-Report-Only` header (see
  `next.config.js` `headers()`; CSP is report-only, not yet enforced, see
  follow-ups below).

## Known follow-ups still open (not blockers, but tracked)

- **Durable rate-limit and cache store (`DECISIONS.md` D-013 / D-018).** The
  IP rate limiter (`middleware.ts`) and the score cache
  (`lib/scoring/cache.ts`) both keep state in per-instance memory. On Vercel
  each serverless instance counts independently, so the effective ceiling is
  `instances x limit`, and a cached/stale envelope on one instance is
  invisible to another. Fixing this needs a shared store (Upstash Redis or
  similar), which is a new paid service and an owner decision.
- **Per-key exact rate limits (`DECISIONS.md` D-019).** The v1 middleware
  buckets by bearer token so a key can't multiply its budget across IPs, but
  it applies one fixed ceiling for everyone because the per-key
  `ApiKey.rateLimitPerMin` value lives in Prisma, which isn't edge-compatible
  inside middleware. Exact per-key enforcement needs the same shared store as
  D-013.
- **CSP enforcement.** The Content-Security-Policy is shipped
  report-only (`Content-Security-Policy-Report-Only` in `next.config.js`)
  because the wallet-connect stack (RainbowKit, Solana wallet adapters) uses
  `eval`/wasm and opens RPC/WebSocket connections to many hosts; enforcement
  (dropping `unsafe-eval`, adding nonces) needs a clean violation-report
  window first.
- **Remaining dependency-audit highs need breaking upgrades (`DECISIONS.md`
  D-028).** The wallet tree was slimmed to the Phantom and Solflare adapters
  and `npm audit` now gates CI on critical findings (currently zero). The
  five remaining highs sit in `next` itself (fix is the Next 16 major),
  dev-only `eslint-config-next` tooling, and `ws` under the Solana mobile
  protocol; they are accepted until those upgrades are scheduled.
  `osv-scanner` stays report-only (no severity threshold in the action).
