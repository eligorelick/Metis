# Audit batch 1: headline numbers (2026-10-22)

Base: `bc71121` (main). Scope: batch 1 of the independent audit of 2026-10-22, findings B-25, B-19, B-14, B-15, B-17, B-16, B-40, A-10 and F-19: reports that published wrong headline figures with no warning. Decision: D-100 in [DECISIONS](DECISIONS.md). The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below, served from the run cache. The only new fixture is `tests/fixtures/batch1-debt-facts.json`: public SEC companyfacts for Oracle, Chevron, Prologis and Meta, trimmed to the debt facts the tests read.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| B-25 Guidance ranges and periods | Fixed. "$73-76 billion" was read as an unscaled $73 point and "15-17%" as −17%. A money range shares the scale printed after its high end, a percent range shares its %, a range hyphen is never a sign, a range with one readable end is left unread, and an amount the guide is compared with is not the guide. An outlook naming its year without "full year" guides that fiscal year, not the block's quarter (Meta, Lilly, NextEra, AT&T, Verizon). Backstop: a revenue guide outside 0.2–5× the latest quarter its release could see (four quarters for a full-year guide) is left out of the DCF anchor, the outlook table and the checks, with a note. | `3387f14`, `9f53b9a`, `2f36811`, `a86764f`, `42d24d7` | `tests/currentReports.guidanceRanges.test.ts`, `tests/currentReports.test.ts`, `tests/filingDisclosures.integrity.test.ts` |
| B-19 ADR market cap | Fixed. TSM printed $11.2T: the ADS price times the 25.93B ordinary shares on the 20-F cover (one ADS is five shares). The ADR flag now falls back to the 20-F/40-F forms when no statement row was built, and a 20-F filer's keyless market cap, quote market cap and market-cap history are withheld with a gap naming the missing depositary ratio; a 40-F filer lists its common shares and keeps its market cap. A market cap Métis computes is labelled derived. Panel: TSM $11.2T → withheld. | `7a88d33`, `81a612a` | `tests/keyless.test.ts`, `tests/marketData.integrity.test.ts`, `tests/stageB.economicShareScope.test.ts` |
| B-14 `LongTermNotesAndLoans` | Fixed. Long-term debt reads the tag with its current portion, netted against a current-debt line that already carries it. A same-period debt total the filer tagged that exceeds the composed debt by more than 1% now withholds total and net debt instead of publishing a partial sum. Panel: ORCL $16.8B → $134.5B, which is the oracle's $125.3B of borrowings plus $9.2B of finance leases the census column includes. | `f2af6d8`, `c749cd8` | `tests/edgar.debtChains.audit20261022.test.ts` |
| B-15 Inclusive long-term debt tag | Fixed. `LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities` is the last long-term-debt aggregate, netted like `LongTermDebt` and holding finance leases. Panel: CVX $0.4B → $37.1B (oracle $37.1B). | `f2af6d8` | `tests/edgar.debtChains.audit20261022.test.ts` |
| B-17 CVX reclassified current debt | Fixed. A composition more than 1% from the inclusive total plus short-term borrowings is recomposed from them; with no borrowings tagged, a higher composition is withheld. CVX FY2025 $50.7B → $40.8B. | `f2af6d8` | `tests/edgar.debtChains.audit20261022.test.ts` |
| B-16 Partial debt published | Fixed. The interest check uses the average of the year's balances, opening to closing, instead of the year's largest. A collapse check withholds debt that fell more than 60% to a balance on which the year's interest implies over 25%, unless the cash flow shows net repayment of at least half the fall. It runs after B-14/B-15/B-17, and re-withholds none of the correctly composed panel rows. | `c33d365`, `8b89196` | `tests/stageB.debtPlausibility.test.ts` |
| B-40 Inclusive total withheld with its split | Fixed. When `LongTermDebt` is the only long-term tag and the refused maturity bucket was the only current component, total debt is `LongTermDebt` plus leases and only the split is withheld; the statements builder and Stage B's debt admission agree. Panel: PLD withheld → $34.7B at 2026-03-31 (oracle $36.4B at 2026-06-30; the June quarter still has borrowings beside the refused bucket). | `1c7331a`, `a88a9e0` | `tests/edgar.debtChains.audit20261022.test.ts`, `tests/edgar.debtAdmission.review.test.ts` |
| A-10 Zero remainder-of-year bucket | Fixed. Any tagged remainder-of-year bucket, zero included, refuses the next-twelve-months figure as current debt, and a balance sheet whose `LongTermDebt` equals its `LongTermDebtNoncurrent` declines it first. Panel: META $86.4B → $83.7B (oracle $83.7B). | `7e3f097` | `tests/edgar.debtChains.audit20261022.test.ts` |
| F-19 Composite letter | Fixed. Below evidence for 50% of the route-applicable signal weight the composite prints "Not graded: evidence N%" with its score and no letter, on every reader-facing surface, in both exports and in the judge payload (the audit export keeps the stored band as a raw field); Key data prints the evidence share and the band thresholds beside it. A deterministic band letter for a score that rounds to 45 through 55 carries "neutral" wherever it is shown. | `5484062`, `f8caf8a`, `9b76aa3` | `tests/report.compositeEvidenceFloor.test.ts`, `tests/stageC.payload.passes.test.ts`, `tests/report.history.export.test.ts` |

