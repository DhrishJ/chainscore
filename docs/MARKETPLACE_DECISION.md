# Marketplace: recommendation for the human decision

Phase 6 deliverable. The P2P loan marketplace exists in the codebase
(listings, applications, wallet-signed writes) but is inert: the database
write path only recently came alive, no listing has ever been funded, and
the landing page no longer references it (removed in the spearhead
restructure, nav link retained).

## Options

**A. Keep front-and-center.** Rejected as the default: it splits the
positioning back into three audiences, competes with the API spearhead for
credibility, and carries the largest regulatory surface for the least
validated demand.

**B. Demote to "coming soon" (RECOMMENDED).** Keep the code, label the nav
link "Marketplace (preview)", add a one-line honesty note on the
marketplace page that matching is not yet live, and revisit only after the
API business shows real usage (a concrete trigger: 3 paying integrations
or 10K scored calls in a month, whichever first). Cost: near zero now,
keeps optionality, keeps the site honest.

**C. Remove entirely.** Cleanest positioning, but destroys working code
and forecloses a plausible future SKU for modest maintenance savings. Not
recommended while option B costs nothing.

## Regulatory note (restated for the record, not resolved here)

Scoring via API is straightforward. If the marketplace ever matches loans
and ChainScore touches funds or takes a cut, that is a different category:
potential lending, brokering, or money-transmission exposure depending on
jurisdiction. That question goes to a licensed professional BEFORE any
funded loan flows through the product. Until then, option B keeps the
marketplace visibly experimental with no funds flow.

## Build cost comparison

- B costs a nav label and one honesty banner (minutes).
- A costs real product work (matching, escrow UX, dispute flows) plus the
  legal work above (months).
- C costs deleting ~2K lines and their tests (hours) and the option value.

Decision needed from the human: adopt B (default), or order A or C.
