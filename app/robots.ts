import type { MetadataRoute } from 'next'
import { clientEnv } from '@/lib/env.client'

export default function robots(): MetadataRoute.Robots {
  const base = clientEnv.NEXT_PUBLIC_APP_URL || 'https://chainscore.dev'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/dashboard'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
