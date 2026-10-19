# Research safeguard implementation plan

Baseline: `65ed563850849269cea7f4f020a4f9412146750b`. This stage enforces existing contracts and describes calculation conventions. It does not recalibrate investment scores or promise forecast accuracy.

## Design and acceptance

1. **Grade contract.** Validate each proposed section and strip grade against the existing deterministic band using the ordered bands A, B, C, D, F. A change exceeding one band, conflicting strip/section proposals, or a change without an explicit structured reason and admitted cited reasoning is rejected. Retain the proposed letters and reason for audit, withhold rejected headline assessments on every surface, and publish a versioned validation record. Citation admission establishes source identity, not full semantic truth. Missing deterministic bands and limited evidence continue to withhold assessments.
2. **Runtime identity.** Extend the existing input-snapshot custody fields. Bind a production build to retained compiled-server artifact digests and captured methodology/dependency identities. Ordinary run capture uses that build's identity without rereading mutable source code as though it were the running build. Missing or inconsistent build evidence remains identity-incomplete. Existing snapshot and replay checks, redaction and deterministic Stage B behavior remain intact. This is local content identity, not external attestation.
3. **EPS definition.** Preserve the complete-quarter diluted-EPS sum. Label the convention at its calculation and valuation use. Use synthetic share-count-change, loss and consistently split-adjusted fixtures to show why a quarter sum must not be called reconstructed full-period diluted EPS. Do not infer unreported common-income adjustments, anti-dilution rules or split history.

## Execution and verification

- [x] Run unchanged product and integration suites; record failures before edits.
- [x] Add failing tests for each new safeguard before implementing it.
- [x] Verify baseline versus candidate Stage B calculations with deterministic retained inputs and synthetic fixtures.
- [x] Run typecheck, lint, product/integration tests, coverage and production build. Run security/dependency checks where available.
- [x] Independently review the complete diff, including report and replay surfaces, and repair supported findings.
- [ ] Prepare small commits and a draft pull request; do not merge it.

No live paid analyses are part of this stage. Freezing replay explicitly pins the already-resolved `esbuild` development package; no new resolved package is added. The companion disposition records distinguish larger analytical enhancements and experiments from these safeguards. Extensions require sourced input contracts, accounting-consistent bridges and meaningful acceptance fixtures before changing defaults.

## Evidence boundaries

The one-band grade limit is the application's existing judge contract, not an investment-book rule. The books motivate critical scrutiny and recorded uncertainty: Benjamin Graham and David Dodd, *Security Analysis*, sixth edition, chapter 1; Howard Marks, *The Most Important Thing Illuminated*, chapters 14, 16 and 19. The inherited reading audit uses PDF pages 125–126, 161–169, 180–189 and 220–227 respectively; these locators refer to the supplied editions, not universally interchangeable print pagination. No book excerpts or PDFs are distributed here. Technical assertions are verified against current code and executable tests; accounting references for EPS are documented separately.
