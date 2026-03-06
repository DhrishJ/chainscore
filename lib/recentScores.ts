export interface RecentScore {
  address: string
  score: number
  timestamp: number
}

class RecentScoresStore {
  private scores: RecentScore[] = []
  private maxSize = 5

  add(entry: RecentScore) {
    this.scores.unshift(entry)
    if (this.scores.length > this.maxSize) {
      this.scores = this.scores.slice(0, this.maxSize)
    }
  }

  get(): RecentScore[] {
    return [...this.scores]
  }
}

// Module-level singleton — persists across requests in the same Node.js process
export const recentScores = new RecentScoresStore()
