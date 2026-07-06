import { prisma } from '@/lib/db'
import { agentEnabled, killSwitchActive, type AgentName } from './config'
import { finishRun, logAction, startRun } from './runs'

// The orchestrator: reads queued agent tasks and dispatches each to its
// agent via the agent-as-tool pattern (every agent is a callable handler in
// this registry; later phases register real model-driven agents built on
// the Vercel AI SDK loop). Pure orchestration logic takes injected
// dependencies so the halt/dispatch behavior is unit-testable; the cron
// route wires in prisma-backed implementations.

export interface OrchestratorTask {
  id: string
  title: string
  description: string
  agent: string
}

export interface AgentHandler {
  (task: OrchestratorTask): Promise<{ summary: string }>
}

const registry = new Map<string, AgentHandler>()

export function registerAgent(name: string, handler: AgentHandler): void {
  registry.set(name, handler)
}

export function registeredAgents(): string[] {
  return [...registry.keys()]
}

// Stub agent (Gate 1 demo): proves the dispatch, logging, and audit-trail
// plumbing end to end without a model call.
registerAgent('noop', async (task) => ({
  summary: `noop agent acknowledged task "${task.title}" and did nothing, by design.`,
}))

export interface OrchestratorDeps {
  isKillSwitchActive(): boolean
  isAgentEnabled(agent: string): boolean
  fetchQueuedTasks(limit: number): Promise<OrchestratorTask[]>
  markTask(id: string, status: 'IN_PROGRESS' | 'DONE' | 'BLOCKED', result?: string): Promise<void>
  log(agent: string, task: OrchestratorTask, outcome: { ok: boolean; detail: string }): Promise<void>
}

export interface OrchestratorResult {
  halted: boolean
  dispatched: number
  outcomes: Array<{ taskId: string; agent: string; ok: boolean; detail: string }>
}

const MAX_TASKS_PER_TICK = 10

export async function runOrchestrator(deps: OrchestratorDeps): Promise<OrchestratorResult> {
  // G7 kill switch: one flag halts everything, checked before any dispatch.
  if (deps.isKillSwitchActive()) {
    return { halted: true, dispatched: 0, outcomes: [] }
  }

  const tasks = await deps.fetchQueuedTasks(MAX_TASKS_PER_TICK)
  const outcomes: OrchestratorResult['outcomes'] = []

  for (const task of tasks) {
    const handler = registry.get(task.agent)
    if (!handler) {
      await deps.markTask(task.id, 'BLOCKED', `No agent named "${task.agent}" is registered.`)
      outcomes.push({ taskId: task.id, agent: task.agent, ok: false, detail: 'unknown agent' })
      continue
    }
    if (task.agent !== 'noop' && !deps.isAgentEnabled(task.agent)) {
      // Disabled agents keep their queue; nothing is lost, nothing runs.
      outcomes.push({ taskId: task.id, agent: task.agent, ok: false, detail: 'agent disabled' })
      continue
    }

    await deps.markTask(task.id, 'IN_PROGRESS')
    try {
      const result = await handler(task)
      await deps.markTask(task.id, 'DONE', result.summary)
      await deps.log(task.agent, task, { ok: true, detail: result.summary })
      outcomes.push({ taskId: task.id, agent: task.agent, ok: true, detail: result.summary })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      await deps.markTask(task.id, 'BLOCKED', detail)
      await deps.log(task.agent, task, { ok: false, detail })
      outcomes.push({ taskId: task.id, agent: task.agent, ok: false, detail })
    }
  }

  return { halted: false, dispatched: outcomes.filter((o) => o.ok).length, outcomes }
}

// Production deps used by the cron route.
export function productionDeps(): OrchestratorDeps {
  return {
    isKillSwitchActive: killSwitchActive,
    isAgentEnabled: (agent) => agentEnabled(agent as AgentName),
    async fetchQueuedTasks(limit) {
      const rows = await prisma.agentTask.findMany({
        where: { status: 'QUEUED' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        take: limit,
      })
      return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, agent: r.agent }))
    },
    async markTask(id, status, result) {
      await prisma.agentTask.update({ where: { id }, data: { status, result } })
    },
    async log(agent, task, outcome) {
      const run = await startRun(agent, 'cron')
      await logAction(run, 'dispatch', { taskId: task.id, title: task.title }, outcome)
      await finishRun(run, {
        status: outcome.ok ? 'SUCCEEDED' : 'FAILED',
        summary: outcome.detail.slice(0, 500),
      })
    },
  }
}
