# ChainScore Partner API (v1)

Versioned API for retrieving wallet credit-score envelopes and registering
score-change webhooks. The full machine-readable contract is published as an
OpenAPI 3.1 document at [`/api/v1/openapi`](/api/v1/openapi) (source:
`public/openapi.json`).

## Authentication

Every v1 request is authenticated with a partner API key, sent as a bearer
token:

```
Authorization: Bearer cs_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are shown once at creation. A missing or malformed header returns
`401`, a revoked key returns `403`. Requests are rate-limited per key; watch
the `X-RateLimit-Remaining` response header, and on a `429` respect the
`Retry-After` header (seconds) before retrying.

## GET /api/v1/score/{address}

Returns the versioned scoring envelope for a wallet: score, grade,
contributing factors, the integrity assessment, and data-completeness /
provenance metadata.

- `address` (path, required): EVM address, Solana address, or ENS name.
- `chain` (query, optional): one of `ethereum`, `polygon`, `arbitrum`,
  `optimism`, `base`, `avalanche`, `bnb`. Defaults to `ethereum`. `solana` is
  accepted by validation but currently returns `501` (not yet available on
  v1).

Response headers include `X-ChainScore-Model-Version` and
`X-ChainScore-Cached` (`"true"` / `"false"`) in addition to the rate-limit
headers above.

```bash
curl -s \
  -H "Authorization: Bearer $CHAINSCORE_API_KEY" \
  "https://chainscore.dev/api/v1/score/0x1234567890abcdef1234567890abcdef12345678?chain=ethereum"
```

Errors: `400` invalid address, `401` auth failure, `403` revoked key, `429`
rate limited, `501` chain not yet supported (currently `solana`).

## POST /api/v1/webhooks

Registers an HTTPS callback that ChainScore notifies when the watched
wallet's score changes. The returned `secret` signs every delivery and is
shown exactly once, at creation, so store it immediately.

Body:

```json
{
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "chain": "ethereum",
  "url": "https://partner.example.com/webhooks/chainscore"
}
```

```bash
curl -s -X POST \
  -H "Authorization: Bearer $CHAINSCORE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"address":"0x1234567890abcdef1234567890abcdef12345678","chain":"ethereum","url":"https://partner.example.com/webhooks/chainscore"}' \
  "https://chainscore.dev/api/v1/webhooks"
```

Response (`201`):

```json
{
  "id": "a1b2c3d4e5f6",
  "secret": "shown-once-store-it-now",
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "chain": "ethereum",
  "url": "https://partner.example.com/webhooks/chainscore"
}
```

Errors: `400` invalid JSON body or failed validation (bad address, bad
chain, url must be https), `401` auth failure, `403` revoked key, `429` rate
limited, `500` failed to create subscription.

## Load testing

`scripts/loadTest.ts` (run with `npm run loadtest`) drives concurrent
requests against `GET /api/v1/score/{address}` and reports latency
percentiles, throughput, a status-code histogram, and cached vs. uncached
counts. See the script header for configuration (target URL, address,
`CHAINSCORE_API_KEY`, concurrency, total requests).
