import { NextRequest, NextResponse } from 'next/server'
import { addressParamSchema } from '@/lib/validation'
import { clientEnv } from '@/lib/env.client'

export const dynamic = 'force-dynamic'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const { address } = params

  if (!addressParamSchema.safeParse(address).success) {
    return new NextResponse('Invalid address', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  const base = clientEnv.NEXT_PUBLIC_APP_URL || 'https://chainscore.dev'
  const imageUrl = `${base}/api/og/${address}`
  const targetUrl = `${base}/score/${address}`
  const safeAddress = escapeHtml(address)
  const safeImageUrl = escapeHtml(imageUrl)
  const safeTargetUrl = escapeHtml(targetUrl)
  const title = `ChainScore for ${safeAddress}`
  const description = 'View this wallet\'s onchain credit score, free at ChainScore.'

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${safeImageUrl}" />
    <meta name="fc:frame" content="vNext" />
    <meta name="fc:frame:image" content="${safeImageUrl}" />
    <meta name="fc:frame:button:1" content="View full score" />
    <meta name="fc:frame:button:1:action" content="link" />
    <meta name="fc:frame:button:1:target" content="${safeTargetUrl}" />
  </head>
  <body>
    <p>${description}</p>
  </body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}
