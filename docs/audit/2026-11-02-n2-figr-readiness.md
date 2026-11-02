# N2 lender and share-class readiness (2026-11-02)

Offline evidence: retained corrected FIGR bundle and the integrator's independent
FIGR-TIEOUT. Baseline f8d6c758. No retained bundle is copied into the repository;
tests use small synthetic issuers. These readiness items are new research
questions, absent from the original audit findings/triage and reviewed plans.
The current brief supplies their scope. Existing owner routing decisions remain
binding: general plus recent-IPO, FIN-OTHER, not the bank map.

| Finding | Disposition | Commit | Red receipt | Green receipt | Stored-report impact |
| --- | --- | --- | --- | --- | --- |
| R-FIGR-3 | Fixed, bounded filed-statement alternative | fd8d05a3 + follow-up in this commit | r-figr-3-red-confirmed (2 failures; 11 controls pass) | r-figr-3-final-green (126 pass), r-figr-3-green-controls (350 pass) | New computations only; historical bytes unchanged (D-67). |
| R-FIGR-1 | Fixed | eaeb021f | r-figr-1-red; r-figr-1-operating-header-red | r-figr-1-green-controls (187 pass); r-figr-1-consumers (380 pass); r-figr-1-export-controls (27 pass); r-figr-1-payload-consumers (415 pass); r-figr-1-docs-green (184 pass) | New computations only; source conflicts retained; no historical reinterpretation. |
| R-FIGR-2 | Fixed explanation; numerical refusal retained after assessment | fb1d451b | r-figr-2-red (2 failures; 2 controls pass) | r-figr-2-green (57 pass), r-figr-2-exports-green | Existing saved reports and numerical gates unchanged. |

## R-FIGR-3 evidence and replay

The bundle's two cover-inventory results have no classes, observations, inventory
passage or rights passage and say "No eligible complete inline cover-share
inventory". Raw primary HTML is absent, so an exact DOM failure cannot be proved
offline. The current class-tagged parser recognizes CommonClassXMember and two
narrow equality sentences; the retained issuer sentence has repeated full class
names, a separately named third class, and "sharing of losses", outside those
supported forms. The retained 10-Q balance sheet independently supplies all
three outstanding counts at June 30, 2026; its EPS note explicitly gives all
three identical dividend/liquidation rights. Summing only A and B would omit
6,941,715 common shares. Filed counts: A 178,794,505; B 37,893,047; third class
6,941,715. The provider title binds the quoted Class A; this limitation is printed.

| Changed computed figure | Before | After R-FIGR-3 |
| --- | ---: | ---: |
| Economic shares (2026-06-30) | withheld | 223,629,267 |
| Approximate issuer-common capitalization, USD | withheld | 4,825,919,581.86 |
| EV excluding leases, USD | withheld | 4,858,062,581.86 |
| EV including leases, USD | withheld | 4,862,838,581.86 |
| Selected EV, USD | withheld | 4,858,062,581.86 |
| EV/EBITDA | withheld | 16.9788713350x |
| EV/sales | withheld | 6.8103712878x |
| P/B | withheld | 3.4150401425x |
| P/TBV | withheld | 3.8358395326x |

These are every numerical change in the computed replay, excluding duplicate
payload/provenance copies. Quote remains $21.58 (2026-10-30); filed shares are
not represented as October shares. P/E remains 26.975x on the existing
price/filed diluted-EPS convention (not capitalization/net income). Intrinsic
value, cost of equity and WACC remain withheld. Overall score 50.13/D and
evidence completeness 0.1693009614 are unchanged. Retained cash-flow conflicts
remain source-level refusals. No new or backfilled share facts are manufactured.

Residuals: unsupported cover layouts still refuse when a complete, equal-rights
statement alternative is absent. This path deliberately admits only the exact
documented count/equality conventions. Actual cover dates and independently
traded prices of other classes remain unavailable. Generic single-class and
bank controls retain their routes and conventions. Version stamps stay at the
shared report 1.56.0 / payload 1.60.0 / Stage B CLAUDE_REPAIRS_39; no golden
repin or historical display reinterpretation is required.


## R-FIGR-1 evidence and replay

The 10-Q operating cash-flow section reports H1 loan-sale proceeds 4,638.228m,
held-for-sale originations 2,686.831m, purchases 2,432.718m and principal payments
389.014m. Thus the generic owner-FCF/runway interpretation fails independently
of the retained CFO conflicts. Neither negative CFO nor a financial-sector name
alone triggers this rule. The synthetic positive-CFO lender is the regression
trigger; non-lenders, fee-based firms, banks, investing activity, missing sale
proceeds, zero flows, unknown SIC, wrong/future sources are controls.

