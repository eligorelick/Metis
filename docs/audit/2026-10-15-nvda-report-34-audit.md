# NVDA report #34 audit: what stands between Metis and institutional grade

Audited artifact: `NVDA-report-34.md` (generated 2026-10-15T20:58Z, spec 1.17.0,
pipeline stage-c-1.1.1, model chatgpt/gpt-6-astra for bull, bear and judge).
Size: 413 KB, 2,227 lines. 193 KB is the report body; the other 220 KB is appendix and verification log.

Method: I read the whole report and replicated the DCF from its disclosed inputs. I
checked figures against SEC filings and market data (see the fact-check section)
and traced each defect to the code that produces it. Severity:

- **P0** changes the investment conclusion, or is a factual or arithmetic error.
- **P1** is a material omission an institutional reader would reject the report for.
- **P2** is a methodology weakness that distorts grades.
- **P3** is presentation and readability.
- **P4** is data acquisition, process and trust signalling.

## Bottom line

0. **The historical numbers are right; the analysis built on them is not.** An
   independent check against EDGAR XBRL, the 10-K, the 10-Q, the 8-K earnings
   releases and the DEF 14A found every reported historical figure correct:
   income statement, cash flow, segments, debt, price, SMA, RSI, multiples, the
   10y yield and beta. The defects are in modelling choices, omissions, stale
   facts and presentation.
1. **The headline valuation conclusion (Valuation F, base $143.96 vs $217.27) is an
   artifact of a house rule, not a finding.**
   - The DCF clamps year-one growth to 25% and caps the margin at the FY2025
     annual level. That puts next-12-month revenue at $378.7B. This is below
     the latest quarter's annualized run-rate ($96.22B × 4 = $384.9B). It is
     well below NVIDIA's own Q3 FY2027 guidance annualized ($108.0B ± 2% × 4 =
     $432B).
   - The base case therefore assumes revenue *falls* sequentially from a quarter
     the company has already guided up 12%.
   - The replicated DCF matches the report ($143.98 vs $143.96). Anchoring only
     year 1 to the Q3-guidance run-rate gives $258, above the quote.
   - The reverse DCF's own break-even (37.4%) is below the guided run-rate.
2. **Consensus, peer valuation, executive pay and peer market caps are all
   suppressed by the same over-strict "currency not established" rule.** NVIDIA
   reports in USD. Throwing away USD analyst estimates removed the only
   forward-looking anchor and contributed to the clamp.
3. **Several grades are distorted by mis-specified signals.** The accruals ratio
   counts purchases of marketable securities and strategic stakes as accruals (0.91,
   "red"). The ROIC "stability" score penalises ROIC for *rising* (subscore 12).
   Beneish is flagged with no decomposition. ROIC−WACC is scored twice. Together
   these produce Quality C and Moat C for one of the highest-return franchises in
   the market.
4. **The report omits most of what an NVDA analyst would lead with**, all verified
   in primary filings:
   - Q3 FY2027 guidance ($108.0B ± 2%; GM 74.0% ± 50 bp; FY27 tax 16–18%)
   - Q1 FY2027 results
   - Q2 YoY growth (+106%)
   - Q2 market-platform mix (Hyperscale $48.7B, ACIE $40.3B, Edge $7.2B)
   - The dividend raised from $0.01 to $0.25/quarter
   - $99.0B of buyback authorization remaining
   - A $105B residual-value guarantee on OpenAI-tenanted data centers
     (8-K, 2026-08-17)
   - Supply commitments up from $119B to $279B
   - $25B of new senior notes, which is why debt rose to $33.4B
   - About $99B of strategic equity stakes
   - The Hugging Face acquisition agreement (8-K, 2026-09-02)
   - The EVP Worldwide Field Operations change (Puri departure, 8-K 2026-06-28)

   Also missing:
   - The Rubin roadmap
   - CUDA, the software moat
   - Hyperscaler custom silicon
   - TSMC and HBM supply
   - China licensing
   - Consensus and price targets (fetched but never shown)
   - Any peer multiples

   Zero mentions of Rubin, CUDA, OpenAI, TSMC, dividend or short interest. The
   report also states twice that issuer-defined free cash flow "is not in the
   filings and data reviewed". NVIDIA publishes it every quarter (Q2: $21.3B).
5. **The trust layer undermines itself.** The header says "Factual prose claims:
   0/90 validated; 1 contradicted". The single "contradiction" is a verifier false
   positive. A TTM figure ending 2026-07-26 was flagged because the sentence
   contains "2026". Sentences that state a metric and value verbatim are
   "unchecked" because the matcher cannot link them to their metric.
6. **Readability is far below the bar.**
   - Internal IDs are used as metric names (`computed.deterministic-aspect-scores.valuation-score`).
   - 157 duplicated `source id:`/`src:` pairs.
   - 2,003 "n/a" cells.
   - ~180 hedging clauses ("is not…", "does not establish…").
   - 16-digit floats and raw JSON in table cells.
   - The same assumptions block is repeated 8 times.
   - No charts and no multi-year financial summary.

---

## P0 — Errors that change the conclusion or are wrong

### P0-1. DCF year-one growth clamp contradicts reported run-rate (report §5, §12)

- **Evidence.** `near-term growth anchor … 25.0% (… clamped from the 66.9% median)`
  (line 521).
  - Base 12M-ending-2027-07-26 revenue is $378.71B (line 550).
  - The latest quarter is $96.22B (line 244). Its annualized run-rate is $384.9B.
  - Base EPS for the same window is $9.27 (line 1158), below the Q2 run-rate of $2.46 × 4 = $9.84.
  - The "What would change the assessment" milestone (revenue below $378.71B) is
    therefore almost certain to be cleared, so it carries no information.
- **Replication** (Node re-implementation of the disclosed inputs; mid-year discounting; reproduces base $143.98 and bull $814.16):

  | Change vs report base (all else equal) | Value/share |
  | --- | --- |
  | Report base (g₁ 25%, WACC 13.25%, tax fades to 8.9%) | $144 |
  | g₁ 40% | $237 |
  | g₁ 50% | $327 |
  | WACC 11% | $186 |
  | WACC 10% | $214 |
  | Terminal tax floored at 15% (Pillar Two) | $137 |
  | g₁ 50%, WACC 11%, tax floor 15% | $413 |
  | Price-implied g₁ at the report's WACC | 37.4% (matches report) |
  | Price-implied g₁ at WACC 10.5% and 15% tax floor | 29.0% |

