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
        <span
          tabIndex={0}
          title={description}
          aria-label={description}
          className="text-muted hover:text-text focus:text-text transition-colors cursor-help"
        >
          <Info size={13} aria-hidden="true" />
        </span>
      </div>
      <span className="text-3xl font-bold font-grotesk text-text">{value}</span>
      <p className="text-muted text-xs leading-relaxed">{description}</p>
    </div>
  )
}
