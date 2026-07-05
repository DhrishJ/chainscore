# COST_TO_GAME.md — per-feature manipulation cost (Workstream F)

For each serving feature (ml/feature_schema.json, v5, 34 features), an estimate
of how cheaply an adversary can fake a favorable value, and the design response.
Cost is qualitative: LOW (gas only, scriptable), MEDIUM (needs real but
recoverable capital or time), HIGH (needs sustained capital-at-risk or
independent counterparties that cannot be self-supplied).

The guiding rule: the model's weight on a feature should track its cost to
game. Cheap features earn little; expensive features carry the score. The v5
SHAP ordering already does this (repayment and tenure dominate, raw counts
sit low), and the monotonic constraints make the strongest features
un-invertible. This table records the reasoning and flags where a detector,
not a weight change, is the right lever.

| Feature | Cost to game | Why | Response |
|---|---|---|---|
| repayment_ratio | LOW mechanically, but constrained | Self-funded borrow-repay loops fake it cheaply | Monotonic (can only lower risk); instant-repay detector discounts flash-shaped histories |
| total_repays | LOW, constrained | Same self-repay loop | Monotonic negative; realized-exposure features reward carried debt this attack lacks |
| days_since_first_defi | HIGH | Cannot backdate first DeFi interaction | Weight freely; strong honest signal |
| total_borrows | MEDIUM | Borrows are cheap but each needs collateral posted | Paired with liquidation and unpaid features so volume alone does not help |
| borrow_velocity | LOW | Scriptable burst of borrows | Burst-timing detector; low intrinsic weight |
| prior_liquidation_count | HIGH (to fake DOWN) | An attacker cannot remove a real liquidation | Monotonic positive; trustworthy |
| has_prior_liquidation | HIGH | Same | Monotonic positive |
| liquidation_rate | HIGH | Derived from real liquidations | Monotonic positive |
| net_unpaid_borrows | MEDIUM | Rewards genuinely carried, unrepaid debt | Monotonic positive; hard to fake favorably |
| wallet_age_days / months | HIGH | Age cannot be manufactured retroactively | Weight freely |
| active_days_count | LOW | Scriptable daily dust tx | Wash-trade + burst detectors; low weight |
| tx_count / 30d / 90d / 180d | LOW | Raw activity, gas-only to inflate | Wash-trade detector discounts self-dealing; low weight |
| active_months_12 | LOW-MEDIUM | Needs activity spread over months (time cost) | Modest weight |
| aave_borrows / repays | LOW-MEDIUM | Protocol-specific version of the above | Same treatment as totals |
| compound_borrows / repays | LOW-MEDIUM | Same | Same |
| protocols_used_count | LOW | One tx per protocol to tick the box | Low weight; breadth is weakly informative |
| has_uniswap_lp | LOW | Add a tiny LP position | Low weight |
| has_staked_eth | MEDIUM | Needs real staked ETH (recoverable) | Low weight |
| has_governance_vote | LOW | One vote tx | Low weight |
| total_portfolio_usd | MEDIUM | Real capital, but flash-loanable for a snapshot | Point-in-time scoring resists snapshot gaming; modest weight |
| stablecoin_pct | LOW-MEDIUM | Rebalance at snapshot time | Modest weight |
| token_diversity | LOW | Airdrop or buy dust of many tokens | Low weight |
| has_eth | LOW | Hold any ETH | Very low weight |
| has_ens | LOW | Register a name (small fee) | Very low weight |
| is_gnosis_safe | LOW-MEDIUM | Deploy a Safe | Low weight; presence not amount |

## Where detectors carry the load

The features an attacker can fake cheapest (repayment loops, wash-traded
activity, timed bursts) are exactly the ones the monotonic constraints and the
`lib/integrity` detectors target. The detectors output a graded penalty that
downstream scoring applies, so a wallet whose good features are largely
synthetic is discounted in proportion to the evidence, rather than trusted or
hard-blocked. The honest, expensive features (age, tenure, real liquidations)
are left to carry the score because they cannot be manufactured.

## What we deliberately do not claim

No feature set is un-gameable by an adversary willing to lock up real capital
at real risk for a long time, but that adversary is, by construction, a
genuinely creditworthy borrower. The goal is to make faking a good score cost
about as much as being a good borrower, which removes the economic incentive
to fake.
