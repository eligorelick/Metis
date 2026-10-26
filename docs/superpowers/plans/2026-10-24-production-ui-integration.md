# Metis Production UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporate the redesigned research workspace into the production React app with demonstrated preservation of financial meaning, evidence, supported workflows, and saved reports.

**Architecture:** Incrementally refactor the existing presentation layer. Keep the current report-loading boundary, immutable `Report` snapshots, financial engines, assessment rules, formatters, job controllers, and export contracts authoritative. Retain a reversible layout flag while developing the new view; the flag must be independent of the existing appearance preference.

**Tech Stack:** Existing Next.js 16.4.2, React 19, TypeScript, Tailwind, SQLite/Drizzle, Vitest, Recharts and lightweight-charts; Node >=24. Read the installed Next documentation required by the repository's AGENTS.md before implementation. Do not upgrade dependencies as part of this migration.

**Spec:** [Redesign rationale](../../redesign-plan.md), plus the decisions and preservation matrix below. The HTML prototypes are visual/interaction references, not production data or computation libraries.

**Status:** Implemented in `codex/metis-ui-redesign` from `089a6cf0fd28665fc6d34725061eb011f22ff9d9`. Original full Windows/Linux verify, review fixes and Windows serial smoke/integration pass at `5c6088a`. Additional usability fixes at `20c083b` pass fresh full Windows verify, Linux product/build and browser workflows. See the [execution record](../../ui-redesign-execution.md) and [preservation ledger](../../ui-redesign-parity.md) for exact scope and limits. The original checkout and user-owned untracked specification are preserved; production promotion remains a separate release action.

## Outcome and release scope

Deliver a professional research workspace inside the existing Metis application. An analyst must be able to understand a thesis, distinguish business quality from valuation, examine the scoring rationale, trace a figure, challenge assumptions, inspect missing evidence, compare saved reports, run research, and export the full record. Improve hierarchy and navigation without simplifying away the information needed to make those judgments.

The implementation goal ends with tested production code, a working isolated preview, a complete preservation ledger, and a reviewable branch or draft pull request. It does not include merging or deploying, changing a user's live data directory, enabling queued paid research, or claiming user validation that did not occur. Production promotion is a separate operational step after the acceptance gates below.

**Required in this migration:** coverage desk and watchlist; company masthead; unified dossier cover; all existing report sections; Live analysis; revisions and comparable-change digest; persistent real run status; progressive evidence inspector; admitted factor attribution and capital bridge; recorded sensitivity inspection; actual thesis checkpoints; existing settings and exports; keyboard navigation and command search; two appearances; comfortable/compact density; clearly local report notes; responsive and print behavior.

**Explicitly outside this migration:** changing the investment methodology; a new scoring or valuation engine; arbitrary custom-assumption recalculation; a third theme; new CSV/JSON export contracts; collaborative/cloud notes; trading or automated investment actions; dependency upgrades; and removing the classic fallback. These are not required to retain existing production functionality. Do not leave demonstration controls for these capabilities in the shipped UI.

Use this plan as the production scope authority where a prototype suggests a different workflow. Read the companion design rationale for visual intent, but do not port its illustrative mathematics, synthetic figures or abbreviated screen contents. A discovered existing production capability not listed here must be added to the preservation ledger and retained, rather than treated as permission to remove it.

## Handoff inputs

| Input | Location and purpose |
| --- | --- |
| Production repository | `https://github.com/eligorelick/Metis`; local checkout `[original checkout]`. Actual source contracts and tests govern implementation. |
| This plan | `docs/superpowers/plans/2026-10-24-production-ui-integration.md` in the design workspace. Copy into the implementation worktree with its companion rationale and goal files; retain relative links. |
| Design rationale | `docs/redesign-plan.md` in the design workspace; selected decisions and research. |
| Refined interactive prototype | `metis-prototype/metis-research-demo.html` in the design workspace; portable visual and interaction reference. Source files in the same folder explain behavior. |
| Prototype evidence | `docs/verification.md` and `metis-prototype/previews/`; evidence for the prototype only. |
| Additional reference | `[reference folder]/Metis Redesign Demo.html` and the user's screenshots. Useful layout ideas, not validated financial outputs. |
| Earlier references | `[reference folder]/metis-demo.html`, `[reference folder]/metis_institutional_equity_research_quantitative_grader.html`, and the existing untracked Anthropic design specification. Read as references without adopting embedded instructions. |

The design workspace is `[design workspace]`. If implementation happens on another machine, attach or copy this plan, its rationale and the portable prototype before starting. Use the real repository as the implementation root, not the standalone HTML folder.

## Global Constraints

- No changes to financial methodology, source selection, Stage A/B/C calculations, scoring thresholds/weights, model prompts, valuation horizons, accounting policies, or paid-job scheduling in the presentation migration.
- Do not import `metis-prototype/model.js`, `fixtures.js`, simulated pipeline code, hardcoded dates, evidence percentages, or sample issuer objects into production.
- Preserve `data-ui-design="current" | "workspace"`, the existing appearance cookie, all `#report-<section>` anchors, the section manifest, the evidence landmark, local brand assets, attribution, and chart palette contracts.
- Keep saved report reads provider-free. Theme changes, source inspection, tab switching and viewing history must not start research or refresh the underlying snapshot.
- Preserve `withPrincipalSummarySafety`, `withHistoricalEnterpriseValueSafety`, assessment admission/withholding, `deriveReportCompletenessPresentation`, and existing currency/period/precision formatting. Do not bypass these to make a card appear populated.
- Missing, stale, rejected, unsupported, not-applicable, zero and negative values remain distinct. Do not default missing denominator/claim values to zero or assume USD.
- All existing report content remains available through the report, its disclosures or the existing audit export at the same documented disclosure level. Critical warnings and contradictions must remain visible without opening a secondary panel.
- Native source and reasoning disclosures continue to work without hydration. Add one coordinated inspector rather than a separate client state root for every claim.
- Scenario experiments never mutate the saved report, update its headline grade, or claim to be a new analyst conclusion.
- Use an isolated branch/worktree at implementation time. Preserve the working database and credentials; preview against an isolated data directory with queued work held, not the production database.

