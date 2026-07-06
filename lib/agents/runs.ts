import { prisma } from '@/lib/db'

// Audit trail (G7): every agent run and every tool call is a row, with
// inputs, outputs, cost, and the model used. The [agent-run] / [agent-action]
// console lines are the structured-log mirror for Vercel Runtime Logs.

export interface RunHandle {
  id: string
  agent: string
}

export async function startRun(agent: string, trigger: 'cron' | 'manual'): Promise<RunHandle> {
  const run = await prisma.agentRun.create({ data: { agent, trigger } })
  console.log(`[agent-run] ${JSON.stringify({ event: 'start', id: run.id, agent, trigger })}`)
  return { id: run.id, agent }
}

export async function finishRun(
  handle: RunHandle,
  outcome: {
    status: 'SUCCEEDED' | 'FAILED' | 'HALTED'
    summary?: string
    error?: string
    model?: string
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
  }
): Promise<void> {
  await prisma.agentRun.update({
    where: { id: handle.id },
    data: { ...outcome, costUsd: outcome.costUsd ?? 0, finishedAt: new Date() },
  })
  console.log(
    `[agent-run] ${JSON.stringify({ event: 'finish', id: handle.id, agent: handle.agent, ...outcome })}`
  )
}

export async function logAction(
  handle: RunHandle,
  tool: string,
  input: unknown,
  output: unknown,
  opts?: { status?: string; costUsd?: number }
): Promise<void> {
  await prisma.agentAction.create({
    data: {
      runId: handle.id,
      tool,
      inputJson: JSON.stringify(input ?? null),
      outputJson: JSON.stringify(output ?? null),
      status: opts?.status ?? 'executed',
      costUsd: opts?.costUsd ?? 0,
    },
  })
  console.log(
    `[agent-action] ${JSON.stringify({ runId: handle.id, tool, status: opts?.status ?? 'executed' })}`
  )
}
