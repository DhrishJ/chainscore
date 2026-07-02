import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { verifyWalletSignature } from '@/lib/auth'
import { isSolanaAddress, verifySolanaSignature } from '@/lib/solanaAuth'
import { isAddress } from 'viem'

// Replay-safe write authentication (Workstream G).
//
// Old flow (vulnerable): the client invented a message and a nonce, signed
// them, and the server verified only the signature. Any captured signature
// authorized any action for that address, forever.
//
// New flow: the server issues the nonce and the exact message, bound to
// (address, action) with a short expiry. Verification checks the signature
// against the server's stored message and consumes the nonce atomically, so
// a signature works exactly once, for exactly the action it names, within
// its validity window.

export const AUTH_ACTIONS = [
  'create_listing',
  'manage_listing',
  'apply_listing',
  'manage_application',
  'create_review',
] as const
export type AuthAction = (typeof AUTH_ACTIONS)[number]

const NONCE_TTL_MS = 5 * 60 * 1000

// Human-readable action lines so wallet prompts show what is being approved.
const ACTION_LABEL: Record<AuthAction, string> = {
  create_listing: 'Create a loan listing',
  manage_listing: 'Manage your loan listing',
  apply_listing: 'Apply to a loan listing',
  manage_application: 'Accept, reject, or withdraw a loan application',
  create_review: 'Leave a review',
}

export function buildNonceMessage(address: string, action: AuthAction, nonce: string, expiresAt: Date): string {
  return [
    'ChainScore wants you to sign this message to authorize an action.',
    '',
    `Action: ${ACTION_LABEL[action]}`,
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
    '',
    'This signature authorizes only this action and expires in 5 minutes.',
  ].join('\n')
}

// Storage seam: Prisma in the app, in-memory in unit tests.
export interface NonceRecord {
  id: string
  address: string
  action: string
  message: string
  expiresAt: Date
  usedAt: Date | null
}

export interface NonceStore {
  create(record: Omit<NonceRecord, 'usedAt'>): Promise<void>
  findById(id: string): Promise<NonceRecord | null>
  // Atomically mark used; returns false when already consumed.
  consume(id: string): Promise<boolean>
}

const prismaStore: NonceStore = {
  async create(record) {
    await prisma.authNonce.create({ data: record })
  },
  async findById(id) {
    return prisma.authNonce.findUnique({ where: { id } })
  },
  async consume(id) {
    const result = await prisma.authNonce.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    })
    return result.count === 1
  },
}

function normalizeAddress(address: string): string {
  return isSolanaAddress(address) ? address : address.toLowerCase()
}

export interface IssuedNonce {
  nonceId: string
  message: string
  expiresAt: string
}

export async function issueNonce(
  address: string,
  action: AuthAction,
  store: NonceStore = prismaStore,
  now: () => Date = () => new Date()
): Promise<IssuedNonce> {
  const id = randomBytes(24).toString('base64url')
  const expiresAt = new Date(now().getTime() + NONCE_TTL_MS)
  const normalized = normalizeAddress(address)
  const message = buildNonceMessage(normalized, action, id, expiresAt)
  await store.create({ id, address: normalized, action, message, expiresAt })
  return { nonceId: id, message, expiresAt: expiresAt.toISOString() }
}

export interface VerifyRequest {
  address: string
  action: AuthAction
  nonceId: string
  signature: string
}

export type VerifyResult = { ok: true } | { ok: false; error: string; status: number }

export async function verifyAuthorizedAction(
  req: VerifyRequest,
  store: NonceStore = prismaStore,
  now: () => Date = () => new Date()
): Promise<VerifyResult> {
  const { address, action, nonceId, signature } = req
  if (!address || !nonceId || !signature) {
    return { ok: false, error: 'Missing authentication fields', status: 400 }
  }
  const isSol = isSolanaAddress(address)
  if (!isSol && !isAddress(address)) {
    return { ok: false, error: 'Invalid address', status: 400 }
  }
  const normalized = normalizeAddress(address)

  const record = await store.findById(nonceId)
  if (!record) return { ok: false, error: 'Unknown nonce', status: 401 }
  if (record.address !== normalized) return { ok: false, error: 'Nonce address mismatch', status: 401 }
  if (record.action !== action) return { ok: false, error: 'Nonce action mismatch', status: 401 }
  if (record.usedAt) return { ok: false, error: 'Nonce already used', status: 401 }
  if (record.expiresAt.getTime() <= now().getTime()) {
    return { ok: false, error: 'Nonce expired', status: 401 }
  }

  // Verify the signature over the server-issued message, never over anything
  // the client supplies.
  const valid = isSol
    ? verifySolanaSignature(normalized, record.message, signature)
    : await verifyWalletSignature(normalized, record.message, signature as `0x${string}`)
  if (!valid) return { ok: false, error: 'Invalid signature', status: 401 }

  // Consume atomically after a valid signature so a failed client attempt
  // does not burn the nonce, while two racing requests can succeed at most once.
  const consumed = await store.consume(nonceId)
  if (!consumed) return { ok: false, error: 'Nonce already used', status: 401 }

  return { ok: true }
}
