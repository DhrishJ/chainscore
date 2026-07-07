import { describe, expect, it } from 'vitest'
import { checkWriteAllowed, normalizeRepoPath, ALLOWED_COMMANDS } from '@/lib/agents/repoGuard'

const ROOT = process.cwd()

describe('engineering agent repo guard (G4/G8)', () => {
  it('ACCEPTANCE: refuses every protected surface', () => {
    const refused = [
      'ml/model.json',
      'model/config.yaml',
      'lib/data/mlScorer.ts',
      'lib/data/solanaScorer.ts',
      'lib/integrity/detectors.ts',
      'prisma/schema.prisma',
      'middleware.ts',
      'next.config.js',
      'lib/env.server.ts',
      'lib/env.client.ts',
      '.env.local',
      '.github/workflows/ci.yml',
      'vercel.json',
      'scripts/check-client-secrets.mjs',
      'lib/agents/outbox.ts',
      'lib/facts/validator.ts',
    ]
    for (const file of refused) {
      const result = checkWriteAllowed(ROOT, file)
      expect(result.allowed, `${file} must be refused`).toBe(false)
      expect(result.reason).toBeTruthy()
    }
  })

  it('allows normal application code', () => {
    for (const file of [
      'app/api/v1/usage/route.ts',
      'lib/format.ts',
      'components/Navbar.tsx',
      'tests/unit/format.test.ts',
      'docs/API.md',
    ]) {
      expect(checkWriteAllowed(ROOT, file).allowed, `${file} should be allowed`).toBe(true)
    }
  })

  it('refuses paths that escape the repository', () => {
    expect(checkWriteAllowed(ROOT, '../outside.txt').allowed).toBe(false)
    expect(checkWriteAllowed(ROOT, 'C:/Windows/system32/evil.ts').allowed).toBe(false)
    expect(normalizeRepoPath(ROOT, '../../etc/passwd')).toBeNull()
  })

  it('dotted traversal inside the repo cannot reach protected paths', () => {
    expect(checkWriteAllowed(ROOT, 'app/../ml/model.json').allowed).toBe(false)
    expect(checkWriteAllowed(ROOT, 'app/..\\..\\..\\anything').allowed).toBe(false)
  })

  it('command allowlist contains exactly the three gates and nothing shell-shaped', () => {
    expect(Object.keys(ALLOWED_COMMANDS).sort()).toEqual(['lint', 'test', 'typecheck'])
    for (const cmd of Object.values(ALLOWED_COMMANDS)) {
      expect(cmd.join(' ')).not.toMatch(/[;&|><`$]/)
    }
  })
})
