# P2 DCF inputs and seasonality disposition (2026-11-02)

Base: ac4916f8. All 18 audit findings reproduced at this exact base; N1 is an
added research remedy. No already-fixed B5a items were repeated. Every replay
is offline; stored source bytes remain immutable. Shared stamps remain report
1.56.0, payload 1.60.0, Stage B STAGE_B_2026_11_CLAUDE_REPAIRS_39 and pipeline
stage-c-1.6.18. Owner decisions were read from specs/, including OD-5 and OD-11.

| Finding | Status and remedy | Owning commit(s) | Red receipt | Green receipt | Stored-report impact |
|---|---|---|---|---|---|
| FIN-402 | Fixed: coverage EBIT uses its own normalized window | 7b91d6c1 | fin-402-family-red | fin-402-family-green-03 | No numeric rewrite |
| FIN-402-V1 | Fixed: separate normalized terminal evidence; GAAP grades retained | 7b91d6c1 | fin-402-family-red | fin-402-family-green-03 | No numeric rewrite |
| FIN-402-V2 | Fixed: normalized annual margins/ceiling with per-tag recurring guard | 7b91d6c1 | fin-402-family-red | fin-402-family-green-03 | No numeric rewrite |
| FIN-502 | Fixed: bounded normalized tax seed | 7b91d6c1 | fin-402-family-red; fin-502-legacy-red | fin-402-family-docs-green-02 | Proven old mismatch receives note |
| FIN-102 | Fixed: known operating losses with admitted positive capital remain terminal misses | 8e353992 / 04ca47f2 | fin-102-red | fin-102-green-02 | Skipped old terminal years receive note |
| FIN-111 | Fixed: transition flows leave growth, fits and valuation history | 3d5bbeda | fin-111-red | fin-111-green | Numbers retained |
| FIN-501 | Fixed: OD-11 base-shift margin family; actual solved path published | afc0a927 / 40786255 | fin-501-104-red-02; fin-501-od11-red; fin-501-trigger-red | fin-501-od11-green; p2-integration-green-04 | Numbers retained |
| FIN-104 | Fixed: all reverse candidates/brackets/bounds stay in-domain | afc0a927 | fin-501-104-red-02 | fin-501-104-green-02 | Old unsupported range-end claim receives note |
| FIN-116 | Fixed: weighted latest debt admits debt leg; average only rate denominator | 055afea5 | fin-116-red | fin-116-green | Old latest-debt/all-equity claim receives note |
| FIN-405 | Fixed: no predecessor YoY labelled current when newest year refused | a38fe3b9 | fin-405-red | fin-405-green-03 | Numbers retained |
| FIN-127 | Fixed: filed fiscal-year identity or distinct FY ending date labels | 8d16549c / c99fee4c | fin-127-red; fin-127-od5-red | fin-127-green-02; fin-127-od5-green | Numbers retained |
| FIN-114 | Fixed: ERP source names selected country | a18ab470 | fin-114-red | fin-114-green | Numbers retained |
| FIN-113 | Fixed: filed current-capital start; approximate fallback identified | a794397d | fin-113-red | fin-113-green | Only evidence-established date metadata corrected |
| FIN-115 | Fixed: manifest names debt cost actually accepted | 1ccbeeb5 | fin-115-red | fin-115-green-02 | Numbers retained |
| FIN-118 | Fixed: degradation names actual valuation dependencies | 87505f44 | fin-118-red | fin-118-green | Stored dependency label corrected from stored evidence |
| FIN-406 | Fixed: known loss uses zero tax shield across keyed/keyless routes | fc433589 | fin-406-red | fin-406-green | Numbers retained |
| FIN-512 | Fixed: binding sigma caps disclose raw sample and bounded shock | 508f7315 | fin-512-red; fin-512-legacy-rpt502-red | fin-512-complete-green | Old sigma at bound qualified; no raw sample invented |
| RPT-502 | Fixed: scenario method names domain withholding | 52568d91 | fin-512-legacy-rpt502-red | rpt-502-green | Exact obsolete method sentence adapted for display |
| N1 | Fixed: concentrated SBC disclosure and other-three-quarter run rate | a7f4e1a9 | n1-red-02 | n1-complete-green | No old numeric reinterpretation without quarter evidence |

Consumer follow-through: 6ca62516 fixes nullable provenance type contracts;
5916d965 and 6eb0163f own the added terminal evidence and approximation metadata
in historical golden restoration, the normalized terminal basis, admitted-row
FCF labels, and the five-year trigger horizon. No helper rolls a shared stamp
back. Commit 9935e3db supplies the frozen legacy display adaptations. The old
full-output golden pins remain intact through one P2 helper, with leaf-level
assertions. Fourteen owned audit-delta leaves name the P2 findings; pre-existing
capex-restoration ownership remains unchanged.

