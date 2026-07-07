// Local runner for the Engineering agent (Phase 3).
//
//   node --env-file=.env.local --import tsx scripts/runEngineeringAgent.ts [taskId]
//
// Runs on a machine with git and gh (serverless cannot host a coding agent);
// the orchestrator's serverless dispatch does not handle engineering tasks,
// they wait here. Picks the given task or the highest-priority QUEUED
// engineering task, requires a clean tree on master, hands the repo to the
// agent, and records the outcome on the task row. The agent opens a PR at
// most; merge and deploy remain human actions (G4).

import { execFileSync } from 'node:child_process'
import { prisma } from '@/lib/db'
import { runEngineeringAgent } from '@/lib/agents/engineering'

async function main(): Promise<void> {
  const repoRoot = process.cwd()

  const status = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot }).toString().trim()
  if (status) {
    console.error('Refusing to run: working tree is not clean.')
    process.exit(2)
  }
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot })
    .toString()
    .trim()
  if (branch !== 'master') {
    console.error(`Refusing to run: on branch ${branch}, expected master.`)
    process.exit(2)
  }

  const taskId = process.argv[2]
  const task = taskId
    ? await prisma.agentTask.findUnique({ where: { id: taskId } })
    : await prisma.agentTask.findFirst({
        where: { agent: 'engineering', status: 'QUEUED' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      })

  if (!task) {
    console.log('No queued engineering task.')
    process.exit(0)
  }

  console.log(`Picking up task ${task.id}: ${task.title}`)
  await prisma.agentTask.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } })

  try {
    const result = await runEngineeringAgent(
      { id: task.id, title: task.title, description: task.description },
      repoRoot
    )
    await prisma.agentTask.update({
      where: { id: task.id },
      data: {
        status: result.prOpened ? 'DONE' : 'BLOCKED',
        result: result.summary.slice(0, 1_000),
      },
    })
    console.log(
      JSON.stringify({ prOpened: result.prOpened, steps: result.steps, costUsd: result.costUsd.toFixed(4) })
    )
  } catch (e) {
    await prisma.agentTask.update({
      where: { id: task.id },
      data: { status: 'BLOCKED', result: e instanceof Error ? e.message.slice(0, 1_000) : String(e) },
    })
    throw e
  } finally {
    // Always return the runner to master so the next run starts clean.
    try {
      execFileSync('git', ['checkout', 'master'], { cwd: repoRoot })
    } catch {
      // leave as-is; the human will see the branch state
    }
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
