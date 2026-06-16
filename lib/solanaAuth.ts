import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { buildSignMessage } from './auth'

export { buildSignMessage }

export function isSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) && !address.startsWith('0x')
}

export function verifySolanaSignature(
  address: string,
  message: string,
  signatureBase58: string
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message)
    const signatureBytes = bs58.decode(signatureBase58)
    const publicKeyBytes = bs58.decode(address)
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)
  } catch {
    return false
  }
}
