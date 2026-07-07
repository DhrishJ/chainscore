import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { generateText, stepCountIs, tool, type LanguageModel } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { startRun, finishRun, logAction } from './runs'
import { checkWriteAllowed, normalizeRepoPath, ALLOWED_COMMANDS } from './repoGuard'

// The Engineering agent (Phase 3, G4): ships code up to, never through, the
// merge gate. It runs on a machine with git (the local runner script), not
// on serverless. Its ceiling is structural: the write tool refuses protected
// paths (repoGuard), the command tool runs only fixed allowlisted commands,
// branches are always agent/-prefixed, PRs are labeled and opened non-draft
// only after local gates pass, and NO merge or deploy tool exists anywhere.

const execFileAsync = promisify(execFile)
const MODEL_ID = 'claude-sonnet-5'
const USD_PER_INPUT_TOKEN = 3 / 1_000_000
const USD_PER_OUTPUT_TOKEN = 15 / 1_000_000
const MAX_STEPS = 48

const SYSTEM_PROMPT = `You are the Engineering agent for ChainScore, a Next.js 14 + TypeScript (strict) + Prisma + Tailwind codebase with zod at every boundary and Vitest tests. House style: conventional commits, small reviewable changes, tests with every feature, comments only for non-obvious constraints, no em dashes anywhere.

Your job: complete ONE assigned task by writing code and tests, verifying with the fixed gates (typecheck, lint, test), then committing on your agent/ branch and opening a pull request. You cannot merge, deploy, or touch protected paths (model/scoring, prisma, middleware, next.config, env, CI, agent guardrails); if the task requires a protected change, describe exactly what a human must do in the PR body instead of attempting it.

Method:
1. Read the task. Explore the repo (searchRepo, readFile) until you understand the existing patterns; imitate them.
2. Write the implementation and its tests with writeFile.
3. Run typecheck, lint, and test. Fix failures and re-run until green. If you cannot get green after several attempts, open the PR as draft with a diagnosis instead of thrashing.
4. commitAll with a conventional-commit message, then openPr. The PR body must state: what changed, test coverage, risk, and what you deliberately did not do.
Work strictly within the task scope. Do not refactor unrelated code.`

