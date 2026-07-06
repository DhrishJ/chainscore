import { prisma } from '@/lib/db'
import { spendCaps } from './config'

// The approval wall (G1) and spend backstop (G2).
//
// Contract: agents call proposeAction() and get back a pending item; the
// tool result they see is "pending approval", never an execution. Only
// executeAction() performs anything, and it REFUSES - with an error, not a
// prompt - any item whose status is not APPROVED (a human flips that via
// the dashboard). SPEND items additionally pass the code-level cap check
// even after approval, so an approved budget cannot overrun (G2). Every
// transition is auditable on the row (decidedBy/decidedAt/executedAt).

export type OutboxKind = 'SPEND' | 'MERGE' | 'DEPLOY' | 'CONFIG' | 'OTHER'

export interface ProposeInput {
  kind: OutboxKind
  title: string
  payload: Record<string, unknown>
  proposedBy: string
  runId?: string
  amountUsd?: number
  channel?: string
}

export class OutboxRefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutboxRefusalError'
  }
}

// Executors registered per kind. A kind with no executor cannot execute at
// all (safe default): approval alone does nothing until code exists for it.
export type OutboxExecutor = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>
const executors = new Map<string, OutboxExecutor>()

export function registerExecutor(key: string, fn: OutboxExecutor): void {
  executors.set(key, fn)
}

// Minimal data access, injectable for tests.
export interface OutboxDb {
  create(data: {
    kind: OutboxKind
    title: string
    payloadJson: string
    proposedBy: string
    runId?: string
    amountUsd?: number
    channel?: string
  }): Promise<{ id: string }>
  get(id: string): Promise<{
    id: string
    kind: string
    status: string
    payloadJson: string
    amountUsd: number | null
    channel: string | null
    title: string
  } | null>
  setStatus(
    id: string,
    data: {
      status: 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED'
      decidedBy?: string
      decidedAt?: Date
      executedAt?: Date
      resultJson?: string
      note?: string
    }
  ): Promise<void>
  executedSpendToday(channel?: string): Promise<number>
}

function prismaDb(): OutboxDb {
  return {
    async create(data) {
      const row = await prisma.outboxItem.create({ data })
      return { id: row.id }
    },
    async get(id) {
      return prisma.outboxItem.findUnique({ where: { id } })
    },
    async setStatus(id, data) {
      await prisma.outboxItem.update({ where: { id }, data })
    },
    async executedSpendToday(channel) {
      const since = new Date()
      since.setUTCHours(0, 0, 0, 0)
      const rows = await prisma.outboxItem.findMany({
        where: {
          kind: 'SPEND',
          status: 'EXECUTED',
          executedAt: { gte: since },
          ...(channel ? { channel } : {}),
        },
        select: { amountUsd: true },
      })
      return rows.reduce((sum, r) => sum + (r.amountUsd ?? 0), 0)
    },
  }
}

export async function proposeAction(
  input: ProposeInput,
  db: OutboxDb = prismaDb()
): Promise<{ id: string; status: 'pending_approval' }> {
  if (input.kind === 'SPEND' && (input.amountUsd === undefined || input.amountUsd <= 0)) {
    throw new OutboxRefusalError('SPEND proposals must carry a positive amountUsd.')
  }
  const row = await db.create({
    kind: input.kind,
    title: input.title,
    payloadJson: JSON.stringify(input.payload),
    proposedBy: input.proposedBy,
    runId: input.runId,
    amountUsd: input.amountUsd,
    channel: input.channel,
  })
  return { id: row.id, status: 'pending_approval' }
}

export async function approveAction(id: string, decidedBy: string, db: OutboxDb = prismaDb()): Promise<void> {
  const item = await db.get(id)
  if (!item) throw new OutboxRefusalError(`Outbox item ${id} not found.`)
  if (item.status !== 'PENDING') {
    throw new OutboxRefusalError(`Outbox item ${id} is ${item.status}, not PENDING.`)
  }
  await db.setStatus(id, { status: 'APPROVED', decidedBy, decidedAt: new Date() })
}

export async function rejectAction(
  id: string,
  decidedBy: string,
  note?: string,
  db: OutboxDb = prismaDb()
): Promise<void> {
  const item = await db.get(id)
  if (!item) throw new OutboxRefusalError(`Outbox item ${id} not found.`)
  if (item.status !== 'PENDING') {
    throw new OutboxRefusalError(`Outbox item ${id} is ${item.status}, not PENDING.`)
  }
  await db.setStatus(id, { status: 'REJECTED', decidedBy, decidedAt: new Date(), note })
}

// THE control. Refuses anything not explicitly approved by a human, and for
// SPEND enforces the config caps as a backstop even after approval.
export async function executeAction(
  id: string,
  db: OutboxDb = prismaDb(),
  caps = spendCaps()
): Promise<Record<string, unknown>> {
  const item = await db.get(id)
  if (!item) throw new OutboxRefusalError(`Outbox item ${id} not found.`)

  if (item.status !== 'APPROVED') {
    throw new OutboxRefusalError(
      `REFUSED: outbox item ${id} ("${item.title}") is ${item.status}. Only a human-approved item can execute.`
    )
  }

  if (item.kind === 'SPEND') {
    const amount = item.amountUsd ?? 0
    const spentToday = await db.executedSpendToday()
    if (caps.dailyUsd <= 0 || spentToday + amount > caps.dailyUsd) {
      throw new OutboxRefusalError(
        `REFUSED: spend of $${amount} would exceed the daily cap ($${caps.dailyUsd}, $${spentToday} already spent). Caps are config, not judgment (G2).`
      )
    }
    if (item.channel) {
      const channelSpent = await db.executedSpendToday(item.channel)
      if (caps.channelDailyUsd <= 0 || channelSpent + amount > caps.channelDailyUsd) {
        throw new OutboxRefusalError(
          `REFUSED: spend of $${amount} on ${item.channel} would exceed the per-channel daily cap ($${caps.channelDailyUsd}, $${channelSpent} already spent).`
        )
      }
    }
  }

  const executor = executors.get(item.kind)
  if (!executor) {
    throw new OutboxRefusalError(
      `REFUSED: no executor is registered for kind ${item.kind}. Approval alone does nothing until code exists for this action.`
    )
  }

  try {
    const result = await executor(JSON.parse(item.payloadJson))
    await db.setStatus(id, {
      status: 'EXECUTED',
      executedAt: new Date(),
      resultJson: JSON.stringify(result),
    })
    return result
  } catch (e) {
    await db.setStatus(id, {
      status: 'FAILED',
      resultJson: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
    })
    throw e
  }
}
