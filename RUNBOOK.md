# RUNBOOK.md

Operational procedures for ChainScore. This is the "how do I actually do the
thing" document; see `ARCHITECTURE.md` for why things are built this way and
`DEPLOYMENT.md` for the current deploy blockers.

## Provisioning the database

The app is currently not connected to a working database (see
`DEPLOYMENT.md` blockers). Until `DATABASE_URL` points at a live Postgres
instance, every DB-backed feature fails closed: `npx prisma db push` cannot
run, `AuthNonce`-gated marketplace writes return 500, partner API key auth
(`lib/apiKey.ts`) has nothing to look up against, and `scripts/mintApiKey.ts`
falls back to printing a manual `INSERT` statement instead of writing the row
itself. This is deliberately safer than pretending those features work.

To provision:

1. Create a new Supabase project (or point at any Postgres 14+ instance you
   control).
2. Use the **pooler** connection string, not the direct host. Supabase's
   direct-connection host is IPv6-only, which Vercel's serverless functions
   generally cannot reach; the pooler (PgBouncer, typically on port `6543`,
   host like `aws-0-<region>.pooler.supabase.com`) is IPv4-reachable and is
   what `DATABASE_URL` should use.
3. Set `DATABASE_URL` to that pooler connection string in `.env.local` for
   local development, and in the Vercel project's environment variables for
   deployed environments.
4. Run `npx prisma db push`. This applies every model in
   `prisma/schema.prisma` (`Wallet`, `ScoreSnapshot`, `LoanListing`,
   `LoanApplication`, `Loan`, `Review`, `Notification`, `AuthNonce`,
   `FeatureSnapshot`, `OutcomeLabel`, `BacktestRun`, `ApiKey`,
   `WebhookSubscription`, `Entity`, `EntityMembership`, `MergeAudit`) in one
   shot; the schema is purely additive, there is no destructive migration to
   review or reconcile.
5. Verify: `npx tsx scripts/mintApiKey.ts "smoke-test"` should print a key
   and confirm `stored key id=...` (not the manual-INSERT fallback message).

Until this is done, treat any RUNBOOK step below that touches the database
(minting/revoking keys, webhooks, backtest runs written to `BacktestRun`) as
unavailable, and any docs that assume score history exists (a "historical
score timeline" feature) as aspirational per `ARCHITECTURE.md` section 5.3.

## Rotating a leaked key

General procedure for any provider key (Etherscan, Alchemy, The Graph,
Helius):

1. Rotate the key at the provider's dashboard (invalidate the old one, issue
   a new one).
2. Update the corresponding environment variable in the Vercel project
   settings, and in `.env.local` for local development.
3. Redeploy (a Vercel env var change alone does not update already-running
   deployments; trigger a redeploy or the next push will pick it up).

### Historical Helius exposure

`components/SolanaWalletProvider.tsx` used to read
`NEXT_PUBLIC_HELIUS_API_KEY`, which Next.js inlines into the public JS
bundle at build time, is extractable by anyone, and could be used to burn
the project's Helius quota. This has been fixed: Solana RPC calls the client
needs now go through the server-side `/api/solana-rpc` proxy
(`app/api/solana-rpc/route.ts`), which reads the server-only `HELIUS_API_KEY`
and is never inlined into client code. `scripts/check-client-secrets.mjs`
enforces this going forward: it fails the build if a Helius (or any other
server-only) key value shows up anywhere in `.next/static`.

This does not retroactively protect the *old* key. If it was ever deployed
with `NEXT_PUBLIC_HELIUS_API_KEY` set, that key is burned and must be
rotated at Helius's dashboard per the general procedure above, then removed
entirely as an environment variable (do not leave `NEXT_PUBLIC_HELIUS_API_KEY`
set anywhere, even to an unused value; the whole point is it should not
exist).

## Minting and revoking partner API keys

Mint:

```bash
npx tsx scripts/mintApiKey.ts "Partner Name" [rateLimitPerMin]
```

`rateLimitPerMin` is optional and defaults to 60. The plaintext key
(`cs_live_...`) is printed once, store it immediately, it is never
persisted or recoverable, only its SHA-256 hash is written to the `ApiKey`
table (`lib/apiKey.ts`). If the database is unreachable at mint time, the
script still prints the plaintext plus a manual `INSERT` statement so key
creation is never blocked on DB connectivity; run that statement once the
database is reachable.

Revoke: there is no revoke script. Revoking a key means setting `revokedAt`
on its `ApiKey` row (any non-null timestamp), for example via `prisma
studio` or a direct SQL update:

```sql
UPDATE "ApiKey" SET "revokedAt" = now() WHERE name = 'Partner Name';
```

`authenticateApiKey` (`lib/apiKey.ts`) checks `revokedAt` on every request
and returns `403` for a revoked key, so this takes effect immediately, there
is no cache to bust.

## Reproducing a backtest

```bash
python scripts/export-backtest-holdout.py
npm run backtest
```

