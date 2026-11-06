# EXPE report #1 repair implementation plan

> **For agentic workers:** Use superpowers:executing-plans task by task. Independent scoped tasks may use superpowers:dispatching-parallel-agents. Each repair starts with a failing behavioral regression.

**Goal:** Correct every confirmed defect in report #1, preserve evidence-based refusals, verify the integrated result, and merge PR #111 to main after checks pass.

**Architecture:** Keep financial normalization, optional public evidence, analyst research and presentation separate. Optional research failures degrade evidence coverage without relaxing financial admission, accepting unfinished output or changing the user's provider/billing choice. Source excerpts retain exact lineage and qualifiers.

**Tech stack:** TypeScript, Next.js 16.4.2, Zod, SQLite, Vitest; Node 24.11.1 for the installed native SQLite ABI.

**Spec:** [Complete issue inventory](../../../audit/2026-11-06-expe-report-1.md), including F01–F06, P01–P06 and G01–G46.

## Global constraints

- No paid financial-data subscription is required; useful configured API responses retain priority.
- No ticker-specific branches, guessed numbers, source-control secrets or edits to saved report/snapshot bytes.
- Do not weaken source identity, dates, economic rights, ownership, disclosure completeness or SSRF protections.
- All local cancellation, failed-request usage and source limitations remain inspectable.
- Root owns version stamps, release manifests, documentation, full verification and GitHub integration.

## Review focus

1. A locally limited optional search must not allow auth/policy/quota/user-abort failures to launch another request (Task 1).
2. Unknown research usage and completed actions survive writer success/checkpoint reuse without false consumption or accepted-source claims (Task 1).
3. Signed NCI, wrong-period/currency facts, restatements and partial cash components cannot turn into compatible earnings/capex (Task 2).
4. A continued ownership table must retain every local footnote and reject unrelated tables/sections (Task 4).
5. Data-only and completed reports must agree about dates, missing evidence, neutral model inputs and absent analyst assessments (Tasks 2–3).

## Task 1: Bounded optional research and truthful execution

**Files:** `src/ai/transport.ts`, `src/pipeline/stageC/{passes,index,prompts}.ts`, `src/pipeline/jobArtifacts.ts`, `src/pipeline/jobRunner.ts`, `src/report/{execution,schema,presentation}.ts`; focused AI, Stage C, execution and runner tests.

**Interfaces:** Add an optional typed research limitation to retained research and execution metadata. Preserve all existing stored-report defaults. Only allow a same-provider tool-free writer after explicit local action/time limits or an explicit unsupported search capability; other failures retain their current path.

- [x] Reproduce the report's eight completed actions followed by ninth-action cancellation; assert incomplete notes/URLs are never passed to the writer.
- [x] Add negative regressions for quota, policy/auth, malformed metadata, upstream truncation and user abort; no writer/research retry may launch.
- [x] Add checkpoint, missing usage, source-count and failed-writer accounting regressions.
- [x] Implement typed limitation, bounded prompt, controlled writer continuation and report/manifest disclosure.
- [x] Correct never-launched bear and discarded-attempt wording (P03/P04); use recorded usage evidence.
- [x] Run focused transport, Stage C, artifact, execution, renderer and job-runner suites.

## Task 2: Financial scope, dates and qualification

**Files:** `src/edgar/{incomeClassification,financialEnrichment}.ts`, `src/pipeline/{compute,filingDisclosures}.ts`, `src/pipeline/stageB/capital.ts`, `src/pipeline/stageC/{dataOnlyReport,passes}.ts`, `src/report/{sourceFacts,sourceFactPresentation,financialDiagnostics,thesisTriggers}.ts`; relevant financial regressions.

**Interfaces:** Existing filed facts/provenance and refusal fields remain authoritative. Consumers choose a documented earnings scope; missing compatible consolidated earnings withhold consolidated conversion. Quarterly capex uses independently comparable direct/difference facts, not sign normalization as proof.

