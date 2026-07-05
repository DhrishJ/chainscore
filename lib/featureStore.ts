import { prisma } from '@/lib/db'

// Point-in-time feature store access (Workstream C). The one rule: a read
// for an as_of may only ever return a snapshot whose validAtTs is at or
// before that as_of. The store enforces it here so no caller can leak the
// future into a feature vector, and the backtest engine re-checks it as a
// second line of defense.

export interface FeatureSnapshotRecord {
  address: string
  chain: string
  validAtTs: number
  featureSetVersion: string
  features: number[]
  dataCompleteness: number
}

export interface FeatureStore {
  put(record: FeatureSnapshotRecord): Promise<void>
  // Latest snapshot with validAtTs <= asOfTs, or null when none exists yet.
  getAsOf(
    address: string,
    chain: string,
    asOfTs: number,
    featureSetVersion: string
  ): Promise<FeatureSnapshotRecord | null>
}

export const prismaFeatureStore: FeatureStore = {
  async put(record) {
    await prisma.featureSnapshot.upsert({
      where: {
        address_chain_validAtTs_featureSetVersion: {
          address: record.address,
          chain: record.chain,
          validAtTs: record.validAtTs,
          featureSetVersion: record.featureSetVersion,
        },
      },
      update: { features: record.features, dataCompleteness: record.dataCompleteness },
      create: { ...record, features: record.features },
    })
  },

  async getAsOf(address, chain, asOfTs, featureSetVersion) {
    const row = await prisma.featureSnapshot.findFirst({
      where: { address, chain, featureSetVersion, validAtTs: { lte: asOfTs } },
      orderBy: { validAtTs: 'desc' },
    })
    if (!row) return null
    return {
      address: row.address,
      chain: row.chain,
      validAtTs: row.validAtTs,
      featureSetVersion: row.featureSetVersion,
      features: row.features as number[],
      dataCompleteness: row.dataCompleteness,
    }
  },
}

// In-memory implementation with identical semantics, for tests and for
// running the engine before a database exists.
export function createMemoryFeatureStore(): FeatureStore {
  const rows: FeatureSnapshotRecord[] = []
  return {
    async put(record) {
      const idx = rows.findIndex(
        (r) =>
          r.address === record.address &&
          r.chain === record.chain &&
          r.validAtTs === record.validAtTs &&
          r.featureSetVersion === record.featureSetVersion
      )
      if (idx >= 0) rows[idx] = record
      else rows.push(record)
    },
    async getAsOf(address, chain, asOfTs, featureSetVersion) {
      const candidates = rows
        .filter(
          (r) =>
            r.address === address &&
            r.chain === chain &&
            r.featureSetVersion === featureSetVersion &&
            r.validAtTs <= asOfTs
        )
        .sort((a, b) => b.validAtTs - a.validAtTs)
      return candidates[0] ?? null
    },
  }
}
