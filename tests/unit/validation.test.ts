import { describe, expect, it } from 'vitest'
import {
  addressParamSchema,
  chainSlugSchema,
  cuidSchema,
  ensNameSchema,
  evmAddressSchema,
  evmOrSolanaAddressSchema,
  paginationSchema,
  parseOrError,
  solanaAddressSchema,
} from '@/lib/validation'

const VALID_EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const VALID_EVM_LOWER = VALID_EVM.toLowerCase()
const VALID_SOLANA = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'

describe('lib/validation evmAddressSchema', () => {
  it('accepts a well-formed EVM address and lowercases it', () => {
    const result = evmAddressSchema.safeParse(VALID_EVM)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe(VALID_EVM_LOWER)
  })

  it('rejects an address that is too short', () => {
    expect(evmAddressSchema.safeParse('0xAb58').success).toBe(false)
  })

  it('rejects an address without the 0x prefix', () => {
    expect(evmAddressSchema.safeParse(VALID_EVM.slice(2)).success).toBe(false)
  })

  it('rejects an address with non-hex characters', () => {
    expect(evmAddressSchema.safeParse('0x' + 'g'.repeat(40)).success).toBe(false)
  })
})

describe('lib/validation solanaAddressSchema', () => {
  it('accepts a well-formed Solana address', () => {
    const result = solanaAddressSchema.safeParse(VALID_SOLANA)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe(VALID_SOLANA)
  })

  it('rejects an address shorter than 32 characters', () => {
    expect(solanaAddressSchema.safeParse('short').success).toBe(false)
  })

  it('rejects an EVM-shaped 0x address', () => {
    expect(solanaAddressSchema.safeParse(VALID_EVM_LOWER).success).toBe(false)
  })

  it('rejects addresses containing base58-excluded characters (0, O, I, l)', () => {
    expect(solanaAddressSchema.safeParse('0'.repeat(40)).success).toBe(false)
  })
})

describe('lib/validation ensNameSchema', () => {
  it('accepts a lowercase .eth name', () => {
    expect(ensNameSchema.safeParse('vitalik.eth').success).toBe(true)
  })

  it('accepts an uppercase .eth name (case-insensitive)', () => {
    expect(ensNameSchema.safeParse('Vitalik.ETH').success).toBe(true)
  })

  it('rejects a name without the .eth suffix', () => {
    expect(ensNameSchema.safeParse('vitalik').success).toBe(false)
  })

  it('rejects a name longer than 64 characters', () => {
    expect(ensNameSchema.safeParse('a'.repeat(61) + '.eth').success).toBe(false)
  })

  it('rejects a name with disallowed characters', () => {
    expect(ensNameSchema.safeParse('vita lik.eth').success).toBe(false)
  })
})

describe('lib/validation addressParamSchema', () => {
  it('accepts an EVM address', () => {
    expect(addressParamSchema.safeParse(VALID_EVM).success).toBe(true)
  })

  it('accepts a Solana address', () => {
    expect(addressParamSchema.safeParse(VALID_SOLANA).success).toBe(true)
  })

  it('accepts an ENS name', () => {
    expect(addressParamSchema.safeParse('vitalik.eth').success).toBe(true)
  })

  it('rejects garbage input', () => {
    expect(addressParamSchema.safeParse('not-an-address').success).toBe(false)
  })
})

describe('lib/validation evmOrSolanaAddressSchema', () => {
  it('accepts an EVM address', () => {
    expect(evmOrSolanaAddressSchema.safeParse(VALID_EVM).success).toBe(true)
  })

  it('accepts a Solana address', () => {
    expect(evmOrSolanaAddressSchema.safeParse(VALID_SOLANA).success).toBe(true)
  })

  it('rejects an ENS name (no ENS resolution here)', () => {
    expect(evmOrSolanaAddressSchema.safeParse('vitalik.eth').success).toBe(false)
  })
})

describe('lib/validation cuidSchema', () => {
  it('accepts a cuid-shaped id', () => {
    expect(cuidSchema.safeParse('cku1a2b3c4d5e6f7g8h9i0').success).toBe(true)
  })

  it('rejects an id that is too short', () => {
    expect(cuidSchema.safeParse('abc').success).toBe(false)
  })

  it('rejects an id with uppercase letters', () => {
    expect(cuidSchema.safeParse('CKU1A2B3C4D5E6F7G8H9I0').success).toBe(false)
  })
})

describe('lib/validation chainSlugSchema', () => {
  it('defaults to ethereum when missing', () => {
    expect(chainSlugSchema.parse(undefined)).toBe('ethereum')
  })

  it('accepts every configured chain slug', () => {
    for (const slug of ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'avalanche', 'bnb', 'solana']) {
      expect(chainSlugSchema.safeParse(slug).success).toBe(true)
    }
  })

  it('rejects an unknown chain slug', () => {
    expect(chainSlugSchema.safeParse('dogecoin').success).toBe(false)
  })
})

describe('lib/validation paginationSchema', () => {
  it('defaults to 1 when missing', () => {
    expect(paginationSchema.parse(undefined)).toBe(1)
  })

  it('coerces a numeric string', () => {
    expect(paginationSchema.parse('5')).toBe(5)
  })

  it('falls back to 1 for non-numeric input', () => {
    expect(paginationSchema.parse('abc')).toBe(1)
  })

  it('falls back to 1 when above the max', () => {
    expect(paginationSchema.parse('999999')).toBe(1)
  })

  it('falls back to 1 for zero or negative values', () => {
    expect(paginationSchema.parse('0')).toBe(1)
    expect(paginationSchema.parse('-5')).toBe(1)
  })

  it('falls back to 1 for non-integer values', () => {
    expect(paginationSchema.parse('1.5')).toBe(1)
  })
})

describe('lib/validation parseOrError', () => {
  it('returns ok:true with parsed data on success', () => {
    const result = parseOrError(evmAddressSchema, VALID_EVM)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toBe(VALID_EVM_LOWER)
  })

  it('returns ok:false with a 400 JSON response on failure', async () => {
    const result = parseOrError(evmAddressSchema, 'nope')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
      const body = await result.response.json()
      expect(body).toEqual({ error: 'Invalid address' })
    }
  })
})
