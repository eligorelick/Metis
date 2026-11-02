# P9 methodology decisions (2026-11-02)

The owner delegated these methodology decisions to the coordinator on 2026-11-01.
Base: ae4b656e. Replays are offline; stored reports and snapshots are immutable.

| Item | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| FIN-306 | Fixed: route-withheld Piotroski tests leave the applicable ceiling; missing supported tests still reduce evidence | 1f110ce4; e1c5780f | fin306-red / fin306-green, fin306-fixtures | New computations only; historical scores remain as stored |
| FIN-307 | Confirmed: retain D-137 OD-6 | e2bfd580 | fin307-surfaces (6 passing; no defect reproduced) | No calculation change; stored reports retained |
| FIN-308 | Fixed; coordinator revised type rule 2026-11-02: positive real assets versus mortgage assets for established REITs | Initial: 2cd519b3; 584e70fe; 66c9ea1e; follow-up: this commit after merge 621a765e | fin308-revision-red, fin308-revision-ppe-alias-red / fin308-revision-consumers | New computations only; historical bytes retained |
| FIN-510-V1 | Fixed: refuse ambiguous sibling value | 37387ab5 | fin510v1-red / fin510v1-green | New statement builds only; historical bytes retained |
| Cash-capex | Confirmed: retained cash-capex field and mixed-basis disclosure | 9f7bea0c | cash-capex-records | No calculation change |

## FIN-306 measurements

The real fully observed bank battery is 3/3, with six tests excluded by route.
Its composite supporting weight and ceiling are both 74.51 (rounded); applicable
completeness is 1. The old 8/9 bank fixture and B-to-C transition encoded an
impossible battery and the wrong denominator. The replacement pins absence of
shrinkage at full applicable evidence and shrinkage when supported data is missing.
The quality aspect's 3/9 evidence weighting is retained.

| Census issuer | Before composite / band | After composite / band | Reason |
| --- | --- | --- | --- |
| BAC | 58.28 C | 58.71 C | Six route-withheld tests leave ceiling |
| BRK.B | 52.02 D | 52.14 D | Six route-withheld tests leave ceiling |
| JPM | 55.10 C | 55.36 C | Six route-withheld tests leave ceiling |
| PGR | 73.09 B | 74.45 B | Six route-withheld tests leave ceiling |
| UNH | 57.11 C | 57.22 C | Four route-withheld tests leave ceiling |
| PGR fixture | 72.24 B | 73.56 B | Six route-withheld tests leave ceiling |

Replay receipts: census-base and census-fin306 (45 census snapshots plus five
retained report snapshots). Other composite scores and bands are unchanged.

## Residuals

No live acquisition or inference is authorized. Missing source evidence stays
missing. Shared stamps remain report 1.56.0, payload 1.60.0, Stage B
STAGE_B_2026_11_CLAUDE_REPAIRS_39 and pipeline stage-c-1.6.18.


## FIN-307 verification

The exact scope warning reaches report HTML, reader Markdown, print, audit
Markdown and the serialized AI payload. Six controls pass, including retained
WACC/DCF, Altman Z-prime (1.14845, distress), cap-source selection and existing
currency/missing-cap refusals. Aggregate ADR DCF EV remains 3,200,131,788.7891836;
per-ADS value stays withheld. No red receipt is appropriate for this confirmed
no-change decision; the new surface assertions passed before production edits.


## FIN-308 measurements and calibration (coordinator revision 2026-11-02)

The initial P9 rule required property to exceed half of Assets. The coordinator
revised that rule because specialty equity REITs hold goodwill, intangibles
and right-of-use assets, yet their rental-property economics require FFO/AFFO.
The sub-map must distinguish equity from mortgage. The revised rule and every
tag are named in METHODOLOGY and the routing basis. PP&E is admitted only once
REIT status is established. Mortgage corroboration and unknown common grading
are unchanged. No ticker exceptions or saved-report reinterpretation.

Real assets are filed net investment property (otherwise cost less accumulated
depreciation) plus net PP&E from the existing synonym table. Every operand
matches Assets by instant, currency and accession, and is filed by the run
within the recency window. Positive real assets >= mortgage assets, with
mortgage assets < 50% of Assets, establish equity. Mortgage assets >= 50%
establish mortgage exposure with the existing corroboration; the existing
conflicting-majorities/50-50 case stays unknown. Missing real facts never
establish equity. HTM fair-value and generic loan disclosures remain excluded.

