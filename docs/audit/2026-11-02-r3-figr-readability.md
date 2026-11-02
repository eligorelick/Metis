# R3 FIGR report readability

| Finding | Fix | Commit | Test |
| --- | --- | --- | --- |
| 1 / B-15 repeated lender paragraph | One full Lender conventions block in Fundamentals; metric-specific short reasons in the reader copy, including legacy reports without the dedicated disclosure field. Full detail remains in the audit. | 291d7fef | `report.figrReadability`: `1: states lender conventions once…`; `1 legacy: finds the recorded lender explanation…` |
| 2 / B-15 market EV key-data cell | One short sentence in Key data; the complete recorded market-EV basis has its own audit section. | 291d7fef | `2: gives market EV one short sentence…` |
| 3 / B-14 absent objects and internal route ids | Define FCF only when an FCF cell is shown. Replace unavailable DCF/reverse DCF, targets, sensitivity/common assumptions and weighted-projection scaffolding with one route explanation. Keep meaningful input-refusal evidence and available entity models. | 291d7fef | `3: suppresses absent DCF scaffolding…`; `3 control: preserves an available entity model…`; `stageB.recentIpoCostOfEquity` |
| 4 / B-18 quarterly caption | Latest eight available quarters; name interior missing quarter ends, retaining only the original rows. | 291d7fef | `3a/4: describes available quarters…`; `filingDisclosures.trendBasis.audit20261027` |
| 5a / B-22 registry labels | Prefer retained explicit labels and compact Piotroski diagnostics. Legacy numeric traces do not retain a separate registry label, so use the stable id's named variant and evaluable-signal count as the fallback. | 291d7fef | `5a: preserves an explicit record label…` |
| 5b / B-22 cash-outflow labels | Display capital expenditure / share repurchases (cash outflow), without editing the payload label strings. | 291d7fef | `5b: displays capex…`; `5b: displays buybacks…` |
| 5c/d/f / B-22 machine numbers | Evidence fractions become percentages; case strengths show N of 5; base-unit prose amounts are grouped, preserving dates, accessions and seed/hash identities. | 291d7fef | `5c/d/f: shows completeness as percent…`; `stageC.judgeProtocol` |
| 5e / B-22 guidance notes | Each retained note is a separate sentence/row. Parser diagnostics move to the audit; quoted issuer outlook remains visible. | 291d7fef | `5e: separates guidance notes…`; `adbeReportAudit.regressions` |
| 6 / truncated gap reasons | Truncate at a clause or word boundary; keep the complete original reason in the audit. | 291d7fef | `6: truncates a long unpunctuated gap…` |
| 7 / B-16 print tables | Protect financial/date tokens; wrap descriptions at spaces; split tables wider than six columns with repeated row identifiers. | 291d7fef | `7: wraps descriptions at spaces…`; `report.export.printHtml` |
| 8 / B-20 portable audit companion | Downloaded Markdown/print name `SYMBOL-report-ID-audit.md`; the app retains its working API link. | 291d7fef | `8: names the downloaded audit companion…` |
| 9 / provider peer list | When every listed issuer was excluded by the comparable screen, label the provider list as scale context and explicitly say it is not used as comparables. | 291d7fef | `9: labels an excluded provider peer list…` |

## Files and stored-report impact

Shared rules: `src/report/readerConventions.ts`, `presentation.ts` and
`filingDisclosurePresentation.ts`. Consumers: `src/report/export/markdown.ts`,
`printHtml.ts`, `auditMarkdown.ts`, `src/components/report/ReportView.tsx` and
`sections.tsx`. The helper is registered in the risk coverage inventory.

No database was opened for the repair. Evidence Markdown, audit Markdown and
print HTML were read in place. Tests use synthetic fixtures, temporary test
databases and a network guard. Saved rows, source data, claim identities,
verification status, calculations, payload label strings, prompts and shared
version stamps are unchanged. The integrator owns the batch stamp bump.

## Red / green receipts and verification

All receipts are under the checkout's ignored `tmp/claude-2026-11-01/`, using
the supplied isolated Node 24.11.1 wrapper, stripped API-key environment and
isolated data paths. Logs are UTF-16LE.

- `r3-red`: all 13 initial regressions failed before implementation.
- `r3-legacy-red`: two additional legacy/entity-model controls failed before
  their fixes. `r3-route-gap-red2` reproduced the route id in a displayed gap.
- `r3-targeted`: seven files, 140 tests passed.
- `r3-product`: diagnostic full product run, 33 failed / 14,343 passed / three
  skipped. This caught old caption/markup pins, the new source inventory entry,
  numeric seed grouping and the loss of substantive recent-IPO refusal detail,
  plus process timeouts under parallel load. These are not presented as a green
  run or as pre-existing failures.
- `r3-precommit`: 24 files, 441 tests passed (exit 0), including every affected
  reader control and all process tests that failed in that diagnostic run.
- `r3-refusal-green`: two files, 21 tests passed (exit 0); substantive refused
  discount-rate evidence remains visible without empty model scaffolding.
- `r3-lint`: exit 0. Typecheck receipts are retained separately.

Existing wording pins were updated because captions now describe retained
available rows, no FCF definition appears without an FCF cell, extraction
diagnostics belong in the audit, and unavailable routes use one explanation.
Existing print-content assertions unwrap only the new token spans; they keep
their financial, currency, escaping and date-meaning assertions. Dedicated R3
tests assert the actual spans, CSS and wide-table structure.

Final gate command (run after this record is committed):

```powershell
& tmp/claude-2026-11-01/run.ps1 -Name r3-verify -NpmScript verify
```

The final handback reports that receipt's exact counts and exit code. No push
or PR is part of this repair.
