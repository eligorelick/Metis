# Audit batch 3a: the remaining high-severity findings (2026-10-22)

Base: `dd9c61b` (main), merged with `efc6c24` (batch 2, PR #49). Scope: batch 3a of the independent audit of 2026-10-22, findings B-32, B-5, A-11, B-7, B-8 (with B-37 as far as B-8 needs it), B-24 (with B-26 as far as B-24 needs it) and C-16: figures withheld although the filed evidence was complete, reports that did not say a newer quarter had been published, and a superseded 10-K operating figure. Decision: D-103 in [DECISIONS](DECISIONS.md) (batch 2 took D-102); report 1.38.0, payload 1.43.0 and Stage B ACCOUNTING_EVIDENCE_20, the stamps after batch 2's. The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below, served from the run cache behind a dead proxy. No fixture file was added; the new tests build their inputs inline from the wording of public SEC filings.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| B-32 WACC withheld without a TTM tax rate | Fixed. The rate falls back to the latest annual effective rate, with a 0% shield on a trailing or annual pre-tax loss, each step named in the basis and an info entry; the 0–35% clamp is unchanged and disclosed. On the SEC path pre-tax income is the sum of its domestic and foreign components when no total is tagged (Oracle). | `47ff39b` | `tests/stageB.ttm.compute.test.ts`, `tests/edgar.statements.test.ts` |
| B-5 Principal aggregate against carrying debt | Fixed. A filed aggregate above the carrying components by up to 2% or 50 million (whichever is larger, the floor capped at 10% of the financing debt) is read as unamortized discount and issuance cost; beyond that, total and net debt are withheld with a gap naming both figures. Tested just inside and just outside the band. | `9a8b00b`, `de44efd` | `tests/edgar.debtCompleteness.test.ts`, `tests/edgar.debtChains.audit20261022.test.ts` |
| A-11 Vendor rounding treated as a conflict | Fixed. A vendor figure and the filed figure agree within one reporting unit (on figures of at least 100 units, so never above 1%) or 0.01% of the larger, whichever is wider; a zero against a nonzero figure gets no unit allowance. Tested on both sides of the tolerance. | `28ff062`, `14e9940`, `ab031f8` | `tests/edgar.vendorAgreement.test.ts` |
| B-7 No D&A from separate lines | Fixed. With no combined tag for a period, D&A is `Depreciation` + `AmortizationOfIntangibleAssets`, else `Depreciation` alone, disclosed per quarter as a lower bound. Amortization alone is never D&A. Owner decision: `Depreciation` alone is kept as a disclosed lower bound (Alphabet tags amortization in some quarters only). | `74d64fa` | `tests/edgar.statements.test.ts` |
| B-8 Multi-class market cap | Fixed for class-tagged covers that state every class's economic relation (Meta: identical rights; Berkshire: Class B = 1/1,500 of A). Market cap is the sum over classes of count x economic units per quoted share x the quoted price, named as an approximation. With unequal weights, P/E is market cap over common income. Mastercard, Comcast and Visa state no relation Métis reads and stay withheld; for such multi-class issuers Key data now shows issuer-common capitalization as withheld instead of the quote's one-class market cap. Alphabet already had an unverified-vendor scope that agrees with the oracle and is unchanged. | `8377b4b`, `6fbb585`, `20b7751`, `8464920`, `ecda168`, `31e9398` | `tests/edgar.economicShares.classTagged.test.ts`, `tests/stageB.economicShareScope.test.ts` |
| B-37 Diluted share basis for weighted classes | Partly: only as far as B-8 needs it (P/E on weighted classes avoids a diluted EPS on an unidentified class basis). Per-share intrinsic value for weighted classes stays withheld; left for Batch 3. | `8377b4b` | as B-8 |
| B-24 Newer results not disclosed | Fixed. A results release filed after the newest statement period and reporting a later quarter raises a banner in the web view and both exports and a warn gap; headline revenue and diluted EPS appear as an unaudited Key data row only when both parse unambiguously with an established currency. Nothing enters statements, TTM or valuation. A deliveries or operational update, a dividend or an outlook does not count; revenue is the sentence-opening total, never a segment's. | `a011041`, `b67e3e2`, `d1757e3`, `5ae00af`, `469c214`, `75306aa` | `tests/currentReports.newerResults.test.ts` |
| B-26 Release dating and ordering | Partly: compact titles ("3Q26", "Q3 2026 Update") now date a release, which is what B-24 needs for Bank of America and Tesla, and a hyphenated ordinal title ("second-quarter 2026") is read, which removed a false notice on Lilly in the control panel. Ordering releases that state no period at all (PEP) is left for Batch 4. | `a011041`, `7a1e55c` | `tests/currentReports.newerResults.test.ts` |
| C-16 Superseded 10-K operating figure | Fixed. When the 10-Q is newer than the selected 10-K excerpts, the 10-Q MD&A passages stating a count of an operating measure those excerpts state (gigawatts, megawatts, backlog, customers, subscribers or paid members, physical units) are kept first within 15% of the unchanged 12,000-character budget; the excerpt title names the measures. On Southern Co.'s saved snapshot the 11, 5 and 16 gigawatt sentences are now in the 10-Q excerpt. Years, megawatt-hours and units of account are not counts. | `328d672`, `d325114` | `tests/stageC.interimSupersession.test.ts` |

Every new test failed before its fix, except the negative cases (an operational update, the statements' own quarter, no 10-K figure), which pass on both sides by design.

## Independent review

A fresh reviewer read the batch's diff without the author's reasoning; after the fixes, a second fresh reviewer and an automated code review read it again ("round two"), and Codex reviewed the pull request ("Codex"). Each finding was checked against the code, and each confirmed one was fixed test first in its own commit.

| Finding | Disposition | Commit |
|---|---|---|
| B-5: the 50 million floor let a small issuer's notes be read as mostly discount (10 million of components against a 59 million aggregate) | Fixed: the floor reaches at most 10% of the financing components | `de44efd` |
| B-8: P/E switched to market cap over income when only an ended evidence row carried unequal weights | Fixed: the switch follows the classes in force on the price day | `6fbb585` |
| B-8: the withheld capitalization row and the one-class label applied to every unresolved scope, including an ADR | Fixed: only a scope unresolved across common classes; the market data table also no longer fails without a valuation section | `20b7751` |
| B-24: a segment's revenue could be read as the total, and an adjusted EPS slipped through when "adjusted" opened the sentence | Fixed: revenue must open its sentence; a sentence naming a non-GAAP basis is skipped; amounts exact | `b67e3e2` |
| B-24: a dividend per share or an EPS outlook counted as a release stating results | Fixed | `b67e3e2` |
| A-11: one reporting unit let 2 million agree with 1 million | Fixed: the unit allowance needs a figure of at least 100 units; the module joins the risk coverage manifest | `14e9940` |
| C-16: years, megawatt-hours and units of account read as operating counts; the title named measures the pass had not kept | Fixed | `d325114` |
| B-7: `Depreciation` alone published as D&A | Kept as a disclosed lower bound (owner decision in D-103); carrying the caveat onto the EV/EBITDA row is left for later | none |
| Round two, B-8: a class counted at an earlier cover date dropped out of the sum and the market cap was published as complete | Fixed: every class must be counted at one date | `8464920` |
| Round two, B-24: a loss per share read as positive diluted EPS; a non-GAAP basis named after the figure; full-year revenue under the quarter's label | Fixed: the whole sentence is read | `d1757e3` |
| Round two, B-5: METHODOLOGY said the band applies when no current debt is reported | Fixed wording: when current and noncurrent debt do not both resolve | `5890ada` |
| Round two, B-24: the `ReportView` data-only banner's comment sat on the new banner | Fixed | `e8df163` |
| Control panel, B-24: a false notice on Lilly, whose hyphenated title was missed and a later quarter in the text dated the release | Fixed | `7a1e55c` |
| Codex, B-24: an outlook word after the amount ("Diluted EPS of $3.10 is expected") still counted as results | Fixed: the words right after the amount are checked too, bounded at 60 characters so Tesla's unpunctuated headline list still counts (the panel rerun caught that) | `5ae00af`, `469c214`, `75306aa` |
| Codex, B-8: an unparsed relative entitlement ("Class B ... 110% of dividends paid on Class A") left the classes at equal weight | Fixed: a percent, multiple, fraction or priority refuses the scope; a sentence reporting the dividends each class was paid (Meta) still reads as no relation | `ecda168` |
| Codex, B-24: a year-ago "quarter ended" date stated first dated the release and suppressed the notice | Fixed: the latest end dates it, and an end exactly four quarters before the fiscal label's quarter is set aside | `5ae00af` |
| Codex, B-8: class ambiguity was flagged from multi-class evidence that had ended before the price day | Fixed: only evidence in force counts | `ecda168` |
| Codex, B-24: the notice cited EX-99.1 when only the commentary stated the results | Fixed: the record keeps the exhibit that states them | `5ae00af` |
| Codex re-pass, B-24: "is projected" (and other inflections) after an amount still counted as results | Fixed | `75306aa` |
| Codex re-pass, B-8: a worded multiple ("twice the dividends") left the classes at equal weight | Fixed: worded multiples and fractions refuse the scope | `31e9398` |
| Codex re-pass, A-11: the IREN cash-investment pass rechecked vendor CFO near-exactly and nulled CFO and FCF the new tolerance admits | Fixed: the recheck uses the shared comparator | `ab031f8` |
| Codex re-pass, B-24: an ordinal guidance heading kept a compact title ("Q2 2026 Update") from dating the release | Fixed | `75306aa` |
| Codex third pass, B-24: the headline reader took next-quarter guidance ("Third quarter revenue of $1.4 billion is expected") as the quarter's revenue | Fixed: the headline skips a sentence with an outlook word, sharing one vocabulary with the results check | `4101e9a` |
| Codex third pass, B-24: "raising our full-year diluted EPS range to $3.10 to $3.20" counted as stated results | Fixed: raise, range, reaffirm and reiterate are outlook words | `4101e9a` |
| Codex third pass, C-16: "three operating units" was read as a physical-unit count | Fixed: operating, geographic, reportable and organizational units are excluded | `1f7b533` |
| Codex third pass, A-11: the convertible-subtype coverage check compared the vendor's noncurrent debt with the filed subtype near-exactly | Fixed: the vendor path uses the shared comparator; the SEC path stays near-exact | `6986a62` |
| Stage C payload states the quote's market cap without a class caveat when the scope is unresolved | Left for later: a payload-only wording change, outside this batch's findings | none |

## Left for later

- B-37: per-share intrinsic value for weighted share classes (needs a diluted count on the class basis).
- B-26: ordering results releases that state no period (PEP). Southern Co.'s "second-quarter 2026" release was likely misdated by the same missed hyphenated title fixed in `7a1e55c`; its saved snapshot holds no release text, so it is not re-checked here.
- B-7: the D&A lower-bound caveat on the EV/EBITDA row itself.
- The Stage C quote section's market cap caveat for an unresolved class scope.

## Control panel

Base is `dd9c61b` (origin/main) and head is the final commit of this branch. Both sides ran the 45-ticker panel keylessly, offline behind a dead proxy, with a pinned clock (`PANEL_NOW=2026-10-22T06:00:00Z`), cost caps of 0 and the audit's cached `metis.db`. Each side finished 45 of 45 with no errors and no cache misses. The background-refresh failures in the logs are expected behind the dead proxy and changed nothing. Each side was extracted with `extract-census.mjs` and diffed against `oracle-compare.csv`.

| Figure | Base produced | Head produced | Gained | Lost | Changed value |
|---|---|---|---|---|---|
| WACC | 30 | 37 | COST, INTC, MCD, META, ORCL, PG, SNOW | none | none |
| Fair value | 21 | 24 | COST, MCD, ORCL | none | none |
| Total debt | 34 | 35 | MCD | none | none |
| Net debt | 33 | 34 | MCD | none | none |
| Market cap | 39 | 41 | BRK.B, META | none | none |
| P/E | 34 | 36 | BRK.B, META | none | none |
| EV/EBITDA | 23 | 30 | GOOGL, INTC, MCD, META, MSFT, ORCL, TSLA | none | none |
| P/B | 38 | 40 | BRK.B, META | none | none |

Gained figures checked against the oracle:

| Ticker | Field | Base | Head | Oracle | Head vs oracle |
|---|---|---|---|---|---|
| BRK.B | Market cap | withheld | 1153.82B | 1153.82B | 0.00% |
| BRK.B | P/E | withheld | 13.45 | 13.56 | -0.79% |
| MCD | Total debt | withheld | 39.86B | 39.90B | -0.09% |
| META | Market cap | withheld | 1776.94B | 1776.94B | 0.00% |
| META | P/E | withheld | 26.09 | 26.27 | -0.67% |

Watch list:
- **WACC and fair value:** PG, COST and ORCL regain WACC, and COST and ORCL regain fair value.
- **META debt:** already published on main (83.66B against the oracle's 86.41B, -3.2%, "agree"), so this branch neither gains nor loses it.
- **EV/EBITDA:** MSFT, GOOGL, INTC and TSLA regain it.
- **Multi-class issuers:**
  - BRK.B and META are within 1% of the oracle.
  - MA, CMCSA and V are withheld consistently (scope unresolved, page one withholds market cap).
  - GOOGL keeps its vendor-scope label, unchanged.
- **Newer-results notice:** shown on BAC, DUK, JPM, KO, META, NEE, PGR, PLD, TSLA, UNH and V. That is the expected seven plus four more: DUK, KO, NEE and V. Each of the four has a later 8-K and statements that lag the oracle's TTM end:

  | Ticker | Métis statements end | Oracle TTM end |
  |---|---|---|
  | DUK | 2026-03-31 | 2026-06-30 |
  | KO | 2026-04-03 | 2026-07-03 |
  | NEE | 2026-03-31 | 2026-09-30 |
  | V | 2026-03-31 | 2026-06-30 |

  So those four are true positives. An earlier panel pass showed a false notice on LLY ("second-quarter 2026" was not read as a title, and a later "first quarter of 2027" dated the release); `7a1e55c` fixed it.
- **Headline rows:** no unaudited headline revenue or EPS row was parsed on any ticker. The parser is deliberately conservative, and only the notice and the gap appear.
- **No figure was lost and no published value changed.**

After the Codex fixes the head side was run again the same way (45 of 45, no errors). The first rerun dropped Tesla's notice, which `469c214` fixed. The final rerun, on the last code commit, matches the table above in every figure and shows the same eleven notices.

After the merge with batch 2 (`b88b449`), both sides were run again the same way: main at `efc6c24` and the merged branch (45 of 45 each, no errors). Against main, the merged branch loses no figure and changes no produced value. It gains WACC for COST, INTC, MCD, META, ORCL, PG and SNOW; fair value for COST and MCD; total and net debt for MCD; market cap, P/E and P/B for BRK.B and META; and EV/EBITDA for GOOGL, INTC, MCD, META, MSFT, ORCL and TSLA. That is the table above, less ORCL's fair value, which batch 2's DCF domain test withholds on both sides. The eleven notices are unchanged in text, and main shows none.
