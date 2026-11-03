// The mark: CS-1 reduced to a glyph. A 270 degree scale open at the bottom,
// the needle at an illustrative 742, the hub. Same geometry as the dial.

export function LogoMark({ className = 'h-[22px] w-[22px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path
        d="M4.93 19.07 A10 10 0 1 1 19.07 19.07"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="butt"
      />
      <path d="M12 12 L19.4 10.96" stroke="rgb(var(--cs-accent))" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.1" fill="currentColor" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[1.0625rem] font-semibold tracking-[-0.02em]" style={{ fontStretch: '92%' }}>
        ChainScore
      </span>
    </span>
  )
}