- **Fix.**
  - Anchor years 1–2 on, in order: management guidance for the next quarter, consensus
    (once the currency bug in P0-2 is fixed), then the latest-quarter run-rate.
  - Apply the [-10%, 25%] clamp to *growth relative to the run-rate*, not to TTM.
  - Never let base year-1 revenue fall below the annualized latest quarter
    unless guidance says so.
  - Show a growth × margin grid next to the WACC × g grid; the existing grid only
    varies the two least decisive inputs.
- **Compounding margin cap.** The base margin is also cut from the TTM 65.21% to
  62.42%. The ceiling is the highest *annual* margin of the last five years
  (FY2025), and the code states "the TTM figure is not evidence for its own cap".
  The last two quarters ran at 65.6% and 66.2%, and Q3 guidance implies ~65.5%.
  The rule therefore forces a margin step-down in year 1 that nothing in the
  evidence supports.
  - Allow TTM (or guidance) to set the year-1 margin, and fade from there.
  - Keep the cap for terminal-year margins.

### P0-2. "Currency not established" discards USD data for a USD issuer (§5, §8, §9, appendix)

- **Evidence.**
  - Line 494 and line 1604: analyst estimates were excluded because they "carry no
    currency of their own". As a result, line 1605 records "no usable analyst
    revenue estimates".
  - Line 1011: "peer market-capitalization entries have no established currency".
  - Lines 930–978: every executive compensation amount is suppressed with "the
    compensation currency is not established".
- **Why it matters.** It removes consensus, which is the sanity check for the growth
  anchor. It also removes peer sizes and the whole pay discussion.
- **Fix.** Introduce a single currency-resolution rule. When the provider's
  per-symbol endpoints are single-currency, inherit the issuer's reporting currency:
  - `dei` / XBRL unit on companyfacts
  - profile `currency`
  - listing exchange

  Mark the value as "inherited from reporting currency". Withhold only on a real
  conflict.

### P0-3. Guidance-anchored check and the fade shape (§5)

- **Evidence.** All figures below come from the same replication engine.

  | Year-1 anchor (other inputs at report values) | Value/share |
  | --- | --- |
  | Report: TTM × 1.25 = $378.7B | $144 |
  | Q3 FY27 guide × 4 = $432B (+42.6%) | $258 |
  | Consensus-implied 12M to Jul-2027 ≈ $540B (+78%; consensus from secondary sources) | $781 |

- **Interpretation.** The second row shows the clamp alone flips the conclusion.
  The third row shows the *other* failure mode. A linear 10-year fade that starts
  at a hypergrowth rate keeps growth above 50% for years. The value then swings
  from $144 to $781 on the year-1 input alone.
- **Fix.**
  - Decouple the level from the slope. Use an explicit 2–3 year forecast
    anchored on guidance and consensus.
  - Then converge growth toward an industry or GDP-plus rate on a
    convex/exponential path, not linear from year-1 growth.

### P0-4. Terminal tax rate fades the wrong way (§5)

- **Evidence.** "TTM effective rate 16.05% fading to company historical median 8.93%
  by year 10" (line 524). Terminal NOPAT is taxed at 8.93% in perpetuity.
- **Why it matters.**
  - NVIDIA guides a **16–18%** FY2027 tax rate (Q2 FY27 release).
  - Standard practice (Damodaran) moves the effective rate *toward the marginal
    rate* in the terminal year.
  - A $1T-revenue company below the 15% Pillar Two minimum is implausible.
  - The error offsets part of P0-1, which is why it hides.
- **Fix.** Converge to max(statutory marginal, 15% global minimum) and disclose it.

### P0-5. Scenario construction produces economically impossible paths (§5, §12)

- **Evidence.**
  - Bull: growth +25pp *in every explicit year* (50% → 27.5%) with a 72.5%
    operating margin (lines 698–699). That margin is above FY2026's 71.1% *gross*
    margin, and the path takes revenue to ≈$7.9T by year 10.
  - Bear: ten straight years of decline (0% → −22.5%) to ≈$89B of revenue.
  - Result: bull $814 and bear $32, a 25× spread.
  - The 25/50/25 "display weights" imply a weighted value of ≈$284, *above* the
    price. That contradicts the F grade and the verdict, and the report never shows
    the number.
  - The more defensible decaying-shock variant ($385 / $53) is demoted to
    "illustrative" (line 1141).
- **Fix.**
  - Build scenarios from drivers: accelerator units/ASP or hyperscaler capex
    share, gross margin, opex intensity.
  - Use mean-reverting shocks.
  - Cap operating margin at gross margin minus a minimum opex ratio.
  - Either publish the probability-weighted value and reconcile it with the grade,
    or stop displaying weights.

### P0-6. Accruals ratio treats investment purchases as earnings accruals (§3, §6; drives Quality C)

- **Evidence.**
  - Lines 296–302 and 797–817: broad accruals = NI − CFO − CFI = $69.58B over
    average NOA $76.27B, giving 0.91 "red".
  - CFI (−$52.23B) is dominated by purchases of marketable securities and
    non-marketable strategic equity. Capex was only $6.04B.
  - NOA rose from $46.39B to $106.15B, apparently including strategic investments.
- **Why it matters.** Sloan/Richardson accruals measure *operating* accruals.
  Financial-asset purchases are not accruals. The signal scores 16/100 and is a
  "red" forensic flag.
- **Fix.**
  - Exclude short-term investments, marketable securities and non-operating equity
    investments from both CFI and NOA (Richardson et al. 2005 financial-asset
    adjustment).
  - Add a growth-adjusted reading for firms growing over 30%.

### P0-7. Verification headline is wrong and self-defeating (header, appendix)

