# Foreign annual report section recovery — D-191

## Frozen evidence and scope

Read the prescribed census database only with
`new Database(path, { readonly: true, fileMustExist: true })`. Its SHA-256 is
`16562e5e476f644d00f0c21c5fc09afe242545027768afdaed1b46f7f4f8644f`.
No live application database, settings values or credentials were read.
All real filing HTML was already retained in the census's SEC `api_cache`;
no network, provider or model call was needed. Filing text and scratch
scripts/results remain gitignored under `tmp/foreign-sections/`.
Tests added here contain synthetic issuer text only, consistent with
[DATA-RIGHTS](../DATA-RIGHTS.md).

There are 33 companies: 25 have a 10-K, seven a 20-F, none a 40-F, and XOM's
successor has no annual filing in the snapshot. Five companies have seven
saved hard-extraction-failure fields: four narrative fields and three annual-notes
fields. Three more companies have notes-recognition gaps after successful
item extraction, listed separately below. Thus eight companies have ten
failed narrative/notes fields when both failure classes are counted. The three
hard-failed notes fields name four individually failed item extractions,
so eight item failures underlie those seven fields. Duplicate entries in
`bundle.gaps` are not counted again.

## Before and after

“Missing” means no accepted text (zero returned characters). Parenthesized
lengths are rejected stub lengths, not accepted sections. First lines below
are abbreviated for identification; full result records are in
`tmp/foreign-sections/before.json`, `after.json` and `panel-replay.json`.

| Company / form / item | Before | After / accepted characters | First line or retained reference |
| --- | --- | --- | --- |
| INTC / 10-K / 1 | Missing; 152-char stub | Complete mapped ranges / 136,346 | Availability of Company Information |
| INTC / 10-K / 7 | Missing; 230-char stub | Complete mapped ranges / 117,412 | Management's Discussion and Analysis Overview |
| ASML / 20-F / 4 | Missing; no section found | Mapped-page excerpts / 43,116 | 20-F Item 4: mapped-page excerpts. Chapters may continue beyond the referenced pages… |
| ASML / 20-F / 5 | Missing; no section found | Mapped-page excerpts / 52,804 | 20-F Item 5: mapped-page excerpts. Chapters may continue beyond the referenced pages… |
| PEP / 10-K / 8 | Missing; 111-char stub | Missing / 0; specific unresolved reference | See Item 15, Exhibits and Financial Statement Schedules |
| PEP / 10-K / 15 | Missing; 1,229-char stub | Missing / 0; specific unresolved reference | Included by reference to the index appearing in Item 7 |
| DIS / 10-K / 8 | Missing; 138-char stub | Missing / 0; specific unresolved reference | See Index to Financial Statements and Supplemental Data on page 67 |
| EXPE / 10-K / 8 | Missing; 225-char stub | Missing / 0; specific unresolved reference | Index to Financial Statements, Schedules and Exhibits on page F-1 |
| MSFT / 10-K / notes from 8/15 | Items found; no notes recognized | Notes missing / 0, unchanged | Heading is fragmented as “NOTES TO FINANCI AL STATEMENTS” |
| MCD / 10-K / notes from 8/15 | Items found; no notes recognized | Notes missing / 0, unchanged | Summary of Significant Accounting Policies; no opening numbered note |
| ORCL / 10-K / notes from 8/15 | Items found; no notes recognized | Notes missing / 0, unchanged | Full-document heading is fragmented as “NOTES TO CONSOLID ATED FINANCIAL STATEMENTS” |

The seven saved hard-failure fields become four successful narrative fields and
three still-missing notes fields. The three other notes-recognition gaps also
remain unchanged: six domestic annual-notes gaps in total. ASML's two successes are explicitly partial
evidence, not complete-item recovery. DIS Item 15 (20,294 characters) and EXPE
Item 15 (8,746 characters) still extract exhibit lists without the notes.
Their annual-notes fallback therefore remains a gap.

The broader replay checks the three narrative items of all 32 available
annual filings plus Items 8/15 of every 10-K: **146 section slots, 137 → 141
successes, all 137 old successes byte-identical**. CAT Item 15 is another raw
stub in that broader check, but was not a saved notes failure because CAT's
Item 8 already supplies its notes. All other panel companies' narrative
sections are unchanged. XOM's missing successor filing is unchanged.

## Filing evidence and root causes

