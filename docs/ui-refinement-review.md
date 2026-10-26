# Persisted research UI refinement

Local review branch: `codex/metis-ui-refinement`, based on verified redesign commit `38f832951614a878ff4a80db5f645048c8025818`. Substantive application changes: `e9ff206`, followed by a requested-model wording correction; no push, merge or deployment. The existing service and original checkout were left in place.

## Changes and source map

| Change | Main sources |
| --- | --- |
| Shared selected-report identity, generated UTC time, observed quote date, process/research separation and synthetic provenance notice | `ReportSnapshotHeader.tsx`, both company/report pages |
| Compact recorded financial ledger beside trust; full Key Data, assessments, factors, checkpoints and debate remain reachable | `DossierCover.tsx`, `ReportTrustSummary.tsx`, `ReportView.tsx` |
| Selected row controls sticky identity, notes, audit links, Markdown and print; embedded metadata remains unchanged | `PersistedReportView.tsx`, `presentation.ts`, export/print routes and renderers |
| Latest-report watchlist grades explicitly identified independently of selected history | `Sidebar.tsx`, `RunsDisclosure.tsx`, `watchlist.ts`, history page |
| Separate evidence measures, original-precision eligibility, grouped/raw manifest reconciliation, truthful model/usage/cost labels | `assessment.ts`, `completeness.ts`, `presentation.ts`, `auditTables.ts`, export renderers |
| All fourteen keyboard destinations, current reading context, readable prose, wrapping, target size, classic reflow, score/factor scales and print contrast | `ReportContents.tsx`, `sections.tsx`, `FactorAttribution.tsx`, `primitives.tsx`, `globals.css`, `printHtml.ts` |
| Native source access with JavaScript disabled and measured classic sticky clearance | Removed the inherited company `loading.tsx` boundary; `ClassicReportScrollOffset` in `ReportContents.tsx`; portable `scripts/check-report-reading.mjs` |

Names in the table are under `src/components/report`, `src/report`, `src/components/watchlist` and `src/watchlist` as applicable. Exact local evidence paths and screenshots are in the private review handoff, outside Git.

## Preservation matrix

| Surface/content | Evidence and result |
| --- | --- |
| MU saved #46 via company and saved routes | Same selected snapshot; all 14 sections and 244 claim/source blocks on each route, in classic and dossier |
| Historical DEMO #3 / latest #13 | 52 / 34 claim blocks retained; #3 identity, notes and exports remain selected while watchlist grades say latest #13 |
| Bank, limited-evidence, missing legacy metadata and long-content fixtures | SYNBANK #5, SYNEDGE #10, SYNLEGACY #9 and SYNMANY #8 retain 27 / 52 / 49 / 153 claim blocks and 14 reachable destinations each; absent legacy projections have an explicit not-recorded destination |
| Thesis, qualifiers, rationales, numeric provenance and audit | Seven recorded-input contracts passed against rendered HTML, MD, print HTML and audit: 351 sampled traced figures, 104 source endpoints and 230 raw manifest rows, with their recorded values, units, periods, sources and explanations |
| Fourteen research sections | Verdict, Business, Fundamentals, Balance Sheet, Valuation, Quality, Technicals, Leadership, Competitive, Catalysts & Risks, Outlook, Projections, Macro and Appendix remain reachable |
| Statements, forensics, capital bridge, sensitivities, triggers, bull/bear/judge, projections and revision comparison | Existing data contracts and rendering components retained; focused parity, recorded-grid, route-applicability and controller regressions run |
| Persisted data | Read-only comparison: all 45 live saved rows unchanged, no new live report; all 13 original isolated fixture rows unchanged; MU #46 copied byte-for-byte into isolated runtime only |
| Analytical code | No changes in pipeline, providers, AI routing, database or report schema; generation-facing composite formatting retained |
| Assets and controls | Local fonts/SVGs, appearance attributes, density controls, section IDs, evidence landmarks and chart palette contracts retained |

Persisted bytes and rendered access are separate checks. Preservation does not validate the investment model or the accuracy of recorded claims.

## Trust reconciliation

MU has 122 manifest entries: 55 expected disclosures, 31 informational notes, 33 entries represented by 31 grouped data issues, and 3 recorded warnings shown as information. Thus 36 recorded warnings become 31 grouped issues after two pair groupings and three resolved temporary-equity warnings; no entry is deleted.

DEMO #13 has 58 entries: 26 expected disclosures, 16 informational notes, 15 warnings represented by 14 grouped issues, and 1 critical analysis-process issue. SPY/XLK historical-price entries form one group. Its data-only analysis failure remains visible and keeps the confidence ceiling.

MU's figures traced (267/271), factual claims cited (140/140), numeric factual claims matched (36/121, with 85 unmatched), qualitative claims cited (19), contradictions (0), signal evidence availability (94.2%, recorded fraction 0.9417878787878787), and degraded research completeness remain distinct. A matched figure does not validate the entire prose claim. DEMO's equivalent signal measure consistently displays 83.8%, from 0.8381212121212122. Threshold tests use original precision.

## Rendered verification

The production comparison covers 60 geometry samples: both MU routes, classic/dossier, Ink/Ivory, 1920, 1440, 1280×720, 768, 390 and 320 CSS pixels, plus adverse fixture screens. No page or main-container horizontal overflow was found after fixes. Expanded sources at 320px also reflow. Truly two-dimensional tables retain labeled keyboard-accessible scrolling.

