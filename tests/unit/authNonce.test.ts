import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import {
  buildNonceMessage,
  issueNonce,
  verifyAuthorizedAction,
  NonceRecord,
  NonceStore,
} from '@/lib/authNonce'

// In-memory store mirroring the Prisma-backed one, including its atomic
// consume semantics.
function memoryStore(): NonceStore & { records: Map<string, NonceRecord> } {
  const records = new Map<string, NonceRecord>()
  return {
    records,
    async create(record) {
      records.set(record.id, { ...record, usedAt: null })
    },
    async findById(id) {
      return records.get(id) ?? null
    },
    async consume(id) {
      const record = records.get(id)
      if (!record || record.usedAt) return false
      record.usedAt = new Date()
      return true
    },
  }
}

const evmAccount = privateKeyToAccount(generatePrivateKey())
const evmAddress = evmAccount.address.toLowerCase()

async function signedRequest(store: NonceStore, action: 'create_listing' | 'apply_listing' = 'create_listing') {
  const issued = await issueNonce(evmAddress, action, store)
  const signature = await evmAccount.signMessage({ message: issued.message })
  return { issued, signature }
}

describe('issueNonce', () => {
  it('binds the message to address, action, nonce, and expiry', async () => {
    const store = memoryStore()
    const issued = await issueNonce(evmAddress, 'create_listing', store)
    expect(issued.message).toContain(evmAddress)
    expect(issued.message).toContain(issued.nonceId)
    expect(issued.message).toContain('Create a loan listing')
    expect(issued.message).toContain(issued.expiresAt)
  })
})

describe('verifyAuthorizedAction', () => {
  it('accepts a genuine signature over the server-issued message', async () => {
    const store = memoryStore()
    const { issued, signature } = await signedRequest(store)
    const result = await verifyAuthorizedAction(
      { address: evmAddress, action: 'create_listing', nonceId: issued.nonceId, signature },
      store
    )
    expect(result).toEqual({ ok: true })
  })

  it('rejects a replayed signature (single use)', async () => {
    const store = memoryStore()
    const { issued, signature } = await signedRequest(store)
    const req = { address: evmAddress, action: 'create_listing' as const, nonceId: issued.nonceId, signature }
    expect((await verifyAuthorizedAction(req, store)).ok).toBe(true)
    const replay = await verifyAuthorizedAction(req, store)
    expect(replay.ok).toBe(false)
    if (!replay.ok) expect(replay.status).toBe(401)
  })

  it('rejects a signature bound to a different action', async () => {
    const store = memoryStore()
    const { issued, signature } = await signedRequest(store, 'apply_listing')
    const result = await verifyAuthorizedAction(
      { address: evmAddress, action: 'create_listing', nonceId: issued.nonceId, signature },
      store
    )
    expect(result.ok).toBe(false)
  })

  it('rejects a nonce issued to a different wallet', async () => {
    const store = memoryStore()
    const otherAccount = privateKeyToAccount(generatePrivateKey())
    const issued = await issueNonce(evmAddress, 'create_listing', store)
    const signature = await otherAccount.signMessage({ message: issued.message })
    const result = await verifyAuthorizedAction(
      { address: otherAccount.address, action: 'create_listing', nonceId: issued.nonceId, signature },
      store
    )
    expect(result.ok).toBe(false)
  })

  it('rejects an expired nonce', async () => {
    const store = memoryStore()
    const { issued, signature } = await signedRequest(store)
    const future = () => new Date(Date.now() + 6 * 60 * 1000)
    const result = await verifyAuthorizedAction(
      { address: evmAddress, action: 'create_listing', nonceId: issued.nonceId, signature },
      store,
      future
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('Nonce expired')
  })

  it('rejects a tampered signature without consuming the nonce', async () => {
    const store = memoryStore()
    const { issued } = await signedRequest(store)
    const bad = await verifyAuthorizedAction(
      { address: evmAddress, action: 'create_listing', nonceId: issued.nonceId, signature: '0xdead' },
      store
    )
    expect(bad.ok).toBe(false)
    // The nonce survives a failed attempt so the legitimate user can retry.
    expect(store.records.get(issued.nonceId)?.usedAt).toBeNull()
  })

  it('rejects an unknown nonce', async () => {
    const store = memoryStore()
    const result = await verifyAuthorizedAction(
      { address: evmAddress, action: 'create_listing', nonceId: 'does-not-exist', signature: '0xdead' },
      store
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('Unknown nonce')
  })

  it('verifies Solana ed25519 signatures through the same flow', async () => {
    const store = memoryStore()
    const keypair = nacl.sign.keyPair()
    const solAddress = bs58.encode(keypair.publicKey)
    const issued = await issueNonce(solAddress, 'create_listing', store)
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(issued.message), keypair.secretKey)
    )
    const result = await verifyAuthorizedAction(
      { address: solAddress, action: 'create_listing', nonceId: issued.nonceId, signature },
      store
    )
    expect(result).toEqual({ ok: true })
  })
})

describe('buildNonceMessage', () => {
  it('is stable for identical inputs', () => {
    const expires = new Date('2026-07-02T12:00:00Z')
    const a = buildNonceMessage('0xabc', 'create_review', 'nonce123', expires)
    const b = buildNonceMessage('0xabc', 'create_review', 'nonce123', expires)
    expect(a).toBe(b)
  })
})
