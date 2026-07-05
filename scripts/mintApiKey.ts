// Mint a partner API key (Workstream E).
//
//   npx tsx scripts/mintApiKey.ts "Partner Name" [rateLimitPerMin]
//
// Prints the plaintext key ONCE (store it now, it is not recoverable) and
// writes the hashed record to the database. If the database is unreachable,
// it still prints the plaintext and the SQL to insert the record manually,
// so key creation is never blocked on connectivity.

import { generateApiKey } from '@/lib/apiKey'
import { prisma } from '@/lib/db'

async function main(): Promise<void> {
  const name = process.argv[2]
  if (!name) {
    console.error('usage: npx tsx scripts/mintApiKey.ts "Partner Name" [rateLimitPerMin]')
    process.exit(2)
  }
  const rate = Number(process.argv[3] ?? 60)
  const { plaintext, record } = generateApiKey(name, rate)

  console.log('\nAPI key (shown once, store it now):')
  console.log(`  ${plaintext}\n`)

  try {
    await prisma.apiKey.create({ data: record })
    console.log(`stored key id=${record.id} name="${name}" rateLimitPerMin=${rate}`)
  } catch (e) {
    console.warn(`could not write to the database (${e instanceof Error ? e.message.split('\n')[0] : e}).`)
    console.warn('Insert manually with:')
    console.warn(
      `  INSERT INTO "ApiKey" (id, name, "keyHash", "rateLimitPerMin", "createdAt") VALUES ('${record.id}', '${name.replace(/'/g, "''")}', '${record.keyHash}', ${rate}, now());`
    )
  } finally {
    await prisma.$disconnect().catch(() => undefined)
  }
}

main()
