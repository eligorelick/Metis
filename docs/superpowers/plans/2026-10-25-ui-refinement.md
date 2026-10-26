# Metis UI refinement implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks in this session. The user authorized routine implementation decisions and requested a finished local branch; no additional design approval is needed.

**Goal:** Make the existing persisted research workspace readable and explicit about report identity, evidence and limitations, with preserved analytical data and capabilities.

**Architecture:** Refine shared presentation functions and existing server-rendered report composition. Keep native disclosures, all fourteen anchors, source inspection, classic layout and independent Ink/Ivory/density preferences. No financial, schema, provider, prompt or routing changes.

**Tech stack:** Next 16.4.2, React 19, TypeScript, existing CSS/Tailwind and Vitest.

**Spec:** User's 2026-10-25 refinement request; existing BRAND.md and UI preservation ledger. Verified base `38f832951614a878ff4a80db5f645048c8025818`.

## Global constraints

- Leave port 3000, the original/redesign checkouts, live SQLite database and credentials untouched.
- Read live records using read-only SQLite; validate against an isolated copy, scrubbed profile, outbound guard and unused ports.
- Preserve raw report bytes, analytical values, eligibility and confidence gates. Export changes are presentation-only and separately inventoried.
- Do not run paid models, refresh live providers, push, merge or deploy.
- Use recorded/stubbed inputs for controllers. Keep unknown actual models and usage unknown.

## Review focus

- Historical identity: company, sidebar grades, selected history, sources, notes and exports must clearly identify their own saved run.
- Data-only and missing metadata must never read as completed analyst research.
- Equivalent evidence percentages use one decimal, while threshold eligibility uses original precision.
- Manifest grouping, expected/info entries and analysis-process issues must reconcile without deleting any raw entry.
- Small/zoomed screens and expanded source details must reflow; sticky navigation must leave focused destinations visible.

## Approach and diagnosis

Retain and reorganize the implemented dossier. A new prototype would duplicate working capabilities; a CSS-only pass would leave contradictory trust/identity contracts. Shared presentation changes plus a compact top ledger address both within the existing architecture.

Fresh Chrome 1920×855 captures: MU #46 conclusion top 596px company / 446px saved, Key Data 3486px / 3350px. Both headings/exports exist; no page horizontal overflow. Supplied MU download hashes match. Root causes include duplicate route wrappers/action rows, full factor/debate/checkpoint content above Key Data, small divergent presenters and metadata confirmation used as a public completeness label.

### Task 1: Shared trust and provenance contracts

- [x] Add failing tests for degraded/unknown/data-only labels, 31/36 and 14/15 reconciliation, analysis.llm process classification, provenance-based synthetic notices, numerical matching wording and precision near the evidence floor.
- [x] Implement pure presentation helpers; change no completeness calculation, score or persisted schema.
- [x] Apply consistent vocabulary to report metadata, rail, body, Markdown and audit/print exports. Retain precise values and per-pass unknowns in details.
- [x] Run focused presentation/completeness/assessment/export/parity tests and commit.

### Task 2: Report identity and first screen

- [x] Add regressions for selected report identity and latest-report watchlist grades/history selection.
- [x] Share a concise saved snapshot identity presentation across company/saved routes. Consolidate notes and idle generation controls, preserving active progress/errors/cancel.
- [x] Put existing key-financial rows and quality/price/evidence dimensions near the conclusion with trust/caveats adjacent. Keep full Key Data linked and available.
- [x] Move factor attribution, assessment rationales, checkpoints and debate below the ledger into labeled native disclosures with direct anchors. Retain full synthesis as a safely readable fallback because it is an unstructured string.
- [x] Run route, history, notes, generation and content parity regressions and commit.

### Task 3: Readability and graphics

- [x] Raise analytical prose to 14–16px; supporting dense metadata to 12–13px where appropriate. Bound line lengths and wrap long identifiers/values.
- [x] Keep one sticky strip with selected identity/current section and assessment shortcuts; move technical grade/band codes to reachable details.
- [x] Give score bars a visible shared 0–100 scale/50 marker and factor chart signed bounds/zero axis. Retain full tables, negative/zero/missing behavior and stored-grid sensitivity rules.
- [x] Reduce empty inspector/nested scrolling; validate focus and responsive geometry.
- [x] Run component/interaction and palette tests, then commit.

### Task 4: Evidence and release validation

