# Research reliability implementation plan

## Authorized outcome

Implement the user's approved priorities: evaluation infrastructure, measurable thesis revision triggers, coherent scenario presentation and defensible peer valuation. Preserve existing scoring and intrinsic-value formulas; improve evidence, consistency and observability rather than promise forecasting accuracy. No uncalibrated error bars, invented reference-class percentiles, or new grading weights.

## Design and interfaces

1. Evaluation: pure report snapshot / outcome evaluation functions plus a read-only local CLI. Freeze report content by hash, report/method versions, generated/as-of dates, forecast horizons and evaluation policy. Separate operating forecasts from realized price/benchmark returns. Require explicit comparable dates, currencies and adjustment bases; exclude immature or invalid observations with reasons. Persist immutable snapshots as files without modifying existing reports. Do not reinterpret present-value DCF scenarios as future-price intervals.
2. Scenarios: report-side deterministic assumptions/weights must describe the same calculations as projections and targets. Preserve model-authored commentary as commentary, not inputs. Disclose fixed uncalibrated display weights. Derive sensitivity conclusions from actual available valuation grid values, never fitted-error claims. Support AI and data-only reports and legacy reports.
3. Thesis triggers: pure structured conditions derived from established reverse-DCF/projection values, carrying metric, comparator, threshold, horizon, source and revision consequence. Explicitly name fixed assumptions and suppress missing/inapplicable values. Render in app, Markdown and print without asserting a forecast or investment directive.
4. Peers: bounded, cached reads of actual candidate fundamentals and quotes, with documented industry/route/currency/date gates. Compute eligible comparable multiples using consistent definitions; deduplicate issuer/self candidates, filter invalid data, preserve the existing minimum four surviving peers and outlier rule. Provider failures degrade explicitly to no peer median, never fail the report. No unverified forward EPS currencies.

## Work boundaries

- Evaluation agent: new src/report/evaluation*.ts, scripts/evaluate-reports.ts, tests/report.evaluation*.test.ts. No DB or package mutation; parent wires commands.
- Peer agent: src/pipeline/peer*.ts, src/pipeline/dataBundle.ts, types.ts, compute.ts, stageB/valuation.ts and peer tests; coordinate public schema needs with parent.
- Scenario agent: new scenario presentation module, src/report/schema.ts, stageC/passes.ts, dataOnlyReport.ts, prompts.ts, payload.ts and scenario tests. Parent renders new fields.
- Parent: thesis triggers module and tests, report UI/exports, evaluation command integration, documentation, overall validation and review.

## Verification and acceptance

- [x] Establish existing suite baseline and isolated branch.
- [x] Each behavior starts with focused failing tests, then passes targeted tests.
- [x] Independently calculated examples cover comparable peers, withheld data, scenario consistency, trigger thresholds and evaluation maturity/basis.
- [x] Full product/integration tests, typecheck, lint, production build and required repository checks pass.
- [x] Render representative report outputs and inspect app/print/Markdown for consistency and overflow.
- [x] Review diff for data leaks, unsupported numeric claims, backwards compatibility, route applicability and stale/mixed units.
- [x] Document actual evidence and remaining empirical limitations. No claim of guaranteed future forecast accuracy.

## Review focus

- New fields must not make old saved reports unparsable or break provider schemas.
- Quotes, currencies, fiscal dates, share classes and issuer identity must agree for comparisons.
- Absent data must not become zero, a favorable grade, a probability, or a plausible-looking placeholder.
- Forecast horizons and current intrinsic-value sensitivities must remain distinct.
- Optional peer work must be bounded and tolerate unavailable entitlements without delaying/failing core analysis.

## Execution notes

Proceeding under the user's explicit instruction to implement, verify and test the recommendations. Parallel work is limited to the non-overlapping domains above; shared report interfaces and integration are coordinated by the parent.

## Verification record

- Baseline: 4,862 passing product tests, two existing skips. Final: 5,001 passing product tests across 223 files, the same two skips, plus four passing integration tests.
- `npm run verify` passes dependency shape, TypeScript, ESLint, product/integration suites, both coverage gates, production build and the security audit (zero known vulnerabilities). Core coverage: 96.18% statements, 89.99% branches, 98.66% functions, 97.26% lines. Risk coverage: 94.34%, 87.73%, 97.16%, 96.38%, respectively; existing per-file floors remain enforced.
- The audited comparison keeps numeric grades and base intrinsic values pinned. New report fields, eligibility disclosures, scenario commentary/weight semantics and version stamps have explicit intended-delta records. Patched Next 16.3.8 and source-map-js 1.2.2 produce no additional financial deltas.
- Independent reviews corrected conflicting statement CIK acceptance, common-earnings-only peer eligibility, AI-bound forecast provenance, mismatched annual model windows, inverted scenario labels and the degenerate margin-shock divergence. Regression tests reproduce each issue.
- A computed, provider-free report was rendered in app, Markdown and print. Browser inspection at desktop and 390px mobile found and corrected table/text overflow; no page errors. Forecast dates and review thresholds agree across surfaces.
- Limits: fixtures and structural checks establish regression evidence, not demonstrated predictive performance. Live peer-provider entitlement/data quality and live model prose were not validated by this run. Prospective evaluation requires frozen definitions and matured, comparable outcomes; saved legacy reports retain their original content.
