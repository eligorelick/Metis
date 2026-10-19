# Phase-two evidence foundations and reconciliation scope

Baseline: merged PR36, `cdf05cf4e5532dfc46a31c0cfcd494060dfc135c`. This record distinguishes a bounded report fix from the larger analytical backlog. Implementation is subject to exact-head tests and independent review; it is not a fresh analyst report or universal accuracy claim.

## Research and reading boundary

Directly inspected: the existing reported earnings reconciliation, issuer release/commentary adapter and reconciliation tables, fiscal payment evidence, capital/reinvestment conventions, thesis triggers, forecast registry and claim benchmark. Decisions D-83 through D-93 and the saved book-to-code disposition govern the preserved contracts.

The [book-to-code disposition](2026-10-17-book-to-code-disposition.md) incorporates earlier delegated reading of Security Analysis, The Intelligent Investor, Marks, Quantitative Value, QIA, Investment Valuation and Hull. This implementation uses that review as inherited rationale and locators; it does not claim a fresh reading of those books or unavailable companion material. No copyrighted book files are distributed.

Primary references retrieved for this investigation:

- [SEC non-GAAP interpretations](https://www.sec.gov/rules-regulations/staff-guidance/corporation-finance-interpretations/non-gaap-financial-measures), 100.01–100.05 and 102.07/102.11: recurrence, symmetry, labels, FCF limitations and tax effects require care. These are issuer-disclosure interpretations; applying conservative evidence gates in an analytical tool is our engineering inference, not a claim that independent normalization is prohibited.
- [SEC Release 33-10890](https://www.sec.gov/files/rules/final/2020/33-10890.pdf), section II.C.7, PDF pages 62–65: material cash requirements and relevant timing remain distinct from resources available to meet them. The removed prescribed table does not establish absence of obligations.
- [Damodaran, Valuing Companies with Intangible Assets](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/intangibles.pdf), the R&D capitalization discussion, PDF pages 9–12: earnings and capital/reinvestment adjustments need a coherent bridge. Historical example assumptions about asset lives and tax deductibility are not current issuer facts.

Only these identified sections were directly reviewed. None establishes an issuer's present funding availability, recurring earnings or investment performance.

## Supported bounded correction: issuer reconciliation presentation

The existing table grouped facts only by duration and ending date, selected the first observation for each metric, and attributed every table to the first fact's source. The provider can retain facts from both a release and CFO commentary. A GAAP EPS from one document and adjusted EPS from another could therefore produce a fictitious common-source bridge; an itemized tax observation could inherit the wrong exhibit citation. FCF presentation also accepted an issuer amount up to three days away from a column and did not require its source to match.

The report renderer now partitions by the complete retained filing reference: form, accession, filing date, exhibit and URL. It calculates an EPS difference only when a known common document, valid reported duration/end date, established currency, compatible per-share units and unique finite operands support it. Identical observations do not create a conflict; conflicting values remain visible without selecting one for arithmetic. Wrong-unit observations remain separately identified. A finite subtraction must also remain finite after rounding.

The row is labeled **Reported EPS difference (non-GAAP less GAAP)**. It is arithmetic on rounded reported per-share figures, including any share-denominator effects. It is not an item-level tax allocation, an independently admitted adjustment ledger or normalized recurring earning power. Captured tax amounts remain distinct from EPS units. A retained issuer basis note keeps its exact text; absent note-level source identity is disclosed instead of attaching it to an arbitrary document.

An issuer FCF amount enters a reconciliation column only for the exact same reported period/duration and supplying document, without conflicting observations. Its separately sourced as-reported row remains retained when that join is unavailable. No debt service or capex is deducted again. These rows do not establish complete obligation coverage, discretionary cash or funding capacity.

The underlying report facts, source identifiers, original analyst prose, persisted report bytes, scores, DCF paths and financial calculations are unchanged. The shared table builder supplies reader, Markdown and print surfaces. The standalone audit format retains its existing registry/check coverage and does not render these reconciliation tables; this patch does not claim to expand that format's coverage. No provider call, new credential or paid/model fallback is introduced.

## Remaining analytical work and acceptance contracts

| Area | Existing implementation | Required next evidence and checks |
| --- | --- | --- |
| Independently normalized earnings | Reported pretax/tax/ownership arithmetic, issuer EPS/adjustment observations and explicit non-normalized labels. | A signed adjustment ledger must bind each item to issuer/entity, actual period, currency, accounting definition, source/availability date, recurrence rationale and separately supported tax effect. Reported, issuer-adjusted, operating run-rate and all-in stewardship views remain separate. Preserve symmetric gains/losses, reserve reversals, recurring restructuring, temporary tax effects, NCI/common claims and SBC expensed once. Missing material scope or tax evidence withholds a normalized total; it is not zero. |
| Funding and reinvestment | Dated source fiscal buckets, debt/lease and restricted-cash refusals, FCFF sales-to-capital policy and a labeled D&A/capex split heuristic. | A usable funding bridge needs obligors, exact due dates where supported, transferable cash, conditional facilities, covenants and reconciled overlap among leases/debt/commitments. Replacement investment needs evidenced asset lives, vintages/utilization, working capital and intangible-investment bridges. Keep debt service separate from FCFF and the EV/equity bridge. A D&A proxy or fiscal label alone does not supply these facts. |
| Longitudinal thesis review | Observable model/guidance triggers, immutable saved reports, a local append-only forecast registry and offline whole-claim benchmark. | A revisioned thesis record must retain original report/input/model identity, original-as-of and later evidence dates, exact claim/source spans, explicit amendment links and contrary evidence. Distinguish supported, contradicted, mixed and insufficient review outcomes; do not imply semantic validation or automated monitoring from numeric tracing. Local hashes do not externally attest a reviewer or clock. |

These are separate deliverables after their contracts and representative fixtures are adequate. This patch neither invents missing financial inputs nor installs an unconsumed normalization/funding subsystem. Existing issuer facts and refused observations remain available for a later reviewed ledger. The provider's existing first-observation policy and bounded parser coverage are not claimed to retain every potentially relevant item.

## Version and verification boundary

Report specification advances to `1.30.2`. Payload `1.35.1`, pipeline `stage-c-1.6.1` and Stage B `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_12` remain: this changes report table presentation, not the analytical engine or model payload. Historical reports retain generation stamps and original bytes. Any current-render comparison is a separate preview with its own code identity, not a re-stamped or newly accepted analyst run.

Regression-first checks cover source components, unknown legacy document identity, mismatched periods/units, conflicts, duplicate observations, negative and overflowing differences, source-attributed taxes, issuer FCF joins and retained basis notes. Full gate counts and frozen ADBE reader/export comparisons must be recorded against the eventual candidate commit. No new publication or merge occurs until independent review and required remote CI clear that candidate.