- **Evidence.**
  - Header line 15: "0/90 validated; 1 contradicted; 89 unchecked".
  - The contradiction (line 2029) is the sentence "Operating cash flow for the
    trailing period ended 2026-07-26 was USD 134.360 billion". It was rejected
    because it "names '2026' but the cited figure is registered for period ttm:
    2025-07-27 to 2026-07-26". That is a false positive.
  - Sentences such as "Total debt including leases was USD 38.860 billion" (line
    367) are "unchecked: prose does not identify the metric of the cited numeric
    record".
- **Fix.**
  - The period checker should accept any date inside, or equal to an endpoint of,
    the cited window.
  - The metric matcher should use the registry's display label and synonyms.
  - Count numeric-support passes as "validated". Today the 313/322 numeric
    provenance never reaches the headline.

### P0-8. Contradictory earnings reconciliation (§3)

- **Evidence.** Commentary (line 309) says operating income plus other income
  reconciles to pretax income and EPS. The deterministic table directly below
  says "Reconciliation status: unavailable … Statement duration boundaries are
  unknown or conflicting" (lines 331–337). "Reported source facts (assembled)" is
  an empty table.
- **Likely cause.** 52/53-week fiscal-period boundary matching. NVIDIA's year ends
  on the last Sunday of January.
- **Fix.** Use the AMZN-audit period tolerance for retail/52-53-week calendars, and
  hide empty tables.

### P0-9. Three conflicting net-debt figures (§4)

- **Evidence.**
  - Net debt −$66.0B (DCF bridge), −$60.5B (incl. leases) and +$16.4B
    ("statement's net-debt amount") are all stated as FACT (lines 367–375).
  - The 10-Q (Note 5) confirms "cash and short-term investments" of $99.37B =
    cash $22.44B + marketable debt $34.14B + **publicly-held equity $42.78B**.
    The note says "$36.9 billion of investments … are subject to short-term
    lock-up restrictions". The DCF bridge therefore counts locked-up equity
    stakes as cash.
  - The report never explains why debt rose from $8.5B to $33.4B: $25B of senior
    notes were issued in Q2 FY2027.
- **Fix.**
  - Publish one canonical net cash figure with an explicit bridge.
  - Treat listed strategic equity stakes as non-operating assets, with a haircut
    and a disclosure, not as cash.
  - Drop the vendor "netDebt" line from prose.

### P0-10. Capex "discrepancy" that is only rounding (§4)

- **Evidence.** "$6.1 billion" (MD&A) vs "$6.042 billion" (cash-flow statement).
  The report says "We preserve the separate reported amounts rather than assume
  that they are precisely interchangeable" (lines 430–432).
- **Fix.** Use a rounding-aware comparison: same value at the stated precision
  means consistent.

### P0-11. Statements that are wrong or stale as of the report date

| Report statement | Reality (primary source) | Root cause |
| --- | --- | --- |
| "Issuer-defined free cash flow is not in the filings and data reviewed" (lines 318, 428) | Every earnings release defines and reports FCF (Q2 FY27 $21.3B; FY26 $96.6B) | 8-K EX-99.1 is never ingested |
| Flat-share EPS because "no funded future repurchase schedule" (lines 451, 1152) | $99.0B authorization remaining. Q2 buybacks $19.7B plus dividends $6.0B. Dividend raised to $0.25/quarter (Q2 release) | Same, plus capital-return facts not modelled |
| Guarantees described as "land, power and shell guarantees" (10-K scale, ~$3.5B) | $105B cap on residual-value guarantees for OpenAI-tenanted capacity (8-K 2026-08-17). Supply commitments $279B, up from $119B (Q2 CFO commentary) | 8-Ks and CFO commentary not ingested; FY 10-K only |
| Ajay K. Puri listed as current EVP Worldwide Field Operations | Departure notified 2026-06-28 (8-K Item 5.02); successor appointed August 2026 | FMP key-executives is stale; 8-K Item 5.02 not scanned |
| Customer concentration 22% / 14% (FY26) presented as current | H1 FY27: three direct customers at 16%, 15% and 13% (10-Q) | 10-Q notes not ingested |
| "Latest revenue YoY 65.5%" | That is FY26 annual growth. Q2 FY27 YoY is +106% | Annual-only growth metric labelled "latest" |
| Geographic row "Other Americas" $4.30B | The 10-K label is "Other" | Vendor segment label |
| No mention of the Hugging Face acquisition agreement | 8-K 2026-09-02 (Item 8.01) | 8-K Item 8.01 not scanned (only 4.01/4.02 are scanned) |

---

## P1 — Missing content an institutional reader expects