## Design decisions after comparing both demos

1. **Retain primary views: Report, Live analysis, Revisions.** The prototype's Overview/Valuation/Factors/Financials/Sources shortcuts become navigation within Report. They must not replace or conceal the live Stage-B workflow. Preserve existing URLs and historical report routes.
2. **Use the revised unified cover.** Show the stored thesis, its actual executive claims, admitted composite, seven aspect assessments where available, stored assessment dimensions, and a clearly labelled valuation. Preserve the distinction between deterministic scores and analyst grades; they can differ legitimately.
3. **Add a compact change digest.** The Anthropic reference's “since the previous report” strip is useful, but its production data must come from `diffReports`. Incomparable reports show a reason rather than a percentage change.
4. **Expose the complete report map.** Provide all 14 section destinations, current-position feedback, a mobile jump control, native disclosures and a bulk source-disclosure control. An unavailable optional section should have an explicit availability explanation rather than a dead navigation target.
5. **Keep the saved report available during runs.** The persistent job panel displays actual queued/running/completed/failed/canceled/unsupported states, server-reported costs and existing retry eligibility. No timed simulation, optimistic “complete,” or guaranteed reuse claim replaces the server decision.
6. **Preserve measurement meaning.** Keep labels such as “Leadership (capital-stewardship proxy),” FCFF versus historical FCF, operating EPS versus GAAP diluted EPS, and intrinsic DCF EV versus market EV. Never shorten these into a materially different claim.
7. **Use restrained motion and legible surfaces.** Carbon/Paper share the same information structure. Body copy should be approximately 14 px, captions at least 11 px, and tables retain tabular numerals and units. Test actual contrast and scaling; font sizes alone do not establish accessibility.

The newly supplied `Metis Redesign Demo.html` differs from the local Anthropic reference only by its HTML export wrapper at review time. Its source was reviewed; no new browser rendering of that file is claimed. Useful ideas above are selected on their merits, not because either prototype is a production specification. In particular, sample trigger text that promises an automatic grade reduction must not be adopted unless the production contract actually supports that effect.

## Layout and interaction specification

### Coverage and company navigation

The home page becomes a useful coverage desk: real saved companies, latest report identity/date, existing admitted grades and evidence status, and clear paths to open a company or add a ticker. Use a semantic table on wide screens and a readable stacked arrangement on narrow screens. Never fill missing cached data by silently starting research. Distinguish “No report yet” from a failed or unsupported run. Retain provider/model configuration in Settings and expose a compact system-status entry on the desk; missing configuration must remain actionable.

Keep one Metis brand mark in the application shell. On wide screens, use approximately 216–240 px for watchlist navigation and 264–304 px for evidence, allowing the reading region to grow. These are starting dimensions, not fixed-width requirements. Collapse the evidence rail when the reading region would become cramped; collapse the sidebar next. Use available container width, not an assumption that a desktop window is always full screen.

The company masthead contains the full company name, canonical ticker, route, relevant sector metadata, dated quote and its currency, plus report identity/observation context. Current quote time and report observation time must remain separate. Action buttons wrap naturally. A quote or upside is withheld when the corresponding currency or comparability contract requires it.

Report, Live analysis and Revisions are primary destinations. Report shortcuts are an additional local table of contents. Opening a saved historical report must not redirect to the newest report or export the newest report by accident. Preserve existing deep links and browser Back/Forward. If a new query parameter is needed, retain unrelated search parameters and canonical symbol encoding.

### Reading and assessment hierarchy

Use a two-column cover when space permits: thesis and actual executive claims on the left; admitted composite and seven aspect rows on the right. Put business quality, valuation attractiveness and evidence availability nearby, using the production assessment labels and distinct units. Do not synthesize these three dimensions by averaging other scores. Explicitly unavailable dimensions are better than invented numbers.

Keep scenario ranges, actual conflicts, stale inputs and critical gaps near the conclusion they qualify. A large score must not obscure its eligibility reason, score method or evidence limitation. The neutral-50 marker belongs only to quantities whose production contract actually uses that baseline. Aspect rows follow the authoritative manifest order; selecting one goes to its reasoning or admitted contribution detail.

Render the report in its complete manifest order: verdict, business, fundamentals, balance sheet, valuation, quality, technicals, leadership, competitive landscape, catalysts and risks, outlook, projections, macro, appendix. Use manifest keys for existing anchors, including camel-case keys. Navigation to an unavailable optional section reaches an explanation, not empty space. The evidence rail keeps `aria-label="Report evidence and gaps"`.

Full claims, key warnings, numerical units and source identifiers must not depend on hover. Long source IDs wrap or have an accessible full-text expansion. Do not use line clamping or ellipses on thesis prose, valuation caveats or evidence explanations. Compact density reduces padding and table rhythm; it does not hide rows, columns, claims or warnings.

### Appearance and motion

Map the existing `current` preference to the Carbon presentation and `workspace` to Paper only when the dossier flag is on. Preserve stored preference values and existing Metis Ink/Ivory naming where already used; explain the appearance rather than adding competing theme systems. The classic flag state keeps its present appearance behavior.

Starting dossier tokens, subject to measured contrast and brand checks:

| Role | Carbon | Paper |
| --- | --- | --- |
| Canvas | `#101214` | `#f6f4ef` |
| Primary surface | `#17191c` | `#fcfbf8` |
| Raised surface | `#1e2125` | `#edeae3` |
| Sidebar | `#121416` | `#eeece6` |
| Main text | `#eeede8` | `#25292d` |
| Secondary text | `#a7aaad` | `#62676a` |
| Hairline | `#303438` | `#d7d5cd` |
| Accent | `#d3b888` | `#725831` |

