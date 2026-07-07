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
    // Return the runner to a CLEAN master no matter how the run ended
    // (lesson from the first failed run, which carried an abandoned task's
    // uncommitted files back to master). Anything worth keeping was pushed
    // with the PR; local leftovers of a failed run are debris by definition.
    try {
      const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot }).toString().trim()
      if (dirty) {
        execFileSync('git', ['reset', '--hard'], { cwd: repoRoot })
        execFileSync('git', ['clean', '-fd'], { cwd: repoRoot })
        console.log('Runner reset a dirty tree left by the run.')
      }
      execFileSync('git', ['checkout', 'master'], { cwd: repoRoot })
      // Prune the agent branch when it never produced a PR.
      const branches = execFileSync('git', ['branch', '--list', 'agent/*'], { cwd: repoRoot })
        .toString()
        .split('\n')
        .map((b) => b.replace('*', '').trim())
        .filter(Boolean)
      for (const b of branches) {
        const pushed = execFileSync('git', ['ls-remote', '--heads', 'origin', b], { cwd: repoRoot })
          .toString()
          .trim()
        if (!pushed) execFileSync('git', ['branch', '-D', b], { cwd: repoRoot })
      }
    } catch (cleanupError) {
      console.error('Runner cleanup incomplete:', cleanupError)
    }
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