| Input | Comparable real assets | Assets | Final type / effect |
| --- | --- | --- | --- |
| AMT census | 20,573,000,000 net PP&E (registered finance-lease synonym) | 63,300,100,000 | Equity; 56.18 C -> 52.77 D versus prior P9 |
| O census | 55,112,439,000 net property | 76,441,475,000 | Equity; unchanged |
| NNN census | 9,463,681,000 net property | 9,606,523,000 | Equity; unchanged |
| PLD census | 79,943,092,000 net property | 98,133,451,000 | Equity; unchanged |
| O / NNN trimmed fixtures | No property or net-PP&E facts | Filed Assets available | Unknown; common grading retained |

AMT uses `PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization`
and Assets, both 2026-06-30, USD, accession 0001053507-26-000133. Its literal
`PropertyPlantAndEquipmentNet` ends in 2019, so the existing registered synonym
is necessary; no stale fact is carried forward. Its 20.573B real assets are
positive, >= mortgage assets 0, and mortgage assets are < 31.65005B.

| AMT property-map figure | Previous P9 66c9ea1e | Final (equals ac4916f8) |
| --- | --- | --- |
| P/FFO | Withheld | 17.3499503074 |
| P/AFFO | Withheld | 26.7839577164 |
| FFO/share | Withheld | 10.2319496424 |
| AFFO/share | Withheld | 6.6279905204 |
| Implied cap rate | Withheld | 5.5906597293% |
| REIT-model EV | Withheld | 124,733,042,926.72 |

Trimmed O and NNN retain unknown types and raw Beneish scores
-2.596362634549579 and -2.5589578643944697. Their final composites stay 46.50 D
and 50.28 D; the earlier 44.20 / 50.73 pins at integration used the incompatible
industrial-map signals. No census input is a mortgage REIT. Synthetic controls
cover PP&E-only specialty property; 45% real / 40% mortgage -> equity;
10% real / 30% mortgage -> unknown; 50% mortgage; 50/50 ambiguity; 49% mortgage;
missing real facts; net/cost/depreciation and alias precedence; and incompatible
period, currency, accession, duration, future-filing and stale evidence.
The consumer control checks all six restored valuation fields plus balance
sheet and moat grading. The same PP&E never turns an industrial into a REIT.


## FIN-510-V1 statement-producer replay

45 retained census companyfacts were rebuilt with the same statement options
before and after (producer-base / producer-fin510v1). These are the only
field movers; each now carries the conflict gap naming both siblings. The full
period-level amounts and gaps are retained in the two receipt JSON artifacts.

| Issuer | Changed annual / quarterly rows | Most recent affected value before -> after |
| --- | --- | --- |
| HD | 7 / 23 | FY2025 2026-02-01: 1,500,000,000 -> withheld; sibling 2,575,000,000 |
| DIS | 7 / 24 | FY2025 2025-09-27: 5,689,000,000 -> withheld |
| AAPL | 1 / 0 | FY2018: 5,966,000,000 -> withheld |
| META | 1 / 0 | FY2017: 98,000,000 -> withheld |
| ORCL | 1 / 0 | FY2018: 8,341,000,000 -> withheld |

The remaining 40 issuer producers are unchanged in these fields. JNJ FY2025
R&D stays 14,665,000,000; JPM FY2025 interest income stays 193,341,000,000.
There is no current deferred-revenue consumer in FCF, DCF or composite grades;
all census and fixture financial outputs retain their prior P9 values.


## Cash-capex confirmation

No arithmetic or runtime disclosure changed. The convention is stated in
METHODOLOGY and recorded as owner-delegated. FIG: retained vendor capex
18.238M versus PP&E-only 16.936M; the difference 1.302M is 0.6% of retained
231.012M FCF. A PP&E-plus-software basis would be another convention, requiring
comparable period evidence and dependent FCF/P/FCF/DCF-seed review across issuers.


FIN-306 missing-battery review: an entirely absent bank battery previously
left all nine tests in the ceiling. fin306-missing-red reproduced evidence
0.9269662921 versus intended 0.9744094488 on the otherwise full control;
fin306-missing-green verifies the supported maximum even with no result.
Missing supported tests still penalize evidence, and unresolved eligibility
retains its refusal. This adds no ticker exception or stored reinterpretation.


## Initial P9 round gates and census inventory (before coordinator revision)

