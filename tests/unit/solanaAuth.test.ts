import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { isSolanaAddress, verifySolanaSignature } from '@/lib/solanaAuth'

describe('isSolanaAddress', () => {
  it('accepts a valid base58 Solana address', () => {
    expect(isSolanaAddress('mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So')).toBe(true)
  })

  it('rejects EVM addresses', () => {
    expect(isSolanaAddress('0x71C7656EC7ab88b098defB751B7401B5f6d8976F')).toBe(false)
  })

  it('rejects short and malformed strings', () => {
    expect(isSolanaAddress('notanaddress')).toBe(false)
    expect(isSolanaAddress('')).toBe(false)
    expect(isSolanaAddress('O0lI'.repeat(10))).toBe(false)
  })
})

describe('verifySolanaSignature', () => {
  const keypair = nacl.sign.keyPair()
  const address = bs58.encode(keypair.publicKey)
  const message = 'ChainScore: test\nNonce: abc123'

  it('verifies a genuine ed25519 signature', () => {
    const signature = nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey)
    expect(verifySolanaSignature(address, message, bs58.encode(signature))).toBe(true)
  })

  it('rejects a signature over a different message', () => {
    const signature = nacl.sign.detached(new TextEncoder().encode('other message'), keypair.secretKey)
    expect(verifySolanaSignature(address, message, bs58.encode(signature))).toBe(false)
  })

  it('rejects garbage input without throwing', () => {
    expect(verifySolanaSignature(address, message, 'not-base58!!!')).toBe(false)
  })
})
