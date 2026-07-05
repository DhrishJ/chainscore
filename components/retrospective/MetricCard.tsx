import { Info } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string
  description: string
}

export function MetricCard({ label, value, description }: MetricCardProps) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-widest text-muted">{label}</span>
        {/* Decorative: the same description is shown in full as visible text
            below, so the icon carries no extra meaning for screen readers.
            aria-label on a plain span is prohibited (axe aria-prohibited-attr). */}
        <span className="text-muted" aria-hidden="true">
          <Info size={13} />
        </span>
      </div>
      <span className="text-3xl font-bold font-grotesk text-text">{value}</span>
      <p className="text-muted text-xs leading-relaxed">{description}</p>
    </div>
  )
}