Scope tokens under `data-ui-layout="dossier"`. Existing chart palette constants remain unchanged; these surface tokens do not override canvas contracts. Use stronger edges for controls if needed for contrast. Grade letters and words convey meaning independently of color; positive/negative price movement remains a separate semantic channel.

Use local serif stacks for company names and thesis headings, the existing system sans stack for prose and controls, and tabular numerals for financial alignment. Target 14 px prose at 1.55–1.7 line height with a 65–75 character reading measure; 12–13 px table text; 11 px minimum secondary captions. Company headings may scale from 26–34 px; the composite can reach 44–48 px only if all qualification text remains legible. Use sentence case for normal labels. No external font request is necessary.

Prefer horizontal rules and grouped spacing to nested rectangles. Reserve a subtle surface elevation for the cover, menus and inspector. Motion should explain opening, selection and progress: approximately 120–180 ms for small state transitions and at most 220 ms for the inspector. Avoid animated numerical counts, staggered report paragraphs, parallax and indefinite decorative motion. Respect reduced motion and never animate an estimated run percentage that the server did not supply.

### Accessibility, small screens and print

Use real headings, landmarks, buttons, links, tables, disclosure summaries and labelled form controls. Preserve visible focus, skip navigation, tab semantics, Escape handling and focus return. The mobile inspector and command palette trap focus while modal; the desktop evidence rail does not. Keyboard shortcuts ignore text inputs, editable elements and composition events. `/` and Ctrl/Cmd+K open command search; never capture ordinary number keys globally.

