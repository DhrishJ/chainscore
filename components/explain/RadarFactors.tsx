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
      className="rounded-2xl bg-card border border-border p-5"
      role="img"
      aria-label={ariaLabel}
    >
      <h3 className="font-grotesk font-semibold text-text text-sm mb-1">Factor profile</h3>
      <p className="text-muted text-xs mb-2">Each axis is a factor family score, 0 to 100</p>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="#1C2333" />
            <PolarAngleAxis
              dataKey="name"
              tick={{ fill: '#5A6478', fontSize: 11 }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={{ fill: '#5A6478', fontSize: 10 }}
              tickCount={5}
              axisLine={false}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="#0052FF"
              fill="#0052FF"
              fillOpacity={0.35}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