Every new test failed before its fix.

## Control panel

45 tickers, keyless and data-only (no FMP key, no model), on `bc71121` and on this branch, compared with the audit's oracle (`oracle-compare.csv`). Debt is total debt including leases less operating leases, as the census measures it.

| Ticker | Debt before | Debt after | Oracle | Market cap before → after |
|---|---|---|---|---|
| ORCL | $16.8B | $134.5B ($125.3B borrowings + $9.2B finance leases) | $125.3B | unchanged |
| CVX | $0.4B | $37.1B | $37.1B | unchanged |
| META | $86.4B | $83.7B | $83.7B | unchanged |
| PLD | withheld | $34.7B (2026-03-31) | $36.4B (2026-06-30) | unchanged |
| TSM | withheld | withheld | $1,033B | $11.2T → withheld (oracle $2.24T) |

Every other row's headline debt and market cap is unchanged. No headline figure was lost. The guards withhold these historical rows, each with a gap naming the reason:

- GOOGL FY2018 and NFLX FY2020 and Q3 2021: a tagged `LongTermDebt` exceeds the composed debt;
- ORCL May 2022: a `LongTermNotesAndLoans` total exceeds the composed $3.7B, and the collapse check fires;
- O FY2017: debt fell from $4.0B to $0.4B with no repayment shown;
- JPM 2016–2022: the inclusive tag cannot be separated from the maturity bucket. JPM's headline debt was already withheld.

GOOGL and JPM gain a forensics gap. In some periods their long-term debt is now composed from tags that include current debt, so the leverage tests that read it alone are not evaluated there. Their Piotroski and Beneish scores and both composites are unchanged. NFLX FY2019 total debt is published again (B-40). PLD and JPM now produce a WACC. JPM's debt is now read at about $533B, so its effective cost of debt is 19.3%. A bank's interest expense includes deposit interest, and BAC already showed 22.7% before this batch. The financial route does not consume a WACC; this is left for later (below).

Cache: both runs read the same run cache, with keyless traffic only (SEC EDGAR, Yahoo charts, FRED and Finnhub). During the head run the cache stored fresh companyfacts for 14 issuers: AAPL, AMT, AMZN, BA, BAC, BRK.B, META, NEE, NNN, O, ORCL, PG, PLD and SNOW. Five of these (AMT, AMZN, BA, BAC and BRK.B) were also refreshed during the base run. Background refreshes that timed out (34 EDGAR, 49 Finnhub) left the cached copy in use. Every difference between the two runs is one of the changes listed above. The ORCL, CVX, PLD and META debt moves reproduce offline from the trimmed fixture.

Re-run after the review fixes (`4398a58`), against the first run on this branch: only quotes moved (prices dated October 22 instead of 21, and the market caps, multiples, valuation bands and composite scores that follow), and Meta's September 10-Q arrived, so its debt is now $83.7B at 2026-09-30. No headline debt or market cap was newly withheld. Five composites now print "Not graded": TSM (evidence 5%), NNN (41%), MCD (45%), BRK.B (46%) and LLY (47%). 33 of the 45 reports mark at least one band "neutral".

