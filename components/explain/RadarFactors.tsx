'use client'

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'
import type { Factor } from '@/types'

interface RadarFactorsProps {
  factors: Factor[]
}

export function RadarFactors({ factors }: RadarFactorsProps) {
  const data = factors.map((factor) => ({
    name: factor.name,
    score: factor.rawScore,
  }))

  const ariaLabel =
    'Score breakdown by factor family: ' +
    factors.map((factor) => `${factor.name} ${factor.rawScore} of 100`).join(', ')

  return (
    <div
      className="border border-text/15 bg-card/40 p-5"
      role="img"
      aria-label={ariaLabel}
    >
      <h3 className="t-label mb-1 text-text">Factor profile</h3>
      <p className="text-muted text-xs mb-2">Each axis is a factor family score, 0 to 100</p>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="rgb(var(--cs-border))" />
            <PolarAngleAxis
              dataKey="name"
              tick={{ fill: 'rgb(var(--cs-muted))', fontSize: 11 }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={{ fill: 'rgb(var(--cs-muted))', fontSize: 10 }}
              tickCount={5}
              axisLine={false}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="rgb(var(--cs-accent))"
              fill="rgb(var(--cs-accent))"
              fillOpacity={0.35}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
