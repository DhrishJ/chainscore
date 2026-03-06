export interface ChainConfig {
  id: number
  slug: string
  name: string
  icon: string
  alchemyNetwork: string
  nativeCurrencySymbol: string
  stablecoinAddresses: Set<string>
  aaveV3Tokens: Set<string>
  lidoToken: string | null
  supportsENS: boolean
}

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    id: 1,
    slug: 'ethereum',
    name: 'Ethereum',
    icon: 'ETH',
    alchemyNetwork: 'eth-mainnet',
    nativeCurrencySymbol: 'ETH',
    stablecoinAddresses: new Set([
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
      '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
      '0x4fabb145d64652a948d72533023f6e7a623c7c53', // BUSD
      '0x0000000000085d4780b73119b644ae5ecd22b376', // TUSD
    ]),
    aaveV3Tokens: new Set([
      '0x98c23e9d8f34fefb1b7bd6a91b7af122e394e80f', // aEthUSDC
      '0x018008bfb33d285247a21d44e50697654f754e63', // aEthDAI
      '0x23878914efe38d27c4d67ab83ed1b93a74d4086a', // aEthUSDT
      '0x4d5f47fa6a74756616349f32c57fb54567d5a3e1', // aEthWETH
      '0x5ee5bf7ae06d1be5997a1a72006fe6c607ec6de8', // aEthWBTC
    ]),
    lidoToken: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', // stETH
    supportsENS: true,
  },

  polygon: {
    id: 137,
    slug: 'polygon',
    name: 'Polygon',
    icon: 'POL',
    alchemyNetwork: 'polygon-mainnet',
    nativeCurrencySymbol: 'POL',
    stablecoinAddresses: new Set([
      '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e
      '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', // USDC native
      '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // USDT
      '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', // DAI
    ]),
    aaveV3Tokens: new Set([
      '0x625e7708f30ca75bfd92586e17077590c60eb4cd', // aPolUSDC
      '0x6ab707aca953edaefbc4fd23ba73294241490620', // aPolUSDT
      '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8', // aPolWETH
      '0x6d80113e533a2c0fe82eabd35f1875dcea89ea97', // aPolWMATIC
    ]),
    lidoToken: null,
    supportsENS: false,
  },

  arbitrum: {
    id: 42161,
    slug: 'arbitrum',
    name: 'Arbitrum',
    icon: 'ARB',
    alchemyNetwork: 'arb-mainnet',
    nativeCurrencySymbol: 'ETH',
    stablecoinAddresses: new Set([
      '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC native
      '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
      '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
      '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
    ]),
    aaveV3Tokens: new Set([
      '0x724dc807b04555b71ed48a6896b6f41593b8c637', // aArbUSDCn
      '0x82e64f49ed5ec1bc6e43dad4fc8af9bb3a2312e',  // aArbDAI
      '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8', // aArbWETH
    ]),
    lidoToken: null,
    supportsENS: false,
  },

  optimism: {
    id: 10,
    slug: 'optimism',
    name: 'Optimism',
    icon: 'OP',
    alchemyNetwork: 'opt-mainnet',
    nativeCurrencySymbol: 'ETH',
    stablecoinAddresses: new Set([
      '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // USDC native
      '0x7f5c764cbc14f9669b88837ca1490cca17c31607', // USDC.e
      '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', // USDT
      '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
    ]),
    aaveV3Tokens: new Set([
      '0x38d693ce1df5aadf7bc62595a37d667ad57922e5', // aOptUSDCn
      '0x82e64f49ed5ec1bc6e43dad4fc8af9bb3a2312e',  // aOptDAI
      '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8', // aOptWETH
    ]),
    lidoToken: '0x1f32b1c2345538c0c6f582fcb022739c4a194ebb', // wstETH on Optimism
    supportsENS: false,
  },

  base: {
    id: 8453,
    slug: 'base',
    name: 'Base',
    icon: 'BASE',
    alchemyNetwork: 'base-mainnet',
    nativeCurrencySymbol: 'ETH',
    stablecoinAddresses: new Set([
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
      '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
    ]),
    aaveV3Tokens: new Set([
      '0x4e65fe4dba92790696d040ac24aa414708f5c0ab', // aBasUSDC
      '0x99cbc45ea5bb7ef3a5bc08fb1b7e56bb2442ef0d', // aBasWETH
    ]),
    lidoToken: '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452', // wstETH on Base
    supportsENS: false,
  },
}

export function getChain(slug: string | undefined | null): ChainConfig {
  if (!slug) return CHAINS.ethereum
  return CHAINS[slug.toLowerCase()] ?? CHAINS.ethereum
}

export const CHAIN_LIST = Object.values(CHAINS)
