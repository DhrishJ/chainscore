import type { Factor } from '@/types'

interface FactorCardProps {
  factor: Factor
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-accent'
  if (score >= 60) return 'bg-green-400'
  if (score >= 40) return 'bg-warning'
  if (score >= 20) return 'bg-orange-400'
  return 'bg-danger'
}

export function FactorCard({ factor }: FactorCardProps) {
  const pct = factor.rawScore

  return (
    <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-text font-grotesk text-sm sm:text-base">
            {factor.name}
          </h3>
          <p className="text-muted text-xs mt-0.5">
            Weight: {Math.round(factor.weight * 100)}%
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {factor.limitedData && (
            <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs border border-warning/30">
              Limited Data
            </span>
          )}
          <span className="text-xl font-bold font-grotesk text-text">
            {factor.rawScore}
            <span className="text-muted text-sm font-normal">/100</span>
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-muted text-xs leading-relaxed">{factor.explanation}</p>
    </div>
  )
}