| Changed figure (after shares fix -> after lending fix) | Before | After |
| --- | ---: | ---: |
| FY2025 FCF after SBC, USD; both latest and annual-series copy | -20,445,000 | not applicable |
| FY2025 FCF before SBC, USD; both copies | 41,919,000 | not applicable |
| FY2025 FCF conversion after SBC; both copies | -0.1522553451 | not applicable |
| FY2025 FCF conversion before SBC; both copies | 0.3121737252 | not applicable |
| Annual SBC / FCF, percent | 148.7726329349 | not applicable |
| Capital-grade applicable evidence fraction | 0.2352941176 | 0.4 |
| Overall evidence completeness | 0.1693009614 | 0.2278009209 |
| Composite score (grade stays D) | 50.13 | 50.18 |
| Business-quality evidence completeness | 0.1575388776 | 0.1833202203 |
| Business-quality score (grade stays D) | 52.73 | 53.18 |

Every changed signal attribution (weights are percent; contributions are score
points) follows from the changed applicable-evidence ceiling:

| Signal / factor | Weight before -> after | Contribution before -> after |
| --- | --- | --- |
| Interest coverage / financial-strength factor | 3.9107055565 -> 5.2620039465 | 0.1716544048 -> 0.2309675690 |
| ROIC level / capital-returns factor | 7.4792243767 -> 10.0635825477 | 1.8040174327 -> 2.4273744759 |
| 52-week-high distance | 1.9390581717 -> 2.6090769568 | -0.6786703601 -> -0.9131769349 |
| Relative strength | 2.4930747922 -> 3.3545275159 | -0.8725761773 -> -1.1740846306 |
| SMA gap | 1.1080332410 -> 1.4909011182 | -0.2933163829 -> -0.3946684152 |
| Momentum-and-trend factor (sum of previous three) | 5.5401662050 -> 7.4545055909 | -1.8445629203 -> -2.4819299807 |

This accounts for every changed computed number, including duplicate latest/FY
FCF and signal/factor copies. Input metrics are unchanged: no new coverage, ROIC
or price observations were admitted. Runway and DCF change reason from
missing/conflicting data to not applicable; their numeric values remain null.
Current-capital FCF was already null from input conflicts. P/FCF remains null
but loses history/peer admission; FCF yield has no numeric producer in this
base (only a display-policy lead ID), now explicitly suppressed. Earnings/book
multiples and all R-FIGR-3 values stand. Filed CFO/capex observations remain in
source statements, without restoring rejected values. Baseline CFO arithmetic
in FIGR-TIEOUT (-86.490m TTM) is independent context, not newly admitted Stage B
data. Receipt r-figr-1-replay-evidenced writes the immutable offline replay.

Downstream: capital and grading, route policy, valuation and reverse/sensitivity,
quarterly trends, statement extracts, payload/provenance and narrative context,
data-only report, classic/dossier and Markdown/audit/print exports are covered.
Legacy stored-reader preservation tests pass; there is no frozen display cutoff
because historical interpretation is unchanged. Shared stamps and payload
golden remain unchanged (pipeline already stage-c-1.6.18 at this base).

Coordinator notice: base f8d6c758 has 16 known product failures, already repaired
on integration e38aef0f: stageC.claimPeriods.audit20261027 (14),
stageC.excerptCurrencyScale (1), company.generateReport.stream (1). This track
does not alter those repairs or their assertions.


## R-FIGR-2 decision and replay

No robust bottom-up option exists in the retained/current contract.
PeerFundamentals in src/pipeline/peers.ts retains four FMP endpoints (profile,
quote, quarterly income, quarterly balance), no peer price series. The retained
bundle has nine discovered candidate slots and zero populated candidate
fundamentals. The subject and SPY provide only 13 usable monthly returns (287
subject daily bars); the existing estimator requires 24. Sector XLF is a fund
exposure, with no demonstrated issuer asset-beta/financial-leverage basis.
There is no sourced industry-beta dataset. Unqualified vendor betas cannot
supply a verifiable common window or unlever/relever sensitivity. No collection,
provider, market dataset or history threshold was added or relaxed.

| Figure | Before R-FIGR-2 | After R-FIGR-2 |
| --- | ---: | ---: |
| Vendor raw beta | -0.019161666 | -0.019161666 (refused) |
| Issuer/SPY usable monthly returns / minimum | 13 / 24 | 13 / 24 |
| Admitted beta | withheld | withheld |
| Cost of equity / WACC | withheld / withheld | withheld / withheld |
| Per-share intrinsic value | withheld | withheld |
| Composite / evidence completeness | 50.18 / 0.2278009209 | 50.18 / 0.2278009209 |

