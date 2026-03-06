'use client'

interface ShareButtonProps {
  address: string
  score: number
  grade: string
}

export function ShareButton({ address, score, grade }: ShareButtonProps) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chainscore.xyz'
  const scoreUrl = `${appUrl}/score/${address}`

  function handleShare() {
    const text = encodeURIComponent(
      `My on-chain credit score is ${score} (Grade: ${grade}) 🔗\nCheck yours at ${scoreUrl}`
    )
    window.open(
      `https://twitter.com/intent/tweet?text=${text}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1DA1F2]/10 border border-[#1DA1F2]/30 text-[#1DA1F2] hover:bg-[#1DA1F2]/20 transition-all text-sm font-medium"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Share on X
    </button>
  )
}
