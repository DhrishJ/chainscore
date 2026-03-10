"""
ChainScore — On-chain wallet data collector
Scrapes Aave V3 + Compound V2 borrowers from The Graph,
fetches per-wallet features via Etherscan + Alchemy,
and outputs features.csv with binary credit labels.

Label:  1 = repaid without liquidation (good credit)
        0 = was liquidated (bad credit)

Usage:
    pip install requests python-dotenv tqdm
    python collect_data.py

Outputs:
    ml/features.csv
"""

import os
import csv
import time
import math
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))

ETHERSCAN_API_KEY = os.getenv('ETHERSCAN_API_KEY', '')
ALCHEMY_API_KEY   = os.getenv('ALCHEMY_API_KEY', '')
THEGRAPH_API_KEY  = os.getenv('THEGRAPH_API_KEY', '')

AAVE_V3_SUBGRAPH    = 'GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF'
COMPOUND_V2_SUBGRAPH = '4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a'
GRAPH_GATEWAY = f'https://gateway.thegraph.com/api/{THEGRAPH_API_KEY}/subgraphs/id'

ALCHEMY_ETH  = f'https://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}'
ETHERSCAN    = 'https://api.etherscan.io/v2/api'

# Known token sets (Ethereum mainnet)
STABLECOINS = {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',  # USDC
    '0xdac17f958d2ee523a2206206994597c13d831ec7',  # USDT
    '0x6b175474e89094c44da98b954eedeac495271d0f',  # DAI
    '0x4fabb145d64652a948d72533023f6e7a623c7c53',  # BUSD
    '0x853d955acef822db058eb8505911ed77f175b99e',  # FRAX
}
LIDO_STETH     = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84'
AAVE_V2_TOKENS = {
    '0x028171bca77440897b824ca71d1c56caac55b68a3',
    '0xbcca60bb61934080951369a648fb03df4f96263c',
    '0x3ed3b47dd13ec9a98b44e6204a523e766b225811',
    '0x030ba81f1c18d280636f32af80b9aad02cf0854e',
    '0x9ff58f4ffb29fa2266ab25e75e2a8b3503311656',
}
COMPOUND_V2_TOKENS = {
    '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5',
    '0x39aa39c021dfbae8fac545936693ac917d5e7563',
    '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643',
    '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9',
    '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4',
}
UNISWAP_V3_POSITIONS = '0xc36442b4a4522e871399cd717abdd847ab11fe88'

# How many wallets to collect per protocol
TARGET_PER_PROTOCOL = 1500
REQUEST_DELAY = 0.2   # seconds between API calls — adjust to stay within rate limits

# ─────────────────────────────────────────────────────────────
# The Graph helpers
# ─────────────────────────────────────────────────────────────

