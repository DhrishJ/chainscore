import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'
import { env } from '@/lib/env.server'
import { mirrorKeyLimit } from '@/lib/rateLimitDurable'

// Partner API-key authentication (Workstream E/G).
//
// Keys are shown to the partner exactly once at creation; only a SHA-256 hash
// is stored, so a database leak does not expose usable keys. Lookup is by hash
// (constant-time compared) and the plaintext never touches the database or the
// logs. Each key carries a per-minute rate limit enforced alongside the IP
// limit in middleware.

const KEY_PREFIX = 'cs_live_'

export interface ApiKeyRecord {
  id: string
  name: string
  keyHash: string
  rateLimitPerMin: number
  revokedAt: Date | null
  lastUsedAt: Date | null
}

export interface ApiKeyStore {
  findByHash(hash: string): Promise<ApiKeyRecord | null>
  create(record: Omit<ApiKeyRecord, 'lastUsedAt' | 'revokedAt'>): Promise<void>
  touch(id: string): Promise<void>
}

export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

// Generate a new key: returns the plaintext (show once) and the record to
// store. The plaintext is never persisted.
export function generateApiKey(name: string, rateLimitPerMin = 60): { plaintext: string; record: Omit<ApiKeyRecord, 'lastUsedAt' | 'revokedAt'> } {
  const secret = randomBytes(24).toString('base64url')
  const plaintext = `${KEY_PREFIX}${secret}`
  return {
    plaintext,
    record: { id: randomBytes(12).toString('hex'), name, keyHash: hashKey(plaintext), rateLimitPerMin },
  }
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

const prismaStore: ApiKeyStore = {
  async findByHash(hash) {
    return prisma.apiKey.findUnique({ where: { keyHash: hash } })
  },
  async create(record) {
    await prisma.apiKey.create({ data: record })
  },
  async touch(id) {
    await prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } })
  },
}

export type AuthResult =
  | { ok: true; key: ApiKeyRecord }
  | { ok: false; status: number; error: string }

// Verify a presented key. Extracts the bearer token, hashes it, and looks it
// up. The hash comparison inside findByHash is an index lookup; the additional
// constant-time check guards the compared bytes.
export async function authenticateApiKey(
  authorizationHeader: string | null,
  store: ApiKeyStore = prismaStore
): Promise<AuthResult> {
  if (!authorizationHeader) return { ok: false, status: 401, error: 'Missing Authorization header' }
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  const presented = match?.[1]?.trim()
  if (!presented || !presented.startsWith(KEY_PREFIX)) {
    return { ok: false, status: 401, error: 'Malformed API key' }
  }

  const hash = hashKey(presented)
  const record = await store.findByHash(hash)
  if (!record || !constantTimeEqualHex(record.keyHash, hash)) {
    return { ok: false, status: 401, error: 'Invalid API key' }
  }
  if (record.revokedAt) return { ok: false, status: 403, error: 'API key revoked' }

  void store.touch(record.id)
  // Mirror the key's exact ceiling into Redis so edge middleware can enforce
  // it (D-019). Fire-and-forget; absent Redis, the middleware default applies.
  mirrorKeyLimit(redisConfig(), record.keyHash, record.rateLimitPerMin)
  return { ok: true, key: record }
}

function redisConfig(): { restUrl: string; restToken: string } | null {
  const restUrl =
    env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL ?? env.Chainscore_KV_REST_API_URL
  const restToken =
    env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN ?? env.Chainscore_KV_REST_API_TOKEN
  return restUrl && restToken ? { restUrl, restToken } : null
}

export { KEY_PREFIX }
