import { cn } from '@/lib/utils'

interface ScoreBadgeProps {
  score: number
  grade: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ScoreBadge({ score, grade, size = 'md', className }: ScoreBadgeProps) {
  const color =
    grade === 'A' ? 'text-accent border-accent/30 bg-accent/10' :
    grade === 'B' ? 'text-accent border-accent/30 bg-accent/10' :
    grade === 'C' ? 'text-warning border-warning/30 bg-warning/10' :
    grade === 'D' ? 'text-warning border-warning/30 bg-warning/10' :
    'text-danger border-danger/30 bg-danger/10'

  const sizeClass =
    size === 'sm' ? 'text-xs px-2 py-0.5' :
    size === 'lg' ? 'text-base px-4 py-1.5 font-bold' :
    'text-sm px-3 py-1'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        color,
        sizeClass,
        className
      )}
    >
      {score}
      <span className="opacity-60 text-xs">{grade}</span>
    </span>
  )
}