The Python step reads the local training pipeline's processed dataset
(`model/data/processed/`, not checked in) and writes
`data/backtest/holdout.json`, the temporal holdout slice (newest borrowers by
`_split_ts`, features strictly before `observation_cutoff` per `LABELS.md`).
`npm run backtest` (`scripts/runBacktest.ts`) then runs the point-in-time
backtest engine (`lib/backtest/engine.ts`) through the exact serving model
(`lib/data/mlScorer.ts`), and writes a timestamped JSON + Markdown report
under `reports/backtest/`, plus a stable `reports/backtest/latest.json`
that the `/retrospective` page reads directly. If `data/backtest/holdout.json`
is missing, `runBacktest.ts` exits with an error telling you to run the
Python export first; if the exported feature order doesn't match the
serving model's feature order, it also refuses to run rather than silently
score against the wrong schema.

## Running a load/latency check

End-to-end, against a running server:

```bash
npm run loadtest -- [--base http://localhost:3000] [--address 0x...] [--concurrency 20] [--total 500]
```

Needs a running server (`npm run dev` or a deployed URL) and
`CHAINSCORE_API_KEY` set in the environment (never passed as an argv flag, so
it never lands in shell history). It checks the server is up first; if not,
it reports the harness is ready and skips the run rather than failing. It
fires concurrent `GET /api/v1/score/{address}` requests and reports latency
percentiles (p50/p95/p99/max), throughput, a status-code histogram, and
cached vs. uncached counts (from the `X-ChainScore-Cached` header).

In-process only, no server or network needed:

```bash
npx tsx scripts/benchScoring.ts
```

Measures just the parts of latency the service controls (warm cache read,
envelope composition including the integrity detectors), deliberately
excluding provider network fan-out, which dominates a cold request and isn't
something caching can improve.

## Responding to a provider outage

The ingest layer (`lib/ingest/`) fails over across sources automatically
where more than one exists for a chain; a partial or failed attempt logs a
structured line before returning:

```
evt=ingest_failover
```

(see `lib/ingest/txHistory.ts`). Search logs for that token to see which
chain/source failed and which source won. When a source is degraded or
unreachable, the envelope's `dataCompleteness` field drops below 1 and
`degradedSources` lists which inputs were zero-filled, so a consumer can
distinguish "genuinely thin wallet" from "we couldn't get all the data" (see
`ARCHITECTURE.md` section 3).

Under a total outage (no source reachable at all), the scoring service
serves the last-known-good cached envelope instead of erroring
(`getLastKnownGood` in `lib/scoring/service.ts`), flagged `stale: true` with
its original `asOf` timestamp preserved. It never fabricates a score for a
wallet it has no cached history for.

## Responding to a suspected score-manipulation/farming event

1. Check the score-drift monitor primitives in `lib/monitoring/scoreDrift.ts`
   (PSI-based distribution shift detection, and the high-score-convergence
   check for cohorts of new wallets) for signals that a cohort has shifted
   abnormally versus the training-time distribution.
2. Check the live integrity detectors in `lib/integrity/detectors.ts`
   (`assessIntegrity` / `applyIntegrityPenalty`), which currently run
   wash-trading and burst-timing detection inline on every EVM score request
   (per `DECISIONS.md` D-021, the instant-repay and Sybil detectors are wired
   but not yet fed the lending-event/entity data they need, so they
   contribute zero on the live path today). A flagged wallet's `integrity`
   block in the score envelope shows the penalty applied and which signals
   fired.
3. Check `lib/entity/resolver.ts` for entity clustering: whether the
   suspected wallets have been merged into a single entity, and at what
   confidence and on what signals (`MergeAudit` rows record every merge and
   reversal). Merges require multiple corroborating signals by design
   (`DECISIONS.md` D-016), so a single-signal link should never appear as a
   hard merge; if it has, that's a bug, not evidence of farming.
4. See `THREAT_MODEL.md` for the full attack catalogue (Sybil farms, wash
   trading, self-funded fake repayment, circular funding, timing games,
   forced-merge defamation, model extraction) and which defense each maps to,
   and `COST_TO_GAME.md` for the per-feature cost table that explains why the
   model weights what it weights.

## Incident basics

- **Logs**: structured `console.*` JSON only, no external log aggregator or
  request-ID system exists yet (`ARCHITECTURE.md` section 2). On Vercel,
  pull these from the deployment's Function Logs. Grep for `evt=` to find
  structured events like `ingest_failover`.
- **Disabling a partner key fast**: set `revokedAt` on its `ApiKey` row (see
  "Minting and revoking partner API keys" above). This is the fastest lever
  short of pulling `DATABASE_URL` entirely; it takes effect on the next
  request since there is no key cache to invalidate.
- **Disabling all partner API traffic fast**: there is no global kill switch
  today; the nearest equivalent is revoking every active `ApiKey` row, or
  rolling back the deployment.