- [x] Reproduce the Q3 ownership bridge and mixed TTM conversion (F01); pin correct signed NCI handling and scope refusal.
- [x] Reproduce the misplaced cumulative Q3 capex (F02); accept only a proved standalone value or withhold dependent FCF. Preserve correct TTM reconstruction.
- [x] Audit all G01–G39 gap families; recover only directly demonstrated compatible observations, including remaining SBC quarters if safely provable. Document retained gaps explicitly.
- [x] Correct WACC/current valuation and TTM debt-cost dates without changing numeric inputs solely for date repair (F03).
- [x] Show Beneish neutralization/clamping and proxy limitations without changing scoring conventions (F04).
- [x] Correct weighted-average share and blocked-guidance linkage wording (F05/F06).
- [x] Run focused financial/ownership/cash-flow/forensic/financial-route suites; replay exact frozen inputs into separate artifacts and inspect intended deltas.

## Task 3: Reader presentation and factual coverage

**Files:** `src/edgar/segmentFacts.ts`, `src/report/{filingDisclosurePresentation,readerConventions}.ts`, `src/report/export/{markdown,printHtml}.ts`, applicable report components, and roster block in `src/pipeline/stageC/dataOnlyReport.ts`; targeted export/UI tests.

- [x] Decode numeric XML entities as safe text at the segment-label boundary (P01).
- [x] Put segment/event extraction limitations beside the affected material; reserve management-guidance notes for actual guidance (P02).
- [x] Keep the factual executive roster with explicit bounded omissions and no fabricated grades; preserve CEO/chair even when provider order places them last (P05).
- [x] Distinguish no completed analyst peer comparison from no fetched peer evidence (P06).
- [x] Show the existing operating-EPS withholding reason instead of an empty forecast table; distinguish unavailable peer inputs from mathematically non-meaningful ones where the recorded basis supports it.
- [x] Verify shared presentation, Markdown, print and UI consistency without changing original saved reports.

## Task 4: Complete bounded proxy ownership evidence

**Files:** `src/providers/publicGovernance.ts`, `tests/providers.publicGovernance.test.ts`, and public-evidence payload tests if needed.

- [x] Reproduce the actual caption/header and adjacent continuation structure using a small source fixture.
- [x] Admit one source-owned ownership block spanning compatible continued tables, complete as-of/class/voting headers and local footnotes (G41).
- [x] Refuse incomplete qualifiers, ambiguous/hidden/competing tables, cross-section continuation and over-budget blocks.
- [x] Verify source hash/offsets and payload admission. Keep proxy ownership distinct from comprehensive 13F statistics.
- [x] Confirm existing SEC earnings-release payload coverage (G42); do not add a duplicate collector. Document unresolved transcript/IR coverage honestly.

## Task 5: Integrated release and merge

- [x] Review all changes and address concrete findings; reconcile each issue and remaining gap in the inventory.
- [x] Bump report/payload/Stage B/Stage C versions for changed meaning; update pinned version tests, method docs, changelog, audit decision/delta ledger and fictional sample. Do not blindly regenerate numeric goldens.
- [x] Run `npm run verify` under Node 24; require dependency shape, typecheck, lint, integration, core/risk coverage, production build and dependency audit to pass.
- [x] Compare retained-input financial replay before/after; verify refusals and unaffected route fixtures. Run a bounded same-account live research smoke if feasible; record its exact limits and result.
- [x] Commit scoped changes, update PR #111 with outcomes and validation, push and immediately link the PR.
- [x] Audit tracked/new files for private data and unused additions; exclude local generated/session files and enforce the release boundary even for force-added artifacts.
- [ ] Satisfy required GitHub checks/reviews, resolve actionable comments, and merge to main. If checks remain pending, watch the PR for automatic continuation rather than poll.
- [ ] Confirm merged commit/main state; report fixes, remaining evidence limitations and verification to the user.