The final product, typecheck and lint receipts are recorded in
`tmp/claude-impl/HANDOFF.md` with the verified HEAD. The follow-up additionally requires the complete risk-coverage run on its final
head, including the per-file floors for every existing risk source touched.
Payload and intended-delta goldens passed unchanged; no band threshold or
shared stamp changed. The release inventory registers this disposition note.

The initial full-product invocation exposed three dependency-shape failures
because a direct Node launch had no `npm_execpath`, plus a release-inventory
failure caused by the temporary untracked replay harness. The final invocation
supplies the installed Node-24 npm CLI path, and the temporary harness is
removed. These are recorded setup failures, not claimed pre-existing defects.
The FIN-308 test-only taxonomy mutation types also failed typecheck before
being corrected in 584e70fe. All observed failures and receipts are retained
in HANDOFF; only the final-head gates establish completion.

Complete score/band replay inventory (45 main-census inputs, five retained
report inputs and five issuer fixtures):

| Input | Before score / band | After score / band |
| --- | --- | --- |
| snapshot: report-43:AMZN | 55.54 C | 55.54 C |
| snapshot: report-46:MU | 77.91 B | 77.91 B |
| snapshot: report-48:NVDA | 76.29 B | 76.29 B |
| snapshot: report-49:NVDA | 76.29 B | 76.29 B |
| snapshot: report-50:NVDA | 76.29 B | 76.29 B |
| snapshot: census-AAPL:AAPL | 62.69 C | 62.69 C |
| snapshot: census-AMT:AMT | 52.77 D | 56.18 C |
| snapshot: census-AMZN:AMZN | 55.48 C | 55.48 C |
| snapshot: census-BA:BA | 40.27 D | 40.27 D |
| snapshot: census-BAC:BAC | 58.28 C | 58.71 C |
| snapshot: census-BRK.B:BRK.B | 52.02 D | 52.14 D |
| snapshot: census-CAT:CAT | 56.75 C | 56.75 C |
| snapshot: census-CMCSA:CMCSA | 54.34 D | 54.34 D |
| snapshot: census-COST:COST | 60.57 C | 60.57 C |
| snapshot: census-CSCO:CSCO | 56.39 C | 56.39 C |
| snapshot: census-CVX:CVX | 57.92 C | 57.92 C |
| snapshot: census-DIS:DIS | 57.86 C | 57.86 C |
| snapshot: census-DUK:DUK | 51.98 D | 51.98 D |
| snapshot: census-EXPE:EXPE | 65.85 C | 65.85 C |
| snapshot: census-FCX:FCX | 54.47 D | 54.47 D |
| snapshot: census-GOOGL:GOOGL | 61.39 C | 61.39 C |
| snapshot: census-HD:HD | 57.2 C | 57.2 C |
| snapshot: census-INTC:INTC | 40.42 D | 40.42 D |
| snapshot: census-JNJ:JNJ | 57.91 C | 57.91 C |
| snapshot: census-JPM:JPM | 55.1 C | 55.36 C |
| snapshot: census-KO:KO | 55.37 C | 55.37 C |
| snapshot: census-LLY:LLY | 62.65 C | 62.65 C |
| snapshot: census-MA:MA | 67.92 C | 67.92 C |
| snapshot: census-MCD:MCD | 57.5 C | 57.5 C |
| snapshot: census-META:META | 62.16 C | 62.16 C |
| snapshot: census-MSFT:MSFT | 61.75 C | 61.75 C |
| snapshot: census-NEE:NEE | 52.5 D | 52.5 D |
| snapshot: census-NFLX:NFLX | 66.91 C | 66.91 C |
| snapshot: census-NNN:NNN | 48.85 D | 48.85 D |
| snapshot: census-NVDA:NVDA | 79.8 B | 79.8 B |
| snapshot: census-O:O | 43 D | 43 D |
| snapshot: census-ORCL:ORCL | 48.27 D | 48.27 D |
| snapshot: census-PEP:PEP | 61.57 C | 61.57 C |
| snapshot: census-PG:PG | 57.77 C | 57.77 C |
| snapshot: census-PGR:PGR | 73.09 B | 74.45 B |
| snapshot: census-PLD:PLD | 49.61 D | 49.61 D |
| snapshot: census-SNOW:SNOW | 54.79 D | 54.79 D |
| snapshot: census-T:T | 52.52 D | 52.52 D |
| snapshot: census-TSLA:TSLA | 54.54 D | 54.54 D |
| snapshot: census-TSM:TSM | 51.31 D | 51.31 D |
| snapshot: census-UNH:UNH | 57.11 C | 57.22 C |
| snapshot: census-V:V | 64.36 C | 64.36 C |
| snapshot: census-VZ:VZ | 55.92 C | 55.92 C |
| snapshot: census-WMT:WMT | 51.98 D | 51.98 D |
| snapshot: census-XOM:XOM | 55.14 C | 55.14 C |
| fixture: FCX | 55.98 C | 55.98 C |
| fixture: PGR | 72.24 B | 73.56 B |
| fixture: O | 44.2 D | 46.5 D |
| fixture: SNOW | 56.6 C | 56.6 C |
| fixture: NNN | 50.73 D | 50.28 D |


