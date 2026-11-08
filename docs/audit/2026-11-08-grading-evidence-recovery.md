# Primary grading evidence recovery — 2026-11-08

This follows the DHI report repair in PR #118. It improves both calculated and
analyst evidence, starting with primary financial facts already acquired. It
does not change grading thresholds, minimum history, timing coverage, or the
ownership requirements for valuation.

## Cause and correction

The annual statement excerpt retains at most 12,000 characters. Repurchase
cash-flow and equity rows later in the complete source could therefore be
absent downstream. Bulk companyfacts also omits some dimensional share facts
and can attach a payments concept to a rounded total-cost disclosure.

The collector now parses supported consolidated cash-flow and equity tables
from the same complete source before truncation. It retains bounded, separate
cash amounts and share/equity-cost pairs with source identity, annual bounds,
currency, scale and source coordinates. Table column spans and annual equity
opening/closing balances must agree. Unsupported layouts, hidden evidence,
rounded counts and contradictory rows remain refusals. Known-period refusals
are retained so a newer rejected presentation cannot expose an older convenient
value. No new document fetch or provider is required.

A shared immutable view validates these proofs in Stage B and Stage C. Cash
conflicts require an exact compatible vendor observation plus an explicit,
same-filing bridge identifying the bulk tag as total cost including commissions
and excise taxes. Numerical proximity alone is insufficient. Original provider
values and conflicts remain in the frozen input, and the calculation view keeps
their observation history alongside the resolution.

Exact execution pairs use the existing split resolution. Valid complete tagged
pairs remain preferred; conflicting comparable evidence is refused. A lone
rounded concept from a different accounting family is not paired with the
primary statement's cost. Plain rows never acquire invented XBRL concepts.
Scored execution evidence, analyst figures and exports identify the primary
source and preserve the distinction between equity cost and cash outflow.

## Measured effects

The baseline is main commit `71f657a27e67c694234d44f03e89d04e764eae3a`.
Unchanged saved DHI and QCOM inputs and synthetic industrial, bank, REIT and
sparse-history inputs produced byte-identical computed outputs under the final
implementation. The evaluation reads the original live-clone database read-only;
real responses and generated diagnostics remain outside Git.

A separate enriched evaluation adds structured evidence recovered from DHI's
cached [FY2025 10-K](https://www.sec.gov/Archives/edgar/data/882184/000088218425000081/dhi-20250930.htm).
It is not an exact replay of the original retained snapshot. The document's
original acquisition timestamp and its hash are recorded in local diagnostics.

| Annual period | Primary cash outflow | Exact repurchased shares | Primary equity cost |
| --- | ---: | ---: | ---: |
| FY2025 | $4,281.6 million | 30,735,308 | $4,298.2 million |
| FY2024 | $1,787.5 million | 12,467,294 | $1,803.1 million |
| FY2023 | $1,178.5 million | 11,133,774 | $1,187.3 million |

Only FY2025's cash conflict is resolved by this pass: its same-filing disclosure
explicitly identifies the bulk $4.3 billion as total cost including commissions
and excise taxes. The earlier cash conflicts remain refused. All three exact
execution pairs become available, adding six citable analyst figures with their
dates, definitions and source. Missing market/history coverage still prevents
an aggregate timing grade. DHI's calculated grade letters, scores and evidence
fractions do not change. This is a recovery of supported operands, not evidence
that the company deserves a higher grade.

The latest cached interim statement provides explicit quarterly/YTD
noncontrolling income but does not supply the missing later fourth quarter.
No residual or assumed zero fills it; unsupported valuation remains unavailable.
No paid analyst run was made, so qualitative grade changes are not claimed.

## Verification and limits

Synthetic regressions exercise source acquisition through calculated timing,
analyst statement cells, numeric citation registration, reader Markdown and
audit exports. They cover wrong identities/URLs, future observations, ambiguous
periods, column shifts, foreign/unknown currencies, stock splits, incomplete
history, contradictory primary/tagged facts and preservation of original inputs.

Node 24.11.1 verification completed: 17,225 tests in each of the core
and risk coverage runs (three existing skips), four database integration tests,
dependency-shape validation, typecheck, lint, production build and security
audit (zero vulnerabilities). Core statement/branch/function/line coverage was
97.58/93.23/99.11/98.71%; risk coverage was 96.05/91.48/98.30/98.24%, including
the new modules' required per-file floors. All 1,211 tracked source/test files
were hash-identical before and after the gate. The original report and snapshot
hashes still match, and regenerated fictional DEMO output changes only its two
method stamps.

The initial verification command stopped when a risk-test worker exited
unexpectedly after 750 of 751 files, without a reported assertion failure.
The complete risk pass was rerun on unchanged code with machine-readable
diagnostics: all 751 files passed with no unhandled errors. Build and security
audit then completed. The worker exit did not recur; no test, coverage threshold
or validation requirement was waived.

The fresh whole-branch review identified seven admission or handoff gaps, all
addressed with failing-first regressions in one fix pass: explicit cash refusals
now disable usable conflicting operands; partially tagged rows check their
comparable counterpart; ambiguous and rejected presentations cannot restore
older fallbacks; cash-only evidence preserves valid execution facts; comparisons
require matching units; superseded cash warnings are removed from both report
paths; and bounded exact evidence survives payload, report schema and exports
even without an eligible timing grade. Filed and split-adjusted shares remain
separate and citable. The review reported no Critical, Minor or excluded findings.

The subsequent automated PR review found three additional boundary cases.
Acquisition and parser boundaries now explicitly select the eight filing-identity
fields, preventing section text from entering source metadata and breaking strict
report validation. Supported cash zeros and statement dashes remain proved zeros
through calculation and exports; blank or unproved values remain unavailable.
Recognized cash rows with missing comparative cells retain refusal markers for
their declared periods, preventing earlier contradictory values from surviving.
Eleven failing-first regressions cover these cases, including normal 10-K/10-Q
acquisition through both strict report assembly paths and a complete timing
window containing a proved zero-cash year.

The implementation is intentionally narrow: other table shapes, accounting
definitions, cost disclosures and stylesheet-dependent visibility remain gaps.
Legacy bundles without primary proofs keep their prior financial behavior.
Historical reports and snapshots are not rewritten. No dependency, provider,
bulk historical crawl, ticker-specific branch or scoring-policy change is added.

Release identities: report 1.73.0, payload 1.92.0, Stage B
`STAGE_B_2026_11_PRIMARY_CAPITAL_66`, pipeline `stage-c-1.6.44`.
