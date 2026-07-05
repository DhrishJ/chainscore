# THREAT_MODEL.md — score integrity (Workstream F)

Scope: defending ChainScore's own score against manipulation. This is
strictly defensive. Nothing here is tooling to attack other systems; it is an
analysis of how an adversary would manufacture a good ChainScore and what the
platform does to make that expensive.

The product is the score. A score that can be cheaply faked is worthless to a
lending protocol, so raising the cost to game it is core product security, not
an add-on.

## Attacker model

- Goal: obtain a high ChainScore (grade A/B, score >= ~690) for a wallet or
  entity the attacker controls, without the real creditworthiness the score
  is supposed to certify, in order to borrow undercollateralized on a
  downstream protocol and default.
- Capability: can deploy unlimited wallets, script arbitrary onchain activity,
  supply real (but recoverable) capital for short periods, and time actions
  around known scoring windows. Cannot forge signatures or alter chain
  history.
- Budget sensitivity: attacks that require large, genuinely at-risk capital
  for long periods are self-defeating (the collateral outweighs the loan);
  the dangerous attacks are the cheap ones.

## Attack catalogue

Each attack lists the mechanism, which features it targets, and the defense.

### A1. Sybil wallet farms
Spin up many wallets, give each a thin but clean borrow-and-repay history,
score them all, discard the ones that scored low, present the survivors.
- Targets: any feature computable per fresh wallet (tx_count, protocols_used,
  has_ens).
- Defense: entity resolution (Workstream D) clusters funded-from-common-source
  wallets so the farm scores as one entity, not N independent good actors;
  shared-funding Sybil detector (`lib/integrity`) penalizes convergent
  cohorts; drift monitor alerts on clusters of young wallets converging on
  high scores.

### A2. Wash trading / self-dealing loops
Trade back and forth between related addresses to inflate activity and
volume features cheaply (gas is the only real cost).
- Targets: tx_count, tx_count_30d/90d/180d, active_days_count,
  active_months_12, borrow_velocity.
- Defense: wash-trade detector flags self-dealing loops and back-and-forth
  with related addresses; counts from detected wash flows are discounted;
  the model already weights raw activity features far below repayment
  behavior (see cost table).

### A3. Self-funded fake repayment
Borrow from a protocol, immediately repay with the same capital, repeat, to
manufacture a clean repayment_ratio and total_repays without ever carrying
real risk.
- Targets: repayment_ratio, total_repays, aave_repays, compound_repays. These
  are the model's strongest positive drivers, so this is the highest-value
  attack.
- Defense: instant-repay / flash-loan-shaped detector (borrow and repay within
  a very short block window, or borrow amounts never held) marks the history
  as low-signal; net_unpaid_borrows and realized capital-at-risk features
  reward genuinely carried debt, which this attack never creates; monotonic
  constraints mean these features can only ever LOWER risk, so an attacker
  cannot invert them, only fail to earn the benefit.

### A4. Circular funding rings
Fund wallet B from A, C from B, back to A, to obscure a single funding source
and defeat naive Sybil clustering.
- Targets: the entity resolver's funding-source signal.
- Defense: multi-signal clustering (funding, gas-funding, temporal
  co-spending, cross-chain bridge tracing) so no single obfuscation breaks
  the link; ring structure itself is a detectable pattern (strongly connected
  funding component of low-value transfers).

### A5. Scoring-window timing
Concentrate good behavior right before a scoring request, or time borrows and
repays around the observation window the model was trained on.
- Targets: recency-weighted features (tx_count_30d, active_months_12,
  borrow_velocity).
- Defense: burst-timing detector flags activity abnormally concentrated in a
  short pre-scoring window; aged-history features (wallet_age_days,
  days_since_first_defi) cannot be faked retroactively and carry real weight;
  point-in-time scoring (Workstream C) means a score is stamped as-of and
  cannot be gamed by choosing when to snapshot.

### A6. Entity-resolution gaming (the coupled risk)
Because entity resolution aggregates addresses, it becomes an attack surface
two ways:
- Forced merge: an attacker links a victim's address to a bad entity (for
  example by sending it dust from a flagged wallet) to defame the victim's
  score.
- Avoided merge: an attacker structures funding to keep farm wallets from
  clustering.
- Defense: merges require HIGH confidence from multiple independent signals,
  never a single incoming transfer; inbound-only dust cannot force a merge
  (funding-source signal is directional and value-weighted); all merges are
  reversible with an audit trail; low-confidence links are exposed as
  probabilities to downstream scoring rather than hard-applied.

### A7. Model extraction by mass scraping
Query the scoring API across many crafted wallets to reverse-engineer feature
weights, then construct an optimal fake.
- Targets: the model itself.
- Defense: API authentication and per-key plus per-IP rate limiting
  (Workstream G) cap query volume; this threat is owned by Workstream G and
  linked here for completeness.

## Design principles that fall out of this

1. Prefer features that require real capital-at-risk or independent
   counterparties over features that reward raw counts.
2. Keep the strongest positive drivers (repayment) behind monotonic
   constraints so they can never be inverted, only earned.
3. Detection feeds a graded risk penalty, not just a boolean flag, so a
   partially-gamed wallet is discounted proportionally rather than either
   ignored or hard-blocked.
4. Aggregation (entity resolution) must fail safe: a wrong merge can defame a
   real wallet, so the bar to merge is high and every merge is reversible.

See COST_TO_GAME.md for the per-feature manipulation-cost table that drives
feature weighting decisions.