## Offline replay and intended deltas

Each table value without an arrow is identical before and after. DCF/share is
in the input currency; null DCFs are withheld. All terminal ROICs and score bands
are unchanged. Inputs comprise all 45 frozen census snapshots plus keyed AMZN
43, MU 46 and NVDA 50 (48 runs).

| Input | DCF/share | WACC % | Terminal ROIC % | Composite / band |
|---|---:|---:|---:|---|
| AAPL | 137.8282 | 9.4239 | 14.4239 | 62.69 / C |
| AMT | withheld | 7.8786 | withheld | 52.77 / D |
| AMZN | 102.9742 | 10.3182 | 10.3182 | 55.48 / C |
| BA | 27.7411 -> 27.7108 | 8.9176 | 8.9176 | 40.27 / D -> 42.37 / D |
| BAC | withheld | withheld | withheld | 58.53 / C |
| BRK.B | withheld | withheld | withheld | 52.02 / D |
| CAT | 239.9938 -> 263.3959 | 10.0539 | 13.4674 | 56.75 / C |
| CMCSA | withheld | withheld | withheld | 54.34 / D |
| COST | 321.9031 | 8.8451 | 13.8451 | 60.57 / C -> 62.67 / C |
| CSCO | withheld | 8.9420 | 8.9420 | 56.39 / C |
| CVX | withheld | withheld | withheld | 57.92 / C |
| DIS | withheld | withheld | withheld | 57.86 / C |
| DUK | 36.6627 | 6.1200 | 6.1200 | 51.98 / D |
| EXPE | 271.5668 | 9.6501 | 9.6501 | 65.85 / C |
| FCX | 17.3209 -> 16.8771 | 9.8467 | 12.3478 | 54.47 / D -> 56.57 / C |
| GOOGL | 214.4071 | 9.7182 | 14.7182 | 63.15 / C |
| HD | 214.7853 | 8.3878 | 13.3878 | 57.20 / C |
| INTC | withheld | 13.4158 -> 11.6538 | withheld | 40.42 / D |
| JNJ | 125.1139 -> 124.8936 | 7.4522 | 12.4522 | 57.91 / C |
| JPM | withheld | withheld | withheld | 55.10 / C |
| KO | 41.0871 | 7.3274 | 12.3148 | 55.37 / C |
| LLY | withheld | withheld | withheld | 62.65 / C |
| MA | withheld | withheld | withheld | 67.92 / C |
| MCD | withheld | withheld | withheld | 57.50 / C |
| META | withheld | withheld | withheld | 62.16 / C |
| MSFT | 315.0518 | 9.3164 | 14.3164 | 61.75 / C |
| NEE | withheld | 7.7869 | 7.7869 | 52.50 / D |
| NFLX | 38.7598 | 11.0248 | 11.0248 | 66.91 / C |
| NNN | withheld | withheld | withheld | 48.85 / D |
| NVDA | 297.5180 | 12.6803 | 17.6803 | 79.80 / B |
| O | withheld | 6.7623 | withheld | 43.00 / D |
| ORCL | withheld | withheld | withheld | 48.27 / D |
| PEP | 133.9403 -> 142.2934 | 6.9190 | 11.9190 | 61.57 / C -> 62.44 / C |
| PG | withheld | 7.3493 | withheld | 57.77 / C |
| PGR | withheld | withheld | withheld | 73.31 / B |
| PLD | withheld | withheld | withheld | 49.61 / D |
| SNOW | withheld | 10.1256 | withheld | 54.79 / D |
| T | withheld | 6.2373 | withheld | 52.52 / D |
| TSLA | withheld | 11.2229 | 11.2229 | 54.54 / D |
| TSM | withheld | withheld | withheld | 51.31 / D |
| UNH | 393.6370 | 7.2432 | 12.2432 | 57.11 / C |
| V | withheld | withheld | withheld | 64.36 / C |
| VZ | 62.6106 | 6.1200 | 7.8030 | 55.92 / C |
| WMT | 43.2402 | 7.8241 | 12.5943 | 51.98 / D |
| XOM | withheld | 7.4353 | 10.9736 | 55.14 / C |
| retained-43 (AMZN) | 87.1728 | 10.5792 | 10.5792 | 55.54 / C -> 57.64 / C |
| retained-46 (MU) | 3981.1308 | 13.0212 | 13.0212 | 77.91 / B |
| retained-50 (NVDA) | 230.1140 | 13.0212 | 18.0212 | 76.29 / B |

