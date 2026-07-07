import { NextRequest, NextResponse } from 'next/server'
import {
  billingEnabled,
  prismaSubscriptionStore,
  routeStripeEvent,
  stripeEventSchema,
  verifyWebhookRequest,
} from '@/lib/billing/stripe'

export const dynamic = 'force-dynamic'

// Stripe webhook receiver (draft, see lib/billing/stripe.ts for the human
// follow-up this needs before go-live). Verifies Stripe-Signature over the
// raw body, then upserts Subscription rows for the events that matter to
// plan/status. 503 while STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are
// unset, so this route is inert in every environment until a human wires
// real keys.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!billingEnabled()) {
    return NextResponse.json({ error: 'Billing is not configured' }, { status: 503 })
  }

  // Signature verification requires the exact bytes Stripe signed; parsing
  // as JSON first would let whitespace differences invalidate the check.
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('stripe-signature')

  const verification = verifyWebhookRequest(rawBody, signatureHeader)
  if (!verification.ok) {
    return NextResponse.json({ error: `Signature verification failed: ${verification.reason}` }, { status: 400 })
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const event = stripeEventSchema.safeParse(parsedJson)
  if (!event.success) {
    // Correctly signed but not shaped like a Stripe event: still 200, this
    // is not something Stripe should retry.
    return NextResponse.json({ received: true, handled: false })
  }

  try {
    const result = await routeStripeEvent(event.data, prismaSubscriptionStore)
    return NextResponse.json({ received: true, handled: result.handled })
  } catch (e) {
    // A handler failure should not turn into a Stripe retry storm; log and
    // still 200. Reconciliation for a failed upsert is a manual/human step
    // (Stripe dashboard remains the source of truth regardless).
    console.error('[billing webhook] handling failed', e)
    return NextResponse.json({ received: true, handled: false })
  }
}
