import { generateText, stepCountIs, tool, type LanguageModel } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { registerAgent, type OrchestratorTask } from './orchestrator'
import { startRun, finishRun, logAction } from './runs'
import { publishContent, PublishBlockedError, CADENCE_CAPS, type Channel } from './publish'

// The Marketing agent (Phase 4, G6): full content autonomy. It writes and
// publishes on its own judgment; there is no approval state anywhere in the
// pipeline. Its only brakes are the automated ones in publish.ts (facts
// validator, anti-fraud, cadence caps) which return errors it can read and
// react to, exactly like a compiler. Anything paid is not reachable from
// here; spend lives behind the outbox.

const MODEL_ID = 'claude-sonnet-5'
const USD_PER_INPUT_TOKEN = 3 / 1_000_000
const USD_PER_OUTPUT_TOKEN = 15 / 1_000_000
const MAX_STEPS = 24

const SYSTEM_PROMPT = `You are the Marketing agent for ChainScore (chainscore.dev), onchain credit risk infrastructure: a 300 to 850 borrower score with calibrated default probability and a fully published backtest at chainscore.dev/retrospective. The buyer is B2B (DeFi lenders, protocol risk teams, their developers); the free wallet score check at chainscore.dev is the top-of-funnel hook. BRAND_VOICE.md governs tone: quantitative, disarmingly honest, direct, builder-to-builder, contrarian where the data is, memes welcome when they carry a real point. "onchain" one word. No em dashes ever.

You publish autonomously. Nothing you produce waits for a human. Three code-level brakes will reject bad content with an error you can read: the Facts Registry validator (any number you state must be a verified registry entry, in its registered wording; call listVerifiedFacts first and quote exactly), the anti-fraud check (no invented partnerships, endorsements, testimonials, or impersonation; naming chains/protocols we factually read is fine), and per-channel cadence caps. If publish returns BLOCKED, read the reason, fix the content honestly (never by weaseling the same lie differently), and retry once.

Registered claims you may use, verbatim wordings: "40,000 wallets analyzed in training", "88% of liquidations flagged in backtest" (always near its honest companion "48% false positive rate at the operating point" when discussing performance), "250K+ borrower records ingested", "20K+ liquidated wallets in the data", "7 EVM networks plus Solana", "300 to 850", "ROC-AUC 0.849". The retrospective link is the standard proof asset.

Channels: x and farcaster (crypto-native, high volume ok), email (useful over frequent, must contain {{unsubscribe_url}}), seo (draft genuinely useful pages; they ship through code review), video (produce complete packages: hook, script, shot list, caption). Use draftIdea for calendar planning, publish to actually post, packageVideo for video.`

function buildTools(runId: string) {
  return {
    listVerifiedFacts: tool({
      description: 'List every verified Facts Registry entry: key, value, and the wording rules in its definition.',
      inputSchema: z.object({}),
      execute: async () => {
        const facts = await prisma.factsRegistry.findMany({ where: { verified: true } })
        return facts.map((f) => ({ key: f.key, value: f.value, definition: f.definition.slice(0, 300) }))
      },
    }),
    draftIdea: tool({
      description: 'Add a content idea to the calendar (status IDEA) with a scheduled date. Use for planning; publish separately when the date arrives.',
      inputSchema: z.object({
        channel: z.enum(['x', 'farcaster', 'email', 'seo', 'video']),
        title: z.string().max(160),
        body: z.string().max(6_000),
        scheduledFor: z.string().describe('ISO date, e.g. 2026-07-09'),
      }),
      execute: async (input) => {
        const item = await prisma.contentItem.create({
          data: {
            channel: input.channel,
            status: 'IDEA',
            title: input.title,
            body: input.body,
            scheduledFor: new Date(input.scheduledFor),
          },
        })
        return { calendared: true, id: item.id }
      },
    }),
    publish: tool({
      description:
        'Publish content NOW through the gated pipeline. Returns POSTED, or GENERATED (channel not configured yet or cadence-deferred; stored ready-to-post), or a BLOCKED error explaining exactly which brake fired.',
      inputSchema: z.object({
        channel: z.enum(['x', 'farcaster', 'email', 'seo', 'video']),
        title: z.string().max(200).optional(),
        body: z.string().max(20_000),
        factKeys: z.array(z.string()).max(10).optional(),
      }),
      execute: async (input) => {
        try {
          const result = await publishContent({
            channel: input.channel as Channel,
            title: input.title,
            body: input.body,
            factKeys: input.factKeys,
          })
          return result
        } catch (e) {
          if (e instanceof PublishBlockedError) return { status: 'BLOCKED', note: e.message }
          throw e
        }
      },
    }),
    packageVideo: tool({
      description: 'Produce a complete, production-ready video package (hook, script, shot list, caption) as a handoff.',
      inputSchema: z.object({
        title: z.string().max(160),
        hook: z.string().max(300).describe('the first two seconds'),
        script: z.string().max(6_000),
        shotList: z.array(z.string().max(200)).max(20),
        caption: z.string().max(1_000),
        platform: z.enum(['tiktok', 'reels', 'youtube-shorts']),
      }),
      execute: async (input) => {
        const item = await prisma.contentItem.create({
          data: {
            channel: 'video',
            status: 'GENERATED',
            title: input.title,
            body: JSON.stringify(input, null, 2),
          },
        })
        return { packaged: true, id: item.id }
      },
    }),
    recentContent: tool({
      description: 'See the most recent calendar and published content, to avoid repeating yourself.',
      inputSchema: z.object({}),
      execute: async () => {
        const items = await prisma.contentItem.findMany({
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { channel: true, status: true, title: true, scheduledFor: true },
        })
        return items
      },
    }),
  }
}

export interface MarketingRunResult {
  summary: string
  costUsd: number
  toolCalls: number
}

export async function runMarketingAgent(
  trigger: 'cron' | 'manual',
  directive: string,
  model: LanguageModel = anthropic(MODEL_ID)
): Promise<MarketingRunResult> {
  const run = await startRun('marketing', trigger)
  try {
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: directive,
      tools: buildTools(run.id),
      stopWhen: stepCountIs(MAX_STEPS),
    })

    const inputTokens = result.usage?.inputTokens ?? 0
    const outputTokens = result.usage?.outputTokens ?? 0
    const costUsd = inputTokens * USD_PER_INPUT_TOKEN + outputTokens * USD_PER_OUTPUT_TOKEN
    const toolCalls = result.steps.flatMap((s) => s.toolCalls).length

    for (const step of result.steps) {
      for (const call of step.toolCalls) {
        await logAction(run, call.toolName, call.input, 'executed')
      }
    }

    const summary = `${toolCalls} content actions. ${result.text?.slice(0, 300) ?? ''}`
    await finishRun(run, { status: 'SUCCEEDED', summary, model: MODEL_ID, inputTokens, outputTokens, costUsd })
    return { summary, costUsd, toolCalls }
  } catch (e) {
    await finishRun(run, { status: 'FAILED', error: e instanceof Error ? e.message.slice(0, 500) : String(e) })
    throw e
  }
}

registerAgent('marketing', async (task: OrchestratorTask) => {
  const result = await runMarketingAgent(
    'cron',
    `Assigned task: ${task.title}\n\n${task.description}\n\nCadence caps per day: ${JSON.stringify(CADENCE_CAPS)}.`
  )
  return { summary: result.summary.slice(0, 400) }
})