function buildTools(repoRoot: string, runId: string, branchName: string) {
  let prOpened = false

  async function git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd: repoRoot, maxBuffer: 10_000_000 })
    return stdout
  }

  return {
    tools: {
      searchRepo: tool({
        description: 'Search file contents with a regex (ripgrep). Returns matching lines with paths.',
        inputSchema: z.object({ pattern: z.string().max(200), glob: z.string().max(100).optional() }),
        execute: async ({ pattern, glob }) => {
          try {
            const args = ['--line-number', '--max-count', '5', '--max-columns', '240', pattern]
            if (glob) args.push('--glob', glob)
            const { stdout } = await execFileAsync('rg', args, { cwd: repoRoot, maxBuffer: 10_000_000 })
            return stdout.slice(0, 8_000) || 'no matches'
          } catch {
            return 'no matches'
          }
        },
      }),
      listFiles: tool({
        description: 'List files under a directory (relative to repo root).',
        inputSchema: z.object({ dir: z.string().max(200) }),
        execute: async ({ dir }) => {
          const rel = normalizeRepoPath(repoRoot, dir)
          if (rel === null) return 'ERROR: path escapes the repository'
          const entries = await fs.readdir(path.join(repoRoot, rel), { withFileTypes: true })
          return entries
            .filter((e) => !['node_modules', '.next', '.git'].includes(e.name))
            .map((e) => (e.isDirectory() ? e.name + '/' : e.name))
            .join('\n')
        },
      }),
      readFile: tool({
        description: 'Read a file (relative to repo root).',
        inputSchema: z.object({ file: z.string().max(300) }),
        execute: async ({ file }) => {
          const rel = normalizeRepoPath(repoRoot, file)
          if (rel === null) return 'ERROR: path escapes the repository'
          const text = await fs.readFile(path.join(repoRoot, rel), 'utf8')
          return text.length > 40_000 ? text.slice(0, 40_000) + '\n...truncated' : text
        },
      }),
      writeFile: tool({
        description:
          'Write a file (relative to repo root). Protected paths are refused; do not retry them.',
        inputSchema: z.object({ file: z.string().max(300), content: z.string().max(120_000) }),
        execute: async ({ file, content }) => {
          const guard = checkWriteAllowed(repoRoot, file)
          if (!guard.allowed) return `REFUSED: ${guard.reason}`
          const rel = normalizeRepoPath(repoRoot, file)!
          const target = path.join(repoRoot, rel)
          await fs.mkdir(path.dirname(target), { recursive: true })
          await fs.writeFile(target, content, 'utf8')
          return `wrote ${rel} (${content.length} chars)`
        },
      }),
      runGate: tool({
        description: 'Run a verification gate: typecheck, lint, or test. Fixed commands only.',
        inputSchema: z.object({ gate: z.enum(['typecheck', 'lint', 'test']) }),
        execute: async ({ gate }) => {
          const cmd = ALLOWED_COMMANDS[gate]
          try {
            const { stdout, stderr } = await execFileAsync(cmd[0], cmd.slice(1), {
              cwd: repoRoot,
              maxBuffer: 20_000_000,
              timeout: 300_000,
              shell: process.platform === 'win32',
            })
            return `PASS\n${(stdout + stderr).slice(-3_000)}`
          } catch (e) {
            const err = e as { stdout?: string; stderr?: string; message: string }
            return `FAIL\n${((err.stdout ?? '') + (err.stderr ?? '') + err.message).slice(-6_000)}`
          }
        },
      }),
      commitAll: tool({
        description: 'Stage and commit all changes with a conventional-commit message.',
        inputSchema: z.object({ message: z.string().min(10).max(2_000) }),
        execute: async ({ message }) => {
          await git('add', '-A')
          await git('commit', '-m', `${message}\n\nCo-Authored-By: ChainScore Engineering Agent <noreply@chainscore.dev>`)
          const head = (await git('rev-parse', '--short', 'HEAD')).trim()
          return `committed ${head} on ${branchName}`
        },
      }),
      openPr: tool({
        description:
          'Push the branch and open the pull request (labeled "agent"). Call once, after gates pass. draft=true if you could not get gates green.',
        inputSchema: z.object({
          title: z.string().min(10).max(120),
          body: z.string().min(50).max(10_000),
          draft: z.boolean(),
        }),
        execute: async ({ title, body, draft }) => {
          if (prOpened) return 'REFUSED: a PR was already opened for this run.'
          await git('push', '-u', 'origin', branchName)
          const args = [
            'pr', 'create', '--head', branchName, '--title', title,
            '--body', `${body}\n\nOpened by the ChainScore Engineering agent (run ${runId}). A human reviews and merges; this agent cannot (G4).`,
            '--label', 'agent',
          ]
          if (draft) args.push('--draft')
          try {
            const { stdout } = await execFileAsync('gh', args, { cwd: repoRoot, shell: process.platform === 'win32' })
            prOpened = true
            return stdout.trim()
          } catch (e) {
            const err = e as { stderr?: string; message: string }
            // Label may not exist yet; retry once without it.
            if ((err.stderr ?? '').includes('label')) {
              const noLabel = args.filter((a, i) => a !== '--label' && args[i - 1] !== '--label')
              const { stdout } = await execFileAsync('gh', noLabel, { cwd: repoRoot, shell: process.platform === 'win32' })
              prOpened = true
              return stdout.trim()
            }
            throw e
          }
        },
      }),
    },
    wasPrOpened: () => prOpened,
  }
}

export interface EngineeringRunResult {
  prOpened: boolean
  costUsd: number
  steps: number
  summary: string
}

export async function runEngineeringAgent(
  task: { id: string; title: string; description: string },
  repoRoot: string,
  model: LanguageModel = anthropic(MODEL_ID)
): Promise<EngineeringRunResult> {
  const run = await startRun('engineering', 'manual')
  const branchName = `agent/${task.id.slice(-8)}-${task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-|-$/g, '')}`

  try {
    // Fresh branch off current master; the runner guarantees a clean tree.
    await execFileAsync('git', ['checkout', '-b', branchName], { cwd: repoRoot })

    const { tools, wasPrOpened } = buildTools(repoRoot, run.id, branchName)
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `Task ${task.id}: ${task.title}\n\n${task.description}\n\nYou are on branch ${branchName}. Begin by exploring the relevant code.`,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
    })

    const inputTokens = result.usage?.inputTokens ?? 0
    const outputTokens = result.usage?.outputTokens ?? 0
    const costUsd = inputTokens * USD_PER_INPUT_TOKEN + outputTokens * USD_PER_OUTPUT_TOKEN

    for (const step of result.steps) {
      for (const call of step.toolCalls) {
        await logAction(run, call.toolName, call.input, 'executed')
      }
    }

    const summary = `${wasPrOpened() ? 'PR opened.' : 'No PR opened.'} ${result.text?.slice(0, 300) ?? ''}`
    await finishRun(run, {
      status: wasPrOpened() ? 'SUCCEEDED' : 'FAILED',
      summary,
      model: MODEL_ID,
      inputTokens,
      outputTokens,
      costUsd,
    })
    return { prOpened: wasPrOpened(), costUsd, steps: result.steps.length, summary }
  } catch (e) {
    await finishRun(run, {
      status: 'FAILED',
      error: e instanceof Error ? e.message.slice(0, 500) : String(e),
    })
    throw e
  }
}
