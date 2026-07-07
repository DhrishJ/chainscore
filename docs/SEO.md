# SEO: technical state, keyword map, and the brand-collision question

Phase 5 deliverable. Technical items shipped in code; strategy items below
are recommendations for the human where marked.

## 1. Technical SEO (shipped)

- Per-route titles via a template (`%s | ChainScore`), honest descriptions.
- `sitemap.xml` (app/sitemap.ts): landing + retrospective. Score pages are
  excluded on purpose: per-wallet dynamic results are thin content; the
  retrospective is the durable asset.
- `robots.txt` (app/robots.ts): allow all, disallow /admin, /api, /dashboard.
- Canonical URLs on landing and retrospective.
- Structured data: Organization (with an explicit disambiguation
  description), WebSite, SoftwareApplication (the API), and Dataset on the
  retrospective. `sameAs` is deliberately empty until real social profiles
  exist; add X/Farcaster/GitHub URLs there the day accounts are live.
- Core Web Vitals: mobile 98 / desktop 100, LCP 2.4s. Maintain; do not trade
  away for visuals.
- Dynamic OG images already exist per score page (/api/og).

## 2. Keyword map (what real buyers search)

Primary (B2B spearhead, landing page targets):
| Term | Intent | Target page |
|---|---|---|
| onchain credit score | category | / |
| DeFi credit score API | buyer | / (#api) |
| wallet risk score | buyer | / |
| DeFi underwriting | category | / + pillar page |
| crypto borrower risk | category | / |
| lending protocol risk API | buyer | / (#api) |

Secondary (content pages, drafted by the marketing agent in Phase 4 through
the facts validator):
| Term | Asset |
|---|---|
| how is an onchain credit score calculated | pillar explainer |
| Cred Protocol alternative | comparison page (facts-checked, no disparagement) |
| DeFi liquidation prediction | retrospective + explainer |
| Aave liquidation history data | data story off the retrospective |
| wallet credit history checker | consumer hook page (the free check) |

Long-tail: "check wallet credit score free", "credit score for crypto
wallet", "DeFi loan underwriting model". These convert to the consumer hook.

## 3. The brand collision (RECOMMENDATION FOR THE HUMAN)

The name "ChainScore" is contested by:
- chainscore.finance: dormant protocol, identical pitch, a $SCORE token, and
  age-of-domain authority.
- Chainscore Labs: an active dev shop with unrelated services but heavy
  content output.
- Assorted hackathon repos.
- Cred Protocol: not a name collision but the funded incumbent for the
  category terms.

Assessment: "chainscore" as a NAVIGATIONAL term is winnable over time
because the .finance protocol is dormant (no fresh content signals) and our
site now has real, updating content (retrospective, changelog-driven posts)
plus exact-match schema. The CATEGORY terms (onchain credit score, DeFi
underwriting) are the real prize and do not depend on the name at all.

Recommendation: do NOT rename now. Rename is a product-wide cost (domain,
API base URLs, partner docs, social handles) for a problem that mostly
affects one navigational query. Instead: (a) always brand as
"ChainScore (chainscore.dev)" in outbound content so the entity
disambiguates, (b) win the category terms with the retrospective and
pillar content, (c) revisit renaming only if, after 90 days of content and
backlinks, chainscore.dev still does not own its own name query. If a
modifier is ever needed, "ChainScore API" is the cheap, honest one.
Decision needed from the human: accept this posture or order the rename
evaluation now.

## 4. Authority plan (execution largely Phase 4, marketing agent)

1. The retrospective as the citable asset: every liquidation-event reaction
   post links it; pitch it to DeFi data newsletters as a reproducible
   backtest, which nobody else in the category publishes.
2. Directory and aggregator listings: DeFi tool directories, API
   marketplaces, awesome-lists (engineering agent can PR those).
3. Guest content and integration guides once the pricing page exists.
4. Consistent naming + sameAs once social accounts exist (Phase 4 opens
   them; add to StructuredData.tsx the same day).