- [ASML 2025 Form 20-F](https://www.sec.gov/Archives/edgar/data/937966/000162828026011378/asml-20251231.htm): an integrated annual report, not conventional Item 4/5 bodies.
  Its four-column reference table has merged item-caption cells and continues
  through multiple tables with repeated headers. Item 4 has 14 page references
  resolving to 12 unique physical pages; page 13 is a linked chapter divider,
  so only 11 pages are retained. Item 5 has 14 references and 13 unique pages.
  Legacy TOC/header layers find no item-numbered bodies; structural recovery
  previously supported only the single risk-chapter mapping. Inline XBRL is
  not the underlying absence, and this is not a wrongly selected exhibit.
- [INTC 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/50863/000005086326000011/intc-20251227.htm): the apparent Item 1/7 headers are small rows in the final cross-reference index.
  The actual narrative is incorporated from explicit page ranges. Recovery
  proved those ranges but D-184's blanket overlap refusal rejected Business
  page 18/MD&A pages 18–29, Properties page 32 and financial-note pages 65–72
  shared with other items. Sharing is expressly stated by the filing.
- [PEP 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/77476/000007747626000007/pep-20251227.htm): Item 8 refers to Item 15; Item 15 in turn refers to the financial-statement index in Item 7.
  Neither short item body is the financial notes. The current bounded
  annual-notes redirect does not prove that alternative index structure.
- [DIS 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1744489/000174448925000155/dis-20250927.htm): Item 8 explicitly refers to its same-document page-67 financial-statement index; Item 15 is an exhibit list.
  No complete note-body boundaries are proved by the existing redirect.
- [EXPE 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1324424/000132442426000008/expe-20251231.htm): Item 8 points to the same-document F-1 index, and Item 15 lists exhibits.
  The current notes redirect requires a different, fully proved index layout.
  The notes are not declared absent from the filing; extraction remains
  withheld with the actual reference in the reason.
- MSFT, MCD and ORCL have a separate notes-recognition failure, not a failed
  item extraction. MSFT Item 8 retains 103,038 characters, MCD 96,193 and
  ORCL 141,715. MSFT's full notes title contains a word split; ORCL's full
  title also contains a word split and its Item 8 slice starts in the first
  note's body. MCD's actual notes start with an unnumbered Summary of
  Significant Accounting Policies, while the notes guard requires an opening
  Note 1/A/One or equivalent numbered marker. No broad word-joining or
  unnumbered-note admission change was made as part of this narrative repair.

Foreign annual notes remain explicitly unsupported (20-F Item 18 is not
read), and the seven foreign issuers' 6-Ks have no standardized 10-Q item
bodies. Those are disclosed coverage limits, not item-extraction hard failures.

Read the recovered text for both target issuers. INTC Business includes its
CPU design/manufacturing model, Products/Foundry segments and suppliers;
MD&A opens with management's overview and retains operating results,
liquidity and critical-accounting-estimate discussions. ASML's retained pages
include the lithography overview, marketplace/AI demand, sales drivers,
R&D, outlook, cash flows and financing policy. The navigation-only page 13
was identified during that reading and excluded before final verification.
ASML's fixed-layout word fragmentation (for example “ASM L”) remains source
formatting; no broad OCR/text-repair heuristic was introduced.

## Rule, limits and verification

The rule is in [D-191](DECISIONS.md#d-191---recover-explicit-annual-report-page-references-with-honest-coverage-2026-11-04).
Shared whole-page references are admitted only with complete range/link/page
proof. Point references recover labelled physical-page excerpts, without
guessing complete chapter boundaries. Coverage remains in the payload title
even if evidence selection drops the opening text. A missing/ambiguous
reference refuses the mapping; no ticker-specific code is used.

Tests were written and run before their fixes. Red runs demonstrated missing
20-F mappings and reference reasons, rejected shared 10-K ranges, lost payload
coverage labels, conflicting printed page numbers, navigation-only text and
generic 40-F errors. The new fixtures include negative controls for missing,
duplicate, external and wrong-page targets, contents pages, missing closing
items and unmapped continuation rows. Existing EX-13 precedence, hidden-block,
cross-reference, incomplete-range and stub controls remain in the changed
test selection.

The retained note gaps need their own complete index-to-note-body proof;
this change reports why, rather than returning the short references or
exhibit lists as notes. No 40-F is in the frozen panel. Its unsupported
exhibit acquisition now has a specific filing-index reason; choosing and
reading an annual-report exhibit automatically is still unimplemented.

Version constants are deliberately unchanged. A payload-version advance is
required on integration; Stage B, fair-value, scenario-target, pipeline and
report-schema stamps need no change. Existing reports remain immutable.

Verification used Node **24.11.1**, with `C:\Program Files\nodejs` first on
PATH and the prescribed `npm_execpath`.

- `npm ci --offline --no-audit --no-fund`: passed; dependencies were initially absent.
- `npm run typecheck`: passed, exit 0.
- `node node_modules/eslint/bin/eslint.js src/edgar/extract.ts src/pipeline/dataBundle.ts src/pipeline/stageC/payload.ts tests/edgar.mappedAnnualPages.test.ts tests/edgar.sectionRecovery.test.ts tests/stageC.payload.passes.test.ts`: passed, exit 0, no lint findings.
- `node node_modules/vitest/vitest.mjs run --config vitest.config.ts --changed origin/main --passWithNoTests`: passed, exit 0; **500 files, 12,146 tests**, 158.10 seconds.
- `git diff --check`: passed. Self-review caught the conflicting-page-number,
  lost-title-disclosure and linked-navigation cases; each gained a failing
  regression before its correction.

No full `npm run verify` was run. Red/green logs, the final required-command
logs and real-document replays remain under `tmp/foreign-sections/`.
