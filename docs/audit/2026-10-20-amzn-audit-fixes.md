# AMZN audit fixes (2026-10-20)

Base: `67fd439` (the PR #40 merge), the code that generated the audited AMZN report. Scope: the AMZN report audit's fixes 1-5, its findings 12, 14 and 17, and recommendation items 7 and 15 of the independent audit of 2026-10-19 ([its disposition](2026-10-20-independent-audit-fixes.md)). The audit evidence folders stay out of the repository. Decision: D-98 in [DECISIONS](DECISIONS.md).

This change made no provider or model calls, no paid runs, no deployment and no publication. The before/after figures in the pull request were replayed offline from the stored run inputs.

## Disposition

| Fix | Findings | Disposition | Tests |
|---|---|---|---|
| 1 Rate limits | AMZN 2 | Fixed (`48058d7`). Analyst estimates and the annual and quarterly income statement, balance sheet and cash flow wait out an HTTP 429 once: the vendor's `Retry-After`, or one 60-second rate window when none is named, within 90 seconds per request. A request still refused keeps its gap, which says how long it waited. A `fmp.rateLimit` warning names the refused members and says the valuation is degraded. When the refused member is the analyst estimates, the DCF's `valuation.dcf.analystGrowth` record is a warning naming the rate limit, and the DCF notes say the valuation is degraded. The report is still published. | `tests/fmp.quota.test.ts`, `tests/dataBundle.rateLimit.test.ts`, `tests/stageB.dcfAnchoring.test.ts`, `tests/stageB.ttm.compute.test.ts` |
| 2 Investment stakes | AMZN 1 | Fixed in part (`dc91a95`). The SEC statements now fill long-term investments from the filed non-current investment tags, so stakes no longer count as zero or sit inside the operating capital sales-to-capital divides by. The bridge subtracts an estimated tax on non-operating investments. For Amazon at June 30, 2026 the line is $122.7B. Its $97.9B of Anthropic notes are tagged only in the undivided available-for-sale total and still count as zero: see the departures below. | `tests/edgar.statements.test.ts`, `tests/currency.dataOnlyCashFlow.test.ts` |
| 3 Guided quarters | AMZN 3, 14 | Fixed (`fbca9f7`; the review fix narrowed the rule to the period a comparison word governs). A quarter named directly after a comparison word ("compared with ... second quarter 2025") no longer labels the reported or the guided quarter. On Amazon's five releases from July 2025 to July 2026 every label now carries its own year, where four of five were a year early, and the Q4 2025 outlook is scored (three beats of three). Guided revenue carries at the guided year-over-year pace: Amazon's year one is about $829B instead of $791B. | `tests/currentReports.test.ts`, `tests/stageB.dcfAnchoring.test.ts` |
| 4 Improving margins | AMZN 4 | Fixed (`eb5c5b1`). An improving margin fades up to the lower of half its dated trend carried five years and the scenario margin ceiling. The margin basis states the value with the margin held flat. Amazon's margin fades from 12.08% to 14.03%, the ceiling. | `tests/stageB.dcfAnchoring.test.ts`, `tests/stageB.ttm.compute.test.ts` |
| 5 One-off gains | AMZN 5, recommendation 15 | Fixed (`43d41d4`). The P/E is not ranked against its own history when non-operating income exceeds 25% of positive pre-tax income, and Key data caveats it. Tagged one-off items inside operating income leave the DCF margin seed, gains and charges alike. On Freeport-McMoRan's public filings the seed falls from 26.76% to 24.34%, and to 24.06% after the review fix below keeps its $73M impairment in. | `tests/stageB.unusualItems.test.ts`, `tests/stageB.grading.test.ts`, `tests/lease.numericConsumers.test.ts`, `tests/report.multipleBasis.test.ts`, `tests/audit.issuerPipeline.test.ts` |
| 6 Report disclosure | AMZN 12, 17, recommendation 7 | Fixed (`5d4c76e`). Passes that used only the supplied evidence, with no web search, add an Evidence line to the report header and run details, the print header and the live view. The header's contradicted count includes cited figures the verification log marks contradicted, and names the split. | `tests/report.runDisclosure.test.ts` |

Every new test failed before its fix, except one regression guard in fix 3: the sequential-pace fallback, whose behaviour did not change.

## Review fixes (Codex review of PR #41)

The automated Codex review of the pull request at `b25c9c0` raised one P1 and three P2 findings. Each was confirmed against the code, and each fix began with a test that failed because of the problem.

| Finding | Disposition | Tests |
|---|---|---|
| P1 One-off items summed missing periods as zero | Fixed (`c789f63`), narrower than suggested. Requiring all three periods would also drop FCX's 2026 insurance gain, whose fiscal 2025 has no fact because the gain had not happened. The rule now needs the prior year to date only when the fiscal year carries an amount, and the reverse; otherwise the tag is withheld and the DCF notes name it. Amazon's FY2025 $1.3B impairment ($610M in Q4, the rest untagged by quarter) is now kept in the margin seed: 12.25% becomes 12.08%. FCX keeps its $73M 2025 impairment: 24.34% becomes 24.06%. | `tests/stageB.unusualItems.test.ts` |
| P2 P/E rank shown beside the "not ranked" caveat | Fixed (`dc8f79b`). The report row carries no rank, sample size or detail for that multiple, and its history basis says why. | `tests/report.multipleBasis.test.ts` |
| P2 The 90-second bound capped only the wait | Fixed (`4c5c356`). The clock starts before the first attempt; the retry is one attempt timed out when the bound ends; a retry the bound cut off still names the rate limit; a cancelled job still stops the run. | `tests/fmp.quota.test.ts` |
| P2 Failed passes counted in the Evidence line | Fixed (`748afcf`). Only passes that ran to a usable analysis count: not a failed attempt a data-only report lists, nor a model the registry refused. | `tests/report.runDisclosure.test.ts` |

The owner accepted the choices below as recorded (D-98).

## Departures from the audit text

- **Fix 2: the undivided available-for-sale total.** Amazon's `AvailableForSaleSecuritiesDebtSecurities` is its Anthropic notes alone. Most filers' undivided total also holds current and cash-equivalent securities already counted in cash and short-term investments. Amazon files no current available-for-sale portion, so "total less current" would give $53.1B, which is also wrong. No class-wide rule separates the two, so the total is not used. The bridge still understates Amazon's stakes by the notes, a disclosed limitation rather than an estimate.
- **Fix 3: `filingDisclosures.ts`.** The audit asked for both parsers to be fixed together. The forward-guidance check in `filingDisclosures.ts` was where the two labelling mistakes cancelled; once both labels are right, it works unchanged. The wiring test asserts its output.
- **Fix 4: sensitivity as text.** The flat-margin value is stated in the margin basis and the DCF notes, not in a new structured field.
- **Fix 6: subscription passes only.** The Evidence line covers passes run on a ChatGPT or Gemini plan. API passes do not record their web-search use in the execution metadata.
- **Fix 6: prose claims.** The prose part of the contradicted count still comes from the stored coverage totals, so a stored report without a verification log keeps its count.

## What the stored AMZN run cannot show

The stored AMZN inputs never fetched the analyst consensus, so the replay cannot show fix 1's effect on the fair value. The fix's tests show it instead. Fix 3's label correction applies when a release is parsed, so the stored snapshot keeps its old labels. The year-over-year pace and the parser are shown by their tests.

## Data rights

The new parser and statement tests use public SEC EX-99.1 text and companyfacts shapes ([DATA-RIGHTS](../DATA-RIGHTS.md)). No vendor data is committed.

## Choices the owner confirmed

- **The rate-limit bound.** A request waits at most 90 seconds, or 60 seconds when the vendor names no pause. A request still refused publishes a degraded valuation rather than stopping the run.
- **The investment tax.** It applies the 21% marginal-rate floor to the whole carrying value, which assumes a zero tax basis, and it covers marketable equity securities as well as long-term investments. This is the most the tax could be.
- **Leaving out the undivided available-for-sale total.** This keeps Amazon's Anthropic notes at zero.
- **The guided year-over-year pace.** The sequential pace is the fallback, and "from" is on the list of comparison words.
- **The margin fade.** The improving target uses half the trend, capped by the scenario margin ceiling.
- **The one-off rules.** P/E is flagged as gain-inflated above a 25% gains share. One-off items are identified by a fixed tag list.
- **The Evidence line.** Its wording, and showing it for subscription-plan passes only.

## Deferred

The following are not part of this change:

- **AMZN findings.** Findings 6-11, 13, 15, 16 and 18-21 are not addressed:
  - backlog/RPO evidence;
  - segment-aware peers;
  - the SBC weight;
  - the ROIC floor;
  - the reverse-DCF signal;
  - the scenario band;
  - the segment hierarchy;
  - the buyback label;
  - the missing catalysts;
  - the verdict stance;
  - consensus calendarization;
  - the presentation items;
  - the test gaps.
- **Recommendation item 12** (the unprofitable-overlay trigger) needs an owner policy decision.
- **The larger backlog and peer-screen items.**
