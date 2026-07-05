'use client'

import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface Contribution {
  label: string
  impact: number
}

interface ContributionWaterfallProps {
  contributions?: Contribution[]
}

export function ContributionWaterfall({ contributions }: ContributionWaterfallProps) {
  if (!contributions || contributions.length === 0) return null

  const maxAbsImpact = Math.max(...contributions.map((c) => Math.abs(c.impact)))

  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <h3 className="font-grotesk font-semibold text-text text-sm mb-1">
        How each signal moved the score
      </h3>
      <p className="text-muted text-xs mb-4">
        Real feature contributions from this wallet&apos;s model prediction
      </p>
      <div className="flex flex-col gap-2.5">
        {contributions.map((contribution) => {
          const isPositive = contribution.impact > 0
          const widthPct =
            maxAbsImpact > 0 ? (Math.abs(contribution.impact) / maxAbsImpact) * 100 : 0

          return (
            <div key={contribution.label} className="flex items-center gap-3">
              <span className="w-1/2 sm:w-2/5 text-xs text-text truncate" title={contribution.label}>
                {contribution.label}
              </span>
              <div className="flex-1 flex items-center h-5">
                <div className="relative w-full h-full flex items-center">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" aria-hidden="true" />
                  {isPositive ? (
                    <div
                      className="absolute left-1/2 top-0.5 bottom-0.5 rounded-r-sm bg-success"
                      style={{ width: `${widthPct / 2}%` }}
                      aria-hidden="true"
                    />
                  ) : (
                    <div
                      className="absolute right-1/2 top-0.5 bottom-0.5 rounded-l-sm bg-danger"
                      style={{ width: `${widthPct / 2}%` }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
              <span
                className={`flex items-center gap-1 w-24 flex-shrink-0 justify-end text-xs font-medium ${
                  isPositive ? 'text-success' : 'text-danger'
                }`}
              >
                {isPositive ? (
                  <ArrowUpRight size={12} aria-hidden="true" />
                ) : (
                  <ArrowDownRight size={12} aria-hidden="true" />
                )}
                <span className="sr-only">{isPositive ? 'raises score' : 'lowers score'}</span>
                {isPositive ? '+' : ''}
                {contribution.impact.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
