'use client'

// Client half of the replay-safe auth flow: ask the server for a single-use
// nonce and the exact message to sign, sign that message in the wallet, then
// send { nonceId, signature } with the write request. The server verifies the
// signature against its own stored message.

export type ClientAuthAction =
  | 'create_listing'
  | 'manage_listing'
  | 'apply_listing'
  | 'manage_application'
  | 'create_review'

export interface NonceGrant {
  nonceId: string
  message: string
  expiresAt: string
}

export async function requestNonce(address: string, action: ClientAuthAction): Promise<NonceGrant> {
  const res = await fetch('/api/auth/nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, action }),
  })
  const data = (await res.json()) as NonceGrant & { error?: string }
  if (!res.ok) throw new Error(data.error || 'Failed to request signing nonce')
  return data
}
