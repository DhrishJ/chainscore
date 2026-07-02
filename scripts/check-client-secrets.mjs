#!/usr/bin/env node
// Build-time check: fail the build if server secrets or private-key material
// appear anywhere in the client bundle (.next/static). Run after `next build`.
//
// Two detection layers:
//  1. Pattern scan: service-role markers and PEM private keys always fail.
//  2. Value scan: the literal values of server-only env vars (from process.env
//     and .env/.env.local) must not appear in client output.
//
// Every match fails the build. The historical NEXT_PUBLIC_HELIUS_API_KEY
// exception was removed when the server-side Solana RPC proxy landed; any
// Helius key in client output is a regression now.

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const STATIC_DIR = path.join(ROOT, '.next', 'static')

const SERVER_ONLY_KEYS = [
  'DATABASE_URL',
  'ETHERSCAN_API_KEY',
  'ALCHEMY_API_KEY',
  'THEGRAPH_API_KEY',
  'HELIUS_API_KEY',
  'SUPABASE_SERVICE_ROLE',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const FATAL_PATTERNS = [
  { name: 'Supabase service-role marker', re: /SUPABASE_SERVICE_ROLE/ },
  { name: 'JWT with service_role claim', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*/ },
  { name: 'PEM private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
]

function loadDotEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

function collectSecretValues() {
  const dotenv = { ...loadDotEnv(path.join(ROOT, '.env')), ...loadDotEnv(path.join(ROOT, '.env.local')) }
  const values = new Map() // value -> key name
  for (const key of SERVER_ONLY_KEYS) {
    for (const source of [process.env, dotenv]) {
      const v = source[key]
      if (v && v.length >= 8) values.set(v, key)
    }
  }
  return values
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else yield p
  }
}

if (!fs.existsSync(STATIC_DIR)) {
  console.error(`[check-client-secrets] ${STATIC_DIR} not found. Run "next build" first.`)
  process.exit(2)
}

const secretValues = collectSecretValues()
const failures = []
const warnings = []
let filesScanned = 0

for (const file of walk(STATIC_DIR)) {
  if (!/\.(js|json|txt|css|map)$/.test(file)) continue
  filesScanned++
  const content = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)

  for (const { name, re } of FATAL_PATTERNS) {
    if (re.test(content)) failures.push(`${rel}: matched pattern "${name}"`)
  }

  for (const [value, key] of secretValues) {
    if (!content.includes(value)) continue
    failures.push(`${rel}: value of server env var ${key} found in client bundle`)
  }
}

console.log(`[check-client-secrets] scanned ${filesScanned} files in .next/static`)
for (const w of warnings) console.warn(`[check-client-secrets] WARNING: ${w}`)

if (failures.length > 0) {
  for (const f of failures) console.error(`[check-client-secrets] FAIL: ${f}`)
  console.error(`[check-client-secrets] ${failures.length} finding(s). Build rejected.`)
  process.exit(1)
}

console.log('[check-client-secrets] OK: no server secrets in client output')
