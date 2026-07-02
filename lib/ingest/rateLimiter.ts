// Outbound provider rate limiter: enforces a minimum spacing between calls to
// the same provider so ChainScore never exceeds a configured request budget.
// Per-instance state; on serverless each instance paces itself, which keeps
// aggregate usage bounded by (instances x budget). Budgets are set well below
// provider free-tier ceilings for headroom.

const lastCallAt = new Map<string, number>()
const queues = new Map<string, Promise<void>>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Serializes calls per provider key with at least `minIntervalMs` between
// starts. Returns the wrapped function's result.
export async function withProviderLimit<T>(
  provider: string,
  minIntervalMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const prev = queues.get(provider) ?? Promise.resolve()
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  queues.set(
    provider,
    prev.then(() => gate)
  )

  await prev
  try {
    const now = Date.now()
    const last = lastCallAt.get(provider) ?? 0
    const wait = last + minIntervalMs - now
    if (wait > 0) await sleep(wait)
    lastCallAt.set(provider, Date.now())
    return await fn()
  } finally {
    release()
  }
}
