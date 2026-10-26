# Audit batch 6: degrade visibly when providers fail (2026-10-26)

Base: `2f2aa3b` (main, after pull request #55). Scope: batch 6 of the independent audit of 2026-10-22, the findings where a provider failure changed a report without telling the reader, or cost a run more than it needed to: B-1, B-4, F-13, F-1, F-12 and D-3. The owner postponed the Low items on the same code paths. Merged with main after pull request #57. Decision: D-109 in [DECISIONS](DECISIONS.md). Stamps: report 1.41.0, payload 1.47.0, pipeline stage-c-1.6.3 and Stage B ACCOUNTING_EVIDENCE_26, each the next after those of D-107 and D-108. The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below, served from the run cache behind a dead proxy. The outage pass stubbed FRED, FMP and the U.S. Treasury in process, so it sent no request at all. No fixture file was added. The new tests build their inputs inline, and the Treasury CSV they parse is synthetic.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| B-1 A 200 response with an HTML body from FRED becomes an "unrecognized payload" gap, with no retry or CSV fallback | Fixed. Neither FRED endpoint returns HTML as data, so an HTTP 200 whose body opens with `<` is retried like a 503 (the body decides, not the content type). The keyed API then falls back to `fredgraph.csv`. The gap names a maintenance/HTML page and never quotes it. | `e4c73d0`, `7decca7` | `tests/fred.htmlOutage.test.ts`, `tests/fred.bodyRead.test.ts`, `tests/risk.providers.coverage.test.ts` |
| B-4 The risk-free rate has only two sources, so a FRED outage plus an FMP refusal withholds every WACC | Fixed (owner order). The last good cached `DGS10` observation (at most 10 business days old), then the 10 Yr point of the U.S. Treasury daily par yield curve, stand in. The WACC line names the source and date, a `riskFree.substitution` entry says why, and with every source down the WACC is withheld as before. | `23ebff8`, `1e881fa`, `7decca7` | `tests/riskFree.fallback.test.ts`, `tests/riskFree.cachedDgs10.test.ts`, `tests/risk.coverage.test.ts`, `tests/report.providerFallback.test.ts`, `tests/report.versionStamps.test.ts` |
| F-13 The headline fair value carries no caveat when its inputs were substituted | Fixed (owner decision). `fairValue.reasons` carries a "Degraded inputs: …" entry naming each substitution. It covers the risk-free stand-in, a DCF's ROIC-vs-WACC history left with no `DGS10` observation (so the terminal ROIC rule compared every year to the current WACC), the keyless members the value reads that were served after an FMP refusal (not the sector ETF prices or the shares float), and an analyst-growth method dropped because the estimates were refused. It is shown beside the headline in both layouts and on every export. Peers do not feed the headline value, so a dropped peer set is not named. | `67b49dc`, `d999705`, `7decca7` | `tests/fairValue.degradedInputs.test.ts`, `tests/riskFree.fallback.test.ts` |
| F-1 Report data depends on FMP quota state with no run-level warning | Fixed (owner decision). One "Provider fallback · …" line, in the saved-snapshot header (both layouts), under the classic header, at the head of the Markdown, audit and print exports, and in the AI context. | `8a85045`, `7decca7` | `tests/report.providerFallback.test.ts`, `tests/dataBundle.keyless.test.ts`, `tests/keyless.test.ts`, `tests/stageC.payload.passes.test.ts` |
| F-12 A plan connection held by another Metis server is masked as a generic pass failure and retried | Fixed. The runtime is claimed at the start of the fetch step, so the job ends in one attempt before any data is fetched. A mid-run refusal gives the same reason, is not retried, and both name the OPERATIONS row. A signed-out connection claims nothing and still ends data-only. | `99736e4`, `7decca7` | `tests/jobRunner.test.ts`, `tests/ai.store.test.ts`, `tests/ai.transport.test.ts` |
| D-3 Sections kept from a cut-off pass are carried into the retry without a schema check | Fixed. Each kept section is normalized as the whole parse normalizes it, then checked alone against its sub-schema and the rating-safety walk. A failing section is dropped and re-requested, and the step detail names it. Sections reloaded from the section checkpoint on a plan connection get the same check. | `ad28235`, `7decca7` | `tests/stageC.payload.passes.test.ts`, `tests/jobRunner.test.ts` |
| D-4, F-16, F-15, F-18, F-17, F-14 (Low, same code paths) | Postponed by the owner. | none | none |

Every new test failed before its fix, except two kinds that pass on both sides by design. The negative cases are a keyless-by-configuration run, a healthy DGS10, an API-key job and a clean section. The other is the D-3 unit tests, which were written with the fix; the D-3 runner tests were run against the old runner first and failed.

## Owner decisions

- **B-4 (given).** The fallback order:
  1. FRED `DGS10` (keyed, then `fredgraph.csv`).
  2. FMP treasury `year10`.
  3. The last good cached `DGS10` observation, if at most 10 business days old, labelled with its date.
  4. The U.S. Treasury daily par yield curve, 10-year.

  The WACC line names the source and date; if every source fails, the WACC is withheld.
- **F-1 and F-13 (given).** One run-level header line lists the providers that fell back and what replaced them. A `fairValue.reasons` "degraded inputs" entry names each substitution, beside the headline value.
- **F-1/F-13 scope.** Only substitutions that are not the plan's design are named. A keyless-by-configuration run, a member the key's subscription never serves (FMP marks that refusal `expected`, and its stand-in now is too), and the Finnhub fallback that is always expected, get no line and no entry. The fair-value entry leaves out the sector ETF prices and the shares float, which no fair value reads; the run-level line still lists them.
- **F-13, the per-year WACC history.** With FRED down, the ROIC-vs-WACC history is named as compared to the current WACC. Rebuilding that history from the cached `DGS10` rows would keep the figure but is beyond the owner's B-4 order, so it is left for later. The line lists members in a fixed order, so the report and the AI context read the same.
- **F-12.** A busy credentials lock is a different, short-lived condition and is unchanged.
- **D-3.** The check is an optional method on the injected passes bundle, so the runner stays decoupled from `passes.ts`. An implementation without it keeps every carried section, as before.

## Left for later

- B-4: the Treasury par-curve CSV format was not checked against a live response, because this batch made no live calls. The parser fails closed: anything without `Date` and `10 Yr` columns is a gap, not a rate.
- F-12: a busy credentials lock (the mutex) is still reported as a pass failure.
- F-13: with FRED down, the per-year WACC history could be rebuilt from the cached `DGS10` rows, which hold years of observations. That would keep the terminal ROIC figure, but it goes beyond the owner's B-4 order (which covers the current rate), so for now the degraded-inputs entry names it instead.
- F-1: on a classic saved-snapshot page the line shows twice, in the snapshot header and under the classic header, just as the existing synthetic-data notice does. Both placements are the owner's; removing the repeat for both notices at once is left for later.
- Review notes not acted on, because none of them changes a figure or label today:
  - The header line reads the risk-free stand-in back from the `riskFree.substitution` gap's prose. That gap has no structured series and date fields, and the rule for which source served lives in three places. The end-to-end tests pin the producer and consumer wording together.
  - The cached-`DGS10` read decodes every cached row. It runs only when FRED and FMP are both down.
  - During a FRED maintenance window each series is retried on both endpoints before giving up. B-1 asks for the retry, and it stays inside the fetch deadline.
  - An HTML "series not found" page would be retried as an outage. Neither FRED endpoint serves HTML as data, and the gap says "maintenance/HTML page", not that the series is unknown.
- The postponed Low items: D-4, F-16, F-15, F-18, F-17 and F-14.

## Control panel

All 45 control-panel tickers were run data-only on the base (`2f2aa3b`) and on this branch. The runs were offline behind a dead proxy, with the clock fixed at 2026-10-22T06:00:00Z, both cost caps at 0, and the FMP and Anthropic keys blank. Each side read its own copy of the cached census database.

**Providers healthy (base against this branch).** No figure moved on any metric:

| Metric | Shown on both sides | Changed |
|---|---|---|
| Fair value per share and upside | 27 of 45 | 0 |
| WACC | 35 of 45 | 0 |
| Total debt (ex leases) / net debt (ex operating leases) | 36 / 37 of 45 | 0 |
| Market cap / P/E / EV/EBITDA / P/B | 41 / 36 / 32 / 40 of 45 | 0 |
| Aspect bands, composite score and band, critical-gap count, route, status | 45 of 45 | 0 |

The withheld totals are identical: fair value 18, WACC 10, total debt 9, net debt 8, market cap 4, P/E 9, EV/EBITDA 13, P/B 5. No healthy run had the provider-fallback line, a risk-free substitution or a degraded-inputs entry.

The five tickers with an empty per-year WACC history (CMCSA, DIS, MA, NNN, V) withhold their WACC with FRED healthy, and their fair value is suppressed, so the history wording is unchanged for them.

Against `oracle-compare.csv`, both sides reproduce the same verdicts:
- Debt: 17 agree, 4 mismatch, 9 withheld, 6 date-differs, 3 definitional, 6 moved since the audit.
- Market cap: 39 agree, 3 withheld, 3 moved since the audit.
- P/E: the same "moved" set on both sides. These are census rounding and changes merged after the audit.

**Outage pass (this branch).** FRED and a keyed FMP failed on every call, and the U.S. Treasury was stubbed in process, so no request left the machine. The healthy branch run is the reference. The Treasury CSV is synthetic: 4.02% on 2026-10-21, against a cached 5.12%.

| Variant | Risk-free | WACC shown | Fair values shown | Figures that moved | Disclosure |
|---|---|---|---|---|---|
| Last cached `DGS10` | 5.12%, "FRED DGS10 last cached observation, observation 2026-10-20" | 35 of 35 (same values) | 27 of 27 | 7 fair values (CAT 245.67→244.37, CVX 195.21→177.40, FCX 17.10→16.95, KO 39.86→39.51, VZ 64.53→64.27, WMT 42.67→42.30, XOM 195.82→194.71) and 3 composites (CVX 57.43→56.80, VZ 56.22→56.18, XOM 56.66→56.61). | Header line names the cached observation. Every shown fair value carries the degraded-inputs entry, which names the rate and the current-WACC-only history behind the terminal ROIC. |
| Treasury par curve | 4.02% (synthetic), "U.S. Treasury par yield curve 10 Yr, observation 2026-10-21" | 35 of 35 (every value lower, e.g. AAPL 9.42→8.31) | 27 of 27 (every value moved, e.g. AAPL 137.83→159.43) | 11 valuation bands, 4 quality bands, 31 composite scores, 1 composite band (BRK.B D→C). NEE went from outside-domain to suppressed. | As above, naming the Treasury observation. |
| Every source down | withheld | 0 of 45 | 0 of 45 | Fair value suppressed for all 45 (NEE and TSLA from outside-domain), so the valuation band changes for 11 and the quality band (no ROIC-vs-WACC spread) for 22. | Header line lists the FMP stand-ins only. The WACC is withheld as before, and its gap is listed under missing data. |

Why the figures move:
- **Cached `DGS10`.** The rate is the same 5.12%, so the WACC is unchanged. The fair values move because the per-year ROIC-vs-WACC history has no `DGS10` observations and compares every year to the current WACC. That shifts the terminal ROIC, e.g. CVX 9.37% to 7.56%. The degraded-inputs entry says so.
- **Treasury.** The figures follow the lower synthetic rate.
- **NEE under Treasury.** The 6% WACC floor makes its equity value positive, so the DCF is back inside its domain. The existing noncontrolling-interest rule then suppresses it, because NCI's share of profit cannot be established.

Rendering: AAPL, CVX, KO and JPM were rerun on the final commit in all three variants and rendered on every surface. The provider-fallback line appears exactly once in the snapshot header (both layouts) and in the classic body, the Markdown, the audit Markdown and the print export. The degraded-inputs entry appears beside the headline in classic, dossier, Markdown and print. JPM's fair value is suppressed when healthy too, so it has no entry.
