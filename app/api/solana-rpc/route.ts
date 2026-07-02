import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env.server'

// Server-side Solana RPC proxy. The wallet UI used to talk to Helius with a
// NEXT_PUBLIC_ API key baked into the client bundle (ARCHITECTURE.md 6.2);
// this route keeps the key server-only. Only the read methods the wallet UI
// actually needs are allowed, so the endpoint cannot be repurposed as a free
// general-purpose RPC relay. IP rate limiting applies via middleware.

const ALLOWED_METHODS = new Set([
  'getVersion',
  'getHealth',
  'getSlot',
  'getBlockHeight',
  'getLatestBlockhash',
  'getBalance',
  'getAccountInfo',
  'getMultipleAccounts',
  'getTokenAccountsByOwner',
  'getSignaturesForAddress',
  'getTransaction',
])

interface RpcCall {
  jsonrpc?: string
  id?: unknown
  method?: unknown
  params?: unknown
}

function rejected(call: RpcCall) {
  return {
    jsonrpc: '2.0',
    id: call.id ?? null,
    error: { code: -32601, message: 'Method not allowed by this proxy' },
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const calls: RpcCall[] = Array.isArray(body) ? body : [body as RpcCall]
  if (calls.length > 10) {
    return NextResponse.json({ error: 'Batch too large' }, { status: 400 })
  }
  for (const call of calls) {
    if (typeof call?.method !== 'string' || !ALLOWED_METHODS.has(call.method)) {
      const response = Array.isArray(body) ? calls.map(rejected) : rejected(calls[0])
      return NextResponse.json(response, { status: 200 })
    }
  }

  try {
    const upstream = await fetch(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const payload = await upstream.text()
    return new NextResponse(payload, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[POST /api/solana-rpc] upstream failure:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Upstream RPC unavailable' }, { status: 502 })
  }
}
