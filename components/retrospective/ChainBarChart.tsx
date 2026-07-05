'use client'

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface ChainDatum {
  chain: string
  prAuc: number
  rocAuc: number
  n: number
  positives: number
}

interface ChainBarChartProps {
  data: ChainDatum[]
  weakestChain: string
}

const ACCENT = '#0052FF'
const DANGER = '#FF3B5C'
const GRID = '#1C2333'
const MUTED = '#5A6478'
const TEXT = '#E8EDF5'

interface ChainChartRow {
  chain: string
  prAucPct: number
  n: number
  positives: number
}

export function ChainBarChart({ data, weakestChain }: ChainBarChartProps) {
  const chartData: ChainChartRow[] = data
    .slice()
    .sort((a, b) => b.prAuc - a.prAuc)
    .map(d => ({
      chain: d.chain,
      prAucPct: Math.round(d.prAuc * 1000) / 10,
      n: d.n,
      positives: d.positives,
    }))

  const summary = chartData
    .map(d => `${d.chain}: ${d.prAucPct} percent PR-AUC, ${d.positives} of ${d.n} borrowers liquidated`)
    .join('. ')

  return (
    <div
      className="w-full h-72"
      role="img"
      aria-label={`Bar chart of PR-AUC by chain, sorted highest to lowest. ${summary}. The weakest slice is ${weakestChain}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="chain" stroke={MUTED} fontSize={12} tickLine={false} tickMargin={8} />
          <YAxis
            stroke={MUTED}
            fontSize={12}
            tickLine={false}
            domain={[0, 100]}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            contentStyle={{ background: '#0D1117', border: `1px solid ${GRID}`, borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: TEXT }}
            itemStyle={{ color: TEXT }}
            formatter={(value: number) => [`${value}%`, 'PR-AUC']}
          />
          <Bar dataKey="prAucPct" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {chartData.map(row => (
              <Cell key={row.chain} fill={row.chain === weakestChain ? DANGER : ACCENT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
