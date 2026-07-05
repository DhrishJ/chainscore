import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Serves the OpenAPI 3.1 document describing the v1 partner API. Read from
// disk on every request (rather than imported as a JSON module) so the spec
// can be edited without a rebuild, and so a malformed spec fails loudly here
// instead of silently breaking the build.
export async function GET() {
  const specPath = path.join(process.cwd(), 'public', 'openapi.json')
  const raw = fs.readFileSync(specPath, 'utf-8')
  const spec: unknown = JSON.parse(raw)

  return NextResponse.json(spec, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
