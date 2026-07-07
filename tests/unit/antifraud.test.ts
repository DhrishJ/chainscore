import { describe, expect, it } from 'vitest'
import { checkEmailCompliance, checkFraud, UNSUBSCRIBE_TOKEN } from '@/lib/agents/antifraud'

describe('anti-fraud check (G6)', () => {
  it('ACCEPTANCE: blocks a fabricated partnership post', () => {
    const result = checkFraud(
      'Big news: ChainScore is now partnered with Aave Labs to bring credit scores to millions!'
    )
    expect(result.ok).toBe(false)
    expect(result.violations[0].kind).toBe('partnership')
  })

  it('blocks invented endorsements and "trusted by" logos', () => {
    expect(checkFraud('Backed by Paradigm and trusted by Morpho.').ok).toBe(false)
    expect(checkFraud('Our model is audited by Trail Of Bits.').ok).toBe(false)
  })

  it('blocks fabricated integrations and launch claims', () => {
    expect(checkFraud('ChainScore is integrated with Spark Protocol today.').ok).toBe(false)
    expect(checkFraud('Now live on Venus!').ok).toBe(false)
  })

  it('blocks testimonials attributed to people without consent on file', () => {
    const result = checkFraud('"This changed our underwriting" - Jane Smith, Risk Lead')
    expect(result.ok).toBe(false)
    expect(result.violations[0].kind).toBe('testimonial')
  })

  it('blocks impersonation and speaking for other projects', () => {
    expect(checkFraud('We are the team behind Compound and we vouch for this.').ok).toBe(false)
    expect(checkFraud('Posting on behalf of Aave governance.').ok).toBe(false)
  })

  it('allows factual coverage statements about chains and protocols we read', () => {
    expect(
      checkFraud('ChainScore reads borrowing history from Aave and Compound across Ethereum, Arbitrum and Base.').ok
    ).toBe(true)
  })

  it('allows aggressive, contrarian, meme-native content with no fabricated proof', () => {
    expect(
      checkFraud(
        'Hot take: most wallets should NOT have a credit score. If a scoring product rates a wallet that never borrowed, it is making numbers up. We refuse to. Anyway, here is the whole confusion matrix, misses included.'
      ).ok
    ).toBe(true)
  })
})

describe('CAN-SPAM email compliance', () => {
  it('blocks email bodies without the unsubscribe token', () => {
    expect(checkEmailCompliance('Buy now! Great scores await.').ok).toBe(false)
  })

  it('passes email bodies carrying the unsubscribe token', () => {
    expect(checkEmailCompliance(`Newsletter body.\n\nUnsubscribe: ${UNSUBSCRIBE_TOKEN}`).ok).toBe(true)
  })
})
