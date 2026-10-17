# Research safeguard verification

Baseline: `65ed563850849269cea7f4f020a4f9412146750b`, Node 24.16.0 and npm 11.13.0 on Windows. The working branch is a candidate, not a deployed release or an empirical investment-performance study.

## Baseline and intended changes

The unchanged baseline passed 343 product files: 7,139 tests passed and three existing tests were skipped. The integration suite passed all four tests. Dependencies were installed from the existing lock; the SQLite native addon was rebuilt for this host. Existing Vite native-config and ESLint pages-directory notices were present before changes.

The grade tests first failed for the absent validator; the ordinary saved-read regression then failed for the missing validation record. Independent review found that saved-report bypass, and it was corrected on immutable views. Raw model letters, original stored bytes and generation stamps are retained. An additional red regression demonstrated that unchecked numeric support could otherwise authorize an override; the validator now requires admitted qualitative citations or matched numeric support, with no known contradiction. These are bounded checks, not complete semantic validation.

EPS regressions first failed for absent convention metadata and P/E disclosure. The candidate preserves arithmetic. The complete preceding Stage C financial-object hash is reproduced after removing only the exact new EPS explanatory string; all numeric registry values, IDs, dates and projection periods remain pinned. The source prompt increases by 283 bytes for that definition. New payload/version identity intentionally invalidates earlier-context resume.

The exact audit delta ledger preserves all preceding assertions, adds grade audit/status leaves and advances the report-spec leaf. It does not bless changes to economic-value calculations. Historical reference files and their source hashes remain pinned.

Runtime identity tests first failed at ordinary job capture; missing custody was then wired into that path. A server-root junction regression also failed before its refusal was added. Independent review found hash-type coercion that could return an invalid identity; the corrected reader refuses malformed hashes instead of failing a research job. Production evidence binds retained compiled files and captured method/lock inputs, not the mutable checkout or an external attestation.

## Verification status

The first full candidate product run failed five tests, with 7,189 passing and three skipped. `report.schema.test.ts` exposed an optional request-parameter count of 21 against the unchanged margin of 20; generation now requires the rationale object while persisted legacy records remain compatible. `report.markdown.integration.test.ts` exposed direct-versus-stored export disagreement; direct exports now validate immutable views too. The remaining failures in `api.routes.export.test.ts`, `report.legacyEntitySafety.test.ts` and `watchlist.cacheOnly.test.ts` assumed unaudited or mismatched synthetic grade proposals would remain displayable. Their valid controls now explicitly match their bands, and original-content/byte assertions remain. The six focused suites covering these repairs and the grade contract then passed all 184 tests. This failed attempt is separate from the fresh full-gate results.

The second full product attempt passed 7,194 tests and failed two (three skipped). One was the independently discovered citation-ID schema regression: rating-like words in a URL were incorrectly parsed as rationale prose. The new `evidenceSources` machine-ID field now follows the existing `sourceId` exemption; actual rationale prose remains guarded. Its regression failed before the fix, then the grade/schema suites passed 79 tests. The other failure was the publication guard recognizing a reserved retired-directory string inside that synthetic URL. Replacing only its irrelevant path segment preserved the rating-like slug; the grade/publication suites then passed 27 tests. Source changes during this attempt mean it is not final-tree verification.

Independent review then reproduced a saved-view entity-sanitization gap: a withheld claim and its verification-log copy could become identical placeholders while retaining cited support. The new regression failed before the fix; sanitization now invalidates that support as removed/untraced/contradicted, and grade validation rejects removed evidence. The legacy/grade focused suites passed 24 tests after this correction. A rationale-only variant also requires refusal; direct raw claim/rationale tests both failed before adding the existing canonical entity checks to grade admission. Pipeline-generated withholding text cannot establish override support. The final focused legacy/grade run passed all 27 tests, including rationale-only raw/saved exports and previously sanitized records with stale accepted metadata; typecheck passed. Raw stored JSON remains unchanged. The third full product attempt overlapped these review regressions and failed one new test (7,196 passing, three skipped); it is superseded rather than final-tree evidence.

## Final local gates

The frozen implementation passed every required local gate on Windows:

| Command | Result |
| --- | --- |
| `npm run check:dependencies` | Locked dependency shape passed. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run test:product -- --maxWorkers=2` | 347 files, 7,200 passed, three existing skips. |
| `npm run test:integration` | One file, four passed. |
| `npm run test:coverage:core -- --maxWorkers=2` | Passed: statements 96.50%, branches 90.78%, functions 98.01%, lines 97.71%. |
| `npm run test:coverage:risk` | Passed unchanged per-file thresholds: aggregate statements 94.98%, branches 88.77%, functions 97.63%, lines 97.23%. |
| `npm run build` | Passed with isolated empty application profile and provider credentials removed. |
| `npm run audit:security` | Passed; zero dependency vulnerabilities reported. |

The actual production build's retained manifest validated. Its frozen replay reproduced complete Stage B outputs across the four synthetic general, bank, REIT and cash-burning fixtures with network access forbidden; the trusted-local replay CLI also completed on a snapshot bearing that build's identity. These checks complement the checked-in [runtime replay fixtures](../../tests/runtimeReplay.test.ts), which test source mutation, no-Git packaging, reversed ambient lease settings, pre-import refusal and complete numerical parity.

Independent review reproduced and closed the saved-claim and rationale-only withholding defects, including old placeholders, duplicate admitted/removed log entries, raw/saved/export/history parity, immutable generation stamps and idempotency. A separate reviewer compared sixteen complete Stage B fixture/configuration combinations after removing only the exact explanatory EPS string; no financial numerical changes were found. These are synthetic correctness checks, not forecast or investment-performance evidence.

Committed-head Linux and Windows CI remain a separate publication gate. Local results do not stand in for those platform runs.

## Limits and remaining work

No paid analysis or live provider/model run was used. Fixture success does not prove the accuracy of future issuer reports, forecasts or returns. Installed dependency bytes and provider responses are not externally attested by local build identity. Further analytical work, the separately implemented common/preferred-dividend repair, empirical calibration and the seven-book synthesis are listed in the [disposition](2026-10-17-book-to-code-disposition.md). The PR remains a draft until its independent review and platform checks are assessed; it is not automatically merged.