Re-run after the Codex review fixes (`8b89196` to `c749cd8`), against the run above. The withheld counts are unchanged (fair value 24/45, WACC 15/45, total debt 11/45, net debt 12/45, market cap 6/45). What moved and why:

- Quotes (prices a session later): every price, market cap, multiple and fair-value upside, and the composite scores that follow, moved by small amounts. PLD's valuation band moved from C to D on price alone: its P/FFO went from 19.69 to 19.79, which lifted the own-history percentile from 50.7 to 51.7 and the valuation score from 55.52 to 54.75, below the C cutoff.
- New filings and rates: Tesla's September 10-Q arrived, so its debt date moved to 2026-09-30 (debt ex-leases $9.52B, net debt -$35.9B) and its TTM figures moved. The 10-year Treasury rate moved from 5.12% to 5.13%.
- Debt admission (`c749cd8`): GOOGL's 2016–2018 annual rows are now refused by `admitDebtFields` as well. In each year the filer's LongTermDebt ($4.000B, $4.026B, $4.062B) exceeds the noncurrent debt the chains compose ($3.935B, $3.943B, $3.950B) by more than 1%: a current portion of $65M to $112M that no chain reads (DebtCurrent is tagged 0). No figure moves: the statements builder had already withheld these rows for the same reason, and the run now also records a `statements.balance.<date>` gap for them. ORCL's withhold families are the same set, listed in a different order.
- Repayments alone (`8b89196`): no panel issuer has a collapsed balance that only repayments explain, so no debt changed.
- Score display (`9b76aa3`): five reports in the previous run printed a whole-number cutoff beside the band below it (COST, SNOW, TSLA, VZ and WMT; SNOW printed "Composite: 55 / 100 (D …"). Now none do: SNOW's composite of 54.89 prints as "54.8 / 100" beside D. No score or band changed.

## Independent review

Two reviews ran on the branch before it was opened: `/code-review` and a separate reviewer with no access to the fix notes. Each finding fixed here got its own failing test first.

| Finding | Outcome | Commit |
|---|---|---|
| B-19 withheld every 40-F filer's market cap, though a Canadian MJDS issuer lists its common shares | Fixed: only a 20-F filer is withheld | `81a612a` |
| B-19 guard waited for a latest share count, while the history and the plan-limited backfill derive from the dei series | Fixed: the guard depends on the form alone | `81a612a` |
| B-25 named-year outlook took any year: "notes due 2030", "the 2024 divestiture" | Fixed: a maturity's year is skipped; with the block's period known, only its fiscal year or the next | `2f36811` |
| B-25 a span of years ("from 2027 to 2028") read as a one-ended range and dropped a point guide | Fixed: the range test reads the clause with its years blanked | `2f36811` |
| B-25 the `vs.` comparison cue never matched | Fixed | `2f36811` |
| B-25 a year after "over", "above", "below" or "than" read as the guide period | Fixed: those are comparison cues | `a86764f` |
| B-25 a percent range beside a money guide ("up 2-3%") dropped the guide | Fixed: a range of the other kind is ignored | `a86764f` |
| B-25 one out-of-band reading discarded the anchor though a plausible guide for the same quarter followed | Fixed: the anchor takes the first plausible guide for the first guided quarter, never a later quarter's | `a86764f` |
| B-25 a guide in another currency was noted as a misread scale | Fixed: the currency check runs first | `a86764f` |
| B-40 Stage B kept the inclusive total when both split fields were refused for any reason | Fixed: only the split's own refusal reasons are exempt | `a88a9e0` |
| F-19 the payload's COMPOSITE grade printed "n/a": a null value drops its unit | Fixed: the value reads "Not graded: evidence N%" | `f8caf8a` |
| F-19 the neutral test read the unrounded score (55.4 printed as 55 but not neutral) | Fixed: judged on the whole-number score every surface prints | `f8caf8a` |
| F-19 the history diff showed the composite letter under the floor; the diff, audit tables and data-only reasoning lacked "neutral" | Fixed | `f8caf8a` |
| F-19 the audit export prints the stored composite band | Kept: it is the raw stored field; the docs now say so | `f8caf8a` |
| JPM now shows a WACC of 11.5% on a 19.3% cost of debt | Not changed: an owner decision (below, "Left for later") | — |
| Cached last-quarter revenue per bundle | Not changed: the lookup runs once per guide over about 40 rows, and a cache could go stale if a bundle's rows change | — |

