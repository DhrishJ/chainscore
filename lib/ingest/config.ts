import { AlchemyTransfersSource } from './adapters/alchemyTransfers'
import { EtherscanCompatibleSource } from './adapters/etherscanCompatible'
import { TxHistorySource } from './types'

// Per-chain source priority. First entry is the primary; the failover walks
// the list in order. Adding a provider means adding an adapter instance and
// listing it here, nothing else changes.
//
// Chain notes:
// - Etherscan v2 free tier serves eth/polygon/arbitrum/optimism/base/bnb but
//   NOT Avalanche or Scroll, which is exactly the degraded-features gap this
//   workstream closes.
// - Snowtrace (Routescan) is keyless and Etherscan-shaped for Avalanche
//   (verified live 2026-07-02).
// - Scroll: the old blockscout.scroll.io instance was retired (it now
//   redirects to Scrollscan, which needs its own API key). Alchemy serves
//   Scroll once the network is enabled on the Alchemy app (dashboard
//   toggle). Scroll (534352) is not yet in lib/chains.ts (no UI path); the
//   ingest layer carries it for the Workstream C backfill.
// - Alchemy transfers act as the independent second source where available.

const etherscanV2 = new EtherscanCompatibleSource({
  name: 'etherscan_v2',
  kind: 'etherscan_v2',
  chainIds: [1, 137, 42161, 10, 8453, 56],
  minIntervalMs: 250,
})

const snowtrace = new EtherscanCompatibleSource({
  name: 'snowtrace',
  kind: 'keyless',
  baseUrl: 'https://api.snowtrace.io/api',
  chainIds: [43114],
  minIntervalMs: 350,
})

const alchemy = new AlchemyTransfersSource()

const PRIORITY: Record<number, TxHistorySource[]> = {
  1: [etherscanV2, alchemy],
  137: [etherscanV2, alchemy],
  42161: [etherscanV2, alchemy],
  10: [etherscanV2, alchemy],
  8453: [etherscanV2, alchemy],
  56: [etherscanV2],
  43114: [snowtrace, etherscanV2],
  534352: [alchemy],
}

export function txHistorySourcesFor(chainId: number): TxHistorySource[] {
  return (PRIORITY[chainId] ?? [etherscanV2]).filter((s) => s.supportsChain(chainId) || s === etherscanV2)
}