FIN-308 numerator-basis review: fin308-mbs-basis-red reproduced a false mortgage
majority when 10% AFS carrying/fair assets were added to a 60% HTM fair-value-only
disclosure. The corrected numerator uses the comparable AFS tag; HTM and
issuer-category fair-value-only disclosures do not establish carrying assets.
Property, AFS mortgage, direct-loan and unknown controls remain covered. This
changes no census/fixture measurement (no census mortgage REIT). The full
product gate is rerun after this correction so it covers the final HEAD.


## Follow-up replay against both requested bases

Offline captures at exact commits `66c9ea1e` and `ac4916f8` each replayed the
same 45 main-census snapshots, five retained-report input snapshots and five
keyless issuer fixtures. The branch merged integration at `621a765e` before
this revision. No captured input or stored report was changed. All 55 FCF
values are identical against both bases. Quantitative changes below include
integration effects, rather than attributing them to the REIT revision.

Receipts: `revision-census-66c9ea1e`, `revision-fixtures-66c9ea1e`,
`revision-census-ac4916f8`, `revision-fixtures-ac4916f8`,
`revision-census-candidate`, `revision-fixtures-candidate`.
The final-head captures are `revision-census-final-head` and
`revision-fixtures-final-head`; their financial projections must equal the
candidate. `revision-issuer-deltas.json` holds all 55 rows;
`revision-numeric-deltas-66c9ea1e.json` and
`revision-numeric-deltas-ac4916f8.json` enumerate every numeric leaf mover.
The first literal-tag-only replay (`revision-census-final`) still withheld AMT;
`fin308-revision-ppe-alias-red` then reproduced the registered-synonym gap.
That intermediate capture is superseded, never claimed as the final result.

### Every quantitative mover and reason

| Input | Previous P9 66c9ea1e | Integration ac4916f8 | Final | Reason |
| --- | --- | --- | --- | --- |
| snapshot: census-AMT:AMT | 56.18 C | 52.77 D | 52.77 D | FIN-308 revision: positive comparable net PP&E; unknown -> equity; property valuation and grading restored. |
| snapshot: census-BAC:BAC | 58.71 C | 58.53 C | 58.97 C | Versus P9: integrated FIN-309 quote-date excess-return roll. Versus integration: retained FIN-306 applicable-evidence ceiling. |
| snapshot: census-BRK.B:BRK.B | 52.14 D | 52.02 D | 52.14 D | Versus P9: integrated FIN-309 aggregate excess-return values use dated model shares (per-share and score unchanged). Versus integration: retained FIN-306 ceiling. |
| snapshot: census-DUK:DUK | 51.98 D | 51.98 D | 51.98 D | Integrated FIN-302 bridge metadata: absent preferred claim null -> 0; DCF/share and score unchanged. |
| snapshot: census-GOOGL:GOOGL | 61.39 C | 63.15 C | 63.15 C | Integrated FIN-302/FIN-302-V1 convertible claim/divisor: 18.023B preferred claim, diluted count 12.309B -> 12.293B; valuation and score follow. |
| snapshot: census-JPM:JPM | 55.36 C | 55.10 C | 55.36 C | Retained FIN-306 applicable-evidence ceiling versus integration; unchanged versus P9. |
| snapshot: census-PGR:PGR | 74.45 B | 73.31 B | 74.69 B | Versus P9: integrated FIN-309 quote-date excess-return roll. Versus integration: retained FIN-306 applicable-evidence ceiling. |
| snapshot: census-UNH:UNH | 57.22 C | 57.11 C | 57.22 C | Retained FIN-306 applicable-evidence ceiling versus integration; unchanged versus P9. |
| fixture: PGR | 73.56 B | 72.53 B | 73.87 B | Versus P9: integrated FIN-309 quote-date excess-return roll. Versus integration: retained FIN-306 applicable-evidence ceiling. |
| fixture: O | 46.50 D | 44.20 D | 46.50 D | Retained FIN-308 common grading versus integration: trimmed filing has no real-asset facts; still unknown. Unchanged versus P9. |
| fixture: NNN | 50.28 D | 50.73 D | 50.28 D | Retained FIN-308 common grading versus integration: trimmed filing has no real-asset facts; still unknown. Unchanged versus P9. |