No computed or payload financial number changes in the R-FIGR-2 replay. Only
reader/prompt/provenance explanations change: actual monthly observation count,
peer candidate count, missing peer price histories, unvalidated unlever/relever
operands and why a sector-ETF or unsourced industry beta is not substituted.
The critical beta gap keeps its severity and field; refusal remains missing
applicable discount-rate evidence, not an inapplicable cost of equity. The
independent lender applicability reason for FCF-based DCF remains in force.
Bank, mature-issuer refusal and valid vendor-beta controls pass. The valid
vendor-beta path is explicitly not strengthened by this explanation-only
change; no robust sector fallback is claimed. Saved-report classic/dossier and
all three export surfaces carry the reason and preserve the report bytes.

A future numeric fallback would require evidence the current contract lacks:
independent economically comparable issuers, enough common completed return
history, a peer/issuer tax and market D/E basis, documented unlevering/relevering
and uncertainty/sensitivity. Loan inventory funding must first be distinguished
from industrial financial leverage. No nominal minimum-peer-count assertion
is represented as a working gate without that data pipeline. This satisfies
the brief's permitted refusal outcome; it is not a deferred hidden default.


## Final self-review: newer cover observations (R-FIGR-3)

A red control found that an unresolved, newer-dated inline cover observation in
the same primary filing could be bypassed by the older balance-sheet alternative.
The fallback now refuses that case too. Receipt r-figr-3-cover-freshness-red
(1 failure, 13 controls pass), then r-figr-3-cover-freshness-green. The retained
bundle contains no cover observations, so its final replay numbers are unchanged.
A live re-fetch that retains newer unresolved cover facts can therefore still
refuse this fallback; it must establish those facts' complete economics, rather
than force the retained snapshot's outcome. This is a deliberate evidence limit.


The R-FIGR-3 downstream check also found that the prompt had only the raw
provider cap even after the computed issuer scope resolved. A separate red
control (r-figr-3-payload-cap-red) proves that absence. The quote payload now
registers the derived issuer-common capitalization and the filed economic share
count as distinct traced figures with their own price/count dates; the provider
cap remains explicitly raw and scope-unverified. Evidence hashes and the full
class-scope limitations accompany them. For FIGR those added payload figures
are 4,825,919,581.86 USD (price day 2026-10-30) and 223,629,267 shares (count
day 2026-06-30). They add no new computed number and never relabel provider
capitalization as verified.

Final coverage registration: the new retained-class parser is included in the
risk-source manifest and its expected-source test. The lender module is already
in the existing Stage B core glob. No coverage floor or assertion is reduced.
Receipt n2-coverage-registration-red reports the missing placement; green
passes all 20 coverage/dependency-shape checks. The initial full product run
was launched directly with Vitest, omitting npm_execpath required by three
dependency-shape checks; the npm-context green proves that invocation issue.
A final product run uses npm through the Node 24 wrapper.


Surviving per-share gate: the retained vendor Q2 basic weighted-average count is
219,395,921, versus 223,629,267 outstanding economic units. The existing
weighted-denominator check allows the smaller of 3% and half the smallest
class's economic share (about 1.55% here); that count misses the gate. It remains
refused independently of the missing cost of equity. The independent tie-out
reports the filed discrete-Q2 basic/diluted counts 221,514,237 / 246,969,949;
this track does not silently replace the retained vendor's six-month averages
or weaken the economic-coverage gate. Outstanding and diluted weighted counts
remain different facts. The new denominator resolves issuer capitalization,
not every per-share-model operand.

The payload also stops publishing the previously derived 2024-06-30 quarterly
FCF of -24,696,000 USD as owner FCF, and drops the duplicate FY2025 raw-vendor
FCF line of 41,919,000 USD from the prompt; OCF/capex/SBC observations stay
retained. Full numeric paths, including duplicate payload copies and the
provider-cap label move, are in the local numeric-deltas receipt.

The first broad run had 23 failures: the 16 coordinator-known base failures,
three from missing npm context, one missing new-module coverage registration,
the new cover-freshness red control imported before its fix, the unsupported
ETF ordering regression, and the stale P3-first-heading pin. Coverage and npm
context are green in n2-coverage-registration-green; typed ETF defense and both
release headings are green in n2-final-boundary-green (52 checks). The P3 pin
is repinned to the required N2 first heading, retaining an additional assertion
that the P3 heading remains. The invalidated intermediate full rerun was
cancelled by its own runner ancestry after the source corrections. The final
product run starts from the stable corrected source through npm. No unrelated
Track B failure or assertion was altered.


## Final gates

