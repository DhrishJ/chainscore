import { TxRecord } from '@/lib/ingest/types'
import { LendingEvent, WalletActivity } from '@/lib/integrity/types'

// Seeded synthetic manipulation cases (Workstream F). Each factory builds a
// deterministic WalletActivity exhibiting one attack from THREAT_MODEL.md, so
// tests can assert the matching detector fires and honest wallets do not.

const DAY = 86400
const BASE = 1_700_000_000

function tx(from: string, to: string, timeStamp: number, hash: string): TxRecord {
  return { hash, timeStamp, from: from.toLowerCase(), to: to.toLowerCase(), valueWei: '1000000000000000000' }
}

// A2 wash trading: the wallet ping-pongs with two related addresses.
export function washTradingWallet(): WalletActivity {
  const self = '0xAAA0000000000000000000000000000000000001'
  const p1 = '0xBBB0000000000000000000000000000000000002'
  const p2 = '0xCCC0000000000000000000000000000000000003'
  const txs: TxRecord[] = []
  let t = BASE
  for (let i = 0; i < 8; i++) {
    txs.push(tx(self, p1, (t += 3600), `0xw${i}a`))
    txs.push(tx(p1, self, (t += 3600), `0xw${i}b`))
    txs.push(tx(self, p2, (t += 3600), `0xw${i}c`))
    txs.push(tx(p2, self, (t += 3600), `0xw${i}d`))
  }
  return { address: self.toLowerCase(), chain: 'ethereum', txs, relatedAddresses: [p1, p2] }
}

// A1 Sybil: funded from a common source alongside a cohort of related wallets.
export function sybilCohortWallet(): WalletActivity {
  const self = '0xDDD0000000000000000000000000000000000004'
  const funder = '0xF00D000000000000000000000000000000000005'
  const txs: TxRecord[] = [tx(funder, self, BASE, '0xfund')]
  for (let i = 0; i < 20; i++) txs.push(tx(self, `0x${i.toString(16).padStart(40, '0')}`, BASE + i * 3600, `0xact${i}`))
  const cohort = Array.from({ length: 12 }, (_, i) => `0xE${i.toString(16).padStart(39, '0')}`)
  return { address: self.toLowerCase(), chain: 'ethereum', txs, relatedAddresses: cohort }
}

// A5 burst: a long-dormant wallet with all activity crammed into 3 days.
export function burstTimingWallet(): WalletActivity {
  const self = '0x1110000000000000000000000000000000000006'
  const other = '0x2220000000000000000000000000000000000007'
  // One old tx to establish age, then a burst.
  const txs: TxRecord[] = [tx(self, other, BASE - 400 * DAY, '0xold')]
  for (let i = 0; i < 30; i++) txs.push(tx(self, other, BASE + i * 3600, `0xb${i}`))
  return { address: self.toLowerCase(), chain: 'ethereum', txs }
}

// A3 instant repay: every borrow repaid in the same block.
export function instantRepayWallet(): WalletActivity {
  const self = '0x3330000000000000000000000000000000000008'
  const lendingEvents: LendingEvent[] = []
  let t = BASE
  for (let i = 0; i < 6; i++) {
    const block = 1000 + i * 10
    lendingEvents.push({ kind: 'borrow', timeStamp: (t += DAY), blockNumber: block, amountWei: '5000000000000000000' })
    lendingEvents.push({ kind: 'repay', timeStamp: t + 12, blockNumber: block, amountWei: '5000000000000000000' })
  }
  return { address: self.toLowerCase(), chain: 'ethereum', txs: [], lendingEvents }
}

// Honest control: an organic wallet with spread activity, diverse
// counterparties, no reciprocal loops, and genuinely carried loans.
export function honestWallet(): WalletActivity {
  const self = '0x9990000000000000000000000000000000000009'
  const txs: TxRecord[] = []
  for (let i = 0; i < 40; i++) {
    const cp = `0x${(0x1000 + i).toString(16).padStart(40, '0')}`
    txs.push(tx(self, cp, BASE + i * 5 * DAY, `0xh${i}`))
  }
  const lendingEvents: LendingEvent[] = [
    { kind: 'borrow', timeStamp: BASE + 10 * DAY, blockNumber: 500, amountWei: '3000000000000000000' },
    { kind: 'repay', timeStamp: BASE + 90 * DAY, blockNumber: 60000, amountWei: '3000000000000000000' },
    { kind: 'borrow', timeStamp: BASE + 120 * DAY, blockNumber: 70000, amountWei: '2000000000000000000' },
    { kind: 'repay', timeStamp: BASE + 200 * DAY, blockNumber: 130000, amountWei: '2000000000000000000' },
  ]
  return { address: self.toLowerCase(), chain: 'ethereum', txs, lendingEvents, relatedAddresses: [] }
}
