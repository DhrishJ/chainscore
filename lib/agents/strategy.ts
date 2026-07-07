import { generateText, stepCountIs, tool, type LanguageModel } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { PLANS } from '@/lib/pricing/plans'
import { UNIT_ECONOMICS, tierEconomics } from '@/lib/pricing/economics'
import { registerAgent, type OrchestratorTask } from './orchestrator'
import { startRun, finishRun, logAction } from './runs'

// The Strategy agent (Phase 2, G5): a synthetic operator that PROPOSES and
// never executes. Every tool below writes a proposal row (goals, kpis,
// agent_tasks) or the operator update (decision_log). There is no executor,
// no money movement, no production change anywhere in this file; anything
// gated would go through the outbox, and this agent has no outbox executor
// either. Runs on the Vercel AI SDK loop with Anthropic.

const MODEL_ID = 'claude-sonnet-5'
// Anthropic list pricing for the model, used for per-run cost accounting.
const USD_PER_INPUT_TOKEN = 3 / 1_000_000
const USD_PER_OUTPUT_TOKEN = 15 / 1_000_000

export interface StrategyContext {
  kpis: Array<{ key: string; name: string; current: number | null; target: number | null }>
  usageThisPeriod: Array<{ period: string; scores: number }>
  apiKeysActive: number
  pendingTasks: Array<{ agent: string; title: string; status: string }>
  verifiedFactKeys: string[]
  plans: typeof PLANS
  unitEconomics: typeof UNIT_ECONOMICS
  tierMargins: ReturnType<typeof tierEconomics>
  recentDecisions: Array<{ actor: string; summary: string }>
}

export async function assembleContext(): Promise<StrategyContext> {
  const [kpis, usage, keys, tasks, facts, decisions] = await Promise.all([
    prisma.kpi.findMany({ orderBy: { key: 'asc' } }),
    prisma.usageRecord.findMany({ orderBy: { period: 'desc' }, take: 3 }),
    prisma.apiKey.count({ where: { revokedAt: null } }),
    prisma.agentTask.findMany({
      where: { status: { in: ['QUEUED', 'IN_PROGRESS', 'BLOCKED'] } },
      take: 20,
    }),
    prisma.factsRegistry.findMany({ where: { verified: true }, select: { key: true } }),
    prisma.decisionLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
  ])
  return {
    kpis: kpis.map((k) => ({ key: k.key, name: k.name, current: k.current, target: k.target })),
    usageThisPeriod: usage.map((u) => ({ period: u.period, scores: u.scores })),
    apiKeysActive: keys,
    pendingTasks: tasks.map((t) => ({ agent: t.agent, title: t.title, status: t.status })),
    verifiedFactKeys: facts.map((f) => f.key),
    plans: PLANS,
    unitEconomics: UNIT_ECONOMICS,
    tierMargins: tierEconomics(),
    recentDecisions: decisions.map((d) => ({ actor: d.actor, summary: d.summary })),
  }
}

const SYSTEM_PROMPT = `You are the Strategy agent for ChainScore (chainscore.dev), an onchain credit-scoring product: a 300 to 850 borrower score with calibrated default probability, a published backtest, and a metered partner API. The spearhead is B2B risk infrastructure; the free consumer score check is the top-of-funnel hook; the marketplace is demoted pending a product decision.

Your role (G5): you PROPOSE, you never execute. Your tools write proposals and one operator update. You cannot move money, change production, or commit anything. A human reads everything you produce on the /admin/autopilot dashboard and in the nightly digest.

Ground rules:
- Cite the data you used from the provided context in every recommendation. Do not invent metrics; the only numbers you may state are in the context or produced by arithmetic you show.
- The company stage is pre-revenue with a freshly launched honest site, working metering, and no marketing distribution yet. Weight your proposals accordingly.
- Propose at most 5 KPIs, 2 goals, and 6 sprint tasks per run. Tasks must name their agent: engineering, marketing, or human (for gated work like Stripe keys or account creation).
- Finish with exactly one operator update (writeOperatorUpdate): what moved, what is stuck, what you recommend, what needs a human decision. Plain prose, no em dashes.`

