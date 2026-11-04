// The mark is a jewel setting from the calibre: a gold chaton (here the
// ring) holding a ruby bearing. Seventeen of them carry the movement's
// pivots; one stands for the company.

export function LogoMark({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none">
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3.6" fill="rgb(var(--cs-danger))" />
      <circle cx="10" cy="10" r="1" fill="rgb(var(--cs-bg))" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[1.0625rem] font-semibold tracking-[-0.025em]">ChainScore</span>
    </span>
  )
}
