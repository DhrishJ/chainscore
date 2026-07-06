import { describe, expect, it } from 'vitest'
import {
  registerAgent,
  registeredAgents,
  runOrchestrator,
  type OrchestratorDeps,
  type OrchestratorTask,
} from '@/lib/agents/orchestrator'

function makeDeps(overrides: Partial<OrchestratorDeps> & { tasks?: OrchestratorTask[] }): {
  deps: OrchestratorDeps
  marks: Array<{ id: string; status: string; result?: string }>
  logs: Array<{ agent: string; ok: boolean }>
} {
  const marks: Array<{ id: string; status: string; result?: string }> = []
  const logs: Array<{ agent: string; ok: boolean }> = []
  const deps: OrchestratorDeps = {
    isKillSwitchActive: () => false,
    isAgentEnabled: () => true,
    fetchQueuedTasks: async () => overrides.tasks ?? [],
    markTask: async (id, status, result) => {
      marks.push({ id, status, result })
    },
    log: async (agent, _task, outcome) => {
      logs.push({ agent, ok: outcome.ok })
    },
    ...overrides,
  }
  return { deps, marks, logs }
}

const NOOP_TASK: OrchestratorTask = {
  id: 't1',
  title: 'Gate 1 demo task',
  description: 'Dispatch me to the stub agent.',
  agent: 'noop',
}

describe('orchestrator', () => {
  it('the stub noop agent is registered by default', () => {
    expect(registeredAgents()).toContain('noop')
  })

  it('ACCEPTANCE: kill switch halts everything before any dispatch', async () => {
    let fetched = false
    const { deps } = makeDeps({
      isKillSwitchActive: () => true,
      fetchQueuedTasks: async () => {
        fetched = true
        return [NOOP_TASK]
      },
    })
    const result = await runOrchestrator(deps)
    expect(result.halted).toBe(true)
    expect(result.dispatched).toBe(0)
    expect(fetched).toBe(false)
  })

  it('dispatches a queued task to the stub agent and records the audit trail', async () => {
    const { deps, marks, logs } = makeDeps({ tasks: [NOOP_TASK] })
    const result = await runOrchestrator(deps)
    expect(result.halted).toBe(false)
    expect(result.dispatched).toBe(1)
    expect(result.outcomes[0].detail).toContain('noop agent acknowledged')
    expect(marks.map((m) => m.status)).toEqual(['IN_PROGRESS', 'DONE'])
    expect(logs).toEqual([{ agent: 'noop', ok: true }])
  })

  it('blocks tasks for unknown agents without crashing the tick', async () => {
    const { deps, marks } = makeDeps({
      tasks: [{ ...NOOP_TASK, id: 't2', agent: 'ghost' }, NOOP_TASK],
    })
    const result = await runOrchestrator(deps)
    expect(result.dispatched).toBe(1)
    expect(marks.find((m) => m.id === 't2')?.status).toBe('BLOCKED')
  })

  it('skips disabled agents but keeps their tasks queued', async () => {
    registerAgent('strategy', async () => ({ summary: 'should not run' }))
    const { deps, marks } = makeDeps({
      tasks: [{ ...NOOP_TASK, id: 't3', agent: 'strategy' }],
      isAgentEnabled: () => false,
    })
    const result = await runOrchestrator(deps)
    expect(result.dispatched).toBe(0)
    expect(marks).toHaveLength(0)
    expect(result.outcomes[0].detail).toBe('agent disabled')
  })

  it('a throwing agent marks the task BLOCKED and logs a failed run', async () => {
    registerAgent('flaky', async () => {
      throw new Error('boom')
    })
    const { deps, marks, logs } = makeDeps({
      tasks: [{ ...NOOP_TASK, id: 't4', agent: 'flaky' }],
    })
    const result = await runOrchestrator(deps)
    expect(result.dispatched).toBe(0)
    expect(marks.find((m) => m.id === 't4' && m.status === 'BLOCKED')).toBeTruthy()
    expect(logs).toEqual([{ agent: 'flaky', ok: false }])
  })
})
