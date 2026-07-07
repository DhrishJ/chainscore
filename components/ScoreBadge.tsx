import { cn } from '@/lib/utils'
import { stylesForGrade } from '@/lib/site/scoreTier'

interface ScoreBadgeProps {
  score: number
  grade: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ScoreBadge({ score, grade, size = 'md', className }: ScoreBadgeProps) {
  const color = stylesForGrade(grade).pill

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
