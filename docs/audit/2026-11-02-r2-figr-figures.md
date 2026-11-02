# R2 FIGR deterministic figure fixes

| Finding | Fix | Commit | Test |
| --- | --- | --- | --- |
| F05: mixed operating-margin bases | Admit canonical filed operating income only with compatible revenue, currency, interval and filing basis; withhold unmatched quarterly, annual and TTM operating amounts. | bd26083d | `r2.figrFigures`: F05 filed trend/TTM, annual fundamentals, missing numerator and incompatible-evidence controls |
| F04: missing SBC quarter treated as zero | Refuse contradicted vendor SBC, including frozen replay; reuse filed CFO FY + YTD - prior-YTD machinery for cash-flow SBC, with labelled operands. FIGR TTM is 109.079M. | bd26083d | `r2.figrFigures`: F04 filed TTM, contradicted zero, replay and incompatible-operand controls |
| B-12: ambiguous debt perimeter | Label provider funding including loan-owner payables; separately register cited borrowings 962.995M and components, payables and lease observation. Context EV and lender exclusions retained. | bd26083d | `r2.figrFigures`: B12; `stageB.lenderCashFlow` context-EV controls |
| B-13: lender P/TBV marked unsuitable | Add P/TBV to evidenced lender applicability, retaining tangible-common-equity, currency, ownership and positivity gates; read against ROTE. | bd26083d | `r2.figrFigures`: B13; `stageB.lenderCashFlow` industrial-metric controls |
| F23: float ratio mixed observation dates | Call it derived and show float observation date beside FINRA settlement date in key data and market tables. | bd26083d | `r2.figrFigures`: F23; `report.presentation.d62`, `marketData.integrity` |
| Consensus estimate as-of | Use validated observation UTC day in model figure and registry; retain the envelope fiscal reference separately and state publication vintage unestablished. | bd26083d | R2 estimate registry regression; `estimateTiming.integration`; `stageC.payload.passes` timing controls |
| TTM CFO untraced | Register exact duration and the report's TTM interval plus all filed operands and identities. FIGR CFO remains -86.490M. | bd26083d | R2 filed TTM CFO test, including exact `matchProvenanceRecord` |
| Inconsistent Operating expenses column | Require complete directly tagged OperatingExpenses on revenue's filed basis, or (integration review) a provider amount that bridges its row's gross profit to its operating income; one basis per trend column; withhold the rest with dated notes. | bd26083d | R2 expense-subset test; `edgar.operatingExpenseScope` complete-total control |

## Evidence and residuals

Started from b0f273bb, whose subject is "Accept the canonical derived quarter as a whole filed row (D-155 review)". Used only the supplied isolated Node 24.11.1 wrapper. No paid provider request, application launch, owner database
or stored-report rewrite occurred. The supplied paid-input SQLite was opened
with `readonly: true`; diagnostic output went to this checkout's ignored tmp.

The initial valid focused red receipt is `r2-red-3` (10 failing assertions).
`r2-cfo-period-red` separately proves the report's correct amount failed exact
duration matching. Focused green and consumer receipts are retained under
`tmp/claude-2026-11-01/`; the expanded R2 control suite has 19 passing tests.
The frozen paid-input replay checks the actual Q1 2026 margin at 25.1133%,
TTM cash-flow SBC at 109.079M, filed borrowings at 962.995M and the retained
context-EV basis. This is an offline payload rebuild, not a new paid report.

The first full product pass found sparse legacy-bundle handling, a synthetic
mixed-basis fixture, documentation/coverage inventory contracts and historical
payload pins that needed reconciliation. Two minimatch tooling tests timed out
under concurrent load; bounded targeted reruns cover those tests. These are
reported receipts, not claims of pre-existing failures. Introduced fixture
typing errors were caught by typecheck and corrected.

Historical expense tests formerly trusted an unproved subtotal after merely
changing the provider envelope. They now require complete filed evidence.
Estimate tests formerly pinned the fiscal-period reference as figure as-of;
they now pin observation day and separately retain reference/publication roles.
The period-scaling fixture now supplies a common filed operating/revenue basis,
so it continues to isolate annual revenue refusal and 53-week scaling.

Integration review: the first expense rule withheld every provider amount
without a filed `OperatingExpenses` total, which on the owner's saved real-data
snapshots removed 34 of 34 QCOM and AMZN amounts, 30 of 34 NVDA and all 10 META
amounts, each with an appendix gap. The reviewed rule keeps an amount that
bridges its row's gross profit to its operating income and states one basis per
trend column (`tests/r2.operatingExpenseReview.test.ts`); FIGR's Q1 2026 amount
is still withheld. The intended-deltas R2 group then holds one path: the
filing-disclosures block, whose only change on the audit fixture is the
provider-basis note.

`r2FigurePayloadGolden` restores only the eight counted observation/reference
objects before every pre-existing byte/hash assertion. The intended-deltas
fixture adds one R2 group: six newly added manifest slots and 21 reclassified
paths affected by expense-gap insertion or disclosures. Each path belongs to
one group; no baseline, stamp or unaffected amount is changed. Its parent
D-138/D-155 references must be replaced by the integrator's final R2 decision
numbers. The eight appended D-next (R2) decisions also await renumbering.

The first gate on bd26083d passed dependency checks, typecheck and lint, then failed only the exact tracked release-document allowlist: product 14,379 pass, 1 fail, 3 skipped, exit 1. The follow-up explicitly registers this requested audit record in that allowlist; figure implementation is unchanged. The failed receipt is preserved as r2-verify-first.

Final-commit gate: `& tmp/claude-2026-11-01/run.ps1 -Name r2-verify -NpmScript verify`.
The exact gate result is in `r2-verify.result.json` and its UTF-16LE log and is
reported in the implementation handback. Shared payload/report/prompt/Stage B
stamps remain unchanged for the integrator's single batch bump.
