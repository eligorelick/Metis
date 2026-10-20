# Deferred AMZN audit fixes (2026-10-20)

Base: `1f555a7`, the head of pull request #41 (the AMZN audit's fixes 1-6 and their review fixes). Scope: the AMZN report audit's findings 6-11, 13, 15, 16 and 18-21, which #41 left for later. Decision: D-99 in [DECISIONS](DECISIONS.md). The audit evidence folders stay out of the repository.

This change made no provider or model calls, no paid runs, no deployment and no publication. The figures below were replayed offline from the stored run inputs.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| 6 Backlog/RPO evidence | Fixed. A `performance-obligations` notes family keeps the amount and timing sentences first. On the stored AMZN inputs the 10-Q's $496B / 6.4 years and the 10-K's $244B / 4.1 years now reach the payload; both were dropped. No code reads the stale `RevenueRemainingPerformanceObligation` fact. | `baef5d3` | `tests/stageC.evidenceSelection.test.ts` |
| 7 Peer screen | Partly fixed; the audit's cause was wrong. The screen excluded nobody it should have kept: CPNG, W and GLBE fell outside the size band, BABA is an ADR, EBAY's quote and statements were rate-limited, and JD, MELI, PDD, SE and SHOP were never requested after the rate limit. MSFT, GOOGL, ORCL and WMT were never candidates. The peer summary now counts the unserved candidates apart from the screen's exclusions and leaves out the subject. Peers on the stored inputs: none before, none after. | `2bc5d5b` | `tests/report.researchReview.test.ts` |
| 8 SBC unscored when FCF ≤ 0 | Fixed. SBC/FCF scores at its band floor when FCF before SBC is not positive and SBC is positive. AMZN Balance Sheet evidence 82% → 100%. | `4336adf` | `tests/stageB.grading.test.ts` |
| 9 ROIC floor drops a loss year | Fixed. A pre-tax-loss year with operating profit is taxed at the D-58 marginal-rate floor. AMZN FY2022 ROIC 6.92%; the moat floor 16.72% → 6.92%. | `54b45c8` | `tests/stageB.growth.returns.capital.test.ts`, `tests/stageB.grading.test.ts` |
| 10 Reverse DCF with no root | Fixed. A price beyond every value in the growth range grades the reverse signal at that end; the thesis triggers point away from the base case. | `8cbc71f` | `tests/stageB.valuation.test.ts`, `tests/stageB.grading.test.ts`, `tests/report.thesisTriggers.test.ts` |
| 11 Bull case cuts margin | Fixed. The correlated margin shift applies only when it moves with its scenario. | `0c5742c` | `tests/stageB.scenarioTargets.test.ts`, `tests/stageB.auditScenarios.test.ts` |
| 13 Segment hierarchy | Fixed. A row nests only when the sum holds in every jointly tagged quarter, and in at least two. Amazon's product lines no longer appear under service sales; NVIDIA's Data Center still nests. Recalc row 55 (Q4 2025 advertising) is not a defect: the 10-K tags it under a member the 10-Qs don't use, and D-63 does not join renamed members. | `2e19088` | `tests/segmentFacts.subtotals.test.ts` |
| 15 Buyback timing | Fixed. The label states the sign; timing is graded only when a priced year is in the last three annual cash-flow years; the payload dates the figure by its newest priced year. AMZN's 2022-only timing is now stale and ungraded. | `fed42b4` | `tests/stageB.forensicsD61.test.ts`, `tests/stageB.grading.test.ts`, `tests/report.presentation.labels.test.ts`, `tests/report.presentation.d67.test.ts` |
| 16 Catalysts and risks | Partly fixed. Government antitrust cases, their relief, regulators' fines and dated trials now hold the pending-case reservation, so the FTC case reaches the payload from the 10-Q notes, the 10-K notes and Item 1A. The 2027-03-29 trial date was in no filing the run had. Leo costs, the robotics bullet and generic tariff risk were already in the payload and the model left them out; Kuiper and regionalization were not in the inputs. | `6eb999e` | `tests/stageC.evidenceSelection.test.ts` |
| 18 Verdict stance | Fixed. The judge's summary opens with a stance on the price; the analyst-estimates section states the consensus target's and the model value's implied moves and requires reconciling a gap above 20 points. On the stored AMZN inputs the gap is about 92 points. | `30b1a0f` | `tests/stageC.payload.passes.test.ts` |
| 19 Consensus calendarization | Fixed. Estimates follow the issuer's own quarterly shape when the last complete fiscal year supplies one. Latent for the stored AMZN run (no consensus was fetched). | `71350e5` | `tests/stageB.dcfAnchoring.test.ts`, `tests/stageB.ttm.compute.test.ts` |
| 20a Financing obligations in net debt | Not changed. No standard us-gaap tag carries Amazon's $9.3B; it files them under its own elements, which companyfacts omits. | — | — |
| 20b Net debt/EBITDA lease basis | Fixed. The ratio uses the enterprise value's lease basis. AMZN 0.71x → 0.14x; its net debt now equals the bridge's $23.01B. | `3618d78` | `tests/stageB.currentCapital.test.ts` |
| 20c Piotroski failure wording | Fixed. A failed signal says what its figures did. | `4347c3e` | `tests/stageB.piotroskiFailureWording.test.ts`, `tests/stageB.forensicsD61.test.ts` |
| 20d Accrual scaler label | Fixed. "Accrual scaler (average NOA or total assets)". | `a9cc2b9` | `tests/report.amznPresentationNits.test.ts` |
| 20e Earnings date "unconfirmed" | Not changed. The calendar was a vendor estimate, the press-release fetch was rate-limited, Amazon files no 8-K for the date, and its IR site was not discovered; the report's wording followed the payload's accurate note. | — | — |
| 20f Buyback authorization "not read" | Fixed. The remaining authorization is also read from the 10-Q notes. AMZN's $6.1B now reaches the capital-return data. | `05ce272` | `tests/report.amznPresentationNits.test.ts` |
| 20g "Not assessed" officers | Fixed. Only cited facts appear under an officer the gate did not assess. | `c8fb6ca` | `tests/report.amznPresentationNits.test.ts` |
| 20h EV text printed three times | Fixed. The bridge is stated once, the EV rows point to it, and the setting is named as the house default. Stage B output and the payload are unchanged. | `55bac30` | `tests/report.amznPresentationNits.test.ts`, `tests/stageC.deterministicInjection.test.ts` |
| 21 Test gaps | Covered by the tests above: the no-root reverse DCF, SBC at negative FCF, the loss-year floor, recency, scenario direction, seasonal calendarization and the pinned labels. | — | — |