Financial value deltas versus previous P9, all from the integrated B4b fixes
except AMT's restored property map:

| Input / figure | Previous P9 | Final | Reason |
| --- | --- | --- | --- |
| BAC excess-return/share | 45.7923511126 | 47.1378014208 | FIN-309 date roll |
| PGR census excess-return/share | 293.4674325042 | 300.2180924805 | FIN-309 date roll |
| PGR fixture excess-return/share | 254.7814799398 | 261.4243345952 | FIN-309 date roll |
| BRK.B aggregate excess-return equity | 1,374,290,241,582.71 | 1,408,231,990,056.08 | FIN-309 model shares; per-share unchanged |
| BRK.B alternative aggregate equity | 1,203,167,337,406.80 | 1,282,016,807,508.82 | FIN-309 model shares; per-share unchanged |
| GOOGL DCF/share | 215.5926213765 | 214.4071078275 | FIN-302 preferred claim/divisor |
| GOOGL enterprise value excluding leases | 3,954,394,800,000 | 3,972,417,800,000 | FIN-302 preferred claim |
| GOOGL P/FCF | 76.8515908622 | Withheld | FIN-302 exposes preferred claims; parent-common cash-flow attribution unproved |
| DUK preferred bridge field | Unrecorded (null) | 0 | FIN-302 zero-claim metadata; valuation unchanged |

All other changed financial cells are dependent sensitivity, own-history,
alternative or reverse-solve figures of those same issuers, enumerated in the
numeric-leaf artifacts. Against ac4916f8, all financial valuation amounts are
identical; only P9 grading/applicability changes remain. AMT has exactly the
same six property-map values and composite as ac4916f8.

### Complete per-input score and band table

