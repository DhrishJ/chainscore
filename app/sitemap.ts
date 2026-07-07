import type { MetadataRoute } from 'next'
import { clientEnv } from '@/lib/env.client'

// Indexable surface. Score pages are intentionally excluded: they are
// per-wallet dynamic results, not durable documents; the retrospective is
// the citable data asset we want ranking.

export default function sitemap(): MetadataRoute.Sitemap {
  const base = clientEnv.NEXT_PUBLIC_APP_URL || 'https://chainscore.dev'
  const now = new Date()
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/retrospective`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
  ]
}
