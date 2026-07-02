import { AttemptLog, SourceError } from './types'

// Failover executor: tries prioritized sources in order, retrying retryable
// failures per source with exponential backoff plus jitter, then moving on.
// Every attempt is recorded so callers can log exactly which providers were
// consulted and why the winner won.

export interface FailoverOptions {
  // Retries per source for retryable errors (429, 5xx, network).
  retriesPerSource?: number
  baseBackoffMs?: number
  // Injectable for tests.
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

export interface FailoverResult<T> {
  value: T
  source: string
  attempts: AttemptLog[]
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function withFailover<S extends { name: string }, T>(
  sources: S[],
  run: (source: S) => Promise<T>,
  opts: FailoverOptions = {}
): Promise<FailoverResult<T>> {
  const retries = opts.retriesPerSource ?? 2
  const base = opts.baseBackoffMs ?? 300
  const sleep = opts.sleep ?? defaultSleep
  const random = opts.random ?? Math.random
  const attempts: AttemptLog[] = []

  for (const source of sources) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const started = Date.now()
      try {
        const value = await run(source)
        attempts.push({ source: source.name, ok: true, attempts: attempt + 1, ms: Date.now() - started })
        return { value, source: source.name, attempts }
      } catch (e) {
        const retryable = e instanceof SourceError ? e.retryable : true
        attempts.push({
          source: source.name,
          ok: false,
          attempts: attempt + 1,
          ms: Date.now() - started,
          error: e instanceof Error ? e.message : String(e),
        })
        if (!retryable || attempt === retries) break
        // Exponential backoff with full jitter.
        await sleep(base * 2 ** attempt * (0.5 + random() / 2))
      }
    }
  }

  const summary = attempts.map((a) => `${a.source}: ${a.error ?? 'ok'}`).join(' | ')
  throw new AggregateSourceError(`all sources failed: ${summary}`, attempts)
}

export class AggregateSourceError extends Error {
  constructor(message: string, readonly attempts: AttemptLog[]) {
    super(message)
    this.name = 'AggregateSourceError'
  }
}
