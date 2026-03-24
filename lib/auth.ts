import { verifyMessage } from 'viem'

export function buildSignMessage(action: string, nonce: string): string {
  return `ChainScore: ${action}\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString().split('T')[0]}`
}

export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: `0x${string}`
): Promise<boolean> {
  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature,
    })
    return valid
  } catch {
    return false
  }
}
