'use client'
import { useState } from 'react'
import { Link as LinkIcon, Check, Download } from 'lucide-react'
import { clientEnv } from '@/lib/env.client'

interface ShareButtonProps {
  address: string
  score: number
  grade: string
}

export function ShareButton({ address, score, grade }: ShareButtonProps) {
  const appUrl = clientEnv.NEXT_PUBLIC_APP_URL || 'https://chainscore.dev'
  const scoreUrl = `${appUrl}/score/${address}`
  const ogImageUrl = `${appUrl}/api/og/${address}`
  const [copied, setCopied] = useState(false)

  function handleShare() {
    const text = encodeURIComponent(
      `My onchain credit score is ${score} (Grade: ${grade}) 🔗\nCheck yours at ${scoreUrl}`
    )
    window.open(
      `https://twitter.com/intent/tweet?text=${text}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(scoreUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable, ignore silently
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleShare}
        className="t-label flex h-10 items-center gap-2 border border-text/80 bg-text px-4 text-background transition-colors hover:bg-accent hover:text-accent-fg hover:border-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share on X
      </button>

      <button
        onClick={handleCopyLink}
        aria-label="Copy link to this score"
        className="t-label flex h-10 items-center gap-2 border border-text/30 px-4 text-text transition-colors hover:border-text/80"
      >
        {copied ? (
          <Check size={16} className="text-accent" />
        ) : (
          <LinkIcon size={16} className="text-muted" />
        )}
        {copied ? 'Copied' : 'Copy link'}
      </button>

      <a
        href={ogImageUrl}
        download={`chainscore-${address}.png`}
        aria-label="Download score image"
        className="t-label flex h-10 items-center gap-2 border border-text/30 px-4 text-text transition-colors hover:border-text/80"
      >
        <Download size={16} className="text-muted" />
        Download image
      </a>
    </div>
  )
}
