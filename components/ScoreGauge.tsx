'use client'

import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'

interface ScoreGaugeProps {
  score: number
  animated?: boolean
}

function scoreColor(score: number): string {
  if (score >= 750) return '#00FF94'
  if (score >= 650) return '#4ADE80'
  if (score >= 550) return '#FFB800'
  if (score >= 450) return '#FF8C00'
  return '#FF3B5C'
}

export function ScoreGauge({ score }: ScoreGaugeProps) {
  // Map score 300-850 to 0-100 for the bar
  const pct = Math.round(((score - 300) / 550) * 100)
  const color = scoreColor(score)

  const data = [
    { name: 'background', value: 100, fill: '#1C2333' },
    { name: 'score', value: pct, fill: color },
  ]

  return (
    <div className="relative w-48 h-48 mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          startAngle={225}
          endAngle={-45}
          barSize={14}
          data={data}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={7}
            background={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted uppercase tracking-widest">Score</span>
        <span className="text-4xl font-bold font-grotesk" style={{ color }}>
          {score}
        </span>
      </div>
    </div>
  )
}