| Input | Previous P9 66c9ea1e | Integration ac4916f8 | Final |
| --- | --- | --- | --- |
| snapshot: report-43:AMZN | 55.54 C | 55.54 C | 55.54 C |
| snapshot: report-46:MU | 77.91 B | 77.91 B | 77.91 B |
| snapshot: report-48:NVDA | 76.29 B | 76.29 B | 76.29 B |
| snapshot: report-49:NVDA | 76.29 B | 76.29 B | 76.29 B |
| snapshot: report-50:NVDA | 76.29 B | 76.29 B | 76.29 B |
| snapshot: census-AAPL:AAPL | 62.69 C | 62.69 C | 62.69 C |
| snapshot: census-AMT:AMT | 56.18 C | 52.77 D | 52.77 D |
| snapshot: census-AMZN:AMZN | 55.48 C | 55.48 C | 55.48 C |
| snapshot: census-BA:BA | 40.27 D | 40.27 D | 40.27 D |
| snapshot: census-BAC:BAC | 58.71 C | 58.53 C | 58.97 C |
| snapshot: census-BRK.B:BRK.B | 52.14 D | 52.02 D | 52.14 D |
| snapshot: census-CAT:CAT | 56.75 C | 56.75 C | 56.75 C |
| snapshot: census-CMCSA:CMCSA | 54.34 D | 54.34 D | 54.34 D |
| snapshot: census-COST:COST | 60.57 C | 60.57 C | 60.57 C |
| snapshot: census-CSCO:CSCO | 56.39 C | 56.39 C | 56.39 C |
| snapshot: census-CVX:CVX | 57.92 C | 57.92 C | 57.92 C |
| snapshot: census-DIS:DIS | 57.86 C | 57.86 C | 57.86 C |
| snapshot: census-DUK:DUK | 51.98 D | 51.98 D | 51.98 D |
| snapshot: census-EXPE:EXPE | 65.85 C | 65.85 C | 65.85 C |
| snapshot: census-FCX:FCX | 54.47 D | 54.47 D | 54.47 D |
| snapshot: census-GOOGL:GOOGL | 61.39 C | 63.15 C | 63.15 C |
| snapshot: census-HD:HD | 57.20 C | 57.20 C | 57.20 C |
| snapshot: census-INTC:INTC | 40.42 D | 40.42 D | 40.42 D |
| snapshot: census-JNJ:JNJ | 57.91 C | 57.91 C | 57.91 C |
| snapshot: census-JPM:JPM | 55.36 C | 55.10 C | 55.36 C |
| snapshot: census-KO:KO | 55.37 C | 55.37 C | 55.37 C |
| snapshot: census-LLY:LLY | 62.65 C | 62.65 C | 62.65 C |
| snapshot: census-MA:MA | 67.92 C | 67.92 C | 67.92 C |
| snapshot: census-MCD:MCD | 57.50 C | 57.50 C | 57.50 C |
| snapshot: census-META:META | 62.16 C | 62.16 C | 62.16 C |
| snapshot: census-MSFT:MSFT | 61.75 C | 61.75 C | 61.75 C |
| snapshot: census-NEE:NEE | 52.50 D | 52.50 D | 52.50 D |
| snapshot: census-NFLX:NFLX | 66.91 C | 66.91 C | 66.91 C |
| snapshot: census-NNN:NNN | 48.85 D | 48.85 D | 48.85 D |
| snapshot: census-NVDA:NVDA | 79.80 B | 79.80 B | 79.80 B |
| snapshot: census-O:O | 43.00 D | 43.00 D | 43.00 D |
| snapshot: census-ORCL:ORCL | 48.27 D | 48.27 D | 48.27 D |
| snapshot: census-PEP:PEP | 61.57 C | 61.57 C | 61.57 C |
| snapshot: census-PG:PG | 57.77 C | 57.77 C | 57.77 C |
| snapshot: census-PGR:PGR | 74.45 B | 73.31 B | 74.69 B |
| snapshot: census-PLD:PLD | 49.61 D | 49.61 D | 49.61 D |
| snapshot: census-SNOW:SNOW | 54.79 D | 54.79 D | 54.79 D |
| snapshot: census-T:T | 52.52 D | 52.52 D | 52.52 D |
| snapshot: census-TSLA:TSLA | 54.54 D | 54.54 D | 54.54 D |
| snapshot: census-TSM:TSM | 51.31 D | 51.31 D | 51.31 D |
| snapshot: census-UNH:UNH | 57.22 C | 57.11 C | 57.22 C |
| snapshot: census-V:V | 64.36 C | 64.36 C | 64.36 C |
| snapshot: census-VZ:VZ | 55.92 C | 55.92 C | 55.92 C |
| snapshot: census-WMT:WMT | 51.98 D | 51.98 D | 51.98 D |
| snapshot: census-XOM:XOM | 55.14 C | 55.14 C | 55.14 C |
| fixture: FCX | 55.98 C | 55.98 C | 55.98 C |
| fixture: PGR | 73.56 B | 72.53 B | 73.87 B |
| fixture: O | 46.50 D | 44.20 D | 46.50 D |
| fixture: SNOW | 56.60 C | 56.60 C | 56.60 C |
| fixture: NNN | 50.28 D | 50.73 D | 50.28 D |

### Follow-up gates and residuals

`fin308-revision-red`: nine expected defect/disclosure assertions failed.
`fin308-revision-ppe-alias-red`: one expected registered-synonym assertion
failed. `fin308-revision-consumers`: 669 tests passed, including the property
valuation consumer, prior common-grading controls, trimmed O/NNN, payload
golden and tag-synonym registry. Typecheck and lint passed in
`fin308-revision-typecheck` / `fin308-revision-lint`.
The docs/release/stamp gate is `fin308-revision-records`.
Final-head product, risk coverage, typecheck and lint receipts are named
`revision-final-head-product`, `revision-final-head-risk`,
`revision-final-head-typecheck`, `revision-final-head-lint`. Their exact HEAD,
counts and any observed failures are recorded in the ignored HANDOFF after
the runs finish. Coverage floors are unchanged and apply per existing risk
source; the risk gate is required even without a newly added source file.

Shared report 1.56.0, payload 1.60.0, Stage B
STAGE_B_2026_11_CLAUDE_REPAIRS_39 and pipeline stage-c-1.6.18 stay unchanged.
No financial golden or intended-delta JSON was re-pinned. The existing
research-reliability helper alone restores the shared payload stamp; B4b's
helper restores only its own method stamps. All merge batches and registered
notes are retained. Stored reports are immutable. No owner question remains.
