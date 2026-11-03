// The running header every section opens with: an index, a name, and a
// hairline that draws across when it enters.

export function SectionLabel({
  index,
  name,
  aside,
  className = '',
}: {
  index: string
  name: string
  aside?: string
  className?: string
}) {
  return (
    <div className={`relative pt-3 ${className}`}>
      <span data-rule className="absolute inset-x-0 top-0 h-px bg-text/80" aria-hidden />
      <div className="flex items-baseline justify-between gap-6">
        <p className="t-label text-text">
          ({index}) {name}
        </p>
        {aside && <p className="t-label hidden text-right text-muted sm:block">{aside}</p>}
      </div>
    </div>
  )
}
