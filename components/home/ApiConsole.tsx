'use client'

import { useState } from 'react'

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
        out.push({ t: m[1], c: 'text-ink-muted' })
        out.push({ t: m[2], c: 'text-ink-muted' })
      } else if (m[1]) out.push({ t: m[1], c: 'text-ink-fg' })
      else if (m[3]) out.push({ t: m[3], c: 'text-ink-fg' })
      else if (m[4]) out.push({ t: m[4], c: 'text-danger' })
      else if (m[5]) out.push({ t: m[5], c: 'text-ink-muted' })
      last = re.lastIndex
    }
    if (last < line.length) out.push({ t: line.slice(last) })
    return out
  })
}

function Code({ code, numbered = true }: { code: string; numbered?: boolean }) {
  const lines = highlight(code)
  return (
    <pre className="font-mono text-[12.5px] leading-[1.75]">
      <code>
        {lines.map((tokens, i) => (
          <span key={i} className="block whitespace-pre">
            {numbered && (
              <span className="mr-5 inline-block w-5 select-none text-right text-ink-muted" aria-hidden>
                {i + 1}
              </span>
            )}
            {tokens.map((tk, j) => (
              <span key={j} className={tk.c}>
                {tk.t}
              </span>
            ))}
          </span>
        ))}
      </code>
    </pre>
  )
}

export function ApiConsole({ tabs }: { tabs: ConsoleTab[] }) {
  const request = tabs.find((t) => t.id === 'request')
  const responses = tabs.filter((t) => t.id !== 'request')
  const [active, setActive] = useState(0)
  const tab = responses[active]

  return (
    <div className="border border-ink-line bg-ink text-ink-fg">
      {request && (
        <div className="border-b border-ink-line px-5 py-4 sm:px-6">
          <p className="t-label text-ink-muted">Request</p>
          <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Example request">
            <Code code={request.code} numbered={false} />
          </div>
        </div>
      )}
      <div role="tablist" aria-label="Example responses" className="flex border-b border-ink-line">
        {responses.map((t, i) => (
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
                const next = (i + (e.key === 'ArrowRight' ? 1 : responses.length - 1)) % responses.length
                setActive(next)
                document.getElementById(`api-tab-${responses[next].id}`)?.focus()
              }
            }}
            className={`relative px-4 py-3 text-left text-[0.875rem] transition-colors sm:px-5 ${
              i === active ? 'text-ink-fg' : 'text-ink-muted hover:text-ink-fg'
            }`}
          >
            {t.label}
            {i === active && <span className="absolute inset-x-0 -bottom-px h-px bg-ink-fg" aria-hidden />}
          </button>
        ))}
        <span className="t-code ml-auto hidden items-center px-5 text-ink-muted sm:flex">{tab.status}</span>
      </div>
      <div
        role="tabpanel"
        id={`api-panel-${tab.id}`}
        aria-labelledby={`api-tab-${tab.id}`}
        tabIndex={0}
        className="max-h-[28rem] overflow-auto p-5 sm:p-6"
      >
        <Code code={tab.code} />
      </div>
    </div>
  )
}
