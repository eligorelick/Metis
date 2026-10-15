# Enterprise-value integrity audit implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Preserve the original report and reproduce each defect before changing production code.

**Goal:** Make financial bridges reject contradictory input components consistently, and assess the application's readiness with reproducible evidence.

**Architecture:** Retain the existing financial definitions and valid-input results. Apply the existing net-debt integrity boundary to current and historical enterprise values, and share a narrowly scoped lease/debt reconciliation rule across the consumers that remove operating leases. Missing inputs and external provider restrictions remain visible.

**Tech stack:** TypeScript, Next.js 16.3.8, Vitest, SQLite, Node 24, Windows.

**Spec:** The audit scope below is the acceptance specification.

## Global constraints

- Preserve the initial AMZN report; never rewrite report history or substitute a model/provider.
- Treat unavailable licensed data, stale-source disclosures, and uncalibrated grades as reliance limits rather than invented code defects.
- Preserve the existing operating-versus-finance lease definition for valid, compatible inputs.
- Do not publish account identifiers, credentials, local configuration, or the user's report in Git.
- Check provenance/freshness, period/currency/unit alignment, missing versus zero, issuer identity, formulas, assumptions, citations, unsupported claims, failures/cancellation, exports, and visible error honesty.

## Review focus

- A combined cash field contradicting its components must not produce an EV multiple after net debt has correctly refused it.
- Negative debt must not become a lower EV or higher equity value.
- Operating/total lease liabilities cannot exceed their containing debt totals or be normalized from invalid negative values silently.
- Historical EV observations must obey the same integrity rule as the current EV.
- Genuine zero cash/debt, valid net cash, missing lease disclosure, currency gates, and financial-company suppression must retain their existing behavior.

## Tasks

### 1. Establish baseline and reproduce

Files: `tests/stageB.enterpriseValueIntegrity.test.ts`, existing valuation/current-capital/net-debt suites.

- [x] Run existing product tests with no provider network access.
- [x] Add full `runStageB` regressions for conflicting combined cash, negative debt, impossible lease nesting, and valid controls.
- [x] Observe the intended assertion failures before production changes.
- [x] Add historical EV coverage so an invalid observation cannot enter its own-history band.

### 2. Enforce common integrity boundaries

Files: `src/pipeline/compute.ts`, `src/pipeline/stageB/valuation.ts`, `src/pipeline/stageB/netDebt.ts`, `src/pipeline/stageB/currentCapital.ts` (only those proven necessary).

- [x] Preserve component cash evidence when building current/historical valuation inputs.
- [x] Use the existing net-debt resolver rather than duplicating unchecked debt-minus-cash arithmetic.
- [x] Reconcile any removed lease slice with its containing totals; withhold unsupported adjusted values and disclose why.
- [x] Run targeted tests, then the full suite; review valid-case differences before accepting any change.

### 3. Verify and publish

Files: final audit record under `docs/audit/`; only necessary implementation and regression files.

- [x] Critically audit the preserved baseline report independently of generated conclusions.
- [x] Run dependency checks, typecheck, lint, product/integration tests, coverage, production build, and dependency security audit.
- [x] Run a clean isolated Windows smoke with synthetic/data-only inputs and no unrelated queued work.
- [x] Obtain independent code review; resolve confirmed important findings.
- [x] Prepare narrowly scoped reviewed changes and document exact checks, limitations, and readiness. Publication is tracked separately by the Git branch and pull request.

The audit also reproduced and corrected generic quarterly cash-flow extraction,
signed equity-method context, bounded material filing selection, explicit money
scale/precision and verification presentation defects. Each had failing-first
regressions, valid controls and independent review. See
[`docs/audit/2026-10-15-amzn-integrity.md`](../../audit/2026-10-15-amzn-integrity.md)
for completed evidence and reliance limits.
