import { prisma } from '@/lib/db'
import { validateContent, type FactRecord, type ValidationResult } from './validator'

// Server-side wrapper over the pure validator: loads the registry and
// validates a piece of outbound content against it. Every publish path
// (site copy checks, the marketing agent's posting tools) calls this and
// refuses to proceed on ok=false. Tool-layer enforcement, not prompt text.

export async function loadFacts(): Promise<FactRecord[]> {
  const rows = await prisma.factsRegistry.findMany()
  return rows.map((r) => ({
    key: r.key,
    value: r.value,
    numericValue: r.numericValue,
    unit: r.unit,
    verified: r.verified,
  }))
}

export async function validateAgainstRegistry(text: string): Promise<ValidationResult> {
  const facts = await loadFacts()
  return validateContent(text, facts)
}
