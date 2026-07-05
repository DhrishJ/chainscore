// Reproducible backtest runner (Workstream C).
//
//   npm run backtest
//
// Reads data/backtest/holdout.json (produced by
// scripts/export-backtest-holdout.py from the local pipeline data), runs the
// point-in-time engine through the exact serving model, and writes a
// versioned report artifact (JSON + Markdown) under reports/backtest/.

import fs from 'node:fs'
import path from 'node:path'
import { runBacktest, BacktestRow, BacktestReport } from '@/lib/backtest/engine'
import { servingModelMeta } from '@/lib/data/mlScorer'

// True population prevalence (11,111 / 122,221 labeled wallets); matches how
// model/METRICS.md weights every reported number.
const TARGET_BASE_RATE = 0.0909

interface HoldoutFile {
  exportedAt: string
  featureNames: string[]
  rows: BacktestRow[]
}

function fmt(x: number): string {
  return x.toFixed(4)
}

function toMarkdown(report: BacktestReport): string {
  const lines: string[] = []
  lines.push(`# Backtest report: ${report.modelVersion}`)
  lines.push('')
  lines.push(`Generated ${report.generatedAt}. ${report.nRows} wallets, ${report.positives} positives`)
  lines.push(`(sample base rate ${fmt(report.sampleBaseRate)}, weighted to ${report.targetBaseRate ?? 'raw'}).`)
  lines.push('')
  lines.push('## Headline metrics')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|---|---|')
  lines.push(`| ROC-AUC | ${fmt(report.metrics.rocAuc)} |`)
  lines.push(`| PR-AUC | ${fmt(report.metrics.prAuc)} |`)
  lines.push(`| Brier | ${fmt(report.metrics.brier)} |`)
  lines.push(`| ECE | ${fmt(report.metrics.ece)} |`)
  lines.push('')
  const op = report.operatingPoint
  lines.push(`## Operating point (score < ${op.scoreCutoff})`)
  lines.push('')
  lines.push(`Recall ${fmt(op.recall)}, false positive rate ${fmt(op.falsePositiveRate)},`)
  lines.push(`precision ${fmt(op.precision)}, flagged share ${fmt(op.flaggedShare)}.`)
  lines.push('')
  lines.push('## Slices')
  lines.push('')
  lines.push('| Slice | n | positives | ROC-AUC | PR-AUC |')
  lines.push('|---|---|---|---|---|')
  for (const [key, m] of Object.entries(report.slices)) {
    lines.push(`| ${key} | ${m.n} | ${m.positives} | ${fmt(m.rocAuc)} | ${fmt(m.prAuc)} |`)
  }
  lines.push('')
  lines.push('## Reliability (weighted)')
  lines.push('')
  lines.push('| PD bin | mean predicted | observed | n |')
  lines.push('|---|---|---|---|')
  for (const b of report.reliability) {
    if (b.n === 0) continue
    lines.push(`| ${b.lo.toFixed(1)} to ${b.hi.toFixed(1)} | ${fmt(b.meanPredicted)} | ${fmt(b.observedRate)} | ${b.n} |`)
  }
  lines.push('')
  return lines.join('\n')
}

function main(): void {
  const holdoutPath = path.join(process.cwd(), 'data', 'backtest', 'holdout.json')
  if (!fs.existsSync(holdoutPath)) {
    console.error(`missing ${holdoutPath}. Run: python scripts/export-backtest-holdout.py`)
    process.exit(2)
  }
  const holdout = JSON.parse(fs.readFileSync(holdoutPath, 'utf8')) as HoldoutFile

  const meta = servingModelMeta()
  if (!meta) {
    console.error('serving model artifacts not found under ml/')
    process.exit(2)
  }
  // The exported vectors must be in the serving model's feature order.
  if (JSON.stringify(holdout.featureNames) !== JSON.stringify(meta.featureNames)) {
    console.error('feature order mismatch between holdout export and serving model')
    process.exit(2)
  }

  const report = runBacktest(holdout.rows, {
    targetBaseRate: TARGET_BASE_RATE,
    scoreCutoff: meta.gradeCutoffs.C,
  })

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17)
  const outDir = path.join(process.cwd(), 'reports', 'backtest')
  fs.mkdirSync(outDir, { recursive: true })
  const base = path.join(outDir, `${report.modelVersion}-${stamp}`)
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2))
  fs.writeFileSync(`${base}.md`, toMarkdown(report))
  // Stable path the frontend retrospective reads, so the data story always
  // reflects the latest reproducible run without hunting a timestamped file.
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(report, null, 2))

  console.log(`model ${report.modelVersion}: ROC-AUC ${fmt(report.metrics.rocAuc)}, PR-AUC ${fmt(report.metrics.prAuc)}, Brier ${fmt(report.metrics.brier)}, ECE ${fmt(report.metrics.ece)}`)
  console.log(`report written to ${base}.md`)
}

main()
