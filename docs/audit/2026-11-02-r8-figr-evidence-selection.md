# R8 — FIGR filing evidence selection (2026-11-02)

Base: `e1ecadd1` ("Leave a still-forming session bar out of observed price
history"). Branch: `codex/r8-figr-evidence-selection`. Read the specified A2/B2
audit rows, paid input and full frozen filing texts. The isolated snapshot was
opened with `readonly: true, fileMustExist: true`; no provider API or owner's
database was used. All Node commands used the copied isolated Node 24.11.1
wrapper after `npm ci`.

## Finding → rule → regression

The selector split long passages at 1,100 characters, penalized notes tables,
and ranked numeric density ahead of qualifications. General repairs contain
no issuer names or amounts:

| Finding | Rule | Focused regression |
| --- | --- | --- |
| KPI values lost their definition | Atomic referenced KPI footnotes, deductions and denominator; omit the values if the group cannot fit | `evidenceSelection.context.test.ts`: KPI/footnote and undersized-budget cases |
| March definition change lost June/retrospective qualifiers | Bind subsequent definition changes and retrospective application without requiring an oversized reconciliation table | Same: definition-change cases |
| Old financing terms outlived facility/control changes | Bind nearby unused, repaid, terminated and deconsolidated status; reject conditional termination as actual closure | Same: bridge, warehouse, tiny-budget and conditional cases |
| Closing 8-K lost acquired-facility closures | Keep inline numbered clauses atomic; supplementary status uses the existing shared event pool, with no duplicate complete status | Same: numbered clauses/supplement; `stageC.eventContextBudget.test.ts` uses the public closing item and asserts every cap |
| Related debt/sensitivity tables were skipped | Admit component and sensitivity tables with dates, units, shock headers, scope and limitations as groups | Same: component/classification and sensitivity/undersized-budget cases |
| Material drivers, income bridge, unused buyback and third-party cash lost | Rotate qualifying disclosures ahead of repeated numeric text; retain cause and aggregate/component context | Same: expense cause, income breakdown, dated unused program capacity and custodial cash |
| Selected insider rows appeared to classify annual dispositions | Date eligible and displayed row spans separately; state absent aggregate per-code totals and potentially incomplete acquisitions | `stageC.insiderCoverage.test.ts` |
| FRED month keys looked like release dates | Explain monthly observation dates and CPI YoY transforms alongside series | `stageC.payload.passes.test.ts` macro test |

Existing family/critical priorities, person referents and superseding operating
measures remain tested. Exact original offsets, nonoverlapping spans,
determinism and tiny-budget behavior are checked. The historical payload pin
restores only R8's explicitly asserted insider/macro qualifications before the
existing pin chain (`r8EvidenceBasisGolden.ts`); no financial values are masked.
The public fixture inventory adds one referenced SEC item (51 → 52).

## Frozen replay

`REPLAY_DB` points to the supplied `app-data-paid-xhigh/live.db` copy;
`REPLAY_AT=2026-11-02T16:04:50.794Z`. The copied replay/config write only to
this checkout's ignored `tmp/claude-2026-11-01/diag/` directory.

| Replay | Characters | Fingerprint |
| --- | ---: | --- |
| Paid input, supplied reference | 341,671 | `1.61.0:559e5cb9` |
| Integration-base replay, `r8-baseline` | 342,155 | `1.61.0:91919e2b` |
| Final, `r8-final` | 341,152 | `1.61.0:cef2673b` |

Delta against this branch's baseline: **−1,003 characters** (−0.29%). No budget
constant increased. Coverage overhead comes from lower-ranked text: quarterly
MD&A 11,871 → 11,004; quarterly notes 13,890 → 12,778; annual notes 9,877 →
8,858. All material-event text including the lifecycle supplement totals
7,987, within the existing 8,600 cap (baseline 7,371). Each primary transaction
excerpt stays within 1,800 and each supplement within 1,200.

Line numbers below are literal `Select-String`/grep matches in
`tmp/claude-2026-11-01/diag/replay-r8-final.txt`. The serializer prints each
filing's complete JSON envelope on one line, so multiple facts share a line.

| Item | Replay evidence and line(s) |
| --- | --- |
| 1. KPI definition | **500**: `Net Take Rate is derived`, selected revenue, `marketing expenses`, servicing valuation changes and `This net amount is divided` by marketplace volume; 3.6%/4.0% remain beside it |
| 2. Non-GAAP changes | **500**: March 31 change, `added acquisition-related costs` effective June 30, `applied retrospectively` to all periods |
| 3. Debt lifecycle | **505**: bridge `no outstanding borrowings`, July 14 termination, historical warehouse terms plus `no longer controlled nor consolidated`; `REIT Warehouse (E)` has a dash June balance in the debt table |
| 4. Kiavi closing | **555**: `repaid in full all outstanding obligations` under the acquired credit agreement; repurchase agreement with `Deutsche Bank AG` terminated; liens released |
| 5. Related-party composition | **505**: `118,293` FCC + `306,347` Prime YLDS = `424,640`; `Hastra holds YLDS` classified in current related-party debt, with Signum/Hastra context |
| 6. Sensitivities | **505**: `-2% -1% +1% +2%` shock headers; servicing `( 4,165 ) ( 2.9 )` and held-for-sale `( 16,100 ) ( 3.1 )`; thousands, date, independent assumptions and ownership-share caveat |
| 7. Buyback capacity | **500**: no program shares repurchased and `$200.0 million remaining authorized` at June 30; **485**: separate `312500`-share offering purchase at `$32.00`, approximately $10M; $9.7M cash-flow cost remains available |
| 8. SBC cause | **500**: `$21.8 million`, IPO `liquidity condition`, IPO-related grants and increased headcount |
| 9. Other income bridge | **500**: `(870)`, `(116)`, `Staking rewards and realized gains 718`, `Other 5,519`, total `5,251`, and `$5.9 million` Reflow disposal explanation |
| 10. Third-party cash | **505**: `$ 487.5 million` borrower payments due to third-party loan buyers, beyond the separate restricted-cash line |
| 11. Insider coverage | **436**: `Per-code share totals` unavailable for aggregate window; acquired-share subtotal can be incomplete; **98 eligible Form 4/provider rows**, March 24–October 23, versus **12 shown**, August 14–October 23. The raw feed had about 100 rows; non-Form-4 rows remain excluded. Annual window remains October 1, 2025–September 30, 2026 |
| 12. Macro (minor) | **479–480**: monthly first-day observation-month basis and CPIAUCSL/CPILFESL year-over-year transforms |

## Verification and limits

- RED receipts: `r8-context-red.log`, `r8-macro-red.log`,
  `r8-definition-red.log`, `r8-footnotes-status-red.log`,
  `r8-event-budget-red.log`, `r8-capacity-red.log`. The real closing-item test fails when the
  supplemental allocation is removed and passes when restored.
- Product suite (`r8-product-serial.log`, wrapper exit 0): **644 files passed;
  14,577 tests passed, 3 skipped (14,580 total)**, 194.11 s.
- Typecheck and lint: clean, wrapper exits 0
  (`r8-typecheck-verified.log`, `r8-lint-verified.log`). Separate integration
  suite (`r8-integration-final.log`): **4 passed / 1 file**. Replay: **1 passed**.
- The first broad run exposed the historical wording pin and tracked-test
  inventory; later runs exposed the new fixture-count and Markdown-allowlist
  pins. Each was fixed and rechecked. Overlapping broad runs also reported
  timing failures in `risk.coverage`, `repository.release`,
  `report.recordedSensitivity`, `minimatch.tooling` and
  `runtimeArtifactIdentity`; those superseded runs were stopped and the
  complete product gate rerun alone. Final receipts supersede those runs.
- All requested evidence is present. This is an offline evidence-selection
  repair, not a new paid model run or proof that a model will use every fact.
  Context groups too large for a caller's cap remain omitted with disclosure.
  Post-close usable cash, every related-party holder, full-window insider code
  shares and consolidated policy-rate-to-earnings sensitivity remain unproved.
- No prompts, report/export files, claim verifier, shared version stamps,
  stored reports or databases changed. No push or PR.
