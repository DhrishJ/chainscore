/** @type {import('next').NextConfig} */
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
          // Content-Security-Policy is shipped REPORT-ONLY first (Phase 6
          // hardening). A web3 frontend loads wallet SDKs that use eval and
          // wasm, inline styles from RainbowKit, and open RPC/WebSocket
          // connections to many hosts, so an enforced strict CSP cannot be
          // written safely without observing real violations against the live
          // wallet flows. Report-only establishes the policy and surfaces
          // violations in the browser console without breaking anything;
          // enforcement (dropping unsafe-eval, adding nonces) follows once the
          // violation stream is clean. connect-src is broad on purpose:
          // scoring and wallets talk to arbitrary RPC and indexer hosts.
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: wss:",
              "frame-src 'self' https:",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
