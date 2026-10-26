# Audit batch 4: freshness and the earnings window (2026-10-22)

Base: `2f2aa3b` (main, after PR #55). Scope: batch 4 of the independent audit of 2026-10-22, findings B-26, B-24, B-27, B-23, B-9 with B-20, B-36, C-16 and FCX-4: reports that ended a quarter or two before what the issuer had already filed, that read its newest results release wrongly, or that labelled a multiple for a period it did not cover. Decision: D-107 in [DECISIONS](DECISIONS.md) (PR #55 took D-106); report 1.41.0, payload 1.46.0 and Stage B ACCOUNTING_EVIDENCE_24, the stamps after D-106's. Pipeline stage-c-1.6.2 is unchanged: the orchestration did not change. The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below, served from the run cache behind a dead proxy. No fixture file was added; the new tests build their inputs inline from the wording and figures of public SEC filings.

Before each item was fixed it was reproduced on main, and the fix was checked against every company it touches, both report layouts, the exports and the AI payload.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| B-26 Release ordering | Fixed (the part batch 3a left). A results release that states no period goes before the first dated release filed no later than it; dated releases keep period order. For the four releases kept, a results release outranks an operational update (deliveries, production), so the kept set covers a year of results when enough were read. PEP's newest release is now kept. Freeport-McMoRan's 2026-10-02 third-quarter operational update drops out of the four kept, so its newest 8-K read becomes a 2026-09-08 material-event filing (owner decision). | `d16ce5e` | `tests/currentReports.releaseOrder.test.ts` |
| B-24 Newer results not disclosed | Skipped: already fixed on main by batch 3a (D-103, the newer-results banner and headline row). The panel below checks that only the window issuers carry it. | none | none |
| B-27 A newer release's dollars | Fixed. A release reporting a quarter no statement row covers, or stating no quarter end, reports in the statements' currency when every income row since before its period is established in that one currency; the dollar guidance and the DCF guidance anchor return in the earnings window. A multi-currency history, or an unlabelled row at the release's own quarter, still withholds, and the note says the currency is not established rather than claiming a mismatch. | `3433ecc` | `tests/filingDisclosures.releaseCurrency.test.ts`, `tests/filingDisclosures.integrity.test.ts`, `tests/currentReports.guidanceRanges.test.ts` |
| B-23 Companyfacts behind the filed 10-Qs | Fixed (owner decision). When the newer 10-Q's XBRL instance is already fetched, its consolidated, undimensioned facts in the companyfacts taxonomies, for the filer's own CIK, are merged before the statements are built, each point cited to the 10-Q's accession, form, filing date and fiscal focus. A filing companyfacts already carries, or one filed no later than its newest periodic report, is never merged, so a row never mixes bases. Where a newer periodic filing's facts could not be read, a "Newer filing not reflected" banner and a warn gap name it. Visa, Duke Energy, NextEra, Coca-Cola and Prologis now end at their newest 10-Q, matching the oracle's TTM revenue and net income. | `c414780`, `f031014` | `tests/edgar.instanceFacts.test.ts`, `tests/filingDisclosures.newerFiling.test.ts` |
| Scenario fan that does not bracket its base | Fixed (new, found in the B-23 panel run on Duke Energy). Where faster growth needs reinvestment that earns less than it costs and slower growth releases none, bull and bear both land below the base; such a fan is withheld with both values named. No issuer in the main-branch panel reached it. | `3611de9` | `tests/stageB.scenarioTargets.test.ts` |
| B-9, B-20 Multiple labels and the P/E basis | Fixed (owner decision). Each income-derived multiple records the period its earnings cover ("TTM to 2026-06-30" or "FY2025"), and the label follows it in the multiples table, Key data, both exports, both layouts and the AI payload's record ("P/E (FY2025)", "EV/EBITDA (FY2025)"); TTM labels are unchanged. The P/E basis names only the formula that produced the figure, with the reason when it is market cap over common income, and Key data notes "market cap / common income, not price / diluted EPS" beside such a P/E. | `0af1bf8`, `6a1d96f` | `tests/multiples.basisLabel.audit20261022.test.ts` |
| B-36 Successor issuer | Partly. Fixed: a TTM may span a reorganisation when the successor's own filing re-presents the predecessor's net income and per-share figures unchanged (ExxonMobil Holdings regains its P/E, 22.4×), and a successor's no-annual-report gaps name the resolved predecessor. Skipped: taking Item 1A, MD&A and the notes from the predecessor's 10-K. It needs live SEC requests (the predecessor's submissions and 10-K are not in the cache, and the panel runs offline), and the 10-K parsers bind their evidence to the registrant's own CIK, so it needs its own identity design. | `6863eb6`, `38b06c6` | `tests/successor.continuity.audit20261022.test.ts`, `tests/edgar.successor.test.ts`, `tests/dataBundle.edgarForms.test.ts` |
| C-16 Superseded 10-K operating figure | Skipped: already fixed on main by batch 3a (D-103, the 10-Q MD&A supersession pass). | none | none |
| FCX-4 Stale EPS CAGR window | Fixed (owner decision). When no net-income EPS is tagged for a period and no discontinued result is filed for it, the filer's EPS from continuing operations stands in (ASC 260-10-45-3), with its own provenance and a substitution disclosure. Freeport's EPS CAGR runs 2020 to 2025 instead of ending at 2021. | `75ba741` | `tests/edgar.statements.test.ts` |

Every new test failed before its fix, except the negative cases (a multi-currency history, a filed discontinued result, a successor whose comparatives disagree, a filing companyfacts already carries), which pass on both sides by design.

## Left for later

- B-36: Item 1A, MD&A and notes from a predecessor's 10-K (needs live SEC requests and an identity design for the 10-K parsers).
- Freeport-McMoRan's P/E stays withheld: a fourth-quarter diluted EPS is never derived from annual and nine-month figures, and its 2026 second quarter tags no common income. Both predate this batch.
- McDonald's scenario targets on main read about 162 million to 304 million per share in the panel; this batch does not touch them, and the cause is not yet traced.
- Total debt leaves out `OtherShortTermBorrowings`: NextEra's 2026-09-30 total is 109.67B against the oracle's 113.93B, and main differed from the oracle's tag set by the same element at 2026-03-31 (1.26B). The composition rule predates this batch.

## Control panel

Base is `2f2aa3b` (origin/main) and head is this branch with every fix in place. Both sides ran the 45-ticker panel keylessly, offline behind a dead proxy, with a pinned clock (`PANEL_NOW=2026-10-22T06:00:00Z`), cost caps of 0 and a fresh copy of the audit's cached `metis.db`. Each side finished 45 of 45 with no errors. The background-refresh failures in the logs are expected behind the dead proxy and changed nothing. Each side was extracted with `extract-census.mjs` and compared column by column.

| Figure | Base produced | Head produced | Gained | Lost | Changed value |
|---|---|---|---|---|---|
| Statements end (TTM, latest quarter, debt date) | 45 | 45 | none | none | DUK, KO, NEE, PLD, V (B-23) |
| Fair value | 27 | 27 | none | none | DUK 36.64 → 43.09, KO 39.86 → 43.93 (B-23) |
| WACC | 35 | 35 | none | none | KO, NEE, PLD (B-23: the newer balance) |
| Total debt, net debt | 36, 37 | 36, 37 | none | none | DUK, KO, NEE, PLD, V (B-23) |
| Market cap | 41 | 41 | none | none | DUK, KO, NEE, PLD (B-23: the 10-Q's share count) |
| P/E | 36 | 37 | XOM 22.36 (B-36) | none | DUK, KO, NEE, PLD (B-23) |
| EV/EBITDA, EV/Sales, P/B | 32, 35, 40 | 32, 35, 40 | none | none | DUK, KO, NEE, PLD (B-23) |
| Valuation band | 37 | 37 | none | none | DUK D → F, NEE B → A (B-23) |
| Composite | 45 | 45 | none | none | DUK, KO, NEE, PLD, V (B-23); FCX 54.47 → 54.99 (FCX-4) |
| Newest 8-K read | 45 | 45 | none | none | FCX 2026-10-02 → 2026-09-08 (B-26) |

The B-23 merges against the oracle (TTM to the merged 10-Q, P/E):

| Issuer | TTM end, base → head | Oracle TTM end | P/E base → head | Oracle P/E |
|---|---|---|---|---|
| Duke Energy | 2026-03-31 → 2026-06-30 | 2026-06-30 | 18.51 → 18.13 | 18.12 |
| Coca-Cola | 2026-04-03 → 2026-07-03 | 2026-07-03 | 29.10 → 27.85 | 27.83 |
| NextEra | 2026-03-31 → 2026-09-30 | 2026-09-30 | 19.95 → 14.11 | 14.10 |
| Prologis | 2026-03-31 → 2026-06-30 | 2026-06-30 | 32.14 → 28.42 | 28.42 |
| Visa | 2026-03-31 → 2026-06-30 | 2026-06-30 | withheld (class scope) | 34.71 |

Duke's, Coca-Cola's and Prologis's total debt now equals the oracle's at the merged date (91.24B, 43.49B, 36.44B), as does Visa's (23.86B). ExxonMobil's 22.36× is market cap over TTM net income of 32,757M, the oracle's TTM net income; the oracle's 22.92× is price over TTM EPS of 7.77, a different formula on the same earnings.

The watch list:

- The newer-results banner (B-24, from batch 3a) is on exactly the seven window issuers: BAC, JPM, META, PGR, PLD, TSLA and UNH. On main it was also on DUK, KO, NEE and V, whose statements lagged companyfacts; with their newer 10-Qs merged the release is no longer newer than the statements (Prologis's third-quarter release is still newer than its merged second quarter). No report shows the newer-filing banner: every newer periodic filing in the panel was read.
- Labels change only where the basis is not TTM: NNN, whose TTM is suppressed, is the only report with "P/E (FY2025)" and "EV/EBITDA (FY2025)".
- The P/E basis text changes on every issuer, because it now names only the formula that ran. No P/E moves for it: in head 35 of the 37 P/Es (all but NNN and PLD) run on market cap over common income, mostly because a fourth-quarter diluted EPS is never derived, which main's basis did not say; Key data now says so beside them, with the reason ("diluted EPS is not available for every quarter of the period").
- The scenario fan is withheld only for Duke Energy (bull 37.23, base 43.09, bear 33.24).
- No other value moved.