n2-product-final-stable: 577 product files, 574 passed and only the three
coordinator-known files failed; 13,828 tests passed, exactly 16 known base
failures, three existing skips. Runtime 504.38 seconds. No additional product
failure remains. n2-final-complete-typecheck and n2-final-complete-lint pass;
n2-final-complete-docs passes 114 checks, including shared stamps and the
retained P3 heading. r-figr-3-payload-cap-green passes 351 checks, including the
unchanged payload golden. n2-retained-exports-final generates all four retained
replay reports and Markdown/audit/print outputs without mutating report/source
objects. The 13/24 history shortfall is visible in final Markdown; the existing
long-gap display truncation sends the full missing-peer/fallback explanation to
JSON/audit (and retained reader detail), rather than rewriting historical text.
No full verify/build/coverage claim is made; the integrator owns those merged
gates. All three items are addressed; no live provider/model run was performed.


## Review fixes (owner delegated to the coordinator, 2026-11-01)

| Item | Disposition | Commit | Red / green receipts | Stored reports |
| --- | --- | --- | --- | --- |
| F1 | Fixed lender multiples, gross margin and net debt suppression; EV context names tied filed components | This F1/F2/F12 commit | n2-f1-f2-f12-red; n2-f1-ev-context-red / n2-f1-f2-f12-green | Immutable; new computations only |
| F2 | Fixed; lender solvency not modelled; industrial coverage/leverage not displayed as figures or scored | This F1/F2/F12 commit | n2-f1-f2-f12-red / n2-f1-f2-f12-green | Same |
| F12 | Fixed capital-return policy: ROTE instead of ROIC; operating margin retained | This F1/F2/F12 commit | n2-f1-f2-f12-red / n2-f1-f2-f12-green | Same |

FIGR FY2025 common earnings of 62.026m are filed under the basic-EPS common
stockholders tag (two-class allocation). ROTE is not missing that allocation:
its field observation time is 2026-11-01T03:20:40.813Z, after the immutable
bundle cutoff 2026-11-01T03:20:37.716Z. All annual ROTE numerators fail the
existing availability gate. No observation time is rewritten or gate relaxed.
A fresh collection must have a cutoff that admits its observations. The
synthetic eligible lender scores ROTE; the retained target remains withheld.


| Review item | Disposition | Commit | Red / green receipts | Stored reports |
| --- | --- | --- | --- | --- |
| F3 | Fixed both provider labels in new multi-class reports | This class-scope review commit | n2-f3-f5-f6-f7-f8-red / n2-f3-f5-f6-f7-f8-green | Immutable; optional new-report marker |
| F5 | Disclosure only; counts/dates and discrepancy, no gate change | Same | n2-f5-red-confirmed / n2-f3-f5-f6-f7-f8-green | Immutable |
| F6 | Treasury count/percentage disclosed without netting | Same | n2-f3-f5-f6-f7-f8-red / n2-f3-f5-f6-f7-f8-green | Immutable |
| F7 | Exact coordinator same-price wording | Same | n2-f3-f5-f6-f7-f8-red / n2-f3-f5-f6-f7-f8-green | Immutable |
| F8 | Share-worded contrary economics blocked, including review P1 | Same | n2-f3-f5-f6-f7-f8-red / n2-f3-f5-f6-f7-f8-green | Immutable |

F5's first red attempt had an unavailable shares-float fixture; the corrected
fixture was rerun against the pre-fix parser and failed on missing disclosure
(n2-f5-red-confirmed). No coverage assertion is weakened. F7's old wording pins
are replaced with the coordinator's required wording.


| Review item | Disposition | Commit | Red / green receipts | Stored reports |
| --- | --- | --- | --- | --- |
| F4 | No further N2 code change: F1 removes lender EV/Sales; general withholding while eligibility.annual.revenue is open belongs to N3 | This disposition commit | F1 receipts; no new rule | Immutable |
| F9 | Fixed zero-populated-peer wording | This peer-wording commit | n2-f9-red / n2-f9-green | Immutable |
| F10 | Reach corrected: all resolved-scope issuers, prompt only, in the original N2 prompt change; EXPE is the census prompt-only mover, including raw-cap registry ID change | This disposition commit | Baseline/final census and reviewer EXPE receipts | Immutable |
| F11 | No change; mortgage-banker phrase variants are a safe coverage limit, not FIGR's trigger | This disposition commit | Review P8; lender controls | Immutable |

F10 scope: the original raw-cap relabel changes EXPE's registry ID from
payload.quote.marketcap to the derived provider-cap label ID, and adds traced
issuer-common capitalization 34.282bn and 120,019,343 economic units. This
applies to all resolved-scope issuers, prompt only. The review F3 optional
multiClass marker and F7 approximation wording can additionally change scope
metadata/basis without changing financial numbers. These are disclosed in the
review census, rather than misreported as byte-identical computations.
