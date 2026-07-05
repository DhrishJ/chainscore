import { describe, expect, it } from 'vitest'
import {
  authenticateApiKey,
  generateApiKey,
  hashKey,
  ApiKeyRecord,
  ApiKeyStore,
  KEY_PREFIX,
} from '@/lib/apiKey'

function memoryStore(seed: ApiKeyRecord[] = []): ApiKeyStore & { touched: string[] } {
  const byHash = new Map(seed.map((r) => [r.keyHash, r]))
  const touched: string[] = []
  return {
    touched,
    async findByHash(hash) {
      return byHash.get(hash) ?? null
    },
    async create(record) {
      byHash.set(record.keyHash, { ...record, lastUsedAt: null, revokedAt: null })
    },
    async touch(id) {
      touched.push(id)
    },
  }
}

describe('generateApiKey', () => {
  it('creates a prefixed plaintext and stores only its hash', () => {
    const { plaintext, record } = generateApiKey('partner', 100)
    expect(plaintext.startsWith(KEY_PREFIX)).toBe(true)
    expect(record.keyHash).toBe(hashKey(plaintext))
    // The plaintext must not be recoverable from the record.
    expect(JSON.stringify(record)).not.toContain(plaintext)
  })
})

describe('authenticateApiKey', () => {
  it('accepts a valid key and touches last used', async () => {
    const { plaintext, record } = generateApiKey('partner')
    const store = memoryStore([{ ...record, lastUsedAt: null, revokedAt: null }])
    const result = await authenticateApiKey(`Bearer ${plaintext}`, store)
    expect(result.ok).toBe(true)
    expect(store.touched).toContain(record.id)
  })

  it('rejects a missing header', async () => {
    const result = await authenticateApiKey(null, memoryStore())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
  })

  it('rejects a malformed key', async () => {
    const result = await authenticateApiKey('Bearer not-a-real-key', memoryStore())
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown key', async () => {
    const { plaintext } = generateApiKey('partner')
    const result = await authenticateApiKey(`Bearer ${plaintext}`, memoryStore())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
  })

  it('rejects a revoked key with 403', async () => {
    const { plaintext, record } = generateApiKey('partner')
    const store = memoryStore([{ ...record, lastUsedAt: null, revokedAt: new Date() }])
    const result = await authenticateApiKey(`Bearer ${plaintext}`, store)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })
})