Only eight inputs have a numeric change in these five outputs:

- BA, FCX and JNJ: the admitted one-off also leaves the tax seed. The TTM items
  are 33M impairment, 699M gain and 882M impairment respectively. Recurring
  annual families remain in annual history; no blanket historical add-back.
- CAT: FY2022's 925M goodwill impairment is a one-year family, admitted to annual
  history and ceiling. The terminal margin target moves 17.52% -> 18.78%.
- PEP: two annual asset-impairment years (498M and 321M) and a distinct one-year
  intangible-impairment family (3,166M) pass the per-tag three-of-five rule.
  No tag family reaches three. The normalized history/ceiling permits the move.
- INTC: coverage includes the admitted 4.070B TTM add-back, as OD-1 requires.
  The history's five-of-five recurring family still stays reported. ICR 3.4722
  yields the A3/A- synthetic rating; WACC falls 1.7620pp. DCF remains withheld.
- BA, COST, FCX and keyed AMZN: removing an out-of-domain reverse-growth driver
  lowers valuation completeness by 0.3 and adds 2.10 to composite through the
  established shrink-to-neutral rule. PEP's 0.87 composite change follows its
  intended valuation move. No GAAP ROIC grade is normalized.

No unexplained numeric mover remains. Filed start metadata and reverse-margin
families also change as intended without changing these five census outputs.

## Threshold, real SBC and stored-report evidence

The 357-day transition guard admits all measured census full years: 434 filed
income starts, two income gaps, 393 cash-flow gaps, and 779 deduplicated annual
companyfacts contexts, each 364-371 days. All five retained keyed fixtures also
have only 364-371-day measured years (thresholds-keyed-gate.json). Unknown oldest
row durations remain admitted. The census has no actual transition filing;
synthetic stubs exercise the refusal and controls. Periods >=357 days remain a
stated limitation, with no threshold retuning.

The real retained FIG replay keeps default after-SBC FCF -1,442,166,000 and score
48.26/D. Its quarter ending 2025-09-30 has SBC 1,138,332,000 against other-quarter
median 168,998,000. Its cash-capex run-rate companion is -470,508,000: other-three
CFO 198,087,000 minus capex 16,122,000 minus SBC 534,846,000, all times 4/3.
The research example -469,324,000 used PP&E-only capex 15,234,000; the retained
house cash-capex basis includes another 888,000. Both arithmetic bases are
recorded; the implementation consistently keeps the house cash-capex basis.
No IPO cause is inferred. Steady-SBC, nonpositive and incomplete controls pass.

The 51 stored reports replay immutably and idempotently. Report 43 gets a skipped
terminal-year note; reports 46 and 48 get established start metadata 2025-08-29
and 2025-07-28. Old boundary sigmas receive a bounded-shock note without invented
raw samples. Obsolete scenario-method text is adapted for display. Commentary
text and verification logs remain recorded. Unsupported evidence is untouched.

## Verification receipts and failure record

Focused final consumer/docs gates: p2-integration-green-04 (23 selected checks),
p2-stored-docs-green (149 checks), p2-typecheck-06. Exact-base reproduction:
p2-base-probes-02 (49 checks: 38 red triggers and 11 controls) and independent
p2-base-integration-controls. The final committed head is subjected to
p2-product-final, p2-risk-final, p2-typecheck-final, p2-lint-final and
p2-replay-final. Their actual outcomes, final SHA, full commit list and every
failed receipt are recorded in tmp/claude-impl/HANDOFF.md and failures.md.
No failure is labelled pre-existing without an ac4916f8 receipt.

The first full product run exposed eight failures: intended audit deltas,
admitted-row fiscal alias, three npm_execpath harness controls, historical
forensic hash, an inconsistent annual-guidance fixture and payload golden
approximation metadata. Each has a focused passing check. The raw audit-delta
generator also reclassified old capex leaves; original ownership was restored,
not accepted as a P2 delta. Final gates are required after these corrections.

No owner-level question or known unimplemented item remains. Stored financial
outputs remain historical; the display adapters explain proven old conventions.

Final self-review added the explicit B4a refusal boundary: FIN-102 does not count
an operating loss on refused, missing or nonpositive capital. Receipt
fin-102-capital-refusal-red proves the prior overreach; its green consumer gate
includes the existing capital-refusal and golden tests. The earlier candidate
product run is superseded; p2-product-final-02 and p2-risk-final are required
on the corrected committed head, together with renewed type/lint/replay gates.