At 1920×855, freshly audited baseline conclusion tops were 596px company / 446px saved, with full Key Data at 3486px / 3350px. Both refined routes put the conclusion at 399px and the compact ledger/trust at 545px. These are reading-sequence observations, not height acceptance targets.

Twenty-one browser flow checks pass: appearance/density persistence; fourteen keyboard jumps on desktop/mobile; desktop inspector stability and recorded quote provenance; modal focus/Escape/return; expanded sources; reduced motion; equivalent 200% reflow viewport; search; notes persistence/conflict resolution; historical identity; revisions; watchlist add/reload/remove; six actual MD/audit downloads; export failure/retry; pending-export navigation; settings. No generation POST occurred during those viewing/export flows.

Sampled text contrast meets the relevant 4.5:1/3:1 threshold in both layouts/themes and print. The measured minimums were 5.51 Ink dossier, 4.65 Ivory dossier, 4.92 Ink classic, 4.73 Ivory classic and 4.73 print. Sampled enabled buttons/disclosures meet 24px minimum geometry after targeted fixes. This is not full accessibility certification.

Eight real PDFs cover MU #46, DEMO #3/#13 and SYNBANK #5 in A4 and Letter. Each print route exposes all 14 section headings; all 294 produced pages were checked for text outside page bounds and represented in contact sheets. MU section pages were also rendered at reading size. No physical printer was used. PDF rendering used PyMuPDF because Poppler was unavailable and WSL had an existing configuration error.

## Verification status and limits

Fresh focused checks include typecheck, lint, 54 reading/print/parity regressions, trust contracts, historical API/export identity, recorded sensitivity, and the new keyboard offset/focus regressions observed RED before their fixes and GREEN afterward. The full unchanged `npm run verify` passed serially for the final application changes; exact logs are in the private handoff.

Earlier failed attempts are retained: stale copy expectations, a test-only observer mock type error, an API parity expectation missing the new selected-row context, a coverage-directory collision from overlapping full runs, and a recorded-sensitivity deadline exceeded under that load. No coverage floor or timeout was weakened. The unchanged sensitivity test passed in a quiet focused run.

Remaining verification boundaries: native Chrome 200% toolbar zoom was unavailable after its automation connection stopped responding; the 640×360 CSS reflow equivalent for 1280×720 at 200% passed. Full screen-reader certification, investment accuracy, current prices and live paid/provider generation are outside these checks. Recorded/stubbed controller tests exercise generation/progress/cancel/failure/recovery. Browser-extension hydration warnings from the preparatory browser are separate from the isolated browser's zero application page errors.

## Review rulings and rollback

Accepted the independent review's selected-identity and sticky-reading findings; both have reproducing regressions and fixes. Its corrupted scale label was treated as an explicit label-contract defect and corrected. No minor findings were deferred. Additional rendered checks found and corrected classic overflow, expanded citation wrapping, one unfocusable section, target sizing and text contrast.

The full unstructured synthesis is retained with smaller reading typography. Safe structured parsing was unavailable; preserving qualifiers costs the continued presence of legacy literal labels/citations. Detailed recorded financial/model caveats, including MU's exceptional economics and structural-reset limitations, remain available. No analytical revalidation was attempted.

The original service does not need rollback: it was never replaced. To abandon this review, stop only the separately identified preview processes and leave the review worktree. To undo later integration, create a rollback branch and revert this refinement's commits in reverse chronological order after preserving other work; no database restoration or migration is required. Never reset the original checkout or replace saved report records.

Final browser closure additionally reproduced classic mobile headings hidden by the wrapping sticky grid, and a no-JavaScript skeleton persisting over hidden streamed research. The latter was also reproduced read-only in the original service. Classic jumps now use the measured strip height, with a CSS fallback. Removing the company route's loading boundary sends the completed server page directly; generation progress/cancel/failure/resume remain in the existing controller and passed a browser stub exercise. Tradeoff: company navigation waits for the complete server page instead of painting the route skeleton. Native disclosures and all fourteen sections now work without JavaScript using a normal Chrome user agent. The portable reading regression passed 16 layout/theme/width combinations plus native no-JavaScript access without any mutation request.

## Closing execution record

`npm run verify` passed at `e9ff206`: dependency shape, typecheck, lint, 428 product files (8841 passed, 3 skipped), integration (4 passed), both coverage suites, production build and security audit (0 vulnerabilities). Product tests ran again under each coverage configuration with the same passing count. Core coverage: statements 96.96%, branches 91.84%, functions 98.71%, lines 98.17%. Risk coverage: 95.36%, 89.68%, 98.02%, 97.51% respectively; existing per-file floors passed. Skips: one native POSIX environment test on Windows and two opt-in live EDGAR smoke tests, deliberately disabled. No timeout, coverage floor or analytical assertion was relaxed.

The final browser closure also passed all seven checks, including the actual recorded #11/#12 diff route, classic sticky clearance, stubbed controller recovery and native no-JavaScript evidence. The 17-check portable reading regression is committed for repeatable local review. Private evidence includes complete failed attempts as well as the passing closure; no historical test run is substituted for this final-source result.

Final wording correction: the evidence rail now says **Requested model**, with an explicit pointer to actual pass models and unknowns in run details. Its new trust-label regression failed before the change and passed afterward. Fresh typecheck, lint and the full product suite passed afterward (**8842 passed, 3 skipped**, 428 files). The preceding complete `npm run verify` at `e9ff206` remains the integration/coverage/security result; its analytical and coverage-source paths are unchanged by this wording-only patch. The final build and browser label check are recorded in the private handoff. This distinction is explicit rather than presenting the earlier full run as a run of the later label.
