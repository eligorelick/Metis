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

## Review corrections

An independent review of the whole diff found five problems, all fixed in their own commit with tests:

- **Current portions of debt classes.** Composition read only the noncurrent tags, so notes falling due within a year (`ConvertibleDebtCurrent`) would have dropped out. Each class now adds its current variant, and is withheld beside a current-debt line that could hold the same notes.
- **NCI earnings under the 1% floor.** The floor also switched off the NCI earnings test, so a stake bought out before the balance date published parent P/FCF. Earnings above the floor now still withhold it.
- **The report's derived historical EV.** It was refused for debt the builder withheld, but not for debt Stage B withheld. It is now refused for both.
- **The Key data "withheld" marker.** It now reads Stage B's current-period net-debt gap. That covers builder-withheld debt and ignores older periods.
- **Long-term debt on rejected rows.** Rows the plausibility check rejects now also withhold long-term debt, which the forensic leverage tests read on its own.

## Automated review corrections

The Codex review bot on the pull request raised three points. Each was checked against the code and against SEC data before any change:

- **Inferred parent equity read as consolidated (fixed).** The zero-NCI inference copied the NCI-inclusive total's provenance, so Stage B's ownership check still read the figure as consolidated equity. Snowflake's P/B, and the parent-equity inputs to returns and the DCF, stayed blank. The provenance now carries `calculation: "nci-inferred-zero"`, which the ownership check accepts. Test: `tests/audit.issuerPipeline.test.ts`.
- **Instrument classes that hold the same obligation (fixed, narrower than suggested).** Secured debt classifies by collateral, so it can hold the same notes or loans as another class. The bot suggested withholding every combination that could overlap. In the SEC's FY2025 frames, 114 filers compose debt from two or more classes. Thirty-six pair secured debt with another class, mostly REIT mortgages beside unsecured notes, which are separate lines (Realty Income among them), so a blanket withhold would undo item 2 for them. Every pair within 2% of each other was a duplicate (Sun Communities, UMH, American Assets, Babcock & Wilcox, 1847 Holdings), so composed debt is withheld when two classes lie that close. A secured class that holds only part of another class is still not detectable from the tags. Test: `tests/audit.issuerFixtures.test.ts`.
- **Operating lease proven by a total lease liability (not changed).** The bot was concerned that a separately disclosed lease total does not prove the leases sit inside total debt. In this code the lease total cannot arrive that way. SEC enrichment adds only the operating and finance lease liabilities to a vendor row, never `capitalLeaseObligations`. The EDGAR builder adds that total into total debt itself, and FMP's own `totalDebt` definition includes it. Every stored vendor row that carries the lease total reconciles to short plus long debt plus leases (13 of 13). The audit's CODE-1 remedy named this proof. Requiring an exact reconciliation would also wrongly fail EDGAR rows whose overlap rules add only part of the lease total (`resolveDebtOverlaps` cases 1 and 4b).

A second Codex pass, on the commit that made those fixes, raised four more points:

- **Composed long-term debt in the forensic leverage tests (fixed).** An inclusive class total, or a class's current variant, puts current notes into the long-term-debt field. Its total is right, but Piotroski ΔLEVER and Beneish LVGI read the field as noncurrent debt. On main those tests had no figure for Realty Income or NNN, so the distortion was new. Such a figure is now passed to forensics as missing, with a `forensics.longTermDebt` info gap. Test: `tests/audit.issuerPipeline.test.ts`.
- **NCI floor without NCI earnings (fixed).** A non-zero NCI balance under 1% of equity passed the floor even when no NCI earnings figure existed. An ending balance cannot bound the period's earnings, so the floor now needs a known earnings figure. The current-balance check now receives the period's NCI earnings, which it never read before. Test: `tests/stageB.immaterialNci.test.ts`.
- **Partial operating-lease maturity beside a finance lease (fixed).** The operating slice carried no tags of its own, so once a finance lease was also tagged, `incompleteLeaseCoverage` could not see that only one operating maturity was present. Each lease slice now keeps the tags that served it. Test: `tests/audit.issuerFixtures.test.ts`.
- **Analysis cutoff crossing UTC midnight (not changed).** A build whose acquisition crosses 00:00 UTC gets a cutoff dated the next day, while its sources were selected on the start day. Everything the cutoff admits was observed before it, so no point-in-time look-ahead can result. The cost is that such a build may hold statements one filing day older than its cutoff date suggests. Capping the cutoff at the end of the start day would refuse the SEC facts fetched after midnight, which is the PGR-1 failure item 1 fixed.

A third Codex pass raised five more points, all fixed with tests. Each change makes the check judge more evidence or refuse less wrongly:

- **Zero current debt beside composed debt.** A current-debt figure of exactly zero triggered the overlap withhold, although it holds nothing to count twice. Only a non-zero figure now withholds. Test: `tests/audit.issuerFixtures.test.ts`.
- **Zero interest in the plausibility basis.** A quarter is judged on the smaller of its trailing year and the latest fiscal year. FMP's zero-for-undisclosed interest therefore won that choice and switched the check off. Zero interest is now read as undisclosed, as `IMPLAUSIBLE_ZERO_FIELDS` already treats it. Test: `tests/stageB.debtPlausibility.test.ts`.
- **Intra-year borrowings in the annual check.** The annual check saw only year-end balances, so interest on a borrowing repaid between them could withhold complete debt. Quarterly balances inside the year now count. Test: `tests/stageB.debtPlausibility.test.ts`.
- **Fiscal-date drift.** Interest was joined to balances by exact date. It now joins within ±5 days, the tolerance `matchByDate` uses. Test: `tests/stageB.debtPlausibility.test.ts`.
- **Data-only grade interpretation.** The sentence explaining withheld letters named only the half-evidence floor. It now also names the single-signal rule. Test: `tests/stageC.payload.passes.test.ts`.

## Departures from the recommendation text

- **Item 2: `DebtInstrumentCarryingAmount`.** Item 2 suggests treating a missing `DebtInstrumentCarryingAmount` as unproven. That would withhold debt for every filer that does not tag it. The interest-plausibility check, which the same item recommends, is used instead as the fail-closed guard. A filer missing that tag is still judged against the interest it paid.
- **SNOW-10's warning gap.** SNOW-10's spec also asks for a warning gap that names any unmapped debt element above 1% of liabilities. That warning is not implemented. What this change provides is the live-shaped fixtures of item 9, which would have caught SNOW-1 and SNOW-2. A generic unmapped-element scan would flag many disclosure-only elements, such as `DebtInstrumentFaceAmount`, and is left with the deferred items.

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