def graph_query(subgraph_id: str, query: str, variables: dict) -> dict:
    url = f'{GRAPH_GATEWAY}/{subgraph_id}'
    resp = requests.post(url, json={'query': query, 'variables': variables}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if 'errors' in data:
        raise RuntimeError(data['errors'][0]['message'])
    return data.get('data', {})


def fetch_aave_borrowers(limit: int = TARGET_PER_PROTOCOL) -> list[dict]:
    """
    Returns list of {address, borrows, repays, liquidations}.
    Paginates with skip to get `limit` distinct users.
    """
    query = """
    query($first: Int!, $skip: Int!) {
      users(first: $first, skip: $skip, where: { borrowedReservesCount_gt: 0 }) {
        id
        borrowedReservesCount
      }
    }
    """
    results = []
    batch = 100
    for skip in range(0, limit, batch):
        data = graph_query(AAVE_V3_SUBGRAPH, query, {'first': min(batch, limit - skip), 'skip': skip})
        users = data.get('users', [])
        if not users:
            break
        results.extend(users)
        time.sleep(REQUEST_DELAY)
    return results


def fetch_compound_borrowers(limit: int = TARGET_PER_PROTOCOL) -> list[dict]:
    """
    Returns list of accounts that have borrowed on Compound V2.
    Uses Messari's standardized lending schema.
    """
    query = """
    query($first: Int!, $skip: Int!) {
      accounts(first: $first, skip: $skip, where: { borrowCount_gt: 0 }) {
        id
        borrowCount
      }
    }
    """
    results = []
    batch = 100
    for skip in range(0, limit, batch):
        try:
            data = graph_query(COMPOUND_V2_SUBGRAPH, query, {'first': min(batch, limit - skip), 'skip': skip})
            accounts = data.get('accounts', [])
            if not accounts:
                break
            results.extend(accounts)
            time.sleep(REQUEST_DELAY)
        except Exception as e:
            print(f'  [compound borrowers] skip={skip} error: {e}')
            break
    return results


def fetch_aave_activity(address: str) -> dict:
    query = """
    query($user: String!) {
      borrows(where: { user: $user }, first: 1000) { id }
      repays(where: { user: $user }, first: 1000) { id }
      liquidationCalls(where: { user: $user }, first: 100) { id }
    }
    """
    try:
        data = graph_query(AAVE_V3_SUBGRAPH, query, {'user': address.lower()})
        return {
            'aave_borrows': len(data.get('borrows', [])),
            'aave_repays': len(data.get('repays', [])),
            'aave_liquidations': len(data.get('liquidationCalls', [])),
            'aave_error': 0,
        }
    except Exception as e:
        print(f'  [aave] {address[:10]}... error: {e}')
        return {'aave_borrows': 0, 'aave_repays': 0, 'aave_liquidations': 0, 'aave_error': 1}


def fetch_compound_activity(address: str) -> dict:
    # Messari standardized lending schema
    query = """
    query($account: String!) {
      borrows(where: { account: $account }, first: 1000) { id }
      repays(where: { account: $account }, first: 1000) { id }
      liquidates(where: { liquidatee: $account }, first: 100) { id }
    }
    """
    try:
        data = graph_query(COMPOUND_V2_SUBGRAPH, query, {'account': address.lower()})
        return {
            'compound_borrows': len(data.get('borrows', [])),
            'compound_repays': len(data.get('repays', [])),
            'compound_liquidations': len(data.get('liquidates', [])),
            'compound_error': 0,
        }
    except Exception as e:
        print(f'  [compound] {address[:10]}... error: {e}')
        return {'compound_borrows': 0, 'compound_repays': 0, 'compound_liquidations': 0, 'compound_error': 1}


# ─────────────────────────────────────────────────────────────
# Etherscan helpers
# ─────────────────────────────────────────────────────────────

def etherscan_get(params: dict) -> dict:
    params['apikey'] = ETHERSCAN_API_KEY
    params['chainid'] = 1
    resp = requests.get(ETHERSCAN, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_tx_history(address: str) -> dict:
    try:
        resp = etherscan_get({
            'module': 'account',
            'action': 'txlist',
            'address': address,
            'sort': 'desc',
            'page': 1,
            'offset': 10000,
        })
        if resp.get('status') != '1' or not resp.get('result'):
            return {'tx_count': 0, 'active_months_12': 0, 'first_tx_timestamp': None, 'etherscan_error': 0}

        txns = resp['result']
        tx_count = len(txns)
        timestamps = [int(t['timeStamp']) for t in txns]
        first_tx = min(timestamps)

        now = time.time()
        twelve_ago = now - 365 * 86400
        month_set = set()
        for ts in timestamps:
            if ts >= twelve_ago:
                d = datetime.fromtimestamp(ts, tz=timezone.utc)
                month_set.add(f'{d.year}-{d.month}')

        return {
            'tx_count': tx_count,
            'active_months_12': len(month_set),
            'first_tx_timestamp': first_tx,
            'etherscan_error': 0,
        }
    except Exception as e:
        print(f'  [etherscan] {address[:10]}... error: {e}')
        return {'tx_count': 0, 'active_months_12': 0, 'first_tx_timestamp': None, 'etherscan_error': 1}


# ─────────────────────────────────────────────────────────────
# Alchemy helpers
# ─────────────────────────────────────────────────────────────

def alchemy_rpc(method: str, params: list) -> object:
    resp = requests.post(
        ALCHEMY_ETH,
        json={'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if 'error' in data:
        raise RuntimeError(data['error']['message'])
    return data['result']


def alchemy_nft_get(path: str) -> dict:
    url = f'https://eth-mainnet.g.alchemy.com/nft/v3/{ALCHEMY_API_KEY}/{path}'
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_token_data(address: str) -> dict:
    try:
        eth_bal_hex = alchemy_rpc('eth_getBalance', [address, 'latest'])
        has_eth = int(eth_bal_hex, 16) > 0

        token_result = alchemy_rpc('alchemy_getTokenBalances', [address])
        balances = token_result.get('tokenBalances', []) if isinstance(token_result, dict) else []

        code = alchemy_rpc('eth_getCode', [address, 'latest'])
        is_contract = isinstance(code, str) and code != '0x' and len(code) > 2
        is_gnosis_safe = is_contract and len(code) < 300

        has_staked_eth = False
        has_aave = False
        has_compound = False
        stablecoin_usd = 0.0
        total_usd = 0.0

        SIX_DECIMAL_STABLE = {
            '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',  # USDC
            '0xdac17f958d2ee523a2206206994597c13d831ec7',  # USDT
        }

        for t in balances:
            addr = t['contractAddress'].lower()
            bal_hex = t.get('tokenBalance', '0x0')
            if not bal_hex or bal_hex == '0x' + '0' * 64:
                continue

            try:
                raw = int(bal_hex, 16)
            except (ValueError, TypeError):
                continue

            if addr == LIDO_STETH:
                has_staked_eth = True
            if addr in AAVE_V2_TOKENS:
                has_aave = True
            if addr in COMPOUND_V2_TOKENS:
                has_compound = True

            if addr in STABLECOINS:
                decimals = 6 if addr in SIX_DECIMAL_STABLE else 18
                usd_val = raw / (10 ** decimals)
                stablecoin_usd += usd_val
                total_usd += usd_val

        stablecoin_pct = (stablecoin_usd / total_usd * 100) if total_usd > 0 else 0.0

        # Uniswap V3 LP NFTs
        nft_data = alchemy_nft_get(
            f'getNFTsForOwner?owner={address}'
            f'&contractAddresses[]={UNISWAP_V3_POSITIONS}&withMetadata=false'
        )
        has_uniswap_lp = len(nft_data.get('ownedNfts', [])) > 0

        # ENS reverse lookup
        addr_padded = address.lower()[2:].zfill(64)
        ens_result = alchemy_rpc('eth_call', [
            {'to': '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
             'data': f'0x0178b8bf{addr_padded}'},
            'latest',
        ])
        has_ens = (
            isinstance(ens_result, str)
            and ens_result != '0x'
            and ens_result != '0x' + '0' * 64
        )

        return {
            'has_eth': int(has_eth),
            'has_staked_eth': int(has_staked_eth),
            'has_aave_tokens': int(has_aave),
            'has_compound_tokens': int(has_compound),
            'has_uniswap_lp': int(has_uniswap_lp),
            'has_ens': int(has_ens),
            'is_gnosis_safe': int(is_gnosis_safe),
            'stablecoin_usd': round(stablecoin_usd, 2),
            'total_portfolio_usd': round(total_usd, 2),
            'stablecoin_pct': round(stablecoin_pct, 2),
            'alchemy_error': 0,
        }
    except Exception as e:
        print(f'  [alchemy] {address[:10]}... error: {e}')
        return {
            'has_eth': 0, 'has_staked_eth': 0,
            'has_aave_tokens': 0, 'has_compound_tokens': 0,
            'has_uniswap_lp': 0, 'has_ens': 0, 'is_gnosis_safe': 0,
            'stablecoin_usd': 0, 'total_portfolio_usd': 0, 'stablecoin_pct': 0,
            'alchemy_error': 1,
        }


# ─────────────────────────────────────────────────────────────
# Feature derivation
# ─────────────────────────────────────────────────────────────

def derive_features(address: str, raw: dict) -> dict:
    now = time.time()
    first_ts = raw.get('first_tx_timestamp')
    wallet_age_days  = int((now - first_ts) / 86400) if first_ts else 0
    wallet_age_months = wallet_age_days // 30

    total_borrows = raw['aave_borrows'] + raw['compound_borrows']
    total_repays  = raw['aave_repays']  + raw['compound_repays']
    repay_rate    = (total_repays / total_borrows) if total_borrows > 0 else None

    # Protocols used count
    protocols = 0
    if raw['aave_borrows'] > 0 or raw['has_aave_tokens']:
        protocols += 1
    if raw['compound_borrows'] > 0 or raw['has_compound_tokens']:
        protocols += 1
    if raw['has_uniswap_lp']:
        protocols += 1
    if raw['has_staked_eth']:
        protocols += 1

    total_liquidations = raw['aave_liquidations'] + raw.get('compound_liquidations', 0)

    # Label: 1 = good (repaid, no liquidation), 0 = bad (liquidated)
    # Wallets with no borrow history are excluded from training (label = -1)
    if total_borrows == 0:
        label = -1   # will be filtered out
    elif total_liquidations > 0:
        label = 0
    elif total_repays >= total_borrows * 0.9:
        label = 1
    elif total_repays < total_borrows * 0.5:
        label = 0
    else:
        label = -1   # ambiguous — exclude

    return {
        'address': address,
        # Wallet age
        'wallet_age_days': wallet_age_days,
        'wallet_age_months': wallet_age_months,
        # Transaction activity
        'tx_count': raw['tx_count'],
        'active_months_12': raw['active_months_12'],
        # Lending history
        'aave_borrows': raw['aave_borrows'],
        'aave_repays': raw['aave_repays'],
        'aave_liquidations': raw['aave_liquidations'],
        'compound_borrows': raw['compound_borrows'],
        'compound_repays': raw['compound_repays'],
        'compound_liquidations': raw.get('compound_liquidations', 0),
        'total_borrows': total_borrows,
        'total_repays': total_repays,
        'total_liquidations': total_liquidations,
        'repay_rate': round(repay_rate, 4) if repay_rate is not None else -1,
        # Protocol breadth
        'protocols_used_count': protocols,
        'has_uniswap_lp': raw['has_uniswap_lp'],
        'has_staked_eth': raw['has_staked_eth'],
        # Portfolio
        'has_eth': raw['has_eth'],
        'has_ens': raw['has_ens'],
        'is_gnosis_safe': raw['is_gnosis_safe'],
        'stablecoin_usd': raw['stablecoin_usd'],
        'total_portfolio_usd': raw['total_portfolio_usd'],
        'stablecoin_pct': raw['stablecoin_pct'],
        # Data quality flags
        'etherscan_error': raw['etherscan_error'],
        'alchemy_error': raw['alchemy_error'],
        'aave_error': raw['aave_error'],
        'compound_error': raw['compound_error'],
        # Label
        'label': label,
    }


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'features.csv')

FIELDNAMES = [
    'address',
    'wallet_age_days', 'wallet_age_months',
    'tx_count', 'active_months_12',
    'aave_borrows', 'aave_repays', 'aave_liquidations',
    'compound_borrows', 'compound_repays', 'compound_liquidations',
    'total_borrows', 'total_repays', 'total_liquidations', 'repay_rate',
    'protocols_used_count', 'has_uniswap_lp', 'has_staked_eth',
    'has_eth', 'has_ens', 'is_gnosis_safe',
    'stablecoin_usd', 'total_portfolio_usd', 'stablecoin_pct',
    'etherscan_error', 'alchemy_error', 'aave_error', 'compound_error',
    'label',
]


def load_existing_addresses() -> set[str]:
    if not os.path.exists(OUTPUT_FILE):
        return set()
    with open(OUTPUT_FILE, newline='') as f:
        reader = csv.DictReader(f)
        return {row['address'].lower() for row in reader}


def main():
    print('ChainScore — Data Collector')
    print(f'Output: {OUTPUT_FILE}\n')

    if not ETHERSCAN_API_KEY:
        print('ERROR: ETHERSCAN_API_KEY not set in .env.local')
        return
    if not ALCHEMY_API_KEY:
        print('ERROR: ALCHEMY_API_KEY not set in .env.local')
        return
    if not THEGRAPH_API_KEY:
        print('ERROR: THEGRAPH_API_KEY not set in .env.local')
        return

    # Resume support — skip already collected addresses
    existing = load_existing_addresses()
    print(f'Already collected: {len(existing)} wallets')

    file_exists = os.path.exists(OUTPUT_FILE)
    outfile = open(OUTPUT_FILE, 'a', newline='')
    writer = csv.DictWriter(outfile, fieldnames=FIELDNAMES)
    if not file_exists:
        writer.writeheader()

    try:
        # Step 1: Get wallet addresses from The Graph (Aave V3 + Compound V2)
        print(f'\nFetching up to {TARGET_PER_PROTOCOL} Aave V3 borrowers from The Graph...')
        aave_users = fetch_aave_borrowers(TARGET_PER_PROTOCOL)
        aave_addrs = {u['id'].lower() for u in aave_users}
        print(f'  -> {len(aave_addrs)} Aave borrowers')

        print(f'Fetching up to {TARGET_PER_PROTOCOL} Compound V2 borrowers from The Graph...')
        compound_users = fetch_compound_borrowers(TARGET_PER_PROTOCOL)
        compound_addrs = {u['id'].lower() for u in compound_users}
        print(f'  -> {len(compound_addrs)} Compound borrowers')

        all_addrs = aave_addrs | compound_addrs
        addresses = [a for a in all_addrs if a not in existing]
        print(f'  -> {len(addresses)} unique new addresses to process (combined)')

        # Step 2: Per-wallet data collection
        collected = 0
        skipped   = 0

        for addr in tqdm(addresses, desc='Collecting wallets'):
            addr_lower = addr.lower()
            if addr_lower in existing:
                skipped += 1
                continue

            raw: dict = {'address': addr}

            # Fetch all data sources
            time.sleep(REQUEST_DELAY)
            raw.update(fetch_aave_activity(addr))

            time.sleep(REQUEST_DELAY)
            raw.update(fetch_compound_activity(addr))

            time.sleep(REQUEST_DELAY)
            raw.update(fetch_tx_history(addr))

            time.sleep(REQUEST_DELAY)
            raw.update(fetch_token_data(addr))

            features = derive_features(addr, raw)
            writer.writerow(features)
            outfile.flush()

            existing.add(addr_lower)
            collected += 1

    finally:
        outfile.close()

    print(f'\nDone. Collected {collected} wallets, skipped {skipped} duplicates.')
    print(f'Output: {OUTPUT_FILE}')

    # Quick summary
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, newline='') as f:
            rows = list(csv.DictReader(f))
        labels = [int(r['label']) for r in rows if r['label'] in ('0', '1')]
        good = labels.count(1)
        bad  = labels.count(0)
        excl = len(rows) - len(labels)
        print(f'\nDataset summary:')
        print(f'  Total rows:  {len(rows)}')
        print(f'  Label=1 (good credit): {good}')
        print(f'  Label=0 (bad credit):  {bad}')
        print(f'  Excluded (ambiguous):  {excl}')


if __name__ == '__main__':
    main()
