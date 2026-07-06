import { prisma } from '@/lib/db'
import { env } from '@/lib/env.server'

// Nightly digest: what each agent did, what awaits approval, what it cost.
// Emailed via Resend when configured; otherwise built and logged so the
// dashboard content and the email content never diverge.

export interface DigestResult {
  sent: boolean
  reason?: string
  text: string
}

export async function buildDigest(now = new Date()): Promise<string> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [runs, pending, spendToday] = await Promise.all([
    prisma.agentRun.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    }),
    prisma.outboxItem.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
    prisma.outboxItem.aggregate({
      where: { kind: 'SPEND', status: 'EXECUTED', executedAt: { gte: since } },
      _sum: { amountUsd: true },
    }),
  ])

  const lines: string[] = []
  lines.push(`ChainScore Autopilot digest, ${now.toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push(`Runs in the last 24h: ${runs.length}`)
  for (const r of runs.slice(0, 20)) {
    lines.push(
      `  [${r.status}] ${r.agent} (${r.trigger}) $${r.costUsd.toFixed(4)}: ${r.summary ?? r.error ?? ''}`.slice(0, 200)
    )
  }
  lines.push('')
  lines.push(`Awaiting your approval: ${pending.length}`)
  for (const p of pending) {
    const amount = p.amountUsd ? ` ($${p.amountUsd})` : ''
    lines.push(`  [${p.kind}]${amount} ${p.title} — proposed by ${p.proposedBy}`)
  }
  lines.push('')
  lines.push(`Spend executed in the last 24h: $${(spendToday._sum.amountUsd ?? 0).toFixed(2)}`)
  lines.push('')
  lines.push('Approve or reject at /admin/autopilot')
  return lines.join('\n')
}

export async function sendDigest(): Promise<DigestResult> {
  const text = await buildDigest()

  if (!env.RESEND_API_KEY || !env.DIGEST_EMAIL) {
    console.log(`[agent-digest] ${JSON.stringify({ sent: false, reason: 'resend not configured' })}`)
    return { sent: false, reason: 'RESEND_API_KEY or DIGEST_EMAIL not configured', text }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ChainScore Autopilot <autopilot@chainscore.dev>',
      to: [env.DIGEST_EMAIL],
      subject: `Autopilot digest ${new Date().toISOString().slice(0, 10)}`,
      text,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const reason = `resend http ${response.status}`
    console.error(`[agent-digest] ${JSON.stringify({ sent: false, reason })}`)
    return { sent: false, reason, text }
  }
  console.log(`[agent-digest] ${JSON.stringify({ sent: true })}`)
  return { sent: true, text }
}
