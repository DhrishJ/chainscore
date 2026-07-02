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
          // Content-Security-Policy intentionally omitted here: it needs nonce
          // plumbing and explicit wallet-lib allowances, scheduled for a later
          // hardening phase.
        ],
      },
    ]
  },
}

module.exports = nextConfig
