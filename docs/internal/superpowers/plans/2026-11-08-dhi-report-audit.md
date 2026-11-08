# DHI report audit and repair plan

> **For agentic workers:** Use systematic debugging, failing-first regression tests, and verification before completion. The user has authorized audit, repair, and verification in this session.

**Goal:** Explain the missing DHI grades and other confirmed report defects, repair their general causes, and verify preservation of unrelated behavior.

**Architecture:** Preserve immutable stored reports and frozen inputs. Repair source admission and extraction before downstream scoring; retain evidence floors and financial refusal rules. Compare current-method computations from frozen inputs separately from newly authored research.

**Tech stack:** TypeScript, Next.js 16.4.2, Vitest, Node 24.11.1, read-only SQLite inspection.

**Spec:** The user's request in this session; CONTRIBUTING.md's evidence, synthetic-fixture, and historical-compatibility requirements.

## Constraints and review focus

- No issuer-specific rules, guessed borrowing costs, changed dependencies, or weakened grading floors.
- Real reports, provider data, and diagnostic outputs stay in ignored local storage.
- Test matching revenue concepts and conflicting sales subtotals; wrong filing, currency, and duration must not confer scope.
- Test annual guidance with full-year phrasing while retaining period and accounting distinctions.
- Verify interest-cost evidence separately from operating EBIT and cash interest.
- Check confirmed earnings dates against retained primary sources, including tabular schedules.
- Preserve original report and snapshot hashes. Existing report narratives must not be relabeled as newly authored after calculations change.

## Tasks

1. [x] Reproduce the original score from the frozen bundle; inspect stored run stages and PDF.
2. [x] Add synthetic regression tests for a primary statement confirming a broadly named revenue concept; run failing, correct `operatingRevenuePolicy` in `src/edgar/revenueAdmission.ts`, rerun neighboring revenue and financial tests.
3. [x] Audit capitalized borrowing costs and repair only if period/scope evidence supports it; otherwise document the remaining valuation limitation.
4. [x] Independently audit narrative/extraction and repair confirmed guidance/schedule defects with synthetic tests.
5. [x] Update relevant stamps, method documentation, and release documentation list. Compare frozen computation and render/export paths, preserving original bytes.
6. [x] Run full repository verification, review the final diff independently, resolve findings, and report exact evidence and limitations.

Completed evidence and remaining research limits are recorded in [the audit](../../../audit/2026-11-08-dhi-report-4.md). The full Node 24 gate passed; original report bytes and financial control values are preserved. No new analyst run or deployment is included.