Target WCAG 2.2 AA contrast: 4.5:1 for normal text, 3:1 for large text and applicable UI boundaries. Use at least 24 by 24 CSS-pixel targets or the applicable spacing exception, with approximately 40–44 px touch targets for primary mobile controls. Test 320 CSS-pixel reflow and 200% text/zoom behavior. Two-dimensional tables may scroll within a labelled, keyboard-reachable region with a visible affordance; page-level horizontal overflow or hiding the final column is a failure. These are acceptance requirements, not a claim of full accessibility certification. See [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Print uses the existing selected-report print route. It must include all report content and evidence already supported by that export, independent of which tab or disclosure is currently open. Remove app chrome and fixed heights. Repeat table headers, allow genuinely long sections to paginate, and prevent short headings from separating from their first paragraph. Do not apply `break-inside: avoid` to an entire multipage report section. Check A4 and Letter output, including long tables, footnotes and unknown-currency cases.

## Component and data boundaries

Keep `ReportView` and report assembly server-rendered. Apply the existing safety presenters once before composing the cover and sections. Interactive islands receive only the snapshot fields they need; do not serialize config, credentials, database handles, the whole provider bundle or redundant copies of the full report.

| Proposed component or module | Responsibility | Must not do |
| --- | --- | --- |
| `DossierCover.tsx` | Arrange existing thesis, claims, assessment dimensions and score presentation | Recalculate a rating, rewrite analyst text or invent evidence confidence |
| `ReportContents.tsx` | Manifest-driven availability, section links and progressive current-position feedback | Maintain a second conflicting section list |
| `EvidenceInspector.tsx` | Select already-rendered source content by report/item identity and manage focus | Fetch a newer source, modify a claim or treat citation presence as verification |
| `FactorAttribution.tsx` | Display admitted contribution rows with equivalent table access | Substitute a seven-aspect arithmetic approximation for signal-family attribution |
| `CapitalBridge.tsx` | Display the existing valuation bridge with correct signs and units | Rebuild enterprise value or ignore ownership claims |
| `RevisionDigest.tsx` | Summarize comparable `ReportDiff` fields and link to the full comparison | Compute deltas across incompatible versions |
| `CommandPalette.tsx` | Navigate known companies, current sections and real application actions | Start paid work merely because a search result was selected |
| `ReportNotes.tsx` | Save clearly labelled local text under canonical issuer and report identity | Write to the immutable research report or imply shared analyst approval |
| `uiParityContract.ts` in tests | Describe expected semantic coverage and independent render assertions | Recompute investment outputs or prove parity by comparing an object to itself |

Proposed component names are implementation targets, not claims that these files already exist. Reuse an equivalent existing abstraction if the refreshed repository has one. Keep any such adjustment in the execution log with its preservation evidence.

## Preservation and wiring matrix

| Surface or action | Production authority | Required behavior / parity evidence |
| --- | --- | --- |
| Latest saved report and issuer identity | `report/query.ts`, `history.ts`, company page, `PersistedReportView.tsx` | Correct symbol/report ID, legacy parsing and immutable snapshot. No provider call on read. Wrong-issuer report never displayed. |
| Unified summary and grades | `ReportView.tsx`, `sections.tsx`, `assessment.ts`, `surfaceManifest.ts` | Use stored scores, grades, effective weights and assessment dimensions; preserve neutral labels, evidence floor, rejection status and reasons. |
| Financial numbers | `TracedNumber`, `report/format.ts`, `presentation.ts`, company `format.ts` | Identical raw value, unit, currency, period, source, verification status and established display precision. |
| Claims and pinned evidence | `ClaimText.tsx`, `TracedNumberSourceDetails`, source facts, appendix | Same claim label and provenance in inline disclosure and rail; no invented accession, date or verification state. |
| Factor attribution | `scoreAuditTables`, `factorContributionSensitivityTable` | Complete signal-family reconciliation, effective weights and fallback reasons. Unsupported decomposition stays unavailable. Do not substitute aspect-neutralization math from the demo. |
| Valuation and sensitivity | `valuationAuditTables`, `scenarioPresentation`, `fairValueText`, Stage-B valuation | Preserve route applicability, recorded cells, horizon, terminal conventions, ownership, senior claims, denominator and currency-comparison gates. |
| Thesis checkpoints | `report.thesisTriggers`, `thesisTriggers.ts` | Show stored observable condition, period, interpretation and missingness; no fabricated thresholds or automatic investment action. |
| Fundamental/technical/projection charts | Existing chart mappers, `plotData.ts`, `ChartDataDisclosure.tsx` | Same underlying points and admitted paths, negative values visible, gaps preserved, tab/resize remeasurement, exact data table available. |
| Complete report | `REPORT_SECTION_MANIFEST`, existing section renderers | All 14 destinations in order, including catalysts/risks, macro, outlook, projections and appendix; optional data handled explicitly. |
| Revisions / change digest | History routes, `HistoryCompare.tsx`, `diff-body.tsx`, `diffReports` | Real report IDs, issuer matching, chronological order and version comparability; no authored deltas. |
| Generate / attach / cancel / retry | `GenerateReport.tsx` and `/api/report`, `/{jobId}`, `/stream`, `/cancel`, `/retry` | Keep existing identity/generation fencing, reconnect logic, terminal fetch, retry decisions, cost controls and server-owned state. |
| Watchlist / search | `AddTicker.tsx`, `RemoveButton.tsx`, `/api/watchlist`, symbol normalization | Real persistence and error feedback; reload verifies changes. Search not limited to four fixture companies. Preserve share-class aliases. |
| Exports | `ExportButtons.tsx`, `/api/export/[reportId]`, saved print route | Keep Markdown, audit trail, and PDF/print. CSV/JSON are additions only if properly specified; never replacements. Export the selected snapshot. |
| Settings / credentials / queues | Existing Settings components and their API routes | Preserve provider configuration, model/effort selection, unavailable states, protected storage and explicit queue-resume control. |
| Theme / density / notes | Existing appearance contract; scoped new preferences | No research-side effects. Notes explicitly local unless a separately specified persistent annotation service is built. Key notes by issuer and report ID; report storage errors honestly. |

## Review Focus

- Old reports missing optional scoring/projection blocks: render available content without invented assessments or broken links. Task 1/3.
- A symbol/report switch while SSE or inspection is active: no stale job results, sources or exported report IDs leak into the new context. Task 4/6.
- Unknown or mismatched currencies and missing/negative inputs: no misleading dollar prefix, upside or manufactured zero. Task 1/5.
- Long evidence text, 100+ claims, dense tables and narrow/zoomed screens: full content remains reachable, focused controls unobscured, print pages readable. Task 3/4/8.
- No credentials, interrupted provider access, duplicate generation and retry: preserve truthful failures, no duplicate paid work, and the last completed report remains available. Task 6/8.

## Task 0: Prepare an isolated implementation and execution record

**Files:** read applicable `AGENTS.md`, `docs/BRAND.md`, package scripts, CI, local configuration documentation, this plan and the design rationale. Create `docs/ui-redesign-execution.md` in the implementation worktree. No production application edits in this step.

- [x] Inspect repository identity, remote, branch and dirty state. Reuse a suitable attached worktree or create an isolated one from current verified main with branch `codex/metis-ui-redesign` (choose an unused descriptive suffix if necessary). Preserve all existing uncommitted/untracked work. Do not copy secrets or a live SQLite database into the new checkout.
- [x] Record the actual starting commit and differences from the inspected planning base. Recheck the named APIs, safety presenters, manifests and tests; update file references for harmless moves without weakening requirements.
- [x] Copy the plan, `docs/redesign-plan.md`, `docs/metis-ui-codex-goal.md` and its `.txt` copy into the implementation worktree, preserving their relative locations. Record the prototype location in the execution log; the production bundle must not depend on files in Downloads or the design workspace.
- [x] Install exactly from the lockfile with `npm ci` under Node 24, then read the relevant installed Next documentation required by AGENTS.md. Resolve environment problems without unplanned dependency upgrades.
- [x] Prepare an isolated preview database/data directory using existing fixtures. Set `METIS_DB_PATH` and `METIS_DATA_DIR` to those verified paths and `METIS_RESUME_ON_START=0` before booting the app. Follow the repository's actual config discovery rules; ensure it cannot fall through to the user's credential store or live database. Lack of API keys alone is not network isolation because keyless providers exist.
- [x] Use existing hermetic provider/test guards for automated tests. Browser generation checks must use a test-only harness or fixture provider boundary excluded from production builds. A timer simulation cannot establish that the production job controller works.
- [x] Start the execution record with task status, current commit, test commands/results, known baseline failures and next action. Update it after each task so another Codex session can continue without rediscovering completed work.

**Gate:** correct isolated repository and data paths recorded; user checkout unchanged; fixture preview cannot start paid or keyless live research. Existing failures are documented before migration changes.

## Task 1: Establish the preservation baseline

**Files:** inspect the existing manifests and tests; create `tests/helpers/uiParityContract.ts`, `tests/report.uiParity.test.ts`, and `docs/ui-redesign-parity.md` in the implementation branch. Reuse `tests/helpers/task28Report.ts` and existing issuer/currency/legacy fixtures.

**Interfaces:** `captureUiParityContract(report: Report)` produces a typed semantic inventory of required report surfaces using the existing manifests. It records section/assessment identities, numeric values and context, claim/evidence identities, warning/gap identities and export coverage; it does not perform financial calculations or flatten distinctions between data types.

- [x] Run the untouched baseline using the existing Node-24 workflow; record commit, environment, commands and failures before changing UI code.
- [x] Build a fixture matrix from existing canonical, data-only, low-evidence, stale, missing-currency, mixed-currency, wrong-issuer, legacy, negative-FCF, bank and REIT cases. Include long source IDs and long claims.
- [x] Add parity assertions against the existing live report, API projection, Markdown, print and audit surfaces at their existing disclosure levels. Confirm that deliberately removing an evidence identity, warning or numeric context causes failure; do not merely assert a count of 14 headings.
- [x] For each surface, compare independently extracted rendered content to the fixture's expected semantic inventory. Assertions must inspect accessible text/links/details and browser reachability where needed; hidden metadata or a duplicated invisible report must not satisfy missing visible content. Record intentional differences between export scopes rather than requiring each export to contain everything.
- [x] Freeze each input report before rendering; assert it is unchanged afterwards. For representative saved reports, record reportJson digests and compare after reading/navigating/exporting in the preview.
- [x] Add an explicit UI-change boundary check or review artifact listing changes outside presentation files. Any methodology or schema change requires a separate explanation and separate review.
- [x] Run the new parity test and relevant existing surface tests; commit the baseline separately.

## Task 2: Introduce a reversible presentation shell

**Files:** modify `src/config/env.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/components/shell.tsx`, `src/components/ui.tsx`, `src/components/watchlist/Sidebar.tsx`; extend appearance/config and watchlist cache-only tests. Document the new flag through the repository's config documentation process.

**Interfaces:** proposed `ThesisConfig.uiRedesign: boolean`, parsed from `METIS_UI_REDESIGN` with default false. Pass only this boolean to presentation entry points; never serialize server config. Preserve the existing `UiDesign` union and cookie independently. Use `data-ui-layout="classic" | "dossier"` to scope layout styles.

- [x] Add tests for default-off behavior, explicit on/off values, and correct server/client appearance alignment. The flag must not alter report selection or provider configuration.
- [x] Apply new tokens, typography, spacing, mobile navigation and density in dossier mode. Keep the classic layout available while validating.
- [x] Update `src/app/page.tsx` into the coverage desk using its existing saved/cached data dependencies. Retain empty-state add/search and settings access. Move detailed connection diagnostics into the existing Settings destination while keeping actionable missing-configuration status on the desk. Preserve cache-only loading and all coverage actions.
- [x] Preserve existing brand and canvas palette constants. Grade-specific colours must remain separate from price movement semantics; always display text labels.
- [x] Verify both flag states and both appearances with the existing appearance tests and representative page renders; commit.

## Task 3: Compose the full report and unified cover

**Files:** create `src/components/report/DossierCover.tsx`, `ReportContents.tsx`; modify `ReportView.tsx`, `sections.tsx`, `primitives.tsx`, company `ReportTabs.tsx` and page presentation, preserving the loader/controller boundaries. Extend `tests/report.uiParity.test.ts`, `tests/report.assessment.test.ts`, surface and company presentation tests.

**Interfaces:** `DossierCover({ report, completeness }: { report: Report; completeness: ReportCompletenessPresentation })` consumes the already safety-normalized report inside ReportView. `ReportContents` derives its targets from the shared section manifest and explicit availability, never a copied list.

- [x] Pin tests for rejected/limited/not-assessed grades, old reports lacking scores, stored analyst grades differing from deterministic bands, and all required warnings/claims.
- [x] Compose existing verdict, executive evidence, scorecard and disagreement content into one cover. Remove only repeated presentation after proving the underlying information has a retained destination.
- [x] Retain Report and Live Analysis as primary destinations; add an accessible Revisions entry to the existing history routes. Report shortcuts select existing sections without substituting abbreviated demo content.
- [x] Implement all-section navigation, a mobile jump control and current-section feedback. Preserve deep links, Back/Forward, tab keyboard semantics and chart mount/re-measure behavior. Unavailable projections get an availability explanation linked from the contents.
- [x] Test that full report content and legacy optional fields survive this composition, and that saved-report navigation performs no provider work. Run the relevant surface and company tests; commit.

## Task 4: Add source inspection as progressive enhancement

**Files:** create `src/components/report/EvidenceInspector.tsx`; modify `ClaimText.tsx`, `TracedNumberSourceDetails` in `primitives.tsx`, `ReportEvidenceRail.tsx`; extend `tests/report.evidenceDrilldown.test.ts` and add `tests/report.inspector.test.ts`.

**Interfaces:** the enhancement consumes source content already rendered from the selected snapshot. Evidence selection includes report identity and a stable item identity, not just an ambiguous source label. Native details remain the authority and fallback. The controller must clear selection when report identity changes.

- [x] Add assertions that the inspector and original disclosure expose the same source/period/value/verification context; the claim observation date must never be replaced by the snapshot date.
- [x] Implement one inspector controller for desktop pinning, mobile modal focus containment and return to the triggering element. Avoid per-claim hydration/state proliferation.
- [x] Keep gaps, unknown completeness and contradiction alerts visible. Add optional “expand all sources” and an evidence legend that uses the application's actual verification vocabulary.
- [x] Exercise no-hydration disclosure access, print/export access, keyboard open/close, route changes and 100+ claims. Run evidence and surface tests; commit.

## Task 5: Port visual analysis without substituting calculations

**Files:** create presentation components `src/components/report/FactorAttribution.tsx` and `CapitalBridge.tsx`; modify `sections.tsx`, `ValuationReview.tsx` and relevant chart presentation. Consume `auditTables.ts` and existing scenario/presentation helpers. Extend `tests/audit.scoringSensitivity.test.ts`, chart evidence tests and report parity tests.

**Interfaces:** factor graphics consume the existing admitted `factorContributionSensitivityTable(scores: Scoring): ReportAuditTable` result and must retain its unavailable state. Capital graphics consume the existing DCF bridge and the semantic labels in `valuationAuditTables`; every component retains its table alternative.

- [x] Pin reconciliation and unavailable-state tests before adding visuals. The stored base value, actual horizon, sensitivity conventions and effective family weights remain unchanged.
- [x] Render the factor-family contribution display, full capital bridge, stored thesis checkpoints and recorded scenario/sensitivity results. Preserve all ownership claims, signs, currencies, dates and share denominators.
- [x] Allow selecting existing sensitivity cells to inspect recorded assumptions and values. No interpolation or arbitrary recomputation from displayed rounded numbers.
- [x] Handle bank/financial and REIT routes through their existing applicable outputs; never display a general-company DCF simply because the design has a space for it.
- [x] Test selected cells, missing values, below-zero domains, tab remounting, resizing, source access and exact table/graph agreement; commit.

### Separate capability: arbitrary assumption editing

The demo's WACC/growth sliders are **not an existing production API**. The inspected application exposes precomputed sensitivity and valuation data; the API inventory has no scenario-recalculation endpoint. A production slider cannot be connected to the five-year demo model: the current general-company engine has `DCF_HORIZON_YEARS = 10` and additional domain/ownership rules.

Deliver the presentation migration with interactive inspection of recorded cells. Do not display nonfunctional custom sliders or count arbitrary scenario editing as completed. If arbitrary editing is included in the release scope, it becomes a separate required work package before claiming that capability is shipped:

- Define a typed, read-only scenario request tied to report ID and immutable input identity, using existing input snapshots and version compatibility checks.
- Reuse the existing valuation engine (`runDcf(DcfAssumptions, DcfRunOptions)` or the applicable route engine) without changing its algorithm. Do not reconstruct missing inputs from report text or rounded tables.
- Validate bounds and domain conditions through production rules; reject unsupported routes or missing/incompatible snapshots with a reason. No provider fetch or AI run is a fallback.
- Test that the unedited scenario reproduces the saved base result under its recorded method identity; preserve report bytes, headline assessments and costs. Show altered assumptions as an unsaved experiment.
- Do not pretend successful historical replay when the required implementation identity is unavailable. Keep the original snapshot readable.

This capability needs its own implementation contract after inspecting actual snapshot coverage. It is deliberately excluded from a presentation-only promise.

## Task 6: Wire real workflows and retain every export

**Files:** modify presentation around `GenerateReport.tsx`, watchlist components, `ReportTabs.tsx`, `ExportButtons.tsx`, history/diff UI and Settings. Add `src/components/report/RevisionDigest.tsx` consuming `ReportDiff`; use the existing report loaders. Extend existing API/export/stream/resume/settings tests and add `tests/report.revisionDigest.test.ts`.

**Interfaces:** `RevisionDigest({ diff, compareHref }: { diff: ReportDiff; compareHref: string })` reads the existing comparability result. Job UI remains driven by GenerateReport's accepted snapshots, not a new state machine. No changes to endpoint semantics are required for restyling.

- [x] Pin a revision digest test for comparable reports, incompatible specs, same-report selection, wrong issuer, and missing prior history. Do not imply numeric changes where the diff withholds them.
- [x] Restyle actual generation/progress/cancel/retry controls. Keep request fencing, duplicate-job attachment, SSE reconnection, terminal report validation and server-approved resume behavior. Keep the previous report accessible while work runs.
- [x] Wire search and watchlist actions through existing symbol validation and persistence. Every visible action must have a real success, failure, pending or inapplicable state; no demo toast may stand in for persistence.
- [x] Restyle Settings without omitting credentials, model/effort choices, unavailable-provider details or held-queue resumption. Preserve credential handling and same-origin protections.
- [x] Build the new export menu around existing Markdown, audit and print/PDF routes. Verify report ID/symbol and downloaded content. Treat new CSV/JSON formats as separately specified additions, not substitutes for audit data.
- [x] Test stream ordering/reconnect, tab and symbol switches mid-run, duplicate clicks, cancellation, permitted/refused retry, offline failures, persisted watchlist reload and all export routes. Run the relevant existing suites; commit.

## Task 7: Complete keyboard access, density and local notes

**Files:** create `src/components/CommandPalette.tsx`, `src/appearance/density.ts`, `src/components/report/ReportNotes.tsx`, `tests/commandPalette.test.ts`, `tests/appearance.density.test.ts`, and `tests/report.notes.test.ts`, unless refreshed source already has equivalent modules. Wire into the existing shell and report boundary. Extend `globals.css` without another theme provider.

**Interfaces:** `UiDensity = "comfortable" | "compact"`; `parseUiDensity(value: unknown): UiDensity` defaults to comfortable. A palette result has a stable identity, label and a real navigation/action target derived from current application state. Report notes receive the canonical `symbol` and selected `reportId`; use a versioned storage key that includes both. Display preference and note persistence must report failure rather than claim a successful save.

- [x] Pin tests for command search over actual watchlist entries and available report sections, no-match behavior, keyboard navigation, Escape and return focus. Ignore shortcuts while typing/composing or while a conflicting modal is active. Company additions use the existing validated action, not synthetic matches.
- [x] Implement the palette as one lazy client island. `/` and Ctrl/Cmd+K open it; selecting a section navigates to its real anchor, and selecting saved coverage opens the selected company. Show an explicit add-ticker action for an unknown symbol; never trigger report generation from ordinary search selection.
- [x] Pin and implement density persistence, corrupt/unknown stored values, blocked storage and reload behavior. Apply density only after safe preference initialization; avoid server/client markup mismatch. Confirm the semantic content inventory is identical in both densities.
- [x] Pin and implement local notes with issuer/report isolation, reload persistence, plain-text rendering, storage quota/permission failure and a visible unsaved state. Avoid debounce loss on report navigation; store on input or explicitly flush before switching. Distinguish local notes from generated research and exclude them from the immutable report/export by default.
- [x] Provide a visible non-keyboard way to open search, change density and access notes. Test overlapping inspector/palette interactions so only the active modal owns focus. Run the relevant tests and browser cases; commit.

**Gate:** every productivity control works against real application state and cannot silently change research, lose notes or obscure data.

## Task 8: Release verification and rollback

**Files:** `docs/ui-redesign-parity.md`, `.github/workflows/ci.yml` only if adding justified checks; production code changes should be limited to defects revealed by validation.

**Recorded acceptance scope:** checked items refer to the actual matrices and explicit rulings in the execution record. The 200% check uses desktop reflow emulation; browser CPU measurements are a hydration proxy; analyst tasks are scripted fictional walkthroughs; Windows/Ubuntu validation is local CI-equivalent. Native browser-menu zoom, direct React hydration timing, real analyst sessions and hosted CI are not claimed by these checks. All representative final print pages were visually inspected. These limits remain visible in the handoff.

- [x] Run the unchanged full `npm run verify` chain: dependency check, typecheck, lint, product tests, integration tests, core/risk coverage, production build and security audit. Preserve existing coverage floors. Run the current Windows smoke jobs as well as Linux CI.
- [x] In an isolated preview, exercise coverage → saved report → source → analysis → revisions → export → settings, and a fixture-backed generation/cancel/retry journey. Verify requests, authoritative responses and resulting state, not just button clickability. Record any separately authorized live-provider smoke check as live, not fixture coverage.
- [x] Compare the same frozen report through classic/dossier, both appearances, API, Markdown, print and audit. Require unchanged admitted financial values, grade eligibility, warnings, gaps and source identities. Review every intentional display-only difference rather than blanket-updating snapshots.
- [x] Test 320, 390, 768, 1024, 1440 and 1920 CSS-pixel widths; 200% zoom; long labels; negative values; many claims; all table columns; keyboard traversal; visible focus; drawers; reduced motion; light/dark contrast; empty/loading/failure states. Permit local table scrolling, not clipped data or horizontal page overflow. Render and inspect every representative PDF page, not merely PDF creation success.
- [x] Compare report-render time, client JS/hydration, provider request counts, chart behavior, scroll/focus stability and console errors against the baseline. Investigate material regressions instead of accepting a prettier screenshot.
- [x] Complete the preservation matrix with code location and test evidence for each row. A missing or placeholder row blocks a “fully wired” release claim.
- [x] Review the final diff specifically for financial/prompt/provider/schema changes and any weakened tests. Demonstrate opt-in in the isolated preview and record the build and parity results. Document default-on promotion as a separate release step after validation and representative analyst tasks succeed.
- [x] Verify rollback in the isolated preview by disabling the layout flag with unchanged saved report digests and no database migration. Document the launch-configuration change required for a later release; do not apply it to the user's live installation in this implementation goal.

## Verification commands and expected evidence

Run from the isolated implementation worktree. Confirm these scripts still exist at the refreshed base. Execute checks after a meaningful change, not repeatedly without a new reason. New semantic behavior should have a failing regression case first; purely visual styling is verified by renders and accessibility checks rather than tests that merely assert CSS class strings.

| Work package | Focused command or check | Expected result |
| --- | --- | --- |
| Baseline and report preservation | `npm run test:product -- tests/report.uiParity.test.ts tests/report.surfaceManifest.test.ts tests/report.surface.detail.test.ts tests/report.surface.completeness.test.ts tests/report.format.shared.test.ts` | Existing admitted values, units, claims, warnings and source identities remain available; intentional omission mutations fail the new parity assertions. |
| Shell and appearance | `npm run test:product -- tests/appearance.preference.test.ts tests/appearance.surfaces.test.ts tests/watchlist.cacheOnly.test.ts` | Both layout flag states and existing preferences work; saved coverage does not invoke providers. |
| Cover and evidence | `npm run test:product -- tests/report.assessment.test.ts tests/report.evidenceDrilldown.test.ts tests/report.inspector.test.ts tests/company.report.presentation.test.ts` | Eligibility/withholding preserved; inspector and native source disclosure agree; selected report identity remains correct. |
| Attribution and valuation | `npm run test:product -- tests/audit.scoringSensitivity.test.ts tests/audit.scoringEligibility.test.ts tests/charts.evidenceData.test.ts tests/charts.evidenceTable.test.ts tests/charts.missingObservations.test.ts` | Contributions reconcile or are withheld; chart/table values and missingness agree. Add the new capital-bridge assertions to the parity suite. |
| Jobs, history and exports | `npm run test:product -- tests/company.generateReport.stream.test.ts tests/company.generateReport.resume.test.ts tests/company.generateReport.unsupported.test.ts tests/report.revisionDigest.test.ts tests/report.history.export.test.ts tests/report.export.printHtml.test.ts tests/api.routes.export.test.ts` | Existing controller races, retry rules, comparability and selected-snapshot exports remain correct. |
| Settings and watchlist | `npm run test:product -- tests/settings.page.test.ts tests/settings.credentials.ui.test.ts tests/settings.writeQueue.test.ts tests/settings.resumeQueue.test.ts tests/watchlist.addTicker.test.ts tests/watchlist.removeButton.test.ts` | Persistence and errors are truthful; credentials remain protected; queues resume only through the existing explicit action. |
| Productivity | `npm run test:product -- tests/commandPalette.test.ts tests/appearance.density.test.ts tests/report.notes.test.ts` | Shortcuts, focus, content parity, report-specific notes and storage failures work. |
| Complete release gate | `npm run verify` | Dependency shape, typecheck, lint, product/integration tests, core/risk coverage, build and security audit all pass without weakened gates. |
| Windows smoke | `npm run test:product -- --maxWorkers=1` followed by `npm run test:integration` | Matches the existing Windows CI job; do not treat Linux-only success as Windows validation. |

Tests introduced by this plan will not exist until their task is implemented. Do not remove them from the plan merely because the baseline does not have them. Reuse the existing Vitest/happy-dom and hermetic test setup; use browser tooling for actual layout, focus, downloads and chart measurement rather than claiming static markup proves those behaviors.

### Required scenario matrix

| Input or event | Required observable result |
| --- | --- |
| Full canonical operating-company report | All sections, grades, values and source details survive both layouts; selected report exports are equivalent at their established scope. |
| Data-only / failed analysis | Existing data remains readable; synthesis and assessments are withheld where required; actual failure state is shown. |
| Legacy report without scoring metadata | No newly manufactured composite, factor decomposition or quality/price dimensions. Available historic content remains readable. |
| Low-evidence, rejected or neutral assessment | Same production eligibility and wording; no attractive badge that overrides a withholding reason. |
| Unknown/mismatched currency, missing shares, negative FCF | Appropriate unavailable state; no default USD, missing-to-zero coercion, false upside or clipped negative domain. |
| Bank/financial or REIT route | Applicable production valuation and evidence; no generic DCF substituted into the cover. |
| Stale observations and newer filings | Separate timestamps and existing stale/newer-results warnings survive the redesigned hierarchy. |
| Long text, 100+ claims, broad financial tables | Full text and every column reachable at narrow width and zoom; print can paginate; no whole-report duplication to satisfy tests. |
| Symbol/report navigation during SSE or inspection | No prior issuer source, run state or export identity appears under the newly selected report. |
| Duplicate generation, reconnect, cancel and retry | Actual server state controls behavior; duplicate work is not created; refused retry is explained. |
| Incompatible report versions or no prior report | No unsupported change percentage; explain comparability or no previous report and retain full history access. |
| Cookie/localStorage unavailable | Appearance remains usable; density uses a safe default; local notes visibly indicate unsaved data. |
| No hydration | Core report, links and native source details remain readable. Advanced controls must not masquerade as working. |
| Network failure | Last completed report remains available; requests fail truthfully; no success toast without persistence. |

### Browser and visual acceptance

Record browser/version, commit, fixture, viewport, theme, density and layout flag alongside each result. Check the representative full report at 320, 390, 768, 1024, 1440 and 1920 CSS px in both appearances. Exercise core workflows in both densities and use pairwise combinations for adversarial fixtures; record the actual combinations instead of implying an unexecuted Cartesian product.

For each primary flow, verify the browser action, API/controller response, persisted or selected state and rendered result. A generation test must include a queued or running state, a terminal result loaded through the existing endpoint, and a separate cancel/retry case. Clicking mocked buttons or watching animated steps is insufficient. Screenshots cannot prove provider isolation; use request observations and existing guards.

The representative analyst tasks are: locate the current report and quote dates; explain why a high-quality company can have an unattractive price; trace a displayed figure to its observation and source; identify an unavailable valuation input; inspect a recorded sensitivity result; identify a comparable revision; and export the report currently being read. Each task must be achievable without hidden controls or losing reading position. Record manual task walkthroughs now; analyst usability validation remains a separate default-on rollout gate if real analysts are not available during implementation.

Measure the same large fixture before and after on the same environment: server render, route client payload, hydration, opening evidence and changing sections. Five repeat samples after warm-up are sufficient for a local comparison. Investigate a median render regression greater than 20% and 50 ms, a client payload increase greater than 20 KiB gzip, new repeated provider requests or newly unstable chart/focus behavior. These are investigation thresholds chosen for this migration, not universal performance standards. Explain and fix unjustified regressions; do not hide them by changing the fixture or measurement method.

## Preservation ledger and delivery artifacts

Maintain `docs/ui-redesign-parity.md` as the auditable inventory. Give each existing capability or information family a stable row with: old location, new location, authoritative data/function, warning/missingness behavior, test or manual evidence, result and unresolved limitation. Include home, company, every report section, Live analysis, histories, exports and Settings. A row marked omitted, placeholder or unverified cannot support a fully wired claim.

Maintain `docs/ui-redesign-execution.md` with task status, base/current commits, decisions, exact commands and observed results, review findings and next action. Link screenshots, representative A4/Letter PDFs, downloaded export checks and performance measurements under a documented artifact location. Do not commit credentials, personal research databases, provider responses containing secrets, dependency caches or bulky generated build files.

The final handoff includes:

1. A concise change summary and the actual branch/commit or draft PR, with a preview URL and exact enable/disable instructions.
2. The completed preservation ledger and the final test/CI evidence, distinguishing baseline failures, remaining failures, fixture coverage and any authorized live verification.
3. Representative desktop/mobile images, inspected print output, keyboard/contrast findings and measured performance comparison.
4. A review focused on regression risks, financial meaning, stale identity races, missing content and unconnected controls; resolved findings and any remaining limitations.
5. A rollout/rollback note that identifies the build, layout flag, unchanged appearance cookie, unchanged data location and lack of required database migration.

## Rollout and completion boundaries

The new layout flag defaults off while the change is reviewed. The isolated preview enables it, and tests cover both states. For a controlled rollout, enable the same tested build for the intended local installation or deployment only after explicitly authorizing that operational change. Observe the representative workflows and logs, then consider making the new layout the default. Keep classic available through the initial rollout.

Rollback restores the flag to off using the deployment's existing configuration mechanism and restarts/redeploys only as that mechanism requires. It must not run migrations, rewrite report JSON, clear credentials or resume jobs. Verify a previously saved report and its exports before and after the toggle.

If a required check cannot run, preserve the implementation and evidence, diagnose feasible alternatives, and clearly report the exact blocker. Do not call the release ready, skip the gate, reduce coverage thresholds, hide failing assertions or change financial outputs to obtain green tests. A failure already present on the baseline is evidence to report, not evidence that it has become safe to ignore.

## Definition of done

The implementation goal is complete when Tasks 0–8 are finished, every preservation row is accounted for, existing production checks pass, meaningful new parity/workflow checks pass, browser/print verification finds no missing or clipped information in the recorded matrix, review findings are resolved, and the layout can be reverted without changing research data. The final code is reviewable and the preview works. Merging, deployment, default-on promotion and real analyst validation are separate release actions and must not be represented as completed by this goal. Arbitrary scenario editing is complete only after its separate capability contract is implemented and validated; it is excluded from this migration.

The prototype's 23 mathematical tests and browser checks are useful prototype evidence. They do not establish production integration, financial equivalence, or that every production feature is implemented. A zero-regression guarantee cannot come from appearance alone; it requires the recorded evidence above.

## Codex execution handoff

Use the companion [Codex goal prompt](../../metis-ui-codex-goal.md) to start implementation. The prompt authorizes scoped implementation and verification, carries the financial guardrails, and defines the finish line. The implementation and its verification are recorded in the linked execution record; use that current state before starting further work.
