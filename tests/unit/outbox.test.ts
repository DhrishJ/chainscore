import { beforeEach, describe, expect, it } from 'vitest'
import {
  approveAction,
  executeAction,
  proposeAction,
  registerExecutor,
  rejectAction,
  OutboxRefusalError,
  type OutboxDb,
  type OutboxKind,
} from '@/lib/agents/outbox'

// In-memory OutboxDb so the control logic is tested without a database.
interface Row {
  id: string
  kind: string
  title: string
  payloadJson: string
  status: string
  amountUsd: number | null
  channel: string | null
  executedAt?: Date
}

function makeDb(): { db: OutboxDb; rows: Map<string, Row> } {
  const rows = new Map<string, Row>()
  let seq = 0
  const db: OutboxDb = {
    async create(data) {
      const id = `item-${++seq}`
      rows.set(id, {
        id,
        kind: data.kind,
        title: data.title,
        payloadJson: data.payloadJson,
        status: 'PENDING',
        amountUsd: data.amountUsd ?? null,
        channel: data.channel ?? null,
      })
      return { id }
    },
    async get(id) {
      return rows.get(id) ?? null
    },
    async setStatus(id, data) {
      const row = rows.get(id)
      if (!row) throw new Error('missing')
      Object.assign(row, data)
    },
    async executedSpendToday(channel) {
      let sum = 0
      for (const r of rows.values()) {
        if (r.kind === 'SPEND' && r.status === 'EXECUTED' && (!channel || r.channel === channel)) {
          sum += r.amountUsd ?? 0
        }
      }
      return sum
    },
  }
  return { db, rows }
}

const CAPS = { dailyUsd: 100, channelDailyUsd: 50 }

beforeEach(() => {
  registerExecutor('OTHER', async (payload) => ({ ran: true, payload }))
  registerExecutor('SPEND', async () => ({ charged: true }))
})

async function propose(db: OutboxDb, kind: OutboxKind, amountUsd?: number, channel?: string) {
  return proposeAction(
    { kind, title: `${kind} test`, payload: { a: 1 }, proposedBy: 'test-agent', amountUsd, channel },
    db
  )
}

describe('outbox approval wall (G1)', () => {
  it('ACCEPTANCE: an un-approved action cannot execute', async () => {
    const { db } = makeDb()
    const { id, status } = await propose(db, 'OTHER')
    expect(status).toBe('pending_approval')
    await expect(executeAction(id, db, CAPS)).rejects.toThrow(OutboxRefusalError)
    await expect(executeAction(id, db, CAPS)).rejects.toThrow(/REFUSED/)
  })

  it('a rejected action cannot execute', async () => {
    const { db } = makeDb()
    const { id } = await propose(db, 'OTHER')
    await rejectAction(id, 'owner', 'no', db)
    await expect(executeAction(id, db, CAPS)).rejects.toThrow(/REJECTED/)
  })

  it('an approved action executes exactly once', async () => {
    const { db } = makeDb()
    const { id } = await propose(db, 'OTHER')
    await approveAction(id, 'owner', db)
    const result = await executeAction(id, db, CAPS)
    expect(result.ran).toBe(true)
    // Second execution refused: status is now EXECUTED, not APPROVED.
    await expect(executeAction(id, db, CAPS)).rejects.toThrow(OutboxRefusalError)
  })

  it('approval of a non-pending item is refused', async () => {
    const { db } = makeDb()
    const { id } = await propose(db, 'OTHER')
    await approveAction(id, 'owner', db)
    await expect(approveAction(id, 'owner', db)).rejects.toThrow(OutboxRefusalError)
  })

  it('a kind with no registered executor cannot execute even when approved', async () => {
    const { db } = makeDb()
    const { id } = await propose(db, 'MERGE')
    await approveAction(id, 'owner', db)
    await expect(executeAction(id, db, CAPS)).rejects.toThrow(/no executor/)
  })
})

describe('spend caps backstop (G2)', () => {
  it('a spend proposal without an amount is refused at proposal time', async () => {
    const { db } = makeDb()
    await expect(propose(db, 'SPEND')).rejects.toThrow(OutboxRefusalError)
  })

  it('ACCEPTANCE: an APPROVED spend over the daily cap still cannot execute', async () => {
    const { db } = makeDb()
    const { id } = await propose(db, 'SPEND', 150)
    await approveAction(id, 'owner', db)
    await expect(executeAction(id, db, CAPS)).rejects.toThrow(/daily cap/)
  })

  it('cumulative approved spends cannot overrun the daily cap', async () => {
    const { db } = makeDb()
    const a = await propose(db, 'SPEND', 60)
    await approveAction(a.id, 'owner', db)
    await executeAction(a.id, db, CAPS)

    const b = await propose(db, 'SPEND', 60)
    await approveAction(b.id, 'owner', db)
    await expect(executeAction(b.id, db, CAPS)).rejects.toThrow(/daily cap/)
  })

  it('per-channel cap binds independently of the daily cap', async () => {
    const { db } = makeDb()
    const { id } = await propose(db, 'SPEND', 60, 'x-ads')
    await approveAction(id, 'owner', db)
    await expect(executeAction(id, db, CAPS)).rejects.toThrow(/per-channel/)
  })

  it('zero caps mean no spend can execute at all (default posture)', async () => {
    const { db } = makeDb()
    const { id } = await propose(db, 'SPEND', 1)
    await approveAction(id, 'owner', db)
    await expect(executeAction(id, db, { dailyUsd: 0, channelDailyUsd: 0 })).rejects.toThrow(
      /daily cap/
    )
  })

  it('an in-cap approved spend executes and is counted', async () => {
    const { db } = makeDb()
    const { id } = await propose(db, 'SPEND', 40, 'x-ads')
    await approveAction(id, 'owner', db)
    const result = await executeAction(id, db, CAPS)
    expect(result.charged).toBe(true)
    expect(await db.executedSpendToday('x-ads')).toBe(40)
  })
})
