import { NextResponse } from 'next/server'
import { recentScores } from '@/lib/recentScores'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(recentScores.get())
}
