/**
 * Dynamic APR: higher score = lower APR
 * offeredAPR = maxAPR - ((borrowerScore - minBorrowerScore) / (850 - minBorrowerScore)) × (maxAPR - minAPR)
 */
export function calculateOfferedAPR(
  borrowerScore: number,
  minBorrowerScore: number,
  minAPR: number,
  maxAPR: number
): number {
  if (borrowerScore <= minBorrowerScore) return maxAPR
  if (borrowerScore >= 850) return minAPR
  const ratio = (borrowerScore - minBorrowerScore) / (850 - minBorrowerScore)
  const offered = maxAPR - ratio * (maxAPR - minAPR)
  return Math.round(offered * 100) / 100
}
