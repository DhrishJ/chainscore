import path from 'node:path'

// The Engineering agent's hard limits (G4/G8), enforced as path checks the
// write tool runs BEFORE touching disk. A protected path returns an error
// to the model; there is no override parameter. The merge/deploy limits
// need no guard because no merge or deploy tool exists at all.

// Everything the agent may never write. Globs are prefix/suffix simple
// patterns, matched against repo-relative posix paths.
const PROTECTED: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^ml\//, reason: 'model artifacts (G8: never touch scoring)' },
  { pattern: /^model\//, reason: 'training pipeline (G8)' },
  { pattern: /^lib\/data\/mlScorer\.ts$/, reason: 'scoring logic (G8)' },
  { pattern: /^lib\/data\/solanaScorer\.ts$/, reason: 'scoring logic (G8)' },
  { pattern: /^lib\/integrity\//, reason: 'integrity penalties feed scores (G8)' },
  { pattern: /^prisma\//, reason: 'schema and RLS are human-gated (G4); request via PR description' },
  { pattern: /^middleware\.ts$/, reason: 'auth, rate limits, admin gate (G4)' },
  { pattern: /^next\.config\.js$/, reason: 'CSP lives here; never widen (G4)' },
  { pattern: /^lib\/env\.(server|client)\.ts$/, reason: 'secrets surface (G4)' },
  { pattern: /^\.env/, reason: 'secrets (G4)' },
  { pattern: /^\.github\//, reason: 'CI is the quality gate; agents do not modify their own gates' },
  { pattern: /^vercel\.json$/, reason: 'deploy configuration (G4)' },
  { pattern: /^scripts\/check-client-secrets\.mjs$/, reason: 'secret scanner (G4)' },
  { pattern: /^lib\/agents\//, reason: 'agents do not rewrite their own guardrails' },
  { pattern: /^lib\/facts\//, reason: 'the truth layer is human-maintained (G3)' },
]

export interface GuardResult {
  allowed: boolean
  reason?: string
}

export function normalizeRepoPath(repoRoot: string, requested: string): string | null {
  const resolved = path.resolve(repoRoot, requested)
  const relative = path.relative(repoRoot, resolved)
  // Escapes the repo (absolute elsewhere or ../) are always refused.
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return relative.split(path.sep).join('/')
}

export function checkWriteAllowed(repoRoot: string, requested: string): GuardResult {
  const relative = normalizeRepoPath(repoRoot, requested)
  if (relative === null) {
    return { allowed: false, reason: 'Path escapes the repository root.' }
  }
  for (const rule of PROTECTED) {
    if (rule.pattern.test(relative)) {
      return {
        allowed: false,
        reason: `Protected path (${rule.reason}). Open the PR with a written request for a human to make this change instead.`,
      }
    }
  }
  return { allowed: true }
}

// Commands the agent may run, exactly as written. No arbitrary shell.
export const ALLOWED_COMMANDS: Record<string, string[]> = {
  typecheck: ['npx', 'tsc', '--noEmit'],
  lint: ['npm', 'run', 'lint'],
  test: ['npx', 'vitest', 'run'],
}
