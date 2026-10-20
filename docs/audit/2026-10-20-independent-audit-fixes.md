# Independent audit fixes (2026-10-20)

Base: `5377aa5` (the PR #39 merge). Scope: recommendation items 1-6 and 9 of the independent audit of 2026-10-19. The audit's evidence folder (`docs/independent-audit-2026-10-19/`) stays out of the repository. Decision: D-97 in [DECISIONS](DECISIONS.md).

This change made no provider or model calls, no paid runs, no deployment and no publication. The before/after figures in the pull request were replayed offline from the stored run inputs.

## Disposition

| Item | Findings | Disposition | Tests |
|---|---|---|---|
| 1 Analysis cutoff after acquisition | PGR-1, PGR-2 | Fixed. `builtAt` is stamped when acquisition completes, and never before this build's newest fetch stamp. A stamp up to 60 s ahead of the bundle clock still counts as this build's. Two other `observedAt` comparisons were reviewed and need no change of their own, because both are judged against the moved cutoff. `peerFilings.ts` builds peers with a day-level `asOf` and its own fetch stamp. `commonEarnings.ts` stamps supplemental provenance with the companyfacts fetch time. | `tests/dataBundle.keyless.test.ts` |
| 2 Financing debt and fail-closed guard | O-1, O-2, SNOW-1, SNOW-10 | Fixed. When no long-term-debt aggregate is tagged, noncurrent financing debt is built from the combined debt amount or from one figure per instrument class. The result is disclosed as a substitution. A composition that could double count is withheld. On non-financial routes, total and net debt are withheld when a year's interest implies more than 25% on the larger of opening and closing resolved debt. Interest below 0.25% of total assets, and zero debt, are not judged. | `tests/audit.issuerFixtures.test.ts`, `tests/stageB.debtPlausibility.test.ts` |
| 3 Partial operating-lease maturity | FCX-1, FCX-14, CODE-1 | Fixed. Only a missing finance-lease maturity withholds total debt. The operating portion leaves net debt, EV and the WACC debt leg only when total debt is shown to contain it. An aspect whose data is missing reads as a data gap, not as a route choice. | `tests/lease.partialOperating.test.ts`, `tests/audit.issuerFixtures.test.ts` |
| 4 No scoring of withheld leverage | O-3 | Fixed, together with item 2. Withheld debt removes the net debt/EBITDA signal, EV and the EV multiples. Key data marks EV/EBITDA "withheld" instead of dropping the row. | `tests/audit.withheldLeverage.test.ts` |
| 5 Zero NCI and materiality floor | SNOW-2, DOC-1 | Fixed. NCI is inferred zero only from the filing's own pattern. The withhold of parent P/FCF for outside ownership applies only to NCI above 1% of consolidated equity. The DCF gap wording and the METHODOLOGY EV-bridge paragraph now match the code. | `tests/audit.issuerFixtures.test.ts`, `tests/stageB.immaterialNci.test.ts` |
| 6 Minimum evidence for a grade | PGR-4 | Fixed at the display floor that D-67 already applies on every surface. A score resting on one signal with partial evidence shows no letter. Scores and the composite are unchanged. A P/TBV rank that fell back to P/B is named as a P/B rank. | `tests/audit.valuationEvidence.test.ts`, `tests/audit.scoringFreshness.test.ts` |
| 9 Live-shaped issuer fixtures | GATE-21 | Fixed. Trimmed SEC companyfacts for FCX, PGR, O, SNOW and NNN are committed. Every statement row dated 2021 or later builds identically from the full and the trimmed files. A keyless pipeline test runs Stage A and Stage B over them with synthetic prices. | `tests/audit.issuerFixtures.test.ts`, `tests/audit.issuerPipeline.test.ts` |

## Data rights

The fixtures are SEC EDGAR companyfacts, a U.S. government work ([DATA-RIGHTS](../DATA-RIGHTS.md)). The audit's run-input snapshots also hold FMP, Yahoo, Finnhub and FRED observations, so none of them is committed. The pipeline test uses instead a synthetic weekday price series ending at each run's quoted price, one fixed DGS10 observation, and a submissions list rebuilt from the accessions the facts cite.

## Choices for the owner to confirm

- **25% implied-rate threshold.** Debt is withheld above it. Zero debt is not judged.
- **Interest coverage stays scored when debt is withheld.** It is EBIT over interest expense and never reads the debt balance.
- **1% NCI materiality floor for parent P/FCF.**
- **Zero-NCI inference.** It needs both NCI income of exactly zero and an earlier zero NCI balance. This relaxes the stricter fail-closed reading in reconciliation R5/R6.
- **Single-signal floor.** It applies to every aspect, for display only. A REIT whose P/FFO is its one designed signal, observed in full, is still graded.

## Deferred

Items 7, 8, 10, 11 and 13-18 are not part of this change.

Item 12 (unprofitable-overlay trigger, SNOW-3) is untouched. It needs an owner policy decision. Snowflake's DCF therefore stays suppressed.

Item 17 covers the DOC-1 remedies for PRIVACY.md and the keyless design spec, and is deferred. This change corrects only the METHODOLOGY NCI text that item 5 made wrong.
