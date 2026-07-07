# Pricing: unit economics and tier sanity check

Section 9 deliverable. lib/pricing/plans.ts is the single source of truth;
this document grounds its numbers. The Strategy agent refines these with
real telemetry; a human approves changes.

## 1. Cost to score a wallet (estimate, assumptions stated)

A COLD score fans out to providers; a CACHED score costs approximately
nothing (shared Redis cache, verified cross-instance).

Per cold score, at current provider list prices:
| Component | Calls | Est. cost |
|---|---|---|
| The Graph gateway (Aave/Compound/Uniswap queries) | ~3 | ~$0.00012 |
| Etherscan v2 (first tx + tx history) | ~2 | $0 to ~$0.0002 (free tier now; paid tier at scale) |
| Alchemy (token balances, ENS) | ~2 | ~$0.0002 |
| Vercel compute (~1.5s serverless) | 1 | ~$0.0003 |
| Upstash (cache + limiter + meter commands) | ~6 | ~$0.00001 |
| **Total, cold** | | **~$0.0008 to $0.0012** |

Blended assumption at 50% cache hit rate: **~$0.0005 per scored call**.
Monitored wallets (webhook SKU): one scheduled re-score per wallet per day
equals ~$0.015 to $0.03 per wallet per month at cold rates, before
optimization (event-driven invalidation makes most re-scores cached).

Caveats: Etherscan free tier covers current volume but not Growth-tier
volume (budget the $199/mo tier at ~5M calls/mo); the compute estimate is
p50, cold p95 is ~3s. These are list prices as of 2026-07; re-verify
quarterly.

## 2. Margin sanity check per tier

| Tier | Price | Included scores | Revenue/score | Cost/score (blended) | Gross margin |
|---|---|---|---|---|---|
| Developer | $0 | 1,000 | $0 | ~$0.0005 | -$0.50/mo per active dev (CAC, acceptable) |
| Starter | $99 | 10,000 | $0.0099 | ~$0.0005 | ~95% |
| Growth | $499 | 75,000 | $0.0067 | ~$0.0005 | ~92% |
| Overage | | | $0.008 to $0.012 | ~$0.0005 | ~94% |

Monitored wallets: Starter $0.15/wallet overage vs ~$0.03 cost = ~80%
margin; included allocations are similarly safe. No tier is unprofitable at
these assumptions; the loss-leader is the free tier, capped at about fifty
cents per active developer per month, which is cheap acquisition.

## 3. What is enforced in code today

- Metering: one Redis INCR per scored call per key per calendar month
  (usage:{hash16}:{YYYY-MM}), fail-open.
- Quota: free tier hard-stops at quota (429 QUOTA_EXCEEDED). Paid tiers
  flow into overage.
- Customer-set overage cap: overage accrues only up to
  Subscription.overageCapUsd (default $50), then 429 OVERAGE_CAP_REACHED.
  Nobody gets a surprise bill; this is a direct lesson from competitor
  complaints about runaway charges.
- Only real scoring attempts count: invalid addresses, unsupported chains,
  and auth failures are never metered.
- Usage transparency: X-ChainScore-Plan / -Usage / -Quota on every response.
- The pricing page renders lib/pricing/plans.ts directly; it cannot drift
  from what metering enforces.

## 4. Stripe billing: drafted, not live

Starter and Growth are meant to be self-serve: a customer picks a plan,
pays through Stripe Checkout, and their `Subscription` row (planId, status)
updates itself from Stripe's webhooks. That flow is drafted in code
(`lib/billing/stripe.ts`, `app/api/billing/webhook/route.ts`) but is inert
in every environment until a human supplies real Stripe keys; nothing
about this draft changes current behavior.

**Why it is safe to ship un-keyed:** `billingEnabled()` returns `false`
whenever `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is absent from
`process.env`. The checkout helper returns `null` when disabled, and the
webhook route returns `503` when disabled, before touching the database or
the network. No `stripe` npm dependency was added: checkout sessions are
created with a direct Stripe REST API call, and webhook signatures are
verified with `node:crypto`, both by hand, matching Stripe's documented
algorithm (`HMAC-SHA256` over `"${timestamp}.${rawBody}"`, compared in
constant time, with a 300 second replay tolerance).

**The flow, once a human supplies keys:**
1. A partner calls `createCheckoutUrl(planId, apiKeyId)` for `starter` or
   `growth` (the only self-serve plans; `free` has nothing to charge and
   `enterprise` is negotiated). This builds a Stripe Checkout Session
   using inline `price_data` from `lib/pricing/plans.ts` (so no
   per-plan Stripe Price IDs need to exist yet) and stamps `apiKeyId` and
   `planId` into both the session metadata and the resulting
   subscription's metadata.
2. The partner completes payment on Stripe's hosted page.
3. Stripe calls `POST /api/billing/webhook` with `checkout.session.completed`.
   The route verifies the signature, then upserts
   `Subscription { apiKeyId, planId, status: "active" }` (`overageCapUsd`
   is left at its schema default; billing does not manage the customer's
   overage cap).
4. Later `customer.subscription.updated` / `.deleted` events (renewals,
   payment failures, cancellations) update the same row's `status`
   (`.deleted` forces `"canceled"`). Events missing ChainScore's own
   `apiKeyId`/`planId` metadata, or of a type this integration does not
   react to, are acknowledged with `200` and otherwise ignored: Stripe
   retries on non-2xx, and most event types (invoices, disputes, etc.)
   are not this integration's concern yet.

**What a human must still do before this can go live** (none of this is
attempted by this draft; `lib/env.server.ts`, Prisma, and CI are protected
paths for the agent that wrote it):
- Register `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as optional
  strings in the `lib/env.server.ts` schema, matching the convention used
  for the other optional integration keys there.
- Create the Stripe account and a webhook endpoint pointed at
  `/api/billing/webhook`; copy both values into the deployment
  environment.
- Decide whether to keep inline `price_data` (simplest, no extra env vars)
  or move to pre-created Stripe Price objects (better Stripe-side
  reporting) before launch.
- Wire `createCheckoutUrl` into an actual "Upgrade" action in the
  dashboard; today it is a tested library function with no UI caller.

## 5. Other things deliberately not built yet

- Per-plan rate limits wired to the middleware mirror (plans carry
  rateLimitPerMin; the ApiKey row is still authoritative for now; unify
  when subscriptions get a management UI).
- Monitored-wallet metering (the webhook SKU exists; per-wallet counting
  lands with the subscription management work).
- Value-based pricing (basis points on underwritten volume): explicitly
  deferred until integrations exist. Noted, not built.

## 6. Regulatory note (for the human, restated from the brief)

Usage-based API pricing is straightforward. If the P2P marketplace stays
and ChainScore ever touches funds or takes a cut of matched loans, that is
a different regulatory category (potential lending/money-transmission
exposure). Legal counsel question, not an engineering one.
