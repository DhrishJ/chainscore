// ChainScore charges 0.75% origination fee on every matched loan

export const ORIGINATION_FEE_BPS = 75 // 0.75% = 75 basis points

export function calculateFee(loanAmount: number): number {
  return loanAmount * (ORIGINATION_FEE_BPS / 10000)
}

export function calculateNetAmount(loanAmount: number): number {
  return loanAmount - calculateFee(loanAmount)
}

export function formatFee(loanAmount: number, currency: string): string {
  const fee = calculateFee(loanAmount)
  return `${fee.toFixed(4)} ${currency}`
}
