# R9 — FIGR deterministic source, period and accounting-basis repairs

## Scope and reproduction

Branch: `codex/r9-figr-deterministic-fixes`, created from `e1ecadd1`
(`Leave a still-forming session bar out of observed price history`).
Evidence is the November 2, 2026 paid FIGR extra-high report, audit A2 rows
A2-02/10/18/21 and its verification-mark table, and reasoning audit B2 rows
B2-06/08. This package repairs deterministic inputs and earnings-date assembly;
it does not regenerate the paid analysis or treat numeric verification as a
whole-claim factual audit.

The supplied Node 24.11.1 wrapper was copied into this checkout and used for
`npm ci`, tests, typecheck, lint and replay. It strips provider keys and uses
isolated data/config directories. The only run database opened was the supplied
isolated `live/app-data-paid-xhigh/live.db`, through `better-sqlite3` with
`readonly: true, fileMustExist: true`. No paid API or app server was called.
The new fixture retains six companyfacts concepts and the EPS-note passage
from that read-only frozen snapshot; it contains no database or credentials.

The baseline replay was run before production edits with `REPLAY_LABEL=r9-baseline`,
`REPLAY_AT=2026-11-02T16:04:50.794Z` and `REPLAY_PAYLOAD_JSON=1`.
Its fingerprint is `1.61.0:91919e2b` (342,155 characters). The stored paid run's
fingerprint is `1.61.0:559e5cb9`; the requested integration base already differs
from that paid run, so R9 is compared against its own unchanged-checkout replay.
Local receipts are under `tmp/claude-2026-11-01/` and are intentionally ignored.

## Finding → cause → fix → test → replay result

| Finding | Deterministic cause | Fix | Focused regression | Frozen replay result |
| --- | --- | --- | --- | --- |
| A2-10, B2-08: issuer-announced earnings date called a vendor estimate | Calendar-only status; a citation-name exemption without passage support; ISO-only matching and selected prose-key traversal | Resolve one date/source/status record per event. Distinguish vendor calendar, company newswire announcement with publication date, and SEC/company-hosted confirmation. Require actual date-bearing event passages and conservative issuer authorship plus a recognized newswire. Cover natural-language dates, arrays, catalyst Expected cells and scenario strings. | `report.earningsSchedule.test.ts`: vendor ISO/month-first/day-first forms; issuer announcement across claims/cells/scenarios; unrelated SEC text; third-party preview and repeating headline; listing-name suffix; existing punctuation/idempotence guards. New failures were observed before their fixes. | The actual frozen October 22 GlobeNewsWire item produces `company-announced via newswire on 2026-10-22`, with no vendor-estimate qualification, in all three date forms. A separate diagnostic uses the replay's real listing name/news snippets. |
| A2-18: weighted-average shares rejected against later cover shares | An average-to-point-in-time numerical tolerance was treated as the only evidence of all-class EPS scope | Add a narrow primary-note path: explicit combined named classes, identical rights, exact same-period basic/diluted XBRL and table counts, resolved class inventory and one quoted-share economic unit per class. Keep existing unresolved, duplicate and unequal-class checks. Explain the fallback refusal correctly when the primary path is unavailable. | `r9.figrDeterministic.test.ts`: FIGR 221,514,237 basic / 246,969,949 diluted; unnamed, unequal, wrong count, wrong period, negated combination and duplicate-class controls. Existing issuer-economic share tests pass. | The former warning becomes an informational admission of the combined diluted denominator; no cover-count equality is required. Lender owner-FCF valuation remains suppressed. |
| A2-21: TTM capex suppressed for missing standalone quarters | The filed-YTD identity was wired only to CFO and cash-flow SBC | Derive FY + current YTD − prior-year YTD on the same uniquely established annual capex tag. Both YTD operands must come from the same current 10-Q. Match the annual amount or explicit single-tag provenance; do not extend the quarterly capex synonym list or sum extra components. Register operands and rolling period. | `r9.figrDeterministic.test.ts`: $23.451M software basis; lender suppression; mismatched annual amount, ambiguous tags, different filing/currency, future facts and refused annual basis. | `PaymentsToDevelopSoftware`: 20,649,000 + 12,673,000 − 9,871,000 = 23,451,000 USD. The cash-flow bridge displays −23,451,000 as the outflow. |
| A2-02, B2-06: SBC bases and windows blurred | Generic registered labels and an allocated-expense fallback in the cash-flow tag chain; no separate allocated TTM metric | Name cash-flow add-back versus allocated expense in computed, statement and filing-fact records and the revenue ratio. Remove the cross-basis fallback. Register allocated TTM and its three same-tag filed operands separately. Select cumulative YTD when the same filing also supplies a standalone quarter. | `r9.figrDeterministic.test.ts`: 109.079M versus 113.732M, registered labels/period contexts, missing allocated operand and no expense-to-add-back substitution. Existing composition tests now explicitly assert separate bases even when equal. | TTM cash-flow SBC remains 109,079,000; allocated expense is separately 113,732,000. Annual add-back/revenue remains 12.30386789381788%, explicitly named as that basis. |