| # | Gap | Evidence in report | What to add |
| --- | --- | --- | --- |
| P1-1 | **No management guidance.** | 0 mentions of next-quarter outlook. Only 8-K-free sources are ingested (10-K Items 1A/7, 10-Q Item 2). | Ingest 8-K EX-99.1 and the CFO commentary, which are free on EDGAR. Show next-quarter revenue, GM, opex and tax guidance, and a guidance-vs-actual track record (§11 "Guidance credibility" is currently boilerplate). |
| P1-2 | **No quarterly trend.** | Only FY2026 and Q2 FY2027 columns. "Latest revenue YoY 65.5%" is the *annual* FY26 number (line 237). Q2 FY2027 YoY (~+106% vs Q2 FY26 $46.74B) and sequential growth are never shown. | 8-quarter table: revenue, YoY, QoQ, GM, opex, op margin, EPS, OCF, FCF. |
| P1-3 | **Stale segment mix.** | Segment tables are FY2026 annual (lines 192–207). The report acknowledges the 10-Q's new Hyperscale / AI Clouds, Industrial & Enterprise / Edge presentation (line 188) but never shows it. | Latest-quarter market-platform revenue with recast comparatives and YoY. |
| P1-4 | **No multi-year financial summary.** | No 5-year income statement, balance sheet or cash flow tables. | Standard FY-5…FY+2 model table. |
| P1-5 | **No forward multiples or consensus.** | Multiples are TTM only (line 579). Price-target consensus, ratings consensus, analyst estimates, short interest and news were fetched (appendix lines 1492–1518) and never used. | Forward P/E, EV/forward EBITDA, PEG, consensus revenue/EPS (FY+1, FY+2), dispersion, PT range, revisions trend (§11 shows "—"). |
| P1-6 | **No peer valuation, for any issuer.** | 2 of 10 candidates evaluated, 0 eligible. AVGO blocked by FMP HTTP 402. AMD excluded for "missing comparability evidence". **That evidence field is never populated anywhere in `src`, so this gate excludes every peer on every report** (see the root-cause map). The peer list includes a customer (CoreWeave) and obscure tickers (MOVE, XLAB). | A curated competitor map (AMD, AVGO, MRVL, INTC, QCOM, ARM, TSM, plus hyperscaler silicon context). Pull peer fundamentals from SEC companyfacts (free) to avoid FMP 402s. Relax the comparability gate to "show with caveat". |
| P1-7 | **No own-history multiple bands.** | "insufficient history (need ≥8 quarters)" because FMP EV history is capped at 5 rows. The pipeline already holds 24 quarters of statements and 5 years of prices. | Compute historical P/E, EV/Sales and EV/EBITDA bands from the data already held. |
| P1-8 | **Thesis-defining topics absent.** | 0 mentions of Rubin, CUDA, OpenAI, Anthropic, TSMC, CoWoS, HBM, H200, sovereign AI or hyperscaler ASICs (TPU, Trainium, MTIA). | Product roadmap, software ecosystem, competitive silicon, supply chain, strategic investments and vendor-financing exposure, China licensing. |
| P1-9 | **Moat analysis misses the main moat.** | Only "scale (narrow)" and "ip (narrow)" (lines 1038–1046), raw lowercase enums. Market share is "No market-share direction is inferred". | Switching costs and ecosystem (CUDA, libraries, developer base), networking attach (NVLink, InfiniBand, Spectrum-X), systems integration. Use third-party share estimates with sources. |
| P1-10 | **Leadership section is empty, for every issuer.** | Five identical "not-assessed" cards with no pay numbers. The assessment gate requires a "verified" log outcome that the verify pass never assigns to prose claims, so *no executive can ever be assessed*. Insider data unavailable (FMP 402). No ownership, board, succession or key-person risk. | Pay from DEF 14A (free), Form 4 insider transactions from EDGAR (free), CEO ownership, 10b5-1 plans, board independence, say-on-pay. |
| P1-11 | **Catalyst and risk lists are generic.** | One dated catalyst (earnings 2026-11-18, "tentative"). Every risk probability is "medium". | Dated calendar: earnings, GTC, hyperscaler capex prints, product launches, export-rule decisions. Risk matrix with quantified exposure (e.g., % revenue from top-2 customers, China share). |
| P1-12 | **No clear call or key-data box.** | The verdict is a hedged paragraph. No market cap, EV, 52-week range, float, dividend yield, ADV or shares outstanding up front. | Page-1 box: price, market cap, EV, 52w range, consensus PT, model fair-value range, upside/downside, key metrics, 3-bullet thesis, 3-bullet risks. |
| P1-13 | **No charts.** | — | Price vs SMA and relative strength, revenue/margin history, segment mix, valuation band, scenario fan, sensitivity heatmap. |
| P1-14 | **Most of the filings were never read.** | Lines 1565–1567: 89% of 10-K Item 1A, 64% of Item 7 and 81% of 10-Q Item 2 were dropped by section-evidence-2. The LLM repeatedly writes "the retained filing discussion is incomplete". No Item 1, notes or proxy. | Add Item 1, the segment note, the concentration note, purchase obligations and commitments, the investments note and the earnings release. Raise the per-section budget for issuers whose risk factors run long. |

---

## P2 — Methodology weaknesses that distort grades

| # | Issue | Evidence | Fix |
| --- | --- | --- | --- |
| P2-0 | **WACC 13.25%: the inputs are accurate, the beta method is the issue.** | Verified: 10y UST 5.21% (2026-10-13); raw 5y beta ~2.22; ERP 4.46% is Damodaran Jan-2026 (Oct implied 4.20%). Cost of equity 13.29% rests on one regression beta (Blume 1.81) inflated by NVIDIA's 2023–25 re-rating. Each 100 bp of WACC is worth ~$20–40/share. | Show a bottom-up (unlevered industry, re-levered) beta beside the regression beta. Publish the window and R². Refresh the ERP monthly. Widen the grid to ±200 bp. Use FRED DGS10 for current and history (line 1443 admits a provider mismatch). |
| P2-1 | **ROIC "stability" penalises improvement.** | `roicStability` 61.2pp, subscore 12 (line 152). ROIC rose from ~20% to 150%. This pulls Moat to C. | Use downside deviation, years with ROIC > WACC, or the minimum ROIC over the window, not plain standard deviation. |
| P2-2 | **Beneish flagged with no decomposition.** | M = −1.13 "flag" (line 824). Sales-growth index dominates for a 65% grower; the model is known to false-positive for hypergrowth. | Show all 8 indices. Suppress or down-weight the flag when SGI alone crosses the threshold, and disclose that. |
| P2-3 | **ROIC−WACC counted twice.** | 136.5pp is scored in Quality (`roicVsWaccSpread`) and again in Leadership (`capitalDeployment`). `roicLevel` adds a third ROIC signal in Moat. | One signal per factor family, or cap family weight. The report itself says shared families are not independent. |
| P2-4 | **Leadership grade is a buyback proxy.** | Grade B "(confidence: low)" while every executive is "not-assessed". | Rename to "Capital stewardship", or add qualitative inputs. |
| P2-5 | **Piotroski on a hypergrowth balance sheet.** | 4/9, subscore 35. Asset-turnover and current-ratio signals fall mechanically as cash piles up. | Disclose which signals failed. |
| P2-6 | **Valuation completeness 70% is silent.** | 30% of valuation inputs are missing (peers, own-history) and are shrunk to 50. | Show which inputs were missing next to the grade. |
| P2-7 | **Inconsistent margin basis in the DCF.** | "EBIT margin 62.4% → 62.4%: held flat at current 65.21%" (line 523). The basis string is written before the FY2025-annual cap (62.42%) is applied, so the text and the value disagree. | Write the assumption text after all clamps, and state which cap bound (see P0-1). |
| P2-8 | **Terminal value discounted with the mid-year factor.** | PV(TV) uses n − 0.5. End-year discounting gives $140.14 vs $143.98. | Document the convention, or discount the Gordon TV at year n. |
| P2-9 | **Historical FCF series mixes bases.** | FY2023 FCF is shown as $1.099B (after-SBC) in the projection series, while fcfCagr uses before-SBC $3.81B. | Pick one basis per series and label it. |
| P2-10 | **H20 charge rated a "high" severity flag.** | An 18-month-old Q1 FY26 item is the only "high" quality flag (line 832). | Time-decay flags, and score severity by materiality to current earnings. |
| P2-11 | **Judge is not independent.** | Same model family wrote both cases and judged them (lines 9, 1618). Both sides self-rated 3/5. | Use a different model family for the judge, or a deterministic adjudication rubric. |

