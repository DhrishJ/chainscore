/** @type {import('next').NextConfig} */

// --- Content Security Policy (Phase 6 hardening, ratchet in progress) ---
//
// Two policies ship at once (DECISIONS.md D-030):
//
// 1. Content-Security-Policy (ENFORCED): the broad policy previously shipped
//    report-only. Blocks the classes of injection that need no allowance for
//    the wallet stack (foreign scripts/styles/fonts, object embeds, form
//    hijack, non-TLS connections) while staying permissive where wallet SDKs
//    roam: connect-src allows any https/wss host, script-src still carries
//    unsafe-inline/unsafe-eval for Next inline runtime + wallet SDK eval.
//
// 2. Content-Security-Policy-Report-Only (CANDIDATE): the next ratchet step,
//    with unsafe-eval swapped for wasm-unsafe-eval and connect-src enumerated
//    to the hosts the client stack is actually built to reach (default viem
//    RPCs for the five configured chains, WalletConnect relay/verify,
//    Coinbase wallet infrastructure). Violations from real wallet flows land
//    in /api/csp-report ([csp-report] lines in runtime logs). When a
//    directive is quiet there, promote it into the enforced header.
//
// The /embed/:address route overrides frame-ancestors: the embeddable score
// widget exists specifically to be iframed by third-party sites. The
// catch-all X-Frame-Options: SAMEORIGIN is overridden there with the invalid
// sentinel ALLOWALL, which every browser ignores, so the CSP frame-ancestors
// directive (the modern replacement) governs alone on that route.

const reporting = ['report-uri /api/csp-report']

// fonts.googleapis.com / fonts.gstatic.com: @solana/wallet-adapter-react-ui's
// styles.css @imports DM Sans from Google Fonts. Blocking that @import makes
// the parent webpack CSS chunk fire onerror, which surfaces as a
// ChunkLoadError that crashes the whole client app (found by the e2e suite
// when enforcement first landed). The app's own fonts are self-hosted via
// next/font; these two hosts exist solely for that third-party stylesheet.
const enforcedBase = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "form-action 'self'",
]

const enforcedCsp = ["frame-ancestors 'self'", ...enforcedBase, ...reporting].join('; ')

// The embed widget page must be frameable anywhere.
const enforcedCspEmbed = ['frame-ancestors *', ...enforcedBase, ...reporting].join('; ')

// Hosts the client bundle is wired to contact (lib/wagmi.ts chains +
// RainbowKit default wallets). Solana RPC goes through same-origin
// /api/solana-rpc, covered by 'self'.
const candidateConnect = [
  "'self'",
  // Default viem transports for mainnet/polygon/arbitrum/optimism/base
  'https://eth.merkle.io',
  'https://polygon.drpc.org',
  'https://arb1.arbitrum.io',
  'https://mainnet.optimism.io',
  'https://mainnet.base.org',
  // WalletConnect relay, explorer API, verify, pulse telemetry
  'https://*.walletconnect.com',
  'wss://*.walletconnect.com',
  'https://*.walletconnect.org',
  'wss://*.walletconnect.org',
  // Coinbase Wallet SDK
  'https://keys.coinbase.com',
  'https://cca-lite.coinbase.com',
  'wss://www.walletlink.org',
].join(' ')

const candidateBase = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src ${candidateConnect}`,
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
  "worker-src 'self' blob:",
  "form-action 'self'",
  ...reporting,
]

const candidateCsp = ["frame-ancestors 'self'", ...candidateBase].join('; ')
const candidateCspEmbed = ['frame-ancestors *', ...candidateBase].join('; ')

const nextConfig = {
  images: { remotePatterns: [] },
  experimental: {
    // Include ml/ model files in the Vercel serverless bundle
    outputFileTracingIncludes: {
      '/api/score/[address]': ['./ml/model.json', './ml/model_meta.json'],
      '/score/[address]': ['./ml/model.json', './ml/model_meta.json'],
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Content-Security-Policy',
            value: enforcedCsp,
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: candidateCsp,
          },
        ],
      },
      {
        // Embeddable widget: frameable by any site. Later rule wins on
        // duplicate keys, so these override the catch-all above.
        source: '/embed/:address*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
          {
            key: 'Content-Security-Policy',
            value: enforcedCspEmbed,
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: candidateCspEmbed,
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
