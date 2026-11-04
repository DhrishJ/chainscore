import { PLATES, type PlateName } from '@/lib/site/plates'

// A photograph of the calibre. Rendered in Blender (Cycles) from the same
// geometry as the plan drawing, exported as AVIF with a WebP fallback at
// several widths. The background is the page black, so a plate can bleed
// off any edge without a visible frame.

export function Plate({
  name,
  sizes,
  className = '',
  imgClassName = '',
  priority = false,
  alt,
}: {
  name: PlateName
  sizes: string
  className?: string
  imgClassName?: string
  priority?: boolean
  alt?: string
}) {
  const p = PLATES[name]
  const set = (ext: 'avif' | 'webp') => p.widths.map((w) => `/calibre/${name}-${w}.${ext} ${w}w`).join(', ')
  const largest = p.widths[0]
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      {/* Pre-encoded AVIF/WebP at fixed widths; next/image would re-encode them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/calibre/${name}-${largest}.webp`}
        width={p.w}
        height={p.h}
        alt={alt ?? p.alt}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        // React 18 passes the lowercase attribute through untouched; the
        // camelCase prop would warn. (next/image does the same.)
        {...(priority ? ({ fetchpriority: 'high' } as Record<string, string>) : {})}
        className={imgClassName}
        style={{ backgroundImage: `url(${p.placeholder})`, backgroundSize: 'cover' }}
      />
    </picture>
  )
}