The initial focused suite demonstrated the date, share, capex and label failures.
Additional red/green runs captured the co-filed standalone/YTD allocated-SBC
selection, quoted-class suffix in issuer names, third-party headline treatment,
and allocated-expense fallback. The first full-suite run exposed sparse
verifier fixture compatibility and historical label assertions; the two guard
calls now tolerate absent optional news/filing arrays. Claim-verifier logic
was not changed. Historical payload hashes remain pinned by restoring only
R9's asserted label/id leaves in a test helper; no shared stamps were bumped.

## Final replay evidence

Run the supplied replay against the same read-only database with
`REPLAY_LABEL=r9-final`, `REPLAY_AT=2026-11-02T16:04:50.794Z` and
`REPLAY_PAYLOAD_JSON=1`, using the copied diagnostic config. It writes
`diag/replay-r9-final.txt` and `.payload.json`. Relevant emitted lines/passages:

> - cash capital expenditure: -23451000 currency (USD) [computed.current-capital.cash-capital-expenditure · 2026-06-30] periodContext={"kind":"duration","start":"2025-07-01","end":"2026-06-30","basis":"rolling-12-month"}
>
> TTM cash capital expenditure (PaymentsToDevelopSoftware) = filed fiscal year 20649000 + current YTD 12673000 - prior-year YTD 9871000 = 23451000 USD through 2026-06-30.
>
> - SBC, cash-flow add-back: 109079000 currency (USD) [computed.current-capital.sbc-cash-flow-add-back · 2026-06-30] periodContext={"kind":"duration","start":"2025-07-01","end":"2026-06-30","basis":"rolling-12-month"}
>
> - SBC, allocated expense: 113732000 currency (USD) [computed.current-capital.sbc-allocated-expense · 2026-06-30] periodContext={"kind":"duration","start":"2025-07-01","end":"2026-06-30","basis":"rolling-12-month"}
>
> TTM SBC, allocated expense (AllocatedShareBasedCompensationExpense) = filed fiscal year 72421000 + current YTD 51976000 - prior-year YTD 10665000 = 113732000 USD through 2026-06-30.
>
> - SBC, cash-flow add-back / revenue: 12.3039 % [computed.capital-cash.sbc-cash-flow-add-back-revenue · 2025-12-31]
>
> [info] valuation.perShare.economicClassBasis: Diluted shares on the issuer-economic basis: the issuer's same-period EPS note explicitly combines all 3 equally participating common classes. Combined basic weighted-average shares 221,514,237 and diluted weighted-average shares 246,969,949 for the period ending 2026-06-30 are in quoted-share units. A period average need not equal the later outstanding cover count at 2026-08-07; no equality to that point-in-time count is required.

The capex identity's YTD operands are both from 10-Q
`0001628280-26-057061`, filed August 14, 2026; FY is from 10-K
`0002064124-26-000009`, filed March 16, 2026. The same filing identities
apply to both SBC derivations. FY and H1 amounts remain separately dated;
the pipeline does not label their ratio a matched-window growth comparison.

## Checks and boundaries

The final full-product command uses the supplied wrapper to invoke
`C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js run test:product -- --maxWorkers=4 --testTimeout=15000`.
The runtime worker/deadline flags accommodate this machine's loaded tooling
checks; no repository timeout, performance assertion or test selection is
weakened. An earlier default run had 5-second timeouts in
`minimatch.tooling.test.ts` (legacy and project-service consumers),
`report.recordedSensitivity.test.ts` (stored intersections), and
`repository.release.test.ts` (deleted-document references). A direct-Vitest
retry lacked `npm_execpath` for `dependencyShape.test.ts` and was stopped;
the final invocation runs through npm. The required R9 audit document is now
in the release allowlist, and all four harness suites pass together
(44 tests). These setup/check corrections do not change product behavior.

Final receipts (all commands use the isolated wrapper):

| Check | Receipt | Result |
| --- | --- | --- |
| Full product suite, through npm with the runtime flags above | `r9-product-accepted.log` / `.result.json` | 643 files passed; 14,577 tests passed, 3 skipped (14,580 total); exit 0 |
| Typecheck | `r9-typecheck-final.log` / `.result.json` | `tsc --noEmit`, exit 0 |
| Lint | `r9-lint-final.log` / `.result.json` | `eslint .`, exit 0 |
| Integration | `r9-integration.log` / `.result.json` | 1 file, 4 tests passed; exit 0 |
| Final frozen payload and actual-source date-guard diagnostics | `r9-final.log` / `.result.json`, `diag/replay-r9-final.json`, `diag/r9-date-guard.json` | Payload fingerprint `1.61.0:4bd17e0f`, 346,828 characters; both diagnostics pass on the committed source |

