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
| B-23 Companyfacts behind the filed 10-Qs | Fixed (owner decision). When the newer 10-Q's XBRL instance is already fetched, its consolidated, undimensioned facts in the companyfacts taxonomies, for the filer's own CIK, are merged before the statements are built, each point cited to the 10-Q's accession, form, filing date and fiscal focus. A filing companyfacts already carries, or one filed no later than its newest periodic report, is never merged, so a row never mixes bases. Where a newer periodic filing's facts could not be read, a "Newer filing not reflected" banner and a warn gap name it. A successor's own history is judged without the merged filings, as the predecessor search is. Visa, Duke Energy, NextEra, Coca-Cola and Prologis now end at their newest 10-Q, matching the oracle's TTM revenue and net income. | `c414780`, `f031014`, `085d76d` | `tests/edgar.instanceFacts.test.ts`, `tests/filingDisclosures.newerFiling.test.ts` |
| Scenario fan that does not bracket its base | Fixed (new, found in the B-23 panel run on Duke Energy). Where faster growth needs reinvestment that earns less than it costs and slower growth releases none, bull and bear both land below the base; such a fan is withheld with both values named, judged on the two-decimal values the report shows. No issuer in the main-branch panel reached it. | `3611de9`, `1cd4a31` | `tests/stageB.scenarioTargets.test.ts` |
| B-9, B-20 Multiple labels and the P/E basis | Fixed (owner decision). Each income-derived multiple records the period its earnings cover ("TTM to 2026-06-30" or "FY2025"), and the label follows it in the multiples table, Key data, both exports and both layouts ("P/E (FY2025)", "EV/EBITDA (FY2025)"); in the AI payload a fiscal-year multiple names its year in the label the model reads, and its record carries it, while a TTM record is unchanged. EBITDA adds cash-flow D&A only on the operating income's own period; otherwise EV/EBITDA is withheld with both periods named. TTM labels are unchanged. The P/E basis names only the formula that produced the figure, with the reason when it is market cap over common income, and Key data notes "market cap / common income, not price / diluted EPS" beside such a P/E. | `0af1bf8`, `6a1d96f`, `3eb8665`, `85da9cf` | `tests/multiples.basisLabel.audit20261022.test.ts` |
| B-36 Successor issuer | Partly. Fixed: a TTM may span a reorganisation when the successor's own filing re-presents the predecessor's net income and per-share figures unchanged (ExxonMobil Holdings regains its P/E, 22.4×), and a successor's no-annual-report gaps name the resolved predecessor. Skipped: taking Item 1A, MD&A and the notes from the predecessor's 10-K. It needs live SEC requests (the predecessor's submissions and 10-K are not in the cache, and the panel runs offline), and the 10-K parsers bind their evidence to the registrant's own CIK, so it needs its own identity design. | `6863eb6`, `38b06c6` | `tests/successor.continuity.audit20261022.test.ts`, `tests/edgar.successor.test.ts`, `tests/dataBundle.edgarForms.test.ts` |
| C-16 Superseded 10-K operating figure | Skipped: already fixed on main by batch 3a (D-103, the 10-Q MD&A supersession pass). | none | none |
| FCX-4 Stale EPS CAGR window | Fixed (owner decision). When no net-income EPS is tagged for a period and no discontinued result is filed for it, the filer's EPS from continuing operations stands in (ASC 260-10-45-3), with its own provenance and a substitution disclosure. A discontinued result under any of the elements filers use, even one withheld from the row, keeps EPS empty. Freeport's EPS CAGR runs 2020 to 2025 instead of ending at 2021. | `75ba741`, `7d362d0` | `tests/edgar.statements.test.ts` |

Every new test failed before its fix, except the negative cases (a multi-currency history, a filed discontinued result, a successor whose comparatives disagree, a filing companyfacts already carries), which pass on both sides by design.

## Left for later

- B-36: Item 1A, MD&A and notes from a predecessor's 10-K (needs live SEC requests and an identity design for the 10-K parsers).
- Freeport-McMoRan's P/E stays withheld: a fourth-quarter diluted EPS is never derived from annual and nine-month figures, and its 2026 second quarter tags no common income. Both predate this batch.
- McDonald's scenario targets on main read about 162 million to 304 million per share in the panel; this batch does not touch them, and the cause is not yet traced.
- The instance parse runs on every fetched 10-K and 10-Q before the merge discards most of them, and a release's single-currency history is recomputed per guidance item (review findings 7 and 8: cost, not correctness).
- Key data's P/E note and the annual label read the basis and period strings; a structured field on the multiple would replace both, and one notice builder would replace the newer-filing reference built in two places (review findings 9 and 10). Tests pin each wording today.
- Total debt leaves out `OtherShortTermBorrowings`: NextEra's 2026-09-30 total is 109.67B against the oracle's 113.93B, and main differed from the oracle's tag set by the same element at 2026-03-31 (1.26B). The composition rule predates this batch.

## Independent review

Two reviews ran on the branch before the pull request: `/code-review` at high effort over `origin/main..HEAD`, and a fresh subagent reading the code without this note. Each finding, and what was done:

| # | Finding | Disposition |
|---|---|---|
| R1 | A fiscal-year period not named by year ("FY ended 2025-12-31", from a numeric fiscal year) was labelled one way in the table and "P/E (TTM)" in the figure rows and the payload. | Fixed in `3eb8665`: a numeric fiscal year is read as the year, and "FY ended" periods map alike in every label. |
| R2 | Every multiple's payload record now carried a period the prompt never showed, so a model citing "TTM" or the as-of date would fail the period check, and the period-word check would run on every multiple sentence (both reviews). | Fixed in `3eb8665`: a TTM record carries no period, as on main; a fiscal-year record names its year in the label the model reads, so its period is one the model can see. The payload's provenance hash is main's again. |
| R3 | The AI read an annual-basis multiple as "peTtm (current)" with no year (subagent). | Fixed in `3eb8665`, and the key replaced in `fbeefee`: "P/E (current, FY2025)". |
| R4 | The successor's own-history check ran on the merged facts, so a merged newer filing could drop the "predecessor unresolved" warning. | Fixed in `085d76d`: merged filings' points are left out, as in the predecessor search. |
| R5 | The continuing-EPS stand-in missed discontinued results filed under other elements, and its working fields could leave notes and warn gaps (both reviews). | Fixed in `7d362d0`: every element filers use counts, one withheld from the row counts as filed, and the working fields' notes and withholdings are dropped. |
| R6 | EV/EBITDA could add a fiscal-year operating income to a TTM cash-flow D&A, or the reverse, under one period's label. | Fixed in `85da9cf`: the cash-flow D&A stands in only on the same date and basis; otherwise EV/EBITDA is withheld with both periods named. |
| R7 | The fan guard compared unrounded values, so a run within half a cent of the base could withhold the fan (subagent). | Fixed in `1cd4a31`: compared on the two-decimal values shown. |
| R8 | Release retention counts a record with no `reportsResults` flag as a results release, while the newer-results banner needs the flag to be true. | Not changed. Records stored before the flag existed keep main's ranking, so none drops out of the four kept; the banner, batch 3a's rule, asserts newer results only on positive evidence. Each direction is the conservative one for its use. |
| R9, R10 | The instance parse runs before the merge discards most instances, and a release's currency history is recomputed per item. | Not changed: cost, not correctness. Left for later. |
| R11, R12 | Key data's P/E note and the annual label parse prose; the newer-filing reference is built in two places. | Not changed: design. Tests pin each wording and the banner and gap text. Left for later. |

A second review, `/code-review` and a fresh subagent again, ran over the fixes above:

| # | Finding | Disposition |
|---|---|---|
| S1 | A fiscal-year P/E's payload label read "peTtm (current, FY2025)", a key that says TTM. | Fixed in `fbeefee`: "P/E (current, FY2025)"; "the current TTM P/E" does not validate on it, and the TTM record is unchanged. |
| S2 | Beside a fiscal-year operating income, EV/EBITDA was withheld when the cash-flow slice was TTM, although the annual cash-flow row of the same year carries its D&A (subagent). | Fixed in `5797f46`: that row's D&A stands in. |
| S3 | Two undated rows were read as one period (subagent). | Fixed in `5797f46`: an undated row matches nothing. |
| S4 | The before-tax, phase-out, disposal per-share and noncontrolling-interest discontinued elements were not read (code review). | Fixed in `3314075`. |
| S5 | On a first-hit chain a zero under one discontinued element hid a result under a later one (code review). | Fixed in `3314075`: each element is read on its own. |
| S6 | A working figure backed out of year-to-date marked the row derived and named itself in the derivation note (both reviews). | Fixed in `3314075`. |
| S7 | The merged-filings record is optional on the keyless inputs, so a caller that drops it would judge a successor's history on merged facts (code review). | Not changed: it is absent exactly when nothing was merged, the one builder sets it whenever a filing is merged, and a test pins the merged case. |
| S8 | The presentation layer reads a fiscal-year multiple's label from its provenance id by pattern (code review). | Not changed: design. Tests pin the ids and labels; a structured period field would replace the pattern (left for later, with R11). |
| S9 | Docs still named the payload label "peTtm (current, FY2025)" (code review). | Fixed in this note, METHODOLOGY, D-107 and the changelog. |

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
