# N2 lender and share-class readiness (2026-11-02)

Offline evidence: retained corrected FIGR bundle and the integrator's independent
FIGR-TIEOUT. Baseline f8d6c758. No retained bundle is copied into the repository;
tests use small synthetic issuers. These readiness items are new research
questions, absent from the original audit findings/triage and reviewed plans.
The current brief supplies their scope. Existing owner routing decisions remain
binding: general plus recent-IPO, FIN-OTHER, not the bank map.

| Finding | Disposition | Commit | Red receipt | Green receipt | Stored-report impact |
| --- | --- | --- | --- | --- | --- |
| R-FIGR-3 | Fixed, bounded filed-statement alternative | R-FIGR-3 owning commit | r-figr-3-red-confirmed (2 failures; 11 controls pass) | r-figr-3-final-green (126 pass), r-figr-3-green-controls (350 pass) | New computations only; historical bytes unchanged (D-67). |
| R-FIGR-1 | Not started | - | - | - | - |
| R-FIGR-2 | Not started | - | - | - | - |

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
