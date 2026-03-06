import type { ChainConfig } from '@/lib/chains'

// Aave V2 aTokens (Ethereum only)
const AAVE_V2_TOKENS = new Set([
  '0x028171bca77440897b824ca71d1c56caac55b68a3', // aDAI
  '0xbcca60bb61934080951369a648fb03df4f96263c', // aUSDC
  '0x3ed3b47dd13ec9a98b44e6204a523e766b225811', // aUSDT
  '0x030ba81f1c18d280636f32af80b9aad02cf0854e', // aWETH
  '0x9ff58f4ffb29fa2266ab25e75e2a8b3503311656', // aWBTC
])

// Compound V2 cTokens (Ethereum only)
const COMPOUND_V2_TOKENS = new Set([
  '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5', // cETH
  '0x39aa39c021dfbae8fac545936693ac917d5e7563', // cUSDC
  '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643', // cDAI
  '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9', // cUSDT
  '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4', // cWBTC
])

// Uniswap V3 NonfungiblePositionManager — same address on all EVM chains
const UNISWAP_V3_POSITIONS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'

function rpcUrl(network: string): string {
  return `https://${network}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ''}`
}

function nftApiBase(network: string): string {
  return `https://${network}.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY || ''}`
}

async function alchemyRpc(network: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl(network), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    next: { revalidate: 3600 },
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result
}

async function alchemyNftGet(network: string, path: string): Promise<unknown> {
  const res = await fetch(`${nftApiBase(network)}/${path}`, {
    next: { revalidate: 3600 },
  })
  return res.json()
}

export interface TokenBalancesResult {
  totalPortfolioUSD: number
  stablecoinPct: number
  hasETH: boolean
  hasStakedETH: boolean
  hasENS: boolean
  hasAave: boolean
  hasCompound: boolean
  hasUniswapLP: boolean
  isGnosisSafe: boolean
  error?: string
}

export async function getTokenBalances(address: string, chain: ChainConfig): Promise<TokenBalancesResult> {
  const network = chain.alchemyNetwork
  const isEthereum = chain.slug === 'ethereum'

  try {
    const addr = address.toLowerCase()

    const parallelCalls: Promise<unknown>[] = [
      alchemyRpc(network, 'eth_getBalance', [address, 'latest']),
      alchemyRpc(network, 'alchemy_getTokenBalances', [address]),
      alchemyRpc(network, 'eth_getCode', [address, 'latest']),
      alchemyNftGet(network, `getNFTsForOwner?owner=${address}&contractAddresses[]=${UNISWAP_V3_POSITIONS}&withMetadata=false`),
    ]

    // ENS reverse lookup — Ethereum only
    if (isEthereum) {
      parallelCalls.push(
        alchemyRpc(network, 'eth_call', [
          { to: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e', data: `0x0178b8bf${addr.slice(2).padStart(64, '0')}` },
          'latest',
        ])
      )
    }

    const results = await Promise.allSettled(parallelCalls)
    const [ethBalRes, tokenRes, codeRes, nftRes, ensRes] = results

    // ETH balance
    const ethBal = ethBalRes.status === 'fulfilled' ? (ethBalRes.value as string) : '0x0'
    const hasETH = ethBal !== '0x0' && ethBal !== '0x' && BigInt(ethBal) > 0n

    // ENS (Ethereum only)
    let hasENS = false
    if (isEthereum && ensRes?.status === 'fulfilled') {
      const resolverAddr = ensRes.value as string
      hasENS = resolverAddr !== '0x' + '0'.repeat(64) && resolverAddr !== '0x'
    }

    if (isEthereum && !hasENS) {
      try {
        const reverseNode = `${addr.slice(2).padStart(64, '0').toLowerCase()}`
        const reverseRes = await alchemyRpc(network, 'eth_call', [
          { to: '0x084b1c3C81545d370f3634392De611CaaBFf8148', data: `0x691f3431${reverseNode}` },
          'latest',
        ]) as string
        if (reverseRes && reverseRes !== '0x' && reverseRes.length > 66) {
          hasENS = true
        }
      } catch {
        // ignore
      }
    }

    // Contract code → Gnosis Safe detection
    const code = codeRes.status === 'fulfilled' ? (codeRes.value as string) : '0x'
    const isContract = code !== '0x' && code.length > 2
    const isGnosisSafe = isContract && code.length < 300

    // Token balances
    let hasStakedETH = false
    let hasAave = false
    let hasCompound = false
    let stablecoinBalance = 0
    let totalDetectedUSD = 0

    if (tokenRes.status === 'fulfilled') {
      const balances = (tokenRes.value as { tokenBalances: Array<{ contractAddress: string; tokenBalance: string }> }).tokenBalances
      for (const t of balances) {
        const tAddr = t.contractAddress.toLowerCase()
        if (!t.tokenBalance || t.tokenBalance === '0x0000000000000000000000000000000000000000000000000000000000000000') continue

        // Staking detection
        if (chain.lidoToken && tAddr === chain.lidoToken.toLowerCase()) hasStakedETH = true

        // Aave detection: V3 tokens from chain config + V2 tokens (ETH only)
        if (chain.aaveV3Tokens.has(tAddr)) hasAave = true
        if (isEthereum && AAVE_V2_TOKENS.has(tAddr)) hasAave = true

        // Compound detection (V2 cTokens — Ethereum only)
        if (isEthereum && COMPOUND_V2_TOKENS.has(tAddr)) hasCompound = true

        // Stablecoin portfolio value
        if (chain.stablecoinAddresses.has(tAddr)) {
          // USDC/USDT typically 6 decimals; DAI and others 18
          const is6Decimal = [
            '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // ETH USDC
            '0xdac17f958d2ee523a2206206994597c13d831ec7', // ETH USDT
            '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // Polygon USDC.e
            '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', // Polygon USDC
            '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // Polygon USDT
            '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum USDC
            '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // Arbitrum USDC.e
            '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // Arbitrum USDT
            '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // Optimism USDC
            '0x7f5c764cbc14f9669b88837ca1490cca17c31607', // Optimism USDC.e
            '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', // Optimism USDT
            '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base USDC
            '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', // Avalanche USDC native
            '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664', // Avalanche USDC.e
            '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7', // Avalanche USDT native
            // BNB Chain stablecoins use 18 decimals — not listed here
          ].includes(tAddr)
          const decimals = is6Decimal ? 6 : 18
          const bal = Number(BigInt(t.tokenBalance)) / Math.pow(10, decimals)
          stablecoinBalance += bal
          totalDetectedUSD += bal
        }
      }
    }

    // Uniswap V3 LP NFTs
    const hasUniswapLP = nftRes.status === 'fulfilled' && ((nftRes.value as { ownedNfts: unknown[] })?.ownedNfts?.length ?? 0) > 0

    const stablecoinPct = totalDetectedUSD > 0 ? (stablecoinBalance / totalDetectedUSD) * 100 : 0

    return {
      totalPortfolioUSD: totalDetectedUSD,
      stablecoinPct,
      hasETH,
      hasStakedETH,
      hasENS,
      hasAave,
      hasCompound,
      hasUniswapLP,
      isGnosisSafe,
    }
  } catch (e) {
    return {
      totalPortfolioUSD: 0,
      stablecoinPct: 0,
      hasETH: false,
      hasStakedETH: false,
      hasENS: false,
      hasAave: false,
      hasCompound: false,
      hasUniswapLP: false,
      isGnosisSafe: false,
      error: String(e),
    }
  }
}
