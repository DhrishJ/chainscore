import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Placeholders so modules that import lib/env.server.ts load in tests.
    // Individual tests stub these (empty string = missing) as needed.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      ETHERSCAN_API_KEY: 'test-etherscan',
      ALCHEMY_API_KEY: 'test-alchemy',
      THEGRAPH_API_KEY: 'test-thegraph',
      HELIUS_API_KEY: 'test-helius',
    },
  },
})