---

## P3 — Presentation and readability (largely remove or condense)

**Remove from the report body.** Move these to a separate machine-readable audit file
linked from the report.

- The "Pass execution" header cell (1,797 characters; line 10).
- The "Cost $0.000000" row and cost table. Plan-allowance runs should report tokens
  instead.
- The Evidence-timing table (lines 462–471).
- The stock-split history back to 2000 (lines 1583–1588).
- The 70-row missing-data manifest.
- The ~500-line deterministic check log (lines 1633–2145).
- The raw JSON "Scenario construction" cell (line 1256).
- The four 17-column projection-series tables (lines 1258–1432).
- The duplicate "Aspect scores" table (it repeats the Scorecard).
- Duplicate key-number rows: `computed.current-capital.*` and
  `computed.capital.current.*` repeat the same values (lines 383–396, 411–419),
  and forensic values appear twice (lines 798–817).
- The repeated assumption blocks (4× in §12 plus 4× in the audit trail).
- Empty tables ("Reported source facts (assembled)" "—", missing-data "—",
  "Estimate-revision trend —").

**Fix formatting.**

- Replace internal IDs used as metric names with human labels (e.g.,
  `computed.deterministic-aspect-scores.fundamentals-score` becomes "Fundamentals
  score").
- Drop the duplicated "`source id: X` `src: X`" pair; use one footnote marker.
- Round consistently. Fix values such as:
  - 66.89858183148777
  - 426.7365x
  - 37.3975%
  - $217.2705
  - 24285000000 shares
  - 302969000000 "reporting-currency units"
- Fix unit strings:
  - "$11,063.00 millions"
  - "$4.50 billions"
  - "75.00 % Gross margin"
  - "95.00 0-100"
  - "-1.1 score"
  - "40.25 index" (RSI)
  - "-1.85 index" (MACD)
  - "**37.4**" with no unit
  - "$-7.35B" (should be −$7.35B)
- Drop columns that are always "n/a" ("Citation note", "Structured period",
  "Currency" on percentages). There are 2,003 "n/a" cells.
- Label "TAIWAN, PROVINCE OF CHINA" as "Taiwan", and "CHINA" as "China (incl. Hong Kong)".
- Reconcile "last close $217.316" with the "quote $217.2705". The quote was taken
  at 19:56Z, before the close, so label it "latest trade".
- Reconcile "Completeness confirmed: state degraded" (header).

**Tone.** Roughly 180 defensive negations ("is not a forecast", "does not
establish", "not calibrated"). State limitations once in a methodology box. Let
each bullet make one claim with a number.

**Structure.** "Bull/bear disagreements" sits under §13 Macro and belongs with the
Verdict. The Grade strip shows "Leadership B" next to five "not-assessed"
executives.

---

## P4 — Data acquisition, process and trust signals

- **FMP plan limits shape the report.** `limit=5`, and HTTP 402 on AVGO, insider
  trades, institutional ownership, transcripts, press releases and SEC filing
  search. Prefer free primary sources:
  - EDGAR companyfacts for peers and long history
  - Form 4 for insiders
  - DEF 14A for pay
  - 8-K EX-99 for guidance
  - company IR for transcripts and dates
- **A synthesize attempt failed and was discarded** (line 1619). Log the failure
  class and alert when the retry differs materially.
- **The completeness state is "degraded" while the grade confidence still says
  "high"** (Fundamentals). Tie confidence to completeness and source coverage.
- **The headline citation coverage (97%) measures provenance, not correctness.**
  Lead with a correctness metric once P0-7 is fixed.

---

## Fact-check against primary sources

Sources:
- EDGAR companyfacts (CIK 1045810)
- 10-K FY2026 (`000104581026000021`)
- 10-Q Q2 FY2027 (`000104581026000075`)
- Q1 and Q2 FY2027 earnings releases and CFO commentary (8-K EX-99)
- 8-Ks dated 2026-06-28, 2026-08-17 and 2026-09-02
- DEF 14A (2026-05-12)
- U.S. Treasury yield curve and Yahoo daily closes

Items marked ✔ were re-read in the filing text during this audit. Consensus
figures come from secondary aggregators and are labelled as such.

| Claim in report | Report value | Verified value | Verdict |
| --- | --- | --- | --- |
| FY26 revenue / operating income / net income / diluted EPS | $215.94B / $130.39B / $120.07B / $4.90 | Same | Correct |
| FY26 other income; pretax; tax; diluted shares | $11,063M; $141.45B; $21.38B; 24.51B | Same | Correct |
| FY26 GM; OCF; CFI; capex | 71.1%; $102.72B; −$52.23B; $6.04B | Same | Correct |
| H20 charge; state VA release | $4.5B; $711M | Same | Correct |
| FY26 product segments / geography | DC $193.74B … / US $149.62B … | Same values. "Other Americas" should read "Other". These categories have been retired. | Correct but stale |
| Geographic basis | Customer HQ | HQ of direct customer, changed from billing location in Q3 FY26 | Correct |
| Customer concentration | 22% / 14% (FY26) | FY26 correct; H1 FY27 16% / 15% / 13% | Stale |
| Q2 FY27 revenue / op income / NI / EPS / GM | $96.22B / $63.73B / $59.69B / $2.46 / 75.0% | Same | Correct |
| Q2 FY27 other income; equity gains | $7,773M; $7,771M | Same | Correct |
| Q2 FY27 market-platform split | Not given | Hyperscale $48.71B; ACIE $40.31B; Edge $7.20B | Omitted |
| Q1 FY27 results | Not given | Revenue $81.62B; NI $58.32B, incl. $15.9B equity gains; EPS $2.39 | Omitted |
| Q3 FY27 outlook ✔ | Not given | Revenue $108.0B ± 2% (no China DC compute); GM 74.0% ± 50 bp; GAAP opex ~$9.2B; FY27 tax 16–18% | Omitted |
| TTM OCF / capex / SBC / revenue | $134.36B / $7.35B / $7.24B / $302.97B | Same | Correct |
| Q2 FY27 OCF $24.08B vs NI $59.69B | Stated, cause not given | CFO commentary: receivables on extended terms (DSO 60), cash taxes, inventory build ahead of Vera Rubin | Correct; explanation omitted |
| Issuer FCF ✔ | "Not in filings" | Q2 $21.3B; FY26 $96.6B | **Wrong** |
| Cash + mkt debt; cash; borrowings | $56,586M; $22,443M; $33,366M | Same | Correct |
| "Cash and short-term investments" ✔ | $99.37B, used as cash in the EV bridge | Includes $42.78B publicly-held equity; $36.9B under lock-up | Misleading definition |
| Debt increase | Not explained | $25B senior notes issued Q2 FY27 (10-Q Note 9) | Omitted |
| Strategic equity and guarantees ✔ | Generic "private investments … guarantees" | ~$99B equity investments plus commitments. $105B RVG cap (8-K 2026-08-17). Supply commitments $279B. | Materially understated |
| Capital return ✔ | Flat shares; "no funded repurchase schedule" | $99.0B authorization left; dividend $0.25/quarter; Q2 buybacks $19.7B | Contradicted |
| Price; 52w high/low; market cap | $217.27; −10.7% from high; — | Close $217.23; high $243.37 (Oct 6); low $164.27 (Mar 30); ~$5.25T | Correct; key data not shown |
| SMA50 / SMA200 / RSI14 | $223.18 / $202.84 / 40.25 | $223.17 / $202.84 / 40.2 | Correct |
| P/E TTM; P/B; EV/Sales; EV/EBITDA | 27.5; 22.9; 17.1; 25.7 | Recomputed same | Correct |
| 10y UST; real yield; HY OAS | 5.21%; 2.9%; 3.3% | 5.21%; 2.88%; 3.25% | Correct |
| Raw / Blume beta; ERP | 2.217 / 1.81; 4.46% | ~2.22; Damodaran Jan-26 4.46%, Oct-26 implied 4.20% | Correct; ERP slightly stale |
| Consensus (secondary: S&P Global via aggregator) | "Excluded (no currency)" | FY27 revenue ~$412B, EPS ~$9.31; FY28 ~$692B, ~$15.91 | Omitted |
| Executives | Includes Puri | Puri departure 8-K 2026-06-28 ✔; successor in August | Stale |
| Executive pay (DEF 14A, USD) | No figures; "currency not established" | FY26 vs FY25 total: Huang $36.3M vs $49.9M; Kress $14.3M vs $21.4M; others ~$14.3–14.8M vs ~$19.2–21.6M | Direction right; amounts and USD suppressed |
| FY26 buybacks; coverage; ND/EBITDA | $40.09B; 426.7×; −0.30× | Same | Correct |
| Hugging Face acquisition ✔ | Not mentioned | Definitive agreement, 8-K 2026-09-02 | Omitted |
| Next earnings | "Tentative 2026-11-18" | Not yet announced by NVIDIA | Unverifiable |

---

## Root-cause map (report symptom → code)

Paths are relative to the repo root. Lines marked ✔ were re-checked by hand.
The others come from a read-only code trace.

| Symptom | Root cause | Location |
| --- | --- | --- |
| Base Y1 revenue below run-rate (P0-1) | Y1 = TTM × (1 + g₁); g₁ clamped to `NEAR_TERM_GROWTH_CLAMP_PP = [-10, 25]` ✔; no latest-quarter or guidance anchor; analyst case dropped (P0-2) | `src/pipeline/stageB/valuation.ts` constants ~51 ✔, anchor 642–730, clamp 713–723, `dcfCore` 1150–1160 |
| Base margin 62.42% while TTM is 65.21% and the latest quarter ~66% | Margin ceiling = max(45, highest *annual* margin in 5y); "the TTM figure is not evidence for its own cap" ✔. The basis text is written before the cap, hence "held flat at current 65.21%" next to a 62.42% value. | `valuation.ts` 820–822 (text) and 830–851 ✔ (cap) |
| WACC 13.25% | FMP 10y treasury tried before FRED DGS10; single regression Blume beta clamped [0.6, 2.0] | `src/pipeline/stageB/returns.ts` `computeWacc` 321, `riskFreePct` 1287, `selectUsEquityRiskPremium` 260 |
| Terminal tax 8.9% | Fade to historical median, not marginal | `valuation.ts` 858–905 |
| Bull $814 / bear $32 | σ of annual growth capped at 25pp, applied as a *persistent* shift for all 10 years; margin σ cap 12pp; bull/bear relabelled by EV | `src/pipeline/stageB/projections.ts` `scenarioDispersion` 255, caps 60–61; `src/pipeline/stageB/scenarioPaths.ts` 14–60 |
| 25/50/25 shown as display weights | `PROJECTION_WEIGHTS` copied into scenario presentation | `projections.ts` 53–55; `src/report/scenarioPresentation.ts` 81–88 |
| Analyst estimates, peer market caps and exec pay suppressed (P0-2) | Payload rows carry unit `currency …` with no ISO code; prompt and validator treat that as "currency not established" | `src/pipeline/stageC/payload.ts` 1238–1249 (peers), 1318 (leadership); `prompts.ts` 83–84; analyst-estimate currency gate (manifest `valuation.analystEstimates.currency`) |
| Accruals 0.91 "red" (P0-6) | CFI = total `netCashProvidedByInvestingActivities`, unadjusted; NOA removes only `cashAndShortTermInvestments`, not long-term marketable or strategic equity | `src/pipeline/stageB/forensics.ts` `computeAccruals` 1491–1592 (CFI 1510, NOA 1495–1502); band `grading.ts` 423–428 |
| ROIC stability 12/100 (P2-1) | Population SD of ROIC *levels*, no trend adjustment | `src/pipeline/stageB/grading.ts` `stdev` 93–99, signal 890/920, band 313–319 |
| ROIC−WACC double count (P2-3) | Same `spreadPctPts` and `SPREAD_BAND` in Quality (weight 0.35) and Leadership (0.25) | `grading.ts` 818, 944 |
| Buyback "discipline" 215% → 90 | Measures price appreciation since the buybacks (quote vs average repurchase price), not timing discipline | `src/pipeline/stageB/capital.ts` 959–962 |
| **Peer medians are always empty, for every issuer** | `PeerCandidate.economicEvidence` and `subjectEconomicEvidence` are read by the comparability gate but never populated anywhere ✔. Every peer is excluded with "missing sourced economic/accounting comparability evidence". `PEER_CANDIDATE_LIMIT = 6` adds a budget cutoff on top. | `src/pipeline/peers.ts` 28, 235, 263 ✔; `src/pipeline/stageB/peerComparability.ts` 16–21 ✔; `valuation.ts` 2644 |
| **Every executive is always "not-assessed"** | `assessExecutiveEvidence` requires `outcome === "verified" && validationStatus === "validated"` ✔, but the verify pass logs every prose claim as `outcome: "unverified"` ✔. The gate is unreachable. | `src/report/financialDiagnostics.ts` 6–25 ✔; `src/pipeline/stageC/passes.ts` 2959 ✔ |
| "0/90 validated" (P0-7) | Claims with no numbers return `cited`, tallied as unchecked. Numeric claims need an exact two-way metric-word match with the record label. | `src/pipeline/stageC/claimEvidence.ts` 183–293 (`namesMetric` 152–159); tally `passes.ts` 2905–2946 |
| "1 contradicted" false positive (P0-7) | `phraseNamesRecordYear` requires identical year *sets*. "ended 2026-07-26" = {2026} vs "ttm: 2025-07-27 to 2026-07-26" = {2025, 2026}. ✔ | `src/pipeline/stageC/consistency.ts` 703–719 ✔, invoked 1512–1527 |
| Reconciliation "unavailable" (P0-8) | `boundRecord` needs `fieldProvenance[key].periodStart`, which only the EDGAR statement builder sets. FMP-served latest-quarter rows always fail. The first failing line voids the whole table. | `src/report/sourceFacts.ts` 92, 132–171; `payload.ts` 1070–1097; `src/edgar/statements.ts` 2204–2215 |
| Segment tables stale (P1-3) | FMP segmentation requested with `"annual"` only; payload passes `rows[0]`; no XBRL/10-Q segment extraction exists in `src/edgar` | `src/providers/fmp.ts` 1998–2021; `dataBundle.ts` 1707–1708; `payload.ts` 1359–1391 |
| Moat "scale (narrow) / ip (narrow)", peer table names only, technicals prose | Fully judge-authored. The schema enum is printed raw. | `src/report/schema.ts` 1224–1249; `markdown.ts` 951–965, 923–950 |
| Judge = same family | `judgeModelFor` only upgrades Haiku | `passes.ts` 460; `src/models/registry.ts` 183 |
| Header wall of text, $0 cost | `formatExecutionMetadata`; cost from plan allowance | `src/report/execution.ts` 196; `markdown.ts` 1168–1229, 1146–1160 |

Stale documentation:
- `docs/VALIDATION-STATUS.md` still cites spec 1.12.0.
- `docs/METHODOLOGY.md:1458` names `SCORE_BANDS_2026_10`, while the code uses `SCORE_BANDS_2026_10_AUDIT`.
- `buildVerifySystem` (`prompts.ts` 491) is dead code.

---

## Prioritized work packages

Ordered by impact per unit of effort. Each package names the findings it closes.
Each should be validated with a fresh live NVDA run (plus one non-tech control
issuer) and a diff against this report.

| # | Work package | Closes | Size |
| --- | --- | --- | --- |
| 1 | **Currency inheritance.** Values from a single-currency provider inherit the issuer's reporting currency (dei, profile, exchange). Withhold only on conflict. | P0-2, P1-5 (partly), P1-10 (pay) | S |
| 2 | **DCF anchoring.** Use guidance, then consensus, then the latest-quarter run-rate for years 1–2. The clamp applies to growth relative to the run-rate. TTM can set the year-1 margin. Terminal tax converges to max(marginal, 15%). Use a convex fade. Add a growth × margin grid. Offer a bottom-up beta. | P0-1, P0-3, P0-4, P2-0, P2-7 | M |
| 3 | **Ingest 8-K exhibits and items.** EX-99.1 release and CFO commentary (guidance, issuer FCF, capital return, commitments). Items 1.01, 2.03, 5.02 and 8.01, beyond the 4.01/4.02 scans. | P1-1, P0-11, P1-11 | M |
| 4 | **Fix the dead gates.** Either populate peer `economicEvidence` from SEC companyfacts (business description, segment, fiscal period) or replace the gate with a disclosed caveat. Make executive assessment reachable, or drop executive grades. Raise `PEER_CANDIDATE_LIMIT` and add a curated competitor map. | P1-6, P1-10 | M |
| 5 | **Forensics corrections.** Financial-asset-adjusted accruals; trend-aware ROIC stability; Beneish decomposition with an SGI caveat; one ROIC signal per family; a buyback-discipline metric that measures timing, not appreciation. | P0-6, P2-1…P2-5 | M |
| 6 | **Verification fixes.** Period rule accepts dates inside or at the end of a cited window; metric matcher uses labels and synonyms; numeric support counts as validated; reconciliation works for FMP-served quarters. | P0-7, P0-8 | S–M |
| 7 | **Liquidity canonicalization.** One net-cash figure. Locked-up and strategic equity become non-operating assets, not cash. A strategic-investments, guarantees and commitments table. | P0-9, P0-11 | S |
| 8 | **Scenario redesign.** Driver-based, mean-reverting shocks; margin ceiling tied to gross margin. Publish and reconcile the probability-weighted value, or drop the weights. | P0-5 | M |
| 9 | **Data depth.** Quarterly XBRL segments, an 8-quarter trend table, 5-year statements, own-history multiple bands from data already held. | P1-2, P1-3, P1-4, P1-7 | M |
| 10 | **Presentation.** Page-1 summary box; human labels; rounding and unit rules; charts. Move the audit log, manifest and projection-series tables to a separate export. One limitations box instead of per-bullet negations. Hide empty tables. | P3, P1-12, P1-13 | M |
| 11 | **Judge independence.** A different model family for the judge, or a deterministic rubric. | P2-11 | S |
| 12 | **Docs hygiene.** VALIDATION-STATUS spec version, METHODOLOGY band name, dead `buildVerifySystem`. | — | XS |

## Recommended target structure for an institutional NVDA note

1. **Page 1:** rating-style model view, fair-value range, key-data box, 3 thesis
   bullets, 3 risk bullets, catalyst dates.
2. **Investment thesis and debate:** bull/bear/judge, condensed, with numbers.
3. **Results and guidance:** last quarter vs guidance and consensus, next-quarter
   guidance, 8-quarter trend.
4. **Segments and drivers:** latest market-platform mix, product roadmap, customer
   concentration.
5. **Competitive position:** moat sources, share, custom silicon, peer table with
   multiples.
6. **Financial model:** 5-year history plus 3-year forecast, margin and cash-flow
   bridge, capital allocation (buybacks, dividend, strategic investments).
7. **Valuation:** DCF with transparent anchors, growth × margin and WACC × g grids,
   multiples vs own history and peers, scenario fan with reconciled weights.
8. **Quality and forensics:** only signals that pass applicability checks, with
   decomposition.
9. **Risks and catalysts:** dated, quantified.
10. **Governance and insiders.**
11. **Appendix:** methodology, sources, compact data-quality note. The full
    verification log goes in a separate export.

Target length is 15–25 printed pages. The verification log and payload belong
in an attached JSON/HTML audit file, not the report body.

---

## Integration result: live NVDA rerun (2026-10-15 23:31Z)

Branch `claude/nvda-audit-integration` contains:
- D-57 and D-58 (currency inheritance, DCF anchoring)
- D-59 (peer/executive gates, verifier)
- WP3 (8-K guidance, events, quarterly segments)
- The guidance → DCF wiring

Typecheck and lint pass. The test suite passes: 274 files, 5,983 tests, 3 skipped.

Run conditions:
- One live run on chatgpt/gpt-6.1-sol, effort medium.
- Isolated database.
- Live FMP, SEC EDGAR and FRED data.
- Data state: "degraded; critical 0; warnings 4; EDGAR available".

| Finding | Report #34 | Rerun | Status |
| --- | --- | --- | --- |
| P0-1/P0-3 year-one anchor | TTM × 1.25 = $378.7B | Guidance $108.0B × 4, carried 4.5 months = $469.7B; year two on consensus (+46.9%); convergent fade | **Fixed** |
| DCF base value / valuation grade | $143.96 (−33.7%) / F | $235.21 (+8.3%) / C | **Fixed**; composite C 68 → B 73 |
| P0-1 margin step-down | 62.42% from year 1 | 65.48% guided, fading to the 62.42% cap by year 5 | **Fixed** (cap now binds only from year 5) |
| P0-4 terminal tax | 16% → 8.9% | 16% → 21% (statutory floor) | **Fixed** |
| P0-2 currency suppression | Consensus, peer caps and pay suppressed | Consensus case included (76.1%); no "currency not established" text | **Fixed** |
| P1-1 guidance | Absent | Guidance table plus 3-quarter results-vs-guidance (above range each quarter) | **Fixed** |
| P1-2/P1-3 quarterly trend, segments | FY26 annual only | 8-quarter trend; XBRL Hyperscale / ACIE / Edge with QoQ and YoY | **Fixed** (the old FMP annual tables remain alongside; remove them) |
| P0-11 issuer FCF, capital return, events | "Not in filings"; flat shares; Puri current | Issuer FCF table; $99B authorization; $0.25 dividend; Puri retirement; Hugging Face; $105B RVG event | **Fixed** |
| P0-7 false contradiction | 1 contradicted (false positive) | 0 contradicted | **Fixed** |
| P0-7 validation headline | 0/90 validated | 0/30 validated (all 30 FACT claims are qualitative) | **Open**: the headline is still unreadable to an institutional reader |
| P1-6 peer medians | 0 eligible | 4 eligible (AMD, AVGO, INTC, MRVL; AVGO and MRVL via SEC fallback); P/B median 12.5 only | **Partial**: P/E, EV and cash-flow medians still withheld |
| P1-10 executive assessment | All not-assessed | All not-assessed (gate reachable, but the judge supplied no admissible evidence) | **Open** |
| P0-5 scenarios | Bull $814 / bear $32 | Bull $1,233 / bear $52 | **Open** (WP8), and wider than before |
| P0-6, P2-1…P2-3 forensics and grade signals | Accruals 0.91 red; Beneish flag; ROIC SD penalty | Unchanged | **Open** (WP5) |
| P2-0 WACC | 13.25% | 13.25% | **Open** |
| P0-9 net cash with locked-up equity | −$66.0B bridge | Unchanged | **Open** (WP7) |
| P1-8 thesis topics | No CUDA, TSMC, OpenAI | Rubin ×1; still no CUDA, TSMC, OpenAI (the RVG event omits the tenant's name) | **Open**: needs 10-K Item 1 and notes ingestion |
| P3 presentation | 413 KB, 2,003 "n/a" | 367 KB, 1,728 "n/a" | **Open** (WP10) |

The rerun report is kept at `data/recovery/nvda-integration-20261015/NVDA-integration-report.md`
(ignored by git).
