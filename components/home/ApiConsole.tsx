'use client'

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/motion/engine'

// The partner API, shown the way a builder reads it: the request, then the
// two branches an underwriter has to handle. Responses follow the
// ScoreEnvelope schema in public/openapi.json; values are an illustrative
// wallet, computed by the server from the model's real band and deciles.

export interface ConsoleTab {
  id: string
  label: string
  status: string
  code: string
}

type Token = { t: string; c?: string }

// Minimal JSON / shell highlighter: keys, strings, numbers, literals.
function highlight(code: string): Token[][] {
  return code.split('\n').map((line) => {
    const out: Token[] = []
    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(\b-?\d+(?:\.\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)|(\$\s|curl\b|-H\b|\\$)/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      if (m.index > last) out.push({ t: line.slice(last, m.index) })
      if (m[1] && m[2]) {
        out.push({ t: m[1], c: 'text-ink-fg' })
        out.push({ t: m[2], c: 'text-ink-muted' })
      } else if (m[1]) out.push({ t: m[1], c: 'text-ink-green' })
      else if (m[3]) out.push({ t: m[3], c: 'text-ink-accent' })
      else if (m[4]) out.push({ t: m[4], c: 'text-ink-amber' })
      else if (m[5]) out.push({ t: m[5], c: 'text-ink-muted' })
      last = re.lastIndex
    }
    if (last < line.length) out.push({ t: line.slice(last) })
    return out
  })
}

export function ApiConsole({ tabs }: { tabs: ConsoleTab[] }) {
  const [active, setActive] = useState(0)
  const [typed, setTyped] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const tab = tabs[active]

  // Type the request out once, the first time the console is seen.
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    let raf = 0
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        const total = tabs[0].code.length
        const start = performance.now()
        const step = (now: number) => {
          const n = Math.min(total, Math.floor((now - start) / 14))
          setTyped(n)
          if (n < total) raf = requestAnimationFrame(step)
          else setTyped(null)
        }
        raf = requestAnimationFrame(step)
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [tabs])

  const visible = active === 0 && typed !== null ? tab.code.slice(0, typed) : tab.code
  const lines = highlight(visible)

  return (
    <div ref={ref} className="border border-ink-line bg-ink text-ink-fg">
      <div role="tablist" aria-label="API examples" className="flex border-b border-ink-line">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            id={`api-tab-${t.id}`}
            aria-selected={i === active}
            aria-controls={`api-panel-${t.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const next = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
                setActive(next)
                document.getElementById(`api-tab-${tabs[next].id}`)?.focus()
              }
            }}
            className={`t-label relative px-4 py-3 text-left transition-colors sm:px-5 ${
              i === active ? 'text-ink-fg' : 'text-ink-muted hover:text-ink-fg'
            }`}
          >
            {t.label}
            <span
              className={`absolute inset-x-0 -bottom-px h-px origin-left bg-ink-accent transition-transform duration-500 ease-out ${
                i === active ? 'scale-x-100' : 'scale-x-0'
              }`}
            />
          </button>
        ))}
        <span className="t-label ml-auto hidden items-center gap-2 px-5 text-ink-muted sm:flex">
          <span className="h-1.5 w-1.5 bg-ink-accent" aria-hidden />
          {tab.status}
        </span>
      </div>
      <div
        role="tabpanel"
        id={`api-panel-${tab.id}`}
        aria-labelledby={`api-tab-${tab.id}`}
        tabIndex={0}
        className="max-h-[30rem] overflow-auto p-5 sm:p-6"
        data-lenis-prevent
      >
        <pre className="font-mono text-[12.5px] leading-[1.75]">
          <code>
            {lines.map((tokens, i) => (
              <span key={i} className="block">
                <span className="mr-5 inline-block w-5 select-none text-right text-ink-muted/60" aria-hidden>
                  {i + 1}
                </span>
                {tokens.map((tk, j) => (
                  <span key={j} className={tk.c}>
                    {tk.t}
                  </span>
                ))}
                {active === 0 && typed !== null && i === lines.length - 1 && (
                  <span className="cs-caret ml-px inline-block h-[1.05em] w-[0.55em] translate-y-[0.2em] bg-ink-accent" aria-hidden />
                )}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}
