'use client'

import { useEffect, useState } from 'react'

interface RecentScore {
  address: string
  score: number
  timestamp: number
}

function scoreColor(score: number): string {
  if (score >= 750) return 'text-accent'
  if (score >= 650) return 'text-green-400'
  if (score >= 550) return 'text-warning'
  if (score >= 450) return 'text-orange-400'
  return 'text-danger'
}

function truncateAddress(address: string): string {
  if (address.endsWith('.eth')) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function RecentScoresTicker() {
  const [scores, setScores] = useState<RecentScore[]>([])

  useEffect(() => {
    async function fetchRecent() {
      try {
        const res = await fetch('/api/recent-scores')
        if (res.ok) {
          const data = await res.json()
          setScores(data)
        }
      } catch {
        // ignore
      }
    }

    fetchRecent()
    const interval = setInterval(fetchRecent, 30000)
    return () => clearInterval(interval)
  }, [])

  if (scores.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      <span className="text-muted text-xs">Recent:</span>
      {scores.map((s, i) => (
        <a
          key={`${s.address}-${i}`}
          href={`/score/${s.address}`}
          className="flex items-center gap-1 text-xs bg-card border border-border rounded-lg px-2.5 py-1 hover:border-accent/40 transition-all"
        >
          <span className="text-muted">{truncateAddress(s.address)}</span>
          <span className="text-muted">scored</span>
          <span className={`font-semibold font-grotesk ${scoreColor(s.score)}`}>
            {s.score}
          </span>
        </a>
      ))}
    </div>
  )
}