- [x] Compare exact MU #46 company/saved, classic/dossier and Ink/Ivory; DEMO #3/#13 and existing adverse/specialized fixtures. Capture before/after inventories by report path/identity and assert preserved input digests.
- [x] Check 1920/1440, 1280×720, 768, 390, 320 CSS px, 200% equivalent reflow and reduced motion (native browser zoom remains unverified), expanded sources, section jumps, keyboard workflows and exports/error handoff.
- [x] Verify actual nonempty MD/audit files and print/PDF sections/overflow without a physical printer. Exercise isolated recorded/stubbed operational flows.
- [x] Run typecheck, lint, relevant tests and unchanged full npm run verify; retain exact logs and honest platform/check limits.
- [x] Request one independent whole-branch review, resolve material findings, leave local commits, preservation matrix, screenshots, verified/unverified list and rollback instructions.

## Execution record

Evidence and isolated-runtime locations are recorded in the local handoff, outside Git. Branch: `codex/metis-ui-refinement` in a managed worktree. The original checkout and running service remain separate.

Ruling: use full recorded synthesis with smaller reading typography rather than parse label/citations from an unstructured string; this preserves every qualifier, with the cost that legacy literal prefixes remain visible.

Ruling: reuse existing fixture records and a read-only extracted MU #46 in a new isolated database; do not touch the older validation runtime, whose fixture IDs have their own history.

Tasks 1–3: implemented in `48bbe35`; new trust/reading regressions observed failing before the changes and passing afterward. Baseline focused suite passed 69 tests. The first full product attempt found outdated copy assertions and the release document allowlist; expectations were updated only for authorized presentation changes. Financial assertions, eligibility and coverage floors remain unchanged. Reader-only composite formatting was separated from generation-facing `compositeDisplay`, retaining the prompt/data-only generation contract.

Fresh review of `38f8329..b03c863`: two Important findings accepted. The contents observer did not fire at every sticky-edge crossing; a scroll/rAF update now accompanies the observer. Selected row identity did not reach legacy sticky/exports; optional presentation context now carries the authoritative row ID without changing embedded metadata or persisted bytes. Both mechanisms have reproducing RED tests and focused GREEN checks, including absent/conflicting embedded IDs. The review's corrupted scale text was regraded as an explicit scale-label contract defect and corrected in the same pass.

Ruling: analytical revalidation remains outside this UI change, as requested; inherited financial/model limitations remain. Browser, print and operational evidence are mandatory separate checks because static review cannot establish them.

Task 4 is complete with the explicit native-zoom and assistive-technology boundaries in the review handoff. Final application commit e9ff206 passed the full unchanged npm run verify: 8841 product tests, 4 integration tests, both coverage floors, build and security audit (0 vulnerabilities). Three intentional platform/live-network skips remain. The final seven-check browser closure and 17-check portable reading regression passed. Earlier failed attempts are retained. No tests, timeouts or coverage floors were weakened. The review handoff records screenshots, the preservation matrix, actual files, native reading fixes and rollback instructions.

## Public-readiness repair plan

The follow-up audit reproduced two trust-presentation edge cases and a classic reconciliation link without a target. The user authorized repairing all findings and preparing local commits for public-main integration. Existing development branches and the other checkouts remain intact; publication uses a separate branch whose parent is the verified public main and whose initial tree equals the sanitized final implementation tree. Public commits use the existing GitHub noreply identity.

- Add RED regressions for a low-evidence valuation headline, missing/partial qualitative partitions, and the classic reconciliation destination. Preserve all recorded values and MU's established 36/121 numeric partition.
- Keep the cover's valuation letter subject to the existing evidence gate. Retain the raw recorded band in the audit. Share a conservative numeric-claim partition presenter across trust rows, headlines and audit exports; absent partition evidence stays unknown.
- Reuse the native reconciliation disclosure in the classic Appendix, with one destination per layout and correct focus/scroll clearance. Keep raw gaps and grouping explanations reachable.
- Remove the extra documentation EOF blank line. Run focused tests, static checks, independent review, the unchanged full verification gate, and isolated browser/export checks for the repaired paths.
- Scan every new publication commit for private paths, credentials and artifact files. Rehearse integration with the other main checkout without modifying its index, files or branch. Supply local merge instructions and evidence; do not push, merge or deploy.

Review boundaries: do not infer numeric denominators from uncited or contradicted qualitative claims; do not promote a partial single-signal valuation; do not duplicate disclosure IDs; do not change financial engines, providers, schema or stored report bytes. Prior toolchain notices remain distinct from actionable UI/publication findings.

Repair regressions reproduced eleven failures before implementation. The focused reading/trust/export group then passed 145 tests, the release and coverage contracts passed 22 tests, and TypeScript/ESLint passed. Original report values remain unchanged. The numeric partition presenter is included in the existing risk coverage gate; no thresholds were reduced. The first release-contract attempt correctly rejected the not-yet-staged test file; staging the new source/test files resolved its tracked-test inventory mismatch without changing the guard.
