# Metis research workspace — design and implementation plan

Purpose: make a report easier to read, challenge, and trace without removing research depth. This is an independent, local interactive design prototype; it does not change the production repository or financial methods.

## Refinement after reviewing the Anthropic concept

Reviewed the user's screenshot, the local `Downloads/metisredesign/metis-redesign-demo.html` implementation, and its UI redesign specification. Those artifacts are references, not instructions or validated research data. Their strongest contribution is the relationship between the verdict, weighted scorecard and nearby provenance. The two concepts use different illustrative financial fixtures; their numbers are not interchangeable.

The revised executive cover puts concrete, inspectable financial observations and the base estimate beside all seven factor scores, grades and weights. The 50-point marker exposes the reference point. Selecting a row opens its existing factor drivers. This moves primary information into the first screen instead of requiring a separate trip to the factor page. The duplicate overview score list becomes the supplied bull/bear debate, retaining its unverified status.

The design keeps Carbon and Paper as two appearances of the same layout, raises small labels to at least 11 px in the checked report surface, and uses 14 px analytical prose. Grade colours are distinct from positive/negative price changes, with letters and numeric scores always visible. Motion is brief and functional; the reduced-motion setting removes animation and transition effects.

Export is now a native disclosure with explicit scopes: complete-report print/PDF, financial CSV, or current research manifest. Browser history and report section deep links work. The evidence drawer retains keyboard focus and restores it to the originating figure. Missing share inputs continue to withhold per-share value; data-only reports withhold unsupported grades and synthesis.

Research informing these choices:

- [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) supports presenting essential information first and making secondary detail available on demand. The application here is to keep thesis, grades and gaps visible while moving raw transformations into inspection.
- [W3C: Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) informs the 320 CSS-pixel checks and separate scrolling for two-dimensional tables. This is a targeted check, not a complete WCAG conformance claim.
- [W3C: Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) informs visible keyboard focus, header clearance for report anchors, and focus restoration after inspection.

Evidence of improvement is bounded: the revised cover exposes seven weighted factors immediately, every displayed cover figure has an inspection path, and the tested mobile surfaces reflow. No analyst usability study has yet compared task completion times or error rates. “Best possible” cannot be established by visual inspection. Before production integration, test locating a missing input, explaining a score, challenging a valuation assumption, tracing a claim, and comparing revisions with actual users.

## Design decision

Use neutral carbon for the focused research workspace and warm paper for sustained reading and print. Retain the supplied Metis artwork and restrained bronze accent. Serif is reserved for company names and thesis headlines; sans serif handles analytical reading; tabular numerals handle figures. Prefer aligned open ledgers and horizontal rules to nested cards. At desktop size, keep coverage on the left, the report in the center, and evidence on the right. On smaller screens, move navigation and inspection into accessible disclosures or dialogs.

The reference demos provide useful ideas, but their figures are illustrative and must not be promoted to verified observations. In particular, the quantitative grader fixture's stated composite does not reconcile to its supplied aspect weights. The prototype will calculate its displayed illustrative composite, label the arithmetic, and distinguish it from the production engine.

## Workflow and scope

1. Overview: coherent company masthead, dated snapshot, unified thesis and assessment dimensions, scenario range, operating history, seven grades, visible review conditions.
2. Valuation: an explicitly illustrative, internally consistent FCFF model; editable discount and terminal growth assumptions; scenario selection; EV-to-equity bridge; sensitivity table; reset; no silent changes to the stored report.
3. Factor analysis: seven aspect grades, underlying supplied subfactors, exact points-versus-50 decomposition of the illustrative aspect blend; neutralization is arithmetic dependence, not a new rating.
4. Financials and full report: readable ledgers and all 14 sections from the production section manifest. Unavailable data stays unavailable.
5. Revisions: comparable illustrative snapshots and an incompatible-version state that withholds deltas.
6. Sources: citation presence, numeric verification, freshness and completeness displayed separately. Pinned inspector retains reader position; no invented SEC accession IDs or verification claims.
7. Coverage, search, keyboard command palette, theme, density, local notes, print, download, and simulated run states.

## Guardrails

- All market figures are supplied or authored demo fixtures, not live market data. No real API connections, AI runs or transactions.
- No external font, script or image requests at runtime. Preserve logo proportions and license attribution.
- Keep source gaps, model disagreements, data-only and stale states visible. A missing denominator withholds fair value.
- Keep all 14 report anchors and the Report evidence and gaps landmark. Checkpoints initiate review and do not mechanically invalidate a thesis.
- Source and model calculations are inspectable. Evidence availability is not correctness or predictive confidence.
- Keyboard access, native controls, visible focus, reduced motion, touch targets, responsive reflow, and print readability.

## Implementation

- [x] Create self-contained prototype in metis-prototype/ with index.html, styles.css, app.js, model.js, fixture data and local original brand assets.
- [x] Implement the coherent workspace and full core interactions.
- [x] Verify model reconciliation, sensitivity, missing-data handling, and neutralization arithmetic with Node tests.
- [x] Run browser checks for navigation, source inspection, valuation updates, theme, density, revisions, command palette and narrow layout; inspect rendered screenshots and console.
- [x] Produce a portable HTML and a concise research/verification handoff.

## Production integration sequence

First change presentation tokens and typography behind the existing current/workspace appearance contract. Then compose the report cover using existing completeness and safety presenters. Add desktop evidence inspection as progressive enhancement over native details. Use auditTables.ts outputs for production bridges and factor-family decomposition; never replace the engine with this prototype's simplified math. Add revisions through the existing ReportDiff comparability contract. Retain exact chart palette constants, source manifest, IDs, report anchors, print content and data-only warnings. Validate existing Vitest appearance, format, report-surface and diff contracts plus keyboard and browser journeys before shipping.

The detailed [production integration plan](superpowers/plans/2026-10-24-production-ui-integration.md) supersedes this short sequence for implementation. It maps existing APIs and components, preserves Markdown/audit/PDF exports and Live Analysis, and adds release gates for semantic parity, real workflow behavior, responsive layout and rollback. Its baseline commit was checked against remote main on 24 October 2026.

After considering the additional `Metis Redesign Demo.html`, the production proposal adds a comparable-report change digest, complete 14-section navigation, and a persistent server-driven run panel. Primary navigation remains Report / Live analysis / Revisions; the standalone prototype's six research tabs should not displace those workflows. The new HTML's implementation matches the local Anthropic reference apart from its export wrapper at review time. These are proposed production refinements; the current standalone prototype was not changed during this planning review.

Arbitrary custom-assumption sliders require a separate production capability contract. Inspection of recorded sensitivity cells can be implemented now against stored report outputs; the demo's simplified five-year model must never substitute for the current production valuation engine and its method/route-specific rules.

## Research used

- Repository and brand: https://github.com/eligorelick/Metis and docs/BRAND.md.
- Source contracts: src/report/auditTables.ts, thesisTriggers.ts, diff.ts, sectionManifest.ts and src/components/report/ReportView.tsx (read 24 Oct 2026).
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ — contrast, focus, target sizing and motion informed the prototype; this is not a conformance certification.
- Bloomberg research workflow: https://professional.bloomberg.com/products/bloomberg-terminal/research/research-management-solutions/ — centralized research and connected evidence, not visual imitation.
- User-supplied metis-demo.html, metis_institutional_equity_research_quantitative_grader.html and current-interface screenshot.