Full product checks include the unchanged claim-verifier tests. No app/server,
owner database, paid model, push or PR is part of this package.

`payload.ts` edits are confined to SBC basis labels and the current-capital
figures/operand registration needed for capex and allocated SBC. Its news,
evidence, insider and macro sections are untouched. The protected prompt,
presentation, export, component and evidence-selection files are untouched.
`PAYLOAD_VERSION`, `PIPELINE_VERSION`, `REPORT_SPEC` and Stage B stamps are
unchanged; integration owns the bump. The paid stored report is not rewritten.
Natural-language analytical interpretation (including choosing matched-window
comparisons) remains the model's responsibility; the deterministic records now
identify the actual basis and interval. No requested deterministic defect is
intentionally left unfixed.


## New numeric registry IDs and suggested short reader labels

The final frozen replay adds 26 numeric IDs relative to the baseline (some replace generic-label IDs). Existing source-path aliases remain; a formerly unavailable capex alias is now numeric. Period suffixes below are exact, and the reader should retain those periods. Other issuers produce the same semantic families at their own periods/tags.

| New ID | Suggested short reader label |
| --- | --- |
| `computed.capital-cash.sbc-cash-flow-add-back-revenue` | Cash-flow SBC / revenue |
| `computed.current-capital.cash-capital-expenditure` | TTM cash capex (annual tag basis) |
| `computed.current-capital.sbc-cash-flow-add-back` | TTM SBC cash-flow add-back |
| `computed.current-capital.sbc-allocated-expense` | TTM SBC allocated expense |
| `computed.current-capital.sbc-cash-flow-add-back-filed-fiscal-year-operand-sharebasedcompensation` | Cash-flow SBC — FY |
| `computed.current-capital.sbc-cash-flow-add-back-filed-current-ytd-operand-sharebasedcompensation` | Cash-flow SBC — current YTD |
| `computed.current-capital.sbc-cash-flow-add-back-filed-prior-year-ytd-operand-sharebasedcompensation` | Cash-flow SBC — prior YTD |
| `computed.current-capital.capitalexpenditure-filed-fiscal-year-operand-paymentstodevelopsoftware` | Software capex — FY |
| `computed.current-capital.capitalexpenditure-filed-current-ytd-operand-paymentstodevelopsoftware` | Software capex — current YTD |
| `computed.current-capital.capitalexpenditure-filed-prior-year-ytd-operand-paymentstodevelopsoftware` | Software capex — prior YTD |
| `computed.current-capital.sbc-allocated-expense-filed-fiscal-year-operand-allocatedsharebasedcompensationexpense` | Allocated SBC — FY |
| `computed.current-capital.sbc-allocated-expense-filed-current-ytd-operand-allocatedsharebasedcompensationexpense` | Allocated SBC — current YTD |
| `computed.current-capital.sbc-allocated-expense-filed-prior-year-ytd-operand-allocatedsharebasedcompensationexpense` | Allocated SBC — prior YTD |
| `computed.capital.current.cashBridge.cashCapitalExpenditure` | TTM cash capex (annual tag basis) |
| `computed.capital.current.allocatedSbcExpense` | TTM SBC allocated expense |
| `payload.statements.cash-flow-annual.2025-12-31.sbc-cash-flow-add-back` | SBC cash-flow add-back |
| `payload.statements.cash-flow-annual.2024-12-31.sbc-cash-flow-add-back` | SBC cash-flow add-back |
| `payload.statements.cash-flow-annual.2023-12-31.sbc-cash-flow-add-back` | SBC cash-flow add-back |
| `payload.statements.cash-flow-quarterly.2026-06-30.sbc-cash-flow-add-back` | SBC cash-flow add-back |
| `payload.statements.cash-flow-quarterly.2026-03-31.sbc-cash-flow-add-back` | SBC cash-flow add-back |
| `payload.statements.cash-flow-quarterly.2025-12-31.sbc-cash-flow-add-back` | SBC cash-flow add-back |
| `payload.filing-facts.sbc-allocated-expense-2026-01-01-to-2026-06-30` | SBC allocated expense |
| `payload.filing-facts.sbc-allocated-expense-2026-04-01-to-2026-06-30` | SBC allocated expense |
| `payload.filing-facts.sbc-cash-flow-add-back-2026-01-01-to-2026-06-30` | SBC cash-flow add-back |
| `payload.filing-facts.sbc-allocated-expense-2025-01-01-to-2025-12-31` | SBC allocated expense |
| `payload.filing-facts.sbc-cash-flow-add-back-2025-01-01-to-2025-12-31` | SBC cash-flow add-back |

The FCF-ratio counterpart `computed.capital-cash.sbc-cash-flow-add-back-fcf` is also a new semantic ID on routes with an applicable FCF ratio (it remains a gap for this lender); suggested label: **Cash-flow SBC / FCF**. Other annual/quarterly dates and admitted annual capex tags follow these same families.