## Codex review on the pull request

The Codex reviewer left four threads on `e220edb`. Each claim was confirmed in the code, given a failing test, and fixed class-wide.

| Finding | Outcome | Commit |
|---|---|---|
| P1: the B-16 collapse check read a repayment-only filer (`RepaymentsOfLongTermDebt` with no issuance tagged) as "no net debt repayment disclosed", because `netDebtIssuance` resolves only when both tags exist, and withheld repaid debt | Fixed: cash-flow rows carry `debtRepayment` (the `debtRepayment` synonyms, negative = outflow), and the check reads it when the net figure is missing | `8b89196` |
| P2: a quarter named only as a comparison base ("compared with fourth quarter 2025 revenue") made a named-year guide read as quarterly | Fixed: comparison-base part-year phrases are blanked before the sentence is judged quarterly or its year is read | `42d24d7` |
| P2: a rounded score contradicted its band and the printed thresholds (54.6 shown as "55/100" beside D and "C ≥55"; 69.6 as 70 beside C) | Fixed: every surface prints scores through one formatter that cuts to one more decimal where rounding would cross a band threshold; no score or band changes | `9b76aa3`, `d7f3475` |
| P1: `admitDebtFields`, the only debt gate vendor statement rows pass, did not run the uncomposed-total check | Fixed: it runs `uncomposedDebtReason` over `DEBT_AGGREGATE_TAGS` with the same 1% tolerance | `c749cd8` |

## Owner decisions

- Debt-chain order: B-14, B-15 and B-17 before B-16, and B-16 does not re-withhold correctly composed debt (checked on ORCL, CVX and the oracle-correct rows).
- F-19: the composite uses the aspects' 50% floor of route-applicable signal weight; below it, "Not graded: evidence N%" with the score and no letter.
- F-19: scores from 45 to 55 inclusive carry "neutral" beside the band letter wherever a grade is shown and in the judge payload; Key data prints the thresholds and the evidence share beside the composite. An analyst letter that differs from the band is not qualified.
- B-19: withhold the ADS market cap when the ratio is not established from filings.
- B-25: a revenue guide is bounded to 0.2–5× the last quarter.
- House conventions introduced here: the 1% composition tolerance (B-14, B-17), the 60% fall and 25% implied-rate collapse thresholds and the half-the-fall repayment test (B-16), and the 45–55 neutral band (F-19).

## Left for later

- A bank's effective cost of debt includes deposit interest (JPM 19.3%, BAC 22.7%) and still yields a displayed WACC that the financial route never consumes. JPM's WACC row (11.5%) is new in this batch: B-15 now reads its debt at about $533B, where main withheld it as under 2% of assets. Withholding the cost of debt on financial routes would retire the financial spread table, so it needs an owner decision.
- B-19 withholds the keyless market cap of a 20-F filer that lists its ordinary shares directly (1:1); the filed facts read here do not say which security is quoted.
- B-25 reads a year after "over" as a comparison, so "capital expenditures over fiscal 2027" takes the outlook block's period. A mixed-scale range ("$900 million-1.1 billion") is left unread.
- B-14/B-17: the 1% composition tolerance assumes every tagged debt aggregate is a carrying amount. The B-17 recomposition adds only the first of `ShortTermBorrowings` and `CommercialPaper`, and the B-14 netting drops `NotesPayableCurrent` beside any current-maturity line; both are right on the panel but could understate another filer.
- The inclusive-tag path withholds long-term debt where the current-maturity line is the next-twelve-months stand-in (JPM 2016–2022), where the `LongTermDebt` path nets by it.
- A-10: a year-end filing that tags the remainder-of-year bucket at 0 also refuses the next-twelve-months stand-in, unless its `LongTermDebt` equals `LongTermDebtNoncurrent`.
- B-16: the collapse check exempts a fall only on the period's cash-flow repayment (net, or repayments alone when no issuance is tagged), so a spin-off or a debt-for-equity conversion, or a missing quarterly cash-flow row, withholds a genuine fall. The average test does not also judge the closing balance alone.
- The payload labels a keyless Yahoo quote's source as `fmp:quote` (`src/pipeline/stageC/payload.ts`).
