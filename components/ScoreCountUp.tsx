'use client'

import { useEffect, useRef, useState } from 'react'

interface ScoreCountUpProps {
  target: number
  duration?: number
  className?: string
}

export function ScoreCountUp({ target, duration = 1500, className = '' }: ScoreCountUpProps) {
  const [current, setCurrent] = useState(300)
  const startTime = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (startTime.current === null) startTime.current = timestamp
      const elapsed = timestamp - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(300 + (target - 300) * eased))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return <span className={className}>{current}</span>
}
