'use client'

import { useEffect, useRef } from 'react'
import { onTick } from '@/lib/motion/engine'

// A statement that brightens word by word as it passes the reading line.
// Each word carries its index (--i); one custom property (--p) on the
// paragraph drives every word through CSS, so a frame costs one style
// write. The dimmed state is only armed after the first scroll (see
// globals.css), so the server render and a static audit see full text.

export function ManifestoWords({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const words = text.split(' ')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let off: (() => void) | null = null
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !off) {
          off = onTick(() => {
            const r = el.getBoundingClientRect()
            const vh = window.innerHeight
            const start = vh * 0.82
            const end = vh * 0.3
            const p = Math.min(1, Math.max(0, (start - r.top) / (r.height + start - end)))
            el.style.setProperty('--p', (p * (words.length + 1.5)).toFixed(3))
          })
        } else if (!e.isIntersecting && off) {
          off()
          off = null
        }
      },
      { rootMargin: '20% 0px' }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      off?.()
    }
  }, [words.length])

  return (
    <p ref={ref} data-words className={className}>
      {words.map((w, i) => (
        <span key={i} className="w" style={{ ['--i' as string]: i }}>
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  )
}
