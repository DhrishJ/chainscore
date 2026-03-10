/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [] },
  // Include ml/ model files in the Vercel serverless bundle
  outputFileTracingIncludes: {
    '/api/score/[address]': ['./ml/model.json', './ml/model_meta.json'],
    '/score/[address]': ['./ml/model.json', './ml/model_meta.json'],
  },
}

module.exports = nextConfig