Every new test failed before its fix.

## Independent review

One fresh reviewer read the whole change against the audit's findings. It confirmed the numeric fixes and their tests, and found these problems, all fixed with tests that failed first:

| Problem | Fix | Commit |
|---|---|---|
| The pending-case clauses also kept clinical and commercial trials, a company's own divestitures, hypothetical antitrust claims and "reports filed by us with the SEC" | Relief and trials count only beside a legal proceeding, never a clinical or commercial trial; an allegation never when it is only a risk the issuer may face; "filed by" an agency only after a proceeding noun. The same AMZN passages still reach the payload. | `bd4d054` |
| The reverse-DCF text claimed an implied gap where value does not rise with growth | The bound records whether value rises with growth; otherwise its text states only that the price lies beyond every value in the range | `f86d465` |
| Candidates past the house's 10-candidate cap were counted as the provider's failure | Counted on their own: "N beyond the 10-candidate limit" | `315a151` |
| ESTIMATE claims still appeared under an officer the report does not assess | Only FACT claims appear there | `bbe9a1f` |
| The undisclosed-lease gap still named the environment variable | It says "under either lease setting" | `9d7d9ac` |

It also noted that the SBC floor ignores how large SBC is: any positive SBC beside non-positive FCF scores the floor, as any SBC above all positive FCF already did. That is left as an owner choice below. The docs now say exactly what the loss-year ROIC and the seasonal-shape quarter checks test.

## Codex review

The automated Codex review of the pull request raised four P2 findings, and its re-review of the fixes two more. All six were real, and each fix began with a test that failed, where a test could:

