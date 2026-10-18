# Preferred cash payout admission — 2026-10-17

## Decision and evidence

D-34 owns common-claim payout; this repairs the deferred D-42 APIC-inclusive preferred detection at the SEC statement adapter. A positive preferred carrying value cannot justify treating aggregate dividend cash as common cash. Missing common cash evidence therefore withholds the common field and its provenance while preserving the raw aggregate. This is admission control, not a newly calculated JPM payout or valuation.

Primary sources reviewed on 2026-10-17:

- [JPMorgan Chase 2025 annual report](https://www.jpmorganchase.com/content/dam/jpmc/jpmorgan-chase-and-co/investor-relations/documents/annualreport-2025.pdf), glossary printed p.325 (PDF p.357): preferred dividends include declared dividends and deemed dividends upon redemption. Note 23, printed p.286 (PDF p.318), distinguishes 55,949 million common-equity income from the 55,681 million basic-EPS numerator after a 268 million participating-security allocation. These definitions do not establish preferred cash paid. No live issuer companyfacts were fetched or retained for this repair.
- [SEC SAB Topic 6.B](https://www.sec.gov/interps/account/sabcodet6.htm): common-stock income includes adjustments for unpaid cumulative preferred dividends and carrying-value increases. Earnings allocation cannot be assumed to equal a cash disbursement.
- [FASB ASU 2018-09](https://storage.fasb.org/ASU_2018-09.pdf), pp.13–14 (PDF pp.18–19), ASC 260-10-45-60B: two-class EPS allocates earnings among participating securities. This supports keeping the EPS/common-equity-income question separate from cash admission.
- [SEC-filed taxonomy definition](https://www.sec.gov/Archives/edgar/data/1141391/000114139126000013/R93.htm): `DividendsCommonStockCash` covers paid and unpaid declarations settled in cash. It is not a cash-paid replacement for `PaymentsOfDividendsCommonStock`.

## Bounded implementation

Previously the aggregate fallback checked only `PreferredStockValue`. It now checks any positive monetary tag in the existing preferred-stock synonym chain, independently of conflicting zero par/closing values. Evidence must occur within the actual resolved payout window or on its immediately preceding opening-balance date. A positive preferred claim in another currency still establishes issuer exposure without FX conversion; cash subtraction continues to require the same reporting currency. A closing zero does not erase exposure earlier in that period. Distant historical holdings and preferred cash from a completed prior period do not permanently block a later ordinary aggregate fallback.

Regression work also exposed two companion defects in the same chain: total cash 20 less preferred cash 21 yielded common cash +1; preferred cash −8 yielded common cash −28. The localized guard now refuses contradictory component signs and preferred exceeding total, without clamping. An unusable preferred-cash component overlapping the payout window cannot fall through to an aggregate common proxy; this includes incompatible periods/currencies. Directly sourced common cash, including explicit zero, wins. Zero aggregate cash remains common zero when no preferred-cash component contradicts that inference. Compatible cash-only 20 less 8 remains common −12 in FMP sign convention.

Existing protections retained: the fact index filters future filing/period observations before deduplication; row resolution requires exact flow periods and the reporting currency; withheld common fields lose field provenance; financial payout requires two usable annual observations; insufficient payout produces null equity value, per share, implied P/B, and reverse solve with a critical explanatory gap. Supported earnings, TCE, and ROTE remain available.

Follow-up review found a release blocker beyond adapter admission: explicit common-cash refusal lived only in the statement-level `withheld` array. With aggregate zero, Stage B admitted repurchases and inferred the refused common cash as zero. The adapter now carries only an explicitly withheld, null `commonDividendsPaid` on the existing row `fieldConflicts` contract. Financial payout admission and the payout estimator honor that refusal even with a zero total. The explanatory common-dividend gap also covers this case. Direct common zero, uncontested aggregate zero, and legacy zero rows without a refusal retain their existing treatment. Other statement refusals, return calculations, earnings allocation, and grading are unchanged.

`CompanyFacts` is an issuer-local input. Upstream identity admission owns issuer custody; this patch does not invent absent per-fact entity metadata or merge issuers. The integration fixture injects synthetic parsed cash rows into the existing synthetic route bundle to exercise consumers, not provider acquisition or issuer-custody validation. No user database or application operation is needed.

## Verification

- Before production changes: `tests/edgar.preferredCashAdmission.test.ts` had **12 expected failures and 6 passes**. APIC-only/zero-par/closing-zero cases retained aggregate −20; contradictory components produced +1/−28; invalid component fallbacks retained aggregate −20.
- Focused parser and report-surface checks preserve direct cash zero and 20−8, both APIC aliases, opening/intraperiod exposure, prior redemption, stale/future facts, currency/period refusal, and a YTD-derived quarter's actual start.
- Integration verifies 0/1 usable payout years across Stage B, report schema, stored-report parsing, web rendering, Markdown, print HTML, and audit Markdown. The report input remains unchanged by reading/rendering. Two usable years remain admitted.
- Clean controls: `(40/140 + 56/130 + 39/120)/3 × 100 = 34.71611721611722%`; `362438 − 20045 − 52731 − 2600 = 287062` TCE.
- An additional overlap-boundary regression failed (1 failed / 24 passed) before removing an overly restrictive evidence-end check: a mismatched preferred-cash period ending one day after the payout window must also block aggregate fallthrough.
- Parent review exposed a separate existence-versus-arithmetic mistake: a positive preferred balance in CAD beside USD cash was initially ignored. The corrected regression failed (1 failed / 24 passed) before allowing any monetary currency to establish preferred existence; no conversion or mixed-currency subtraction is performed.
- Independent review identified the removed aggregate-zero exception: a new regression failed (1 failed / 29 passed) before restoring zero total → zero common only when no preferred-cash evidence contradicts it. Four companion cases pin refusal beside positive/negative/period/currency-conflicting preferred cash.
- Adapter-stage verification passed **268/268 in 5 files**, but did not cover zero-total refusal propagation. Four added end-to-end regressions then failed (4 failed / 7 passed): each incorrectly produced payout 13.171550671550671% and value 12.565731887250228 per share. The same four failures were confirmed after serializing the synthetic bundle to JSON.
- The new cases cover positive/negative/period/currency-conflicting preferred cash in all three annual observations, parsed row refusal, serialized bundle, Stage B, report schema, stored-report reading, model payload, live web rendering, Markdown, print HTML, and audit Markdown. They require null payout/value/implied P/B/reverse solve and the critical payout gap, while supporting TCE and ROTE. Both genuinely sourced zero controls remain usable.
- Final follow-up: **274/274 passed in 5 files** (`edgar.preferredCashAdmission`, `edgar.preferredPayoutSurfaces`, `edgar.statements`, `stageB.ttm.compute`, `research.routePanel`, each `.test.ts`), with `--maxWorkers=1`. Typecheck, lint (`--no-cache`), and diff checks passed. Vitest emits its existing CJS/native-config warning. Windows test TEMP/TMP were set explicitly to the permitted local Temp directory; locked installed dependencies were reused through the authorized `node_modules` junction.
- The patch is separately stacked on safeguard commit `34c6be7cb5757d26dc9781358c4f6c087ef3b22a`. Report `1.24.1`, payload `1.29.1`, pipeline `stage-c-1.2.1` and Stage B `STAGE_B_2026_10_COMMON_CASH_REFUSAL_6` prevent old-context reuse. The general-route audit changes only its report-spec leaf; every financial assertion, registry hash and prompt byte count remains pinned. The payload fingerprint changes with its version.
- Stacked version/report/golden checks passed 267 tests across four files. Independent review found no remaining material issues in the bounded parser-to-report cash admission chain; the separate earnings-allocation investigation remains open.

### Final local gates

The frozen stacked candidate passed every required local gate on Windows:

| Command | Result |
| --- | --- |
| `npm run check:dependencies` | Passed with an independent exact-lock installation. |
| `npm run typecheck` and `npm run lint` | Passed. |
| `npm run test:product -- --maxWorkers=2` | 349 files, 7,242 passed, three existing skips. |
| `npm run test:integration` | One file, four passed. |
| `npm run test:coverage:core -- --maxWorkers=2` | Passed unchanged thresholds: statements 96.50%, branches 90.78%, functions 98.01%, lines 97.71%. |
| `npm run test:coverage:risk` | Passed unchanged per-file thresholds: aggregate statements 94.98%, branches 88.79%, functions 97.64%, lines 97.23%. |
| `npm run build` | Passed with an isolated empty application profile and provider credentials removed. |
| `npm run audit:security` | Passed; zero dependency vulnerabilities reported. |

An initial dependency-shape check refused a shared dependency junction because npm classified its real paths as extraneous. That attempt stopped before product tests. Replacing only the worktree's junction with its own unchanged-lock installation and rebuilding the SQLite native addon resolved the environment issue; all results above come from the fresh complete run.

Committed-head runtime replay and Linux/Windows CI remain separate checks. This note records local results, not deployed application behavior or live issuer/provider validation. No paid provider/model analysis was used.

## Deferred, unchanged

`returns.incomeAvailableToCommon` can use preferred cash as a fallback even though earnings allocations can include unpaid cumulative dividends/accretion; two-class EPS income can differ from common-equity income; annual joins with ±5-day tolerance can cross incompatible flow scopes. These remain separate follow-ons. This patch adds no declared-dividend bridge, changes no return formula, rewrites no historical report, and claims no fresh issuer numerical correction.
