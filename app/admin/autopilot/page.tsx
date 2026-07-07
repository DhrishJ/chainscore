import { prisma } from '@/lib/db'
import { agentEnabled, killSwitchActive, spendCaps } from '@/lib/agents/config'

// The Autopilot control room (owner only, middleware-gated): pending
// approvals with approve/reject controls, the audit trail of recent runs,
// KPIs, and platform status including the kill switch.

export const dynamic = 'force-dynamic'

function StatusPill({ on, labelOn, labelOff }: { on: boolean; labelOn: string; labelOff: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        on ? 'border-accent/30 bg-accent/10 text-accent' : 'border-border bg-card text-muted'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-accent' : 'bg-muted'}`} />
      {on ? labelOn : labelOff}
    </span>
  )
}

export default async function AutopilotDashboard({
  searchParams,
}: {
  searchParams: { refused?: string }
}) {
  const [pending, recentDecided, runs, kpis, content] = await Promise.all([
    prisma.outboxItem.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 50 }),
    prisma.outboxItem.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED', 'EXECUTED', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.agentRun.findMany({ orderBy: { startedAt: 'desc' }, take: 25 }),
    prisma.kpi.findMany({ orderBy: { key: 'asc' } }),
    prisma.contentItem.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
  ])

  const caps = spendCaps()
  const killed = killSwitchActive()

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-grotesk text-2xl font-bold text-text">Autopilot</h1>
          <p className="mt-1 text-sm text-muted">Owner control room. Nothing gated executes without you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill on={killed} labelOn="KILL SWITCH ACTIVE" labelOff="kill switch off" />
          <StatusPill on={agentEnabled('strategy')} labelOn="strategy on" labelOff="strategy off" />
          <StatusPill on={agentEnabled('engineering')} labelOn="engineering on" labelOff="engineering off" />
          <StatusPill on={agentEnabled('marketing')} labelOn="marketing on" labelOff="marketing off" />
        </div>
      </div>

      {searchParams.refused && (
        <div className="mt-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          Refused: {searchParams.refused}
        </div>
      )}

      <section className="mt-10">
        <h2 className="font-grotesk text-lg font-semibold text-text">
          Awaiting approval ({pending.length})
        </h2>
        <p className="mt-1 text-xs text-muted">
          Spend caps (code backstop): ${caps.dailyUsd}/day total, ${caps.channelDailyUsd}/day per channel.
        </p>
        <div className="mt-4 space-y-3">
          {pending.length === 0 && (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted">
              Nothing pending. Agents have proposed no gated actions.
            </p>
          )}
          {pending.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                    {item.kind}
                    {item.amountUsd ? ` $${item.amountUsd}` : ''}
                  </span>
                  <span className="ml-3 text-sm font-medium text-text">{item.title}</span>
                  <p className="mt-1 text-xs text-muted">
                    by {item.proposedBy} at {item.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                    {item.channel ? ` on ${item.channel}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form method="POST" action={`/api/admin/outbox/${item.id}`}>
                    <input type="hidden" name="action" value="approve" />
                    <button className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-background">
                      Approve
                    </button>
                  </form>
                  <form method="POST" action={`/api/admin/outbox/${item.id}`}>
                    <input type="hidden" name="action" value="reject" />
                    <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-danger">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 text-xs text-muted">
                {item.payloadJson}
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-grotesk text-lg font-semibold text-text">Recent decisions</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-xs text-muted">
              <tr>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Kind</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Decided by</th>
              </tr>
            </thead>
            <tbody>
              {recentDecided.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{d.status}</td>
                  <td className="px-4 py-2 text-xs">{d.kind}</td>
                  <td className="px-4 py-2">{d.title}</td>
                  <td className="px-4 py-2 text-xs text-muted">{d.decidedBy ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-grotesk text-lg font-semibold text-text">Agent runs (audit trail)</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-xs text-muted">
              <tr>
                <th className="px-4 py-2">Agent</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Trigger</th>
                <th className="px-4 py-2">Cost</th>
                <th className="px-4 py-2">Summary</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No runs yet.
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2">{r.agent}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.status}</td>
                  <td className="px-4 py-2 text-xs">{r.trigger}</td>
                  <td className="px-4 py-2 font-mono text-xs">${r.costUsd.toFixed(4)}</td>
                  <td className="max-w-md truncate px-4 py-2 text-xs text-muted">
                    {r.summary ?? r.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-grotesk text-lg font-semibold text-text">Content pipeline</h2>
        <p className="mt-1 text-xs text-muted">
          Marketing publishes autonomously; BLOCKED rows show the truth and fraud brakes firing.
          GENERATED means passed all checks, waiting on a channel or its calendar date.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-xs text-muted">
              <tr>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Channel</th>
                <th className="px-4 py-2">Scheduled</th>
                <th className="px-4 py-2">Title</th>
              </tr>
            </thead>
            <tbody>
              {content.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    No content yet.
                  </td>
                </tr>
              )}
              {content.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{c.status}</td>
                  <td className="px-4 py-2 text-xs">{c.channel}</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {c.scheduledFor?.toISOString().slice(5, 10) ?? ''}
                  </td>
                  <td className="max-w-md truncate px-4 py-2 text-xs">{c.title ?? c.body.slice(0, 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-grotesk text-lg font-semibold text-text">KPIs</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-xs text-muted">
              <tr>
                <th className="px-4 py-2">KPI</th>
                <th className="px-4 py-2">Current</th>
                <th className="px-4 py-2">Target</th>
                <th className="px-4 py-2">As of</th>
              </tr>
            </thead>
            <tbody>
              {kpis.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    No KPIs yet. The Strategy agent proposes these in Phase 2.
                  </td>
                </tr>
              )}
              {kpis.map((k) => (
                <tr key={k.id} className="border-t border-border">
                  <td className="px-4 py-2">{k.name}</td>
                  <td className="px-4 py-2 font-mono">{k.current ?? ''}</td>
                  <td className="px-4 py-2 font-mono text-muted">{k.target ?? ''}</td>
                  <td className="px-4 py-2 text-xs text-muted">{k.asOf?.toISOString().slice(0, 10) ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
