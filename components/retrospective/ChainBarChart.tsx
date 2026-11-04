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

// Theme tokens straight from app/globals.css, so the chart follows paper
// and graphite like everything else.
const INK = 'rgb(var(--cs-text))'
const DANGER = 'rgb(var(--cs-danger))'
const GRID = 'rgb(var(--cs-border))'
const MUTED = 'rgb(var(--cs-muted))'
const MONO = 'var(--font-sans), ui-sans-serif, system-ui, sans-serif'

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
    .map((d) => ({
      chain: d.chain,
      prAucPct: Math.round(d.prAuc * 1000) / 10,
      n: d.n,
      positives: d.positives,
    }))

  const summary = chartData
    .map((d) => `${d.chain}: ${d.prAucPct} percent PR-AUC, ${d.positives} of ${d.n} borrowers liquidated`)
    .join('. ')

  return (
    <div
      className="h-80 w-full"
      role="img"
      aria-label={`Bar chart of PR-AUC by chain, sorted highest to lowest. ${summary}. The weakest slice is ${weakestChain}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 8 }} barCategoryGap="28%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="chain"
            stroke={MUTED}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: MONO }}
            tickLine={false}
            axisLine={{ stroke: INK }}
            tickMargin={10}
          />
          <YAxis
            stroke={MUTED}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: MONO }}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            cursor={{ fill: 'rgb(var(--cs-text) / 0.05)' }}
            contentStyle={{
              background: 'rgb(var(--cs-bg))',
              border: '1px solid rgb(var(--cs-border))',
              borderRadius: 0,
              fontSize: 12,
              fontFamily: MONO,
            }}
            labelStyle={{ color: INK }}
            itemStyle={{ color: INK }}
            formatter={(value: number) => [`${value}%`, 'PR-AUC']}
          />
          <Bar dataKey="prAucPct" radius={0} maxBarSize={72} isAnimationActive={false}>
            {chartData.map((row) => (
              <Cell key={row.chain} fill={row.chain === weakestChain ? DANGER : INK} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
