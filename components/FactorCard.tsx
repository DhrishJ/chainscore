import type { Factor } from '@/types'

interface FactorCardProps {
  factor: Factor
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-accent'
  if (score >= 60) return 'bg-blue-400'
  if (score >= 40) return 'bg-warning'
  if (score >= 20) return 'bg-orange-400'
  return 'bg-danger'
}

export function FactorCard({ factor }: FactorCardProps) {
  const pct = factor.rawScore

  return (
    <div className="flex flex-col gap-3 border border-text/15 bg-card/40 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="t-headline text-xl text-text">
            {factor.name}
          </h3>
          <p className="text-muted text-xs mt-0.5">
            ML weight: {Math.round(factor.weight * 100)}%
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {factor.limitedData && (
            <span className="t-label border border-warning/40 bg-warning/10 px-2 py-0.5 text-warning">
              Limited Data
            </span>
          )}
          <span className="t-headline tnum text-2xl text-text">
            {factor.rawScore}
            <span className="text-muted text-sm font-normal">/100</span>
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 overflow-hidden bg-text/10">
        <div
          className={`h-full transition-all duration-700 ${barColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-muted text-xs leading-relaxed">{factor.explanation}</p>
    </div>
  )
}