// Proposal tools. Every one writes rows a human reviews; none executes.
function buildTools(runId: string) {
  return {
    proposeKpi: tool({
      description: 'Propose a KPI with a definition, current value if known, and target.',
      inputSchema: z.object({
        key: z.string().regex(/^[a-z0-9_]+$/),
        name: z.string().max(120),
        definition: z.string().max(500),
        current: z.number().nullable(),
        target: z.number().nullable(),
        unit: z.string().max(20).nullable(),
      }),
      execute: async (input) => {
        await prisma.kpi.upsert({
          where: { key: input.key },
          update: { ...input, current: input.current, updatedBy: 'strategy' },
          create: { ...input, updatedBy: 'strategy' },
        })
        return { recorded: true, key: input.key }
      },
    }),
    proposeGoal: tool({
      description: 'Propose a high-level goal with rationale (status stays "proposed" until a human accepts).',
      inputSchema: z.object({
        title: z.string().max(160),
        description: z.string().max(1000),
        rationale: z.string().max(1000),
        quarter: z.string().max(10).nullable(),
      }),
      execute: async (input) => {
        const goal = await prisma.goal.create({
          data: { ...input, createdBy: 'strategy', status: 'proposed' },
        })
        return { recorded: true, id: goal.id }
      },
    }),
    proposeAgentTask: tool({
      description:
        'Queue a sprint task for an agent (engineering/marketing) or a human. Tasks for agents run only when that agent is enabled; human tasks appear on the dashboard.',
      inputSchema: z.object({
        agent: z.enum(['engineering', 'marketing', 'human']),
        title: z.string().max(160),
        description: z.string().max(2000),
        priority: z.number().int().min(1).max(5),
      }),
      execute: async (input) => {
        const task = await prisma.agentTask.create({
          data: { ...input, createdBy: 'strategy' },
        })
        return { recorded: true, id: task.id }
      },
    }),
    writeOperatorUpdate: tool({
      description:
        'Write the operator update: what moved, what is stuck, recommendations, decisions needed from the human.',
      inputSchema: z.object({
        summary: z.string().max(200),
        update: z.string().max(8000),
      }),
      execute: async (input) => {
        await prisma.decisionLog.create({
          data: {
            actor: 'strategy',
            summary: `Operator update: ${input.summary}`,
            detail: input.update,
          },
        })
        return { recorded: true, runId }
      },
    }),
  }
}

export interface StrategyRunResult {
  summary: string
  costUsd: number
  toolCalls: number
}

export async function runStrategyAgent(
  trigger: 'cron' | 'manual',
  model: LanguageModel = anthropic(MODEL_ID)
): Promise<StrategyRunResult> {
  const run = await startRun('strategy', trigger)
  try {
    const context = await assembleContext()
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `Company context as of ${new Date().toISOString().slice(0, 10)}:\n\n${JSON.stringify(context, null, 2)}\n\nProduce your proposals and finish with the operator update.`,
      tools: buildTools(run.id),
      stopWhen: stepCountIs(8),
    })

    const inputTokens = result.usage?.inputTokens ?? 0
    const outputTokens = result.usage?.outputTokens ?? 0
    const costUsd = inputTokens * USD_PER_INPUT_TOKEN + outputTokens * USD_PER_OUTPUT_TOKEN
    const toolCalls = result.steps.flatMap((s) => s.toolCalls).length

    for (const step of result.steps) {
      for (const call of step.toolCalls) {
        await logAction(run, call.toolName, call.input, 'recorded', { costUsd: 0 })
      }
    }

    const summary = `Proposed via ${toolCalls} tool calls. ${result.text?.slice(0, 300) ?? ''}`
    await finishRun(run, {
      status: 'SUCCEEDED',
      summary,
      model: MODEL_ID,
      inputTokens,
      outputTokens,
      costUsd,
    })
    return { summary, costUsd, toolCalls }
  } catch (e) {
    await finishRun(run, {
      status: 'FAILED',
      error: e instanceof Error ? e.message.slice(0, 500) : String(e),
    })
    throw e
  }
}

// Orchestrator registration: strategy tasks all funnel into one run.
registerAgent('strategy', async (task: OrchestratorTask) => {
  const result = await runStrategyAgent('cron')
  return { summary: `Strategy run for "${task.title}": ${result.summary.slice(0, 300)}` }
})