| Finding | Fix | Commit |
|---|---|---|
| A modal before a proceeding verb ("regulators could bring actions", "proceedings may seek structural relief") still took the pending-case reservation | A modal within a few words of any proceeding verb keeps a passage out of every clause | `cfa3bc4` |
| An invalid key, a denied subscription, a missing entitlement or an aborted request stopped peer collection but read as a screen exclusion | The loader and the summary share one list of terminal provider failures | `dd1fb93` |
| The scenario construction changed without its method stamps | SHARED_SCENARIO_PATHS_2026_10_D99 and SCENARIO_TARGETS_2026_10_D99 | `97e6476` |
| The notes and risk selection changed without its version | section-evidence-4 | `97e6476` |
| *(re-review)* A missing annual row stretched the buyback-timing window past three fiscal years | The window runs back two fiscal years from the latest annual row by date | `306cf6a` |
| *(re-review)* The modal guard dropped an actual case whose sentence went on to a possible consequence | The guard reads only the words up to and including the matched claim | `dca542e` |

## What moves on the stored inputs

Replayed offline on `1f555a7` and on this branch. AMZN's figures use the SEC statements re-read from its stored filings, as in #41.

| Company | Figure | Before | After | Findings |
|---|---|---|---|---|
| AMZN | Fair value per share | $100.56 | $96.08 | 9 (terminal ROIC), 11 |
| AMZN | Bear / base / bull | $86.71 / $100.56 / $113.98 | $82.11 / $96.08 / $110.32 | 9, 11 |
| AMZN | Composite | C (59.2) | C (55.5) | 8, 9, 10, 15, 20b |
| AMZN | Valuation | F (38.7) | F (31.6) | 10 |
| AMZN | Balance sheet | C (63.5) | C (56.1) | 8, 20b |
| AMZN | Moat | B (71.5) | C (63.5) | 9 |
| AMZN | Leadership | D (46.4) | D (50.8) | 15 |
| FCX | Leadership | D (51.8) | C (59.5) | 15 |
| FCX | Composite | C (57.0) | C (57.3) | 15 |
| O, PGR, SNOW | Grades and values | — | unchanged | — |

AMZN's fair value falls because restoring FY2022's 6.9% ROIC, below the WACC, ends the terminal excess return: the terminal ROIC falls to the WACC. The bull case falls with the base but sits further above it ($14.24 above, from $13.42) because its margin is no longer cut. Finding 19 moves nothing here because no stored run fetched consensus; with the consensus the audit cited injected, AMZN's year one is $874.7B instead of $917.2B.

## Fixture control

In the provider-free DEMO control the reverse DCF now carries its bound (DEMO's price of 40 is below its value at every growth in the range), so its reverse signal is graded again: valuation completeness returns from 0.4 to 0.7 and the composite moves from 73.97 to 76.37. The EV bridge is stated once, and the spec version moves. These are classified as `amzn-deferred-fixes-20261020` in `tests/fixtures/audit-intended-deltas.json`. The Stage C payload pin moves only by the reconciliation note and two reworded notes; restoring them reproduces the preceding prompt and finance hashes.

## Data rights

New tests use public SEC filing text and companyfacts shapes, and synthetic figures. No vendor data is committed.

## Choices for the owner to confirm

- **SBC at the floor** when FCF before SBC is not positive, whatever the size of the SBC (a materiality test on SBC/revenue is possible).
- **The marginal-rate floor for loss years** in ROIC, and its knock-on to the terminal excess return.
- **The three-year recency window** for buyback timing, and leaving timing out when nothing was repurchased in it.
- **Grading a reverse DCF at the range's end** when the price lies beyond it.
- **Scenario margins that never move against their scenario.**
- **The seasonal-shape windows** for consensus (four reported quarters ending on the year end, each of the last three 84-98 days after the one before; fiscal years within 10 days of an anniversary).
- **The government-plaintiff list** for the pending-case reservation.
- **The stance wording** ("undemanding / about right / demanding") and the 20-point reconciliation threshold.

## Deferred

- Recommendation item 12 of the independent audit (the unprofitable-company overlay policy) still needs the owner's decision.
- Segment-aware peers need a peer source per segment.
- Joining segment members renamed between filings (D-63) for annual-only members.
