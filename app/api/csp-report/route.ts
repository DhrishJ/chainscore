import { NextRequest, NextResponse } from 'next/server'
import { extractReports } from '@/lib/cspReport'

// CSP violation report collector. Browsers POST here via the report-uri
// directive in next.config.js. Reports land in server logs (Vercel: Runtime
// Logs) as single-line JSON tagged [csp-report], which is what the
// enforcement ratchet reads: when the report-only candidate policy stops
// producing violations for a directive, that directive can be promoted into
// the enforced header (DECISIONS.md D-030).

const MAX_BODY_BYTES = 16 * 1024

export async function POST(request: NextRequest): Promise<NextResponse> {
  let text: string
  try {
    text = await request.text()
  } catch {
    return new NextResponse(null, { status: 204 })
  }
  if (text.length === 0 || text.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 204 })
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  for (const report of extractReports(body).slice(0, 10)) {
    // One line per violation so log search stays trivial.
    console.warn(`[csp-report] ${JSON.stringify(report)}`)
  }

  // Always 204: the reporter is a fire-and-forget browser background task,
  // and error responses would only generate retry noise.
  return new NextResponse(null, { status: 204 })
}
