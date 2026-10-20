# Valuation methodology

What Metis computes, from which inputs, under which conventions, and where a
convention is this project's own choice rather than a standard.

The current source declares report 1.33.0 / payload 1.38.0 and Stage B
STAGE_B_2026_10_ACCOUNTING_EVIDENCE_15 (2026-10-20). Its bounded evidence fixes
extend the growth-anchor, scenario-horizon, research-reliability and prior audit
rules; final independent review and report acceptance remain gates. The historical literature citations remain the project's
research rationale; a passing test validates implementation behavior, not the
predictive validity of a model or a live provider's contract.

Company analysis requires established security classification: an explicit equity
type, or both provider fund flags explicitly false when no explicit type is given.
An explicit unsupported or unrecognized type cannot be erased by false flags;
true fund flags take priority even over an equity label. Missing classification is
unresolved, rather than proof of either company eligibility or an invalid ticker.
Public chart metadata can augment a confirmed issuer's existing profile with its
missing instrument type and field-level provenance; vendor values stay intact.
Known funds and explicit non-equity instruments receive no issuer valuation.

Strong financial-business evidence that conflicts with the selected route leaves
model eligibility unresolved until consolidated scope is reconciled. Source facts
remain visible, while industrial FCFF, debt-based WACC, leverage, EV multiples,
ROIC, forward scenarios and related grades are withheld. No financial-company
model is substituted by guessing. Weak single-tag evidence does not trigger this
hold. REIT historical P/AFFO comparisons separately require compatible AFFO
construction; compatible FFO alone does not establish AFFO comparability. The
current approximate AFFO may remain visible without a historical percentile.
These are implementation safeguards, not issuer-specific model validation. See
the [cross-company audit and bounded fixes](audit/2026-10-19-company-eligibility-affo.md).

D-90 compares direct and derived quarter durations using the actual emitted
start/end interval. Exact-source cash/repurchase and income-classification
refusals survive payout history, liquidity fallbacks, buyback coverage and
forensic margins. A refused year is not zero payout; retained buyback dollars
after a refused year are an incomplete subset. Gross-profit arithmetic requires
independently compatible full revenue/cost evidence; reconciled EBIT cannot
establish expense placement. FMP's net cash change is ending less beginning
cash, so its comparison requires independently matched same-definition cash
instants, not an assumed cash-change taxonomy alias. Official material events
retain verified issuer identity, dated publication evidence and bounded discovery
limits. These rules change Stage B behavior on identical retained inputs and
therefore advance its implementation stamp. Saved reports remain immutable.
See the [phase-one evidence record](audit/2026-10-19-phase-one-evidence-completion.md)
for source intervals, negative controls and unresolved original vendor evidence.

D-91 applies these rules in the canonical EDGAR constructor as well as vendor admission. Partial service-cost tags cannot create a full gross-profit subtotal; compatible full operands or a directly filed subtotal are required. A newly propagated canonical refusal requires source evidence compatible with the vendor row's currency, explicit interval and filing; existing refusals remain preserved. Explicit refusals survive serialized rows, mixed backfill and immutable disclosure reads, including alternate CFO aliases and dependent standardized FCF. Unicode datelines retain hyphen, en dash and em dash. Historical report bytes and prior method identities remain distinct.

The evidence follow-up (D-56) carries source-established instant/duration
boundaries independently from as-of dates. Missing context keeps the legacy
matching contract; contradictory supplied contexts fail closed. Explicit
source metadata stays outside model-authored request fields. Assembled reported
earnings facts and arithmetic reconciliations are separate from AI opinion and
prose-validation coverage. A reconciliation is unavailable unless its compatible
reported operands establish the identity; no residual is forced to zero and
no universal tax or recurring-earnings adjustment is assumed. Source-fact tables
retain exact base-unit amounts and all required operands.

Statement provenance retains the actual envelope source and any established
row/field override, including EDGAR fallback or backfill into a vendor response.
Unknown or conflicting provider metadata cannot establish a source-bound fact.
A normalized statement interface name does not establish its upstream provider.
Reference normalization preserves intervening qualifiers and explicit absence
statements; standalone judge verification uses the same payload-backed
reconciliation availability as full-report verification.

Quote observation, source acquisition, established filing, publication,
financial period, calculation basis and report generation describe different
events. Unknown timing remains unknown. An analysis cutoff is not a measured
calculation timestamp. A bundle's analysis cutoff (`builtAt`) is stamped when
source acquisition completes, and never before the newest fetch stamp of this
build (a provider stamp up to 60 seconds ahead of the bundle clock still counts
as this build's), so facts the build itself fetched are available at its
cutoff and a cache miss values the same filings exactly as a cache hit
(audit 2026-10-19, PGR-1). Point-in-time availability still rests on each
fact's filing and acceptance dates. Live FMP quote/batch-quote observations demonstrably after
the original acquisition or injected client cutoff fail admission and cache
retrieval; this adds no arbitrary stale-price expiry rule. Synthetic fixtures
and historical report bytes retain their original conventions.
Final runner metadata reconciles the disclosure cutoff and report-generation
timestamp together while retaining every input timestamp and calculation basis.
Recovery preserves the original persisted generation time rather than dating
old evidence as a fresh generation. Legacy timing omissions remain omissions.

Two rules govern everything below. Reported numeric claims use provenance
records with source and as-of information where established; missing dates,
units or currency can prevent verification. Where a rule is a house convention rather than an established method, it
says so in the same breath as the number it produces — in the DCF assumption
block, in the report's missing-data manifest, or both.

Calendar conventions (report 1.9.0 / payload 1.10.0): keyless beta uses adjacent
regular US month-end session dates for both the issuer and SPY within the
60-month window. Weekends, month-end Memorial Day and Good Friday are accounted
for; early closes count as sessions. A missing final session withholds that
month rather than filling its price. Because a daily bar can still be intraday,
the keyless caller also withholds the current UTC observation day and any future
date from beta, including after market close until the next UTC day. Quotes and
chart histories retain those bars. Exceptional exchange closures and non-US
calendars are not modeled. Keyless FRED monthly, quarterly and annual changes
look up the required calendar period, so a wholly absent row cannot shift the
denominator. Daily/weekly/biweekly transformations retain observation-count lags;
frequency inference is approximate for sparse or irregular data. Neither this
alignment nor a report's as-of stamp provides historical publication cutoffs or
ALFRED vintages; current reports use the latest available data.

Sources referred to by name throughout:

- **Damodaran**, *Investment Valuation* and the annual implied-ERP dataset
  (`pages.stern.nyu.edu/~adamodar`), for the equity risk premium, the terminal
  growth constraint, the synthetic-rating spread table, and the treatment of
  stock-based compensation in *Stock Based Compensation: The Elephant in the
  Room*, and the notes on **valuing financial service firms** for the
  equity-side excess-return model and why free cash flow to the firm and
  enterprise value are not defined for them.
- **Koller, Goedhart and Wessels**, *Valuation: Measuring and Managing the
  Value of Companies* (McKinsey), for continuing value, RONIC, and the
  evidence on how return-on-capital advantages decay.
- **FRED** (Federal Reserve Bank of St. Louis), for the risk-free rate:
  series `DGS10` (10-Year Treasury Constant Maturity), alongside `DGS2`,
  `T10Y2Y`, `T10Y3M`, `EFFR`, `CPIAUCSL`, `CPILFESL`, `UNRATE`, `PAYEMS`,
  `T10YIE`, `BAMLH0A0HYM2` and `VIXCLS` in the macro dashboard.
- **NAREIT**, *Funds From Operations White Paper*, for the FFO definition and
  its restatements.
- **Piotroski (2000)**, *Value Investing: The Use of Historical Financial
  Statement Information to Separate Winners from Losers*, for the F-score, its
  nine signals and its non-financial estimation sample.
- **Altman (1968)**, *Financial Ratios, Discriminant Analysis and the
  Prediction of Corporate Bankruptcy*, with the Z' and Z" revisions in **Altman
  (2000)**, *Predicting Financial Distress of Companies*.
- **Beneish (1999)**, *The Detection of Earnings Manipulation*, for the
  M-score, its eight indices, and its exclusion of financial institutions
  (p. 5).
- **CFA Institute** curriculum guidance on quantitative methods, for the
  distinction between a percentile of a distribution and a rank within a
  small observed sample.

---

## Input eligibility, period selection and currency

Stage A fetches and checks a bundle; `src/pipeline/compute.ts` adapts that bundle
into the pure Stage B modules. Provider availability is not itself evidence
that every field can enter a calculation. A failed fetch, a successful empty
response, an unresolved share basis, an ambiguous restatement and an unsupported
business-model metric have different reasons in the missing-data manifest.

The keyless layer in `src/pipeline/keyless.ts` requires EDGAR registrant
confirmation before substituting issuer data. Under `auto`, usable FMP rows
stand and EDGAR can append strictly older whole rows per statement family;
`edgar` rebuilds the six statement members from filed facts; `fmp` disables
older-period and predecessor append, but currently still permits EDGAR
replacement of failed/empty members. No statement row splices FMP fields with
EDGAR fields; different statement families can have different sources for the
same fiscal period. Provenance therefore belongs to each row rather than a
promise of one provider for an entire period. See
`tests/dataBundle.historyDepth.test.ts` and `tests/keyless.test.ts`.

**Instrument boundary.** `classifyInstrumentSupport` in
`src/pipeline/stageB/instrumentSupport.ts` rejects a profile explicitly marked
`isEtf` or `isFund`. Company loading, report admission and Stage B enforce that
boundary; the workflow supports individual companies. False, absent or unknown
flags do not prove that a security is a company: the classifier permits those
inputs, so identification still depends on provider evidence. ADRs are a
company overlay, not an unsupported-instrument classification.

**Whole rows and restatements.** Annual and quarterly statement normalization
uses `src/pipeline/stageB/quarterWindows.ts`. A period end must be a real,
exact Gregorian `YYYY-MM-DD`. Duplicate rows for one period survive only when
one whole row is provably later than every other row using `acceptedDate`,
or `filingDate` when acceptance is absent. Date-only recency represents the
entire day; tied or overlapping intervals, invalid recency, or missing recency
reject the whole duplicate period. Values are not selected field by field
from conflicting restatements.

**TTM.** The newest four normalized quarters are usable only when consecutive
period ends are 70–135 days apart and the newest-to-oldest period-end span is
250–320 days. If an earlier quarter is available, an interval under 70 days
into the oldest slot rejects that slot as a transition/stub period. A long gap
before the window alone does not reject it: earlier history can be missing.
The newest window drives the current TTM; the pipeline does not relabel an older
valid window as current after the newest one fails. Relevant calculations fall
back to the explicitly dated annual statement or become unavailable. Each
summed field needs all four numeric inputs; weighted-average share counts use
a four-quarter average rather than a sum. Own-history construction scans older
candidate windows separately and can retain valid windows beyond rejected ones.

**Currency evidence.** Income, cash-flow and balance rows carry their own
presentation currency. An unlabeled row may use another statement's label only
when fiscal period and filing identity establish that it is from the same
filing. Date coincidence alone and the latest annual currency are insufficient
evidence for an unlabeled quarter. Conflicting labels within that filing fail
closed. A TTM sum requires all quarters to be established in one currency.

The model uses the established TTM income currency when it agrees with the
latest annual income currency, or when that annual label is unknown; otherwise
it uses the annual currency. Cash-flow TTM must match that model currency.
Each family of history is truncated at its first incompatible
or unestablished currency observation. Growth, return denominators, capital
series, projections and own-history calculations therefore do not cross a
presentation-currency change. A dimensionless margin within one statement may
still be shown on a row that cannot enter a cross-period money calculation.
Original statement rows remain available in their own currency or labeled
unknown. No FX series or automatic conversion is supplied.

`src/pipeline/stageB/priceCurrency.ts` permits a model/quote comparison only
when both currencies are known three-letter codes and equal. Unknown currency
is an unproven comparison as well as a known mismatch. This withholds price
multiples, market-cap reverse valuations, market-value capital weights and
upside calculations. An equity-only intrinsic figure that does not require
the quote can remain in statement currency; FCFF valuation also depends on
the WACC's market-value weights. Same-currency checks do not independently
resolve ADR ordinary-share/receipt ratios: established share basis remains a
separate prerequisite.

**Provider rows without a currency (D-57).** FMP's analyst-estimate,
price-target, stock-peer and executive-compensation rows carry no currency
field. `src/pipeline/estimateCurrency.ts` gives each row its own
`reportedCurrency`/`currency` when it has one. Otherwise the row inherits the
issuer's currency, but only when three things agree:

- the reporting currency the statements establish (the model currency);
- the listing currency on the profile;
- the issuer is not an ADR.

An ADR's provider rows may be per receipt in the listing currency or per
ordinary share in the reporting currency, so inheritance is withheld. It is
also withheld when the reporting and listing currencies differ, or when either
is unknown. An inherited figure is rendered "(USD, inherited)" in the AI
payload, its registry record carries `currencyBasis: "inherited"`, and the
`valuation.analystEstimates.currency` manifest entry says the estimates were
inherited. Stock-peer market caps inherit the subject's currency because FMP
draws peers from the subject's own exchange. All estimate rows must resolve to
the model currency to enter the consensus growth method and the year-one
revenue anchor. A row in another currency is excluded, as is a row whose
currency stays unknown, and no FX conversion is attempted. D-57 replaces
D-28's own-row-only rule, which discarded USD consensus, peer sizes and
executive pay for a USD issuer (NVDA report #34).

These contracts are covered by `tests/stageB.quarterWindows.test.ts`,
`tests/stageB.ttm.compute.test.ts`, `tests/currency.quarterEvidence.test.ts`,
`tests/currency.annualCompatibility.test.ts`,
`tests/currency.priceComparison.test.ts` and
`tests/currency.analystEstimates.test.ts`.

## WACC inputs

The discount rate is never printed as a bare percentage. Every input is named
with its source and its date, in the DCF assumption block (`WACC (discount
rate)` row) and in the report's computed-returns notes.

| Input | Source | Convention |
| --- | --- | --- |
| Risk-free rate | **FRED `DGS10`** (latest finite observation), else FMP treasury rates (`year10`) | The series id and the observation date are both stated. D-60: DGS10 comes first so the current WACC and every per-year WACC share one series; the vendor endpoint is only the fallback. |
| Equity risk premium | FMP market-risk-premium `totalEquityRiskPremium` for the issuer's domicile, with country-code/name alias matching; an absent or conflicting domicile row falls back to the unambiguous US row with disclosure, then the dated **Damodaran US** implied-ERP fallback if the selected input is missing or implausible | Conflicting distinct premiums for one country are not chosen by array order. The static fallback is 4.18%, dated 2026-07-01 in `returns.ts`; it requires a valid analysis date, cannot post-date that analysis, and expires after 210 days. A value outside [3%, 25%] falls back. This domicile rule is a house assumption, not an estimate of geographic revenue exposure. D-60: the vendor row carries no vintage, so its date is printed as the acquisition date with "vintage not published by the vendor", beside the dated Damodaran reference. |
| Beta | Provider profile beta, **mean-reversion adjusted** (0.667·raw + 0.333 — the Bloomberg 2/3–1/3 weighting of Blume's finding, not his fitted 0.371 + 0.635·β; see [RESEARCH §7.1](RESEARCH.md)), clamped to [0.6, 2.0] | Raw beta outside (0, 4] is unusable and the WACC fails closed rather than inventing market exposure. One set of constants serves the WACC and the keyless beta estimate, so a report prints one adjusted beta. D-60: a vendor beta publishes no window or fit, so the basis also prints the same 60-month OLS the keyless route uses, run on the bundle's own daily prices against SPY (completed months before the analysis day): observation count, window, price basis, slope, R² and standard error. The WACC keeps the beta it used; no bottom-up beta is built without an industry data source. |
| Cost of equity | rf + beta × ERP | Clamped to [rf + 2.5%, 25%]. |
| Cost of debt | `effective` (interest expense ÷ average debt), `historical` (the issuer's last year that still disclosed interest), or `synthetic` (rf + rating spread from interest coverage, Damodaran's January 2026 table) | The method actually used is named. An effective rate outside [rf − 1, rf + 19] is rejected in favour of the synthetic rating. Debt below 2% of assets is treated as noise, and the note says whether a synthetic rating then ran. Interest expense and the EBIT it is scored against come from **one** statement basis — the trailing twelve months when both are available, else the latest annual statement for both legs — and the basis is named; a mixed pair is the last resort and is labelled as such. |
| Tax rate | Select the first ratios-TTM row, or the first annual-ratios row when no TTM row exists; use its effective-rate field, otherwise TTM tax expense ÷ pre-tax income | A present TTM row lacking tax does not cause a second lookup in annual ratios. Clamped to [0%, 35%]. Where it came from is named. No universal statutory rate is assumed. |
| Weights | Market value of equity (market capitalisation) and book debt as a market-value proxy: total debt **less the operating-lease liability** where the balance sheet discloses it (the EV bridge's lease rule, below), D-60: the weight uses the latest balance sheet (the balance the EV bridge nets); the effective cost of debt still divides a year of interest by the average of the two quarter-ends of the trailing-twelve-month window when the interest figure is TTM, else of the latest two fiscal-year ends | Stated as E% / D%, with the balance dates and the lease basis named. When the statements' currency differs from the quote currency (the ADR case) the weights are suppressed rather than silently mixed. On the financial routes, which value on the cost of equity alone, a WACC-only shortfall is disclosed as a warning rather than blocking the report. |

The final WACC is clamped to [max(6%, rf + 1%), 20%]; a clamp that moves the
rate by 0.5pp or more is disclosed in the manifest, because it materially
changes the discount rate.

**Per-fiscal-year WACC.** The ROIC-versus-WACC history recomputes the WACC at
each fiscal year end from the risk-free observation on or before that date,
holding beta, ERP, the E/D weights and the tax rate constant. A *synthetic*
cost of debt moves with the risk-free rate, because it is rf + spread; an
observed effective rate is held, because it is a fact about that issuer's debt.
An observation more than 14 days before a year end is not that year's rate and
is rejected. Years that cannot be recomputed are named, and the note then says
the current WACC was applied to them. FRED history is fetched five years back,
so roughly five fiscal years can carry their own rate.

---

## Growth, annual returns and capital diagnostics

`src/pipeline/stageB/growth.ts` reports requested 1/3/5/10-year revenue,
diluted-EPS and before-SBC FCF CAGRs as `(end/start)^(1/years) − 1`.
Non-positive endpoints or sign flips withhold the CAGR. Short history degrades
to the available span, with `actualYears` and dates shown. A material difference
between row-count span and elapsed-date span (more than 0.1 years) uses elapsed
years and records irregularity. Margin trends use gross/operating/net income
over positive revenue, up to ten annual observations, and OLS slopes in
percentage points per elapsed year with at least three usable points. Named
valuation/scoring consumers separately check that a degraded CAGR actually
matches the window they require.

`src/pipeline/stageB/returns.ts` computes up to five annual return observations.
ROIC is annual `EBIT × (1 − observed effective tax rate) / invested capital`,
with the tax rate clamped to [0%, 35%], invested capital equal to debt plus
stockholders' equity less cash and short-term investments, and the operating
lease adjustment described below. An unavailable observed tax rate withholds
that year's NOPAT/ROIC; non-positive invested capital is not interpreted as
an exceptional return. This historical NOPAT is separate from the forward
DCF's projected loss-carryforward logic.

When short-term investments are genuinely unreported, returns can instead net
cash alone and disclose that narrower invested-capital basis. Conflicting
combined cash/component values do not qualify for this fallback; they withhold
the affected invested capital and return.

ROTE is income available to common / average tangible common equity, with
preferred allocations required when preferred equity is outstanding. Tangible
common equity subtracts goodwill, other intangibles and preferred from equity.
DuPont reports `net margin × asset turnover × equity multiplier = ROE`, where
the factors are NI/revenue, revenue/average assets and average assets/average
equity. Matching annual return balances use the 45-day tolerance in `returns.ts` and
adjacent annual averaging rule below. Missing eligible prior balances use a
disclosed single-period denominator. ROTE is retained on the financial routes
where ROIC is inapplicable; it is not computed by substituting a vendor ROE.

`src/pipeline/stageB/capital.ts` derives capex/revenue, capex/D&A, before- and
after-SBC FCF conversion, share trends, SBC intensity, interest coverage and
net debt/EBITDA where the route permits them. Conversion requires positive
net income, and leverage requires positive EBITDA. Maintenance capex
`min(abs(capex), D&A)` and growth capex `max(0, abs(capex) − D&A)` are house
heuristics, not a filed maintenance/development split.

**Buyback price proxy.** Within each fiscal cash-flow window, the available
market-cap history is averaged and divided by basic weighted-average shares
(diluted fallback disclosed). That is the year's average price.
- Negative repurchase cash flow is converted to positive dollars spent, and
  implied shares bought equal spend ÷ proxy price.
- The aggregate proxy price is total covered spend ÷ total implied shares.
- Its premium/discount, `(current price − proxy paid price) / proxy paid
  price`, is the price **appreciation since the repurchases**. It is shown
  and not graded (D-61), because it rewards any stock that rose.
- Partial dollar coverage is disclosed.
- The proxy is withheld for ADRs and for unmatched or unknown quote/statement
  currencies.

**Repurchase timing** (D-61, `repurchaseExecutions.ts`) uses the price
actually paid: the filer's tagged repurchase cost ÷ tagged shares for the
fiscal year.
- **Tags.** The share/value pairs are
  `StockRepurchasedAndRetiredDuringPeriod*`,
  `StockRepurchasedDuringPeriod*` and `TreasuryStockSharesAcquired` /
  `TreasuryStockValueAcquiredCostMethod`. Both facts come from the latest
  filing that tags both for that year.
- **Share basis.** The count is put on the statements' share basis with the
  split resolution. Without that resolution, nothing is computed.
- **Measure.** Timing = (Σ shares bought × that year's average price) ÷
  (Σ cost paid) − 1. Positive means the shares were bought below the same
  year's average price (Dittmar & Field 2015).
- **Exclusions.** A year whose paid price is more than 1.6× away from its
  average price is excluded as a basis or tagging mismatch. Timing is
  withheld below 50% coverage of repurchase dollars.
- **Missing side (D-68).** The year's average price is the market cap over
  the fiscal window ÷ basic weighted shares. When timing is not measured,
  the capital note names the side that is missing: the years whose tagged
  execution price has no year-average price (and why, e.g. no market-cap
  history inside the fiscal window), the years outside the plausibility band,
  or no tagged pair at all.

See `tests/stageB.growth.returns.capital.test.ts`,
`tests/stageB.forensicsD61.test.ts`, `tests/stageB.returnsCurrencyAndIc.test.ts`
and `tests/stageB.rote.test.ts`.

## Growth anchor

The separate **revenue acceleration** diagnostic is latest YoY growth minus
the three-year revenue CAGR. Its benchmark must span three actual years within
±0.05 years for fiscal-calendar variation. A degraded two-year CAGR or a four-year
span cannot serve as that benchmark: the benchmark, difference and direction
are withheld with a manifest explanation. The underlying CAGR series still
discloses its available span; the valuation methods below keep their own rules.

Near-term revenue growth is the **median of every method the data supports**,
with the full range shown and each method's value named:

1. **Log-linear regression** of ln(revenue) on elapsed years, over *all*
   annual years on record. Reported with its slope, R² and n. Using every year
   means a spike or a collapse inside the window shows up as a poor fit rather
   than moving the anchor.
2. **Three-year revenue CAGR**.
3. **Five-year revenue CAGR**.
4. **Analyst-consensus case**, when FMP analyst estimates exist: the average
   implied growth over the next two fiscal years. The first leg is annualised
   by day count when the TTM window and the first estimated year end are not a
   full year apart, and is skipped entirely below 90 days as too noisy.

The point estimate is the median; the range is min..max across the available
methods. Methods that could not be computed are named in the assumption block
and disclosed as a `valuation.dcf.growthAnchor` manifest entry.

A three- or five-year CAGR enters the anchor only when its measured span is
its window: a CAGR whose `actualYears` differs from the window by more than
0.25 years (`CAGR_SPAN_TOLERANCE_YEARS`, the tolerance grading uses, applied
through `windowCagr` in `growth.ts`) is excluded and listed as unavailable with
its measured span, e.g. "measured span 2.00 years, not the 3-year window". With
two annual years of history both windows are excluded rather than counting one
two-year rate twice. The degraded CAGR series is still displayed with its span.

The median is then **clamped to [−10%, +25%]**. The report prints the clamped
value as the "near-term growth rate", and the year-one revenue anchor below
uses that value. When the clamp moves it, the rate's basis says so, the
growth-path basis repeats it, and the assumption row reads "25.0% (…, clamped
from the 65.0% median)". Nothing prints the pre-clamp median as if it were the
rate.

### Year-one revenue anchor (D-58, D-60)

Year-one revenue is the 12 months after the TTM end. D-60 takes it from the
first available of three sources:

1. **Analyst consensus levels**, calendarized to the year-one window, when
   consensus is consistent with guidance: no guidance, or a year-one
   consensus at or above the guided quarter's low end × 4. Each fiscal-year
   estimate is spread evenly over its days and weighted by its overlap with
   the window. A 52/53-week year starts the day after the previous estimate's
   year end. The estimates must cover at least 97% of the window. D-65: the
   fiscal year the window starts in contributes its consensus **less the
   revenue already reported** in it (the quarters after the latest annual
   statement through the TTM end, consecutive 13/14-week quarters in the model
   currency), spread over its unreported days; a consensus at or below what
   is already reported is stale and leaves the window uncovered. NVDA FY2027:
   $409.80B − $177.84B reported for H1 = $231.96B for 2026-07-27..2027-01-25,
   where an even share gave $205.5B. The next fiscal year's share is still an
   even spread, which for a fast grower overstates its early quarters
   (disclosed in D-65; no within-year shape is assumed). Consensus covers the
   window's four quarters; guidance covers one, and an issuer that reports
   above its own range each quarter makes the guided run-rate a floor rather
   than a central case. A consensus below the guided run-rate predates or
   contradicts the outlook and is not used for year one. The same breadth and
   agreement gates as later years apply (below).
2. **Management guidance** for the next fiscal quarter
   (`DcfAssumptionInputs.guidance`, from the 8-K earnings release). The guided
   quarter is annualized (× 4) and carried 4.5 months, from the guided
   quarter's midpoint to the year-one window's midpoint, at the **guided
   sequential pace**: guided quarter over the latest reported quarter,
   annualized. D-58 carried it at the clamped near-term rate, a statement about
   history rather than about the guided trajectory. Guidance must end 80–100
   days after the TTM and be published after it. A guided operating margin, if
   present, sets the year-one margin; a guided GAAP tax rate sets the year-one
   tax rate.
3. **The run-rate**, carried 7.5 months from the latest quarter's midpoint to
   the year-one midpoint at the near-term growth rate.

The **run-rate** is the latest quarter annualized, made seasonally neutral.
Latest quarter × 4 overstates a seasonal peak quarter and understates a
trough. So the run-rate is the TTM carried 4.5 months forward at the latest
quarter's year-over-year growth, which has no seasonal component, bounded by
the TTM and latest quarter × 4. It needs the same fiscal quarter a year
earlier (350–380 days before), established in the model currency. Without one,
the anchor falls back to the pre-D-58 rule: TTM revenue grown one year at the
near-term growth rate.

**A broken-input guard bounds year-one revenue relative to the run-rate.** Its
range is [−10%, +25%], widened (D-60) to the evidenced pace: the guided
sequential pace and the latest quarter's year-over-year growth. It catches a
mis-scaled estimate without overruling the issuer's own reported trajectory.
Without a run-rate it is measured against the TTM. When it binds, the anchor
row prints both values.

**Later years (D-65).** Every explicit year after the first takes consensus
growth, window over window, while consensus covers it: the consensus level
itself when consensus set year one, else consensus growth applied to the level
actually used, with the gap to the consensus level stated. D-60 stopped at year
two, and the convergent fade from there put NVDA's years 3–5 9–45% above the
FY+3…FY+5 consensus the same provider response held. A year is anchored only
while every fiscal-year estimate behind its window passes two gates, and its
growth stays in band:

- **Breadth:** at least `MIN_CONSENSUS_ANALYSTS` = 3 revenue estimates. A mean
  of one or two forecasts is a forecaster's view, not a consensus, and
  dispersion is undefined below two (Diether, Malloy and Scherbina 2002 require
  two or more); three gives the low–high range an interior point.
- **Agreement:** an implied coefficient of variation, (high − low) ÷ (d2(n) ×
  mean), of at most `MAX_CONSENSUS_CV_PCT` = 25%. The raw range widens with the
  number of forecasters, so it is divided by d2(n), the expected range of n
  normal draws (Tippett 1925; the range-chart constant, Harter 1960 tables,
  linear between tabulated n and held at d2(50) above it). One standard
  deviation of disagreement wider than a quarter of the level means the mean
  no longer pins a level (dispersion as uncertainty: Barron, Kim, Lim and
  Stevens 1998).
- **Band:** growth within [−10%, max(25%, the prior anchored year's growth)].
  Year two is clamped to it (as D-58 did) and then ends the stretch; from year
  three a window outside it ends the stretch.

A provider row without an analyst count or range is accepted for years one and
two (the D-60 rule) and never beyond. The stretch is contiguous, and the final
explicit year always belongs to the fade, so the path reaches the terminal
rate. The fade starts from the last anchored year. Both gates and the band are
unbacktested house conventions (RESEARCH §8).

The assumption block prints a **consensus-anchored years** row ("years 1–4 of
10"), and the valuation section a **DCF path vs consensus** table: each window's
DCF revenue beside calendarized consensus, the gap, whether it was anchored and
why not, and the fiscal-year estimates behind it (days, analyst count, implied
dispersion). Text names the anchored years; it never calls the path
"consensus-anchored" alone.

**The near-term growth rate** (median of methods, clamped to [−10%, 25%]) sets
year one only on the run-rate and TTM paths. D-65: when it does not, it is not
an assumption row (its methods stay in the notes and the audit export), and the
analyst-consensus method prints both of its legs so the average can be
reproduced.

On NVDA's 2026-10-15 inputs, consensus sits above guidance × 4 ($432B), so it
sets year one: $578.3B for the 12 months to 2027-07-26 (+90.9% over TTM; D-60's
even spread gave $551.8B). Consensus also covers the windows to 2028, 2029 and
2030-07-26 ($810.5B, $1,013.9B, $1,133.7B: +40.1%, +25.1%, +11.8%), with 30–42
analysts and implied dispersions of 2.9–15.0%; FY2032 has no estimate, so year
five is the fade's. Guidance alone would give $513.7B at the guided 58.7%
annual pace; D-58 gave $469.7B (tests/stageB.dcfAnchoring.test.ts,
tests/stageB.valuationD65.test.ts).

**Three of the four methods read the same series.** The regression, the 3-year
CAGR and the 5-year CAGR are all functions of the same annual revenue history,
so when all four are available, three inputs reflect correlated historical
evidence. For four inputs the median averages the two middle values; consensus
outside the historical range can still change which historical pair is averaged
(5%, 10%, 15%, 100% gives 12.5%, versus a historical-only median of 10%). Every
available method receives one place in the sorted median, but those places are
not independent votes. When only one method is eligible, including consensus,
it supplies the anchor alone, subject to the same clamp; no range is available.
The printed method count, unavailable methods and range disclose these limits.

**Two rules were retired here, and the assumption block says so.** The former
"lower of the 3Y/5Y CAGR" rule let whichever window happened to be worse
decide ten years of growth — that is a coin flip on the window, not
conservatism. The former sign-disagreement rule replaced the anchor with the
terminal rate whenever the two windows disagreed in sign, discarding the whole
revenue history on the strength of two endpoints. Both are gone; the
regression's R² is where an erratic history now shows up.

---

## Fade and horizon

The explicit horizon is **10 years**, stated in years in the assumption block.

**Growth path (D-58, D-65).** Year one comes from the year-one revenue
anchor, and every later year consensus covers takes consensus growth (D-65,
above). Every year after the anchored stretch follows a **convergent
fade** from the last anchored year's growth to the terminal rate in year 10:
the gap to the terminal rate decays geometrically with a
`GROWTH_FADE_HALF_LIFE_YEARS` = 3 year half-life, rescaled to reach the
terminal rate exactly in year 10, so it closes somewhat faster than halving
every three years (NVDA since D-65: 9.3pp of excess in year four, 6.8pp in year five). Chan, Karceski
and Lakonishok (2003) find growth beyond one or two years is not persistent,
so the gap should close fastest at the start. The former linear fade from
year one kept a +78% consensus year one above 50% growth for four years. The
half-life is a house convention pending the backtest in RESEARCH §8.2.

**Margin path.** The EBIT margin starts at the current margin: guided, else
TTM, else the five-year median. It fades to a target over 5 years and is held
flat thereafter. The target is the five-year median, or the better/worse of
median and current under a dated improving/declining margin regime (a slope of
more than ±0.5pp per year).

**Tax path (D-58).** The tax rate fades from the observed effective rate to a
terminal rate. The terminal rate is the company's own historical median,
floored at max(statutory marginal rate, 15% global minimum tax). The
statutory rates come from `STATUTORY_MARGINAL_TAX_PCT`, which lists only
sourced national rates: US 21%, 26 U.S.C. §11(b), excluding state taxes. The
15% floor is the OECD Pillar Two GloBE minimum. A below-statutory effective
rate (credits, deferrals, preferential regimes) is not carried in perpetuity:
Damodaran moves the terminal rate toward the marginal rate. NVDA's 8.93%
historical median becomes a 21% terminal rate. A company whose own median is
higher keeps it. When no current rate can be observed (a pre-tax loss, a
missing tax line), the path is held at the terminal rate and the basis says
so.

Cash flows are discounted on the **mid-year convention**, the Gordon terminal
value included: it is the value at the end of year N of flows that, like the
explicit ones, arrive through each year, so it takes the factor for N − 0.5
(Rosenbaum and Pearl, *Investment Banking*, ch. 3: perpetuity-growth terminal
values take the mid-year factor, exit-multiple values the year-end factor;
Koller, Goedhart and Wessels apply the half-year adjustment to the whole value).
Discounting it at N would treat explicit flows as mid-year and perpetuity
flows as year-end, lowering it by (1 + WACC)^0.5. D-60 prints the convention as
an assumption row ("discounting convention") rather than leaving it implicit.

**Valuation date (D-65).** The explicit windows start the day after the
statement date, so their flows are discounted to it, while the per-share value
is compared with a later quote. Every discount exponent is reduced by the years
elapsed from the statement date to the quote date, which rolls the whole value
forward at the WACC (NVDA: 81 days, × 1.0279). The equity bridge keeps the
statement-date balance: cash generated since then is inside the first window's
flows, so it is not counted twice. A quote more than `MAX_ROLL_FORWARD_DAYS` =
200 days after the statement is not rolled forward (a stale statement is a data
problem, not a timing one), and a gap says so. The "valuation date" assumption
row and the bridge's "value stated at" row print the date and factor.

**Two guards bound the paths.** The EBIT-margin **target** is held inside
[−20%, ceiling]. The ceiling is 45% or the highest sustained margin in the
issuer's own record — its last five fiscal years and, since D-60, the
four-quarter TTM (a full year of reported quarters; a margin above 100% never
counts) — whichever is higher, so the cap never binds below a margin the
company has demonstrably earned. NVDA's four latest quarters ran 63.2–66.2%
(TTM 65.21%) while the FY2025 cap was 62.42%. D-58 applies the ceiling
to the margin the path fades to (year 5 onward and the terminal year), not to
year one. Year one may sit above it unless it exceeds 100%, which no real
operating margin can. The basis is written after the cap and names the cap
that bound. NVDA report #34 printed "held flat at current 65.21%" beside a
62.42% path; the path now runs 65.21% → 62.42% by year 5. Sales-to-capital is
held inside [0.5, 5]. Both are broken-input guards in the sense of
[RESEARCH §7.5](RESEARCH.md), not views on what a company can earn: they exist
so that a mis-scaled statement cannot print a confident number.

EBIT itself is the issuer's operating income: the filed line where the filer
reports one, otherwise a derivation from pre-tax income that adds back interest
expense and removes the non-operating results the filing discloses. It is never
pre-tax income plus interest on its own. That sum reintroduces every
non-operating item the derivation removed, and where the derivation is refused
outright — a bank, where interest is an operating cost, or a non-operating
aggregate that already contains the interest being added back — EBIT is
withheld and named in the missing-data manifest rather than published under a
second name.

Terminal growth is **min(2.5%, risk-free rate)** — nothing grows faster than
the risk-free rate in perpetuity (Damodaran). Like the terminal-ROIC rule below
it prints as a HOUSE CONVENTION, in those words, wherever it appears. A Gordon guard requires
WACC − g ≥ 2.0pp in the base case (1.5pp in the sensitivity grid, where a
tighter guard would blank cells the grid exists to show); when it binds, g is
pulled down and the note says so.

---

## Terminal value house convention

**This is a house convention, not a standard, and it is labelled as such
wherever it is printed.**

The default terminal ROIC equals the WACC: growth adds nothing after the
explicit horizon. That is the Koller/Goedhart/Wessels recommendation for most
firms. Applied to every issuer, however, it values an evidenced compounder as
if its returns collapsed to the cost of capital in year 11.

So: the implementation sorts computable annual ROIC observations newest-first
and inspects at most five. When ROIC exceeded the applicable WACC in **all of
at least four of those observations**, half the median spread is carried in perpetuity, capped at
**5 percentage points**. A carried spread below 0.5pp is treated as noise and
the default holds. Anything short of that evidence keeps the default, and the
reason is written into the assumption notes. Missing-ROIC years are excluded
before this test, and the helper does not require that the retained annual
dates are consecutive; this is evidence from available observations, not proof
of four uninterrupted years. This follows McKinsey's RONIC
guidance (a top-quintile ROIC advantage roughly halves over 10–15 years rather
than closing) and Damodaran's allowance of perpetual excess returns only when
they are modest.

Each fiscal year is compared to **its own** WACC where one could be recomputed
(see *WACC inputs* above); otherwise the current WACC is applied to that missing
year and the note names the fallback years. Any year that could not be recomputed also
reaches the missing-data manifest as `returns.wacc.history`, including the
partial case where only some years are missing. When a history is supplied but
no year carries a computable ROIC there is no comparison at all, and the note
says that — not that a risk-free observation was missing.

The per-year WACCs are always recomputed from **FRED `DGS10`**, and since
D-60 the current WACC takes `DGS10` first too, falling back to the provider's
10-year treasury rate only when FRED has no observation. When the fallback runs,
the returns notes say the newest fiscal year's own WACC can differ from the
current one because the two rates come from different series.

Terminal reinvestment is g ÷ ROIC_terminal, Damodaran's consistency rule.

---

**The sensitivity grid keeps the excess, not the level.** Each cell of the
WACC × g grid re-runs the DCF with the terminal ROIC at that cell's WACC plus
the base case's evidenced excess, so a row one point below the base WACC does
not earn a phantom point of excess return and the g-axis reads the same way in
every row; the grid note states the excess it held.

## FCF and SBC

**Free cash flow subtracts stock-based compensation by default.** The
cash-flow statement adds SBC back to operating cash flow because no cash left
the building that period, but the expense is real: it is settled in newly
issued shares, and the bill lands on existing holders as dilution. Damodaran's
treatment in *Stock Based Compensation: The Elephant in the Room* is to treat
it as an operating expense that should not be added back.

Both figures are reported and never conflated:

- `fcfBeforeSbc` — a finite supplied `freeCashFlow` value takes precedence;
  otherwise operating cash flow + capital expenditure (capex arrives negative)
  is derived and labeled. This is the before-SBC vendor convention.
- `fcf` — the same figure less SBC, the house default.

For a row with computable FCF, missing or numeric-zero SBC is treated as
undisclosed by this implementation and left unadjusted, with a note on that row. The info-level
`capital.fcf.sbc` manifest entry applies when the latest row has computable FCF
but no usable SBC; older affected rows have row notes rather than separate
manifest entries. A negative SBC credit is retained with its sign and increases
after-SBC FCF. SBC as a percentage of FCF is measured
against the **before** figure: dividing SBC by an FCF it has already been
subtracted from would count it twice.

Every surface that prints a free-cash-flow figure names which one it is. The
payload and the data-only report label the rows "after SBC, house default" and
"before SBC, vendor convention", and both series are shown. Two conversion
ratios are published the same way, and the **before**-SBC one is the ratio the
balance-sheet grade scores, under a driver named `fcfConversionBeforeSbc`: that
is the definition used by the unbacktested conversion band, and grading the
after-SBC ratio against it would charge the same expense twice, because SBC as a
percentage of free cash flow is already one of the five scored metrics. The
aspect note states the definition. Price to free cash flow uses the **before**
figure — the same basis as the own-history distribution it is ranked in — and is
labelled "P/FCF (before SBC)" wherever it renders, with the basis string saying
that the capital block's house-default figure is a different number.

The FCFF discounted-cash-flow model projects revenue, EBIT margin and
reinvestment. SBC is already an operating expense inside that EBIT, so it is
never added back there either. The DCF and the free-cash-flow metric are
consistent, but they are not the same series, and the assumption block says so.

---

## Dilution

Dilution from outstanding awards is reported as the gap between the **diluted**
and **basic** weighted-average share counts of the latest fiscal year, with the
as-of date and the overhang in percent. It reaches readers as a capital figure
in the Stage C payload and as a capital-allocation note in the data-only
report, and the note is emitted in BOTH states — the unavailable case says so
in words rather than going silent. A missing count is disclosed
(`capital.dilution`), never assumed to be zero.

Stock-based compensation is subtracted from free cash flow **with the sign the
filer reported**. The us-gaap element is a positive add-back inside operating
cash flow, so a negative figure is a net credit — forfeiture reversals
exceeding the period's awards — and it is added back rather than charged. Awards that are antidilutive in
a loss year are excluded from the diluted count by the filer, so a loss-making
issuer's overhang understates the award pool; the note says this.

Separately, the five-year diluted share-count trend reports buyback, dilution
or flat (within ±1%), annualised over the span actually available.

Per-share values use the weighted-average diluted count from the newer of the
latest quarterly and latest annual income statement; when only the annual count
is available, the report says the figure may lag recent buybacks or issuance.

---

## Stock splits and the share basis

A share count or per-share figure is used only on the share basis of the price
it meets, and withheld when that basis cannot be established (decision D-30 in
[`docs/audit/DECISIONS.md`](audit/DECISIONS.md); code in `src/edgar/splits.ts`).

**Dates.** A split has an announcement (the earliest filing that tags it), a
record date, a legal-effective moment, and a first split-adjusted trading
session; the filer's XBRL context date for
`us-gaap:StockholdersEquityNoteStockSplitConversionRatio1` may be any of them
and is treated as accounting context only. NVIDIA's 10-for-1 of 2024 is the
reference case: legally effective 2024-06-07 at 4:01 p.m. Eastern (Form 8-K,
accession 0001045810-24-000144), first split-adjusted session 2024-06-10,
tagged in companyfacts for both dates.

- The **first split-adjusted session** comes only from the price vendor's split
  event. A quote is on the basis of its own session; a split-adjusted history is
  on the basis of the last session it was adjusted through.
- Without a vendor event, the first session is bounded to 7 days before the
  earliest context date through 60 days after the latest one (narrowed by the
  sessions the vendor covered without listing it); a price dated or a count
  filed inside the bound is withheld.
- **Legal effectiveness** decides a filing's side: a statement figure filed
  after it is restated to the split (ASC 260, SAB Topic 4C). It is taken to fall
  no earlier than the earliest context date or 7 days before the first
  split-adjusted session (NVIDIA: 3 days); a figure filed between that bound and
  the first session is withheld. A cover-page count is a count as of its own
  date, so one measured before the split and filed after it is withheld.
- A split both sources describe is applied once. A split only the vendor lists
  (companyfacts carries the ratio only from the next periodic report) is applied
  from the vendor's event. A tagged split the vendor's covering list does not
  contain, or lists with another ratio, is unresolved, and every figure filed
  before it is withheld.
- Vendor events within 7 days of each other describe one split. When they
  disagree on the ratio or the session (Yahoo's daily history says 4-for-1 and
  its full list 5-for-1), the split is unresolved and its figures are withheld;
  the descriptions are never compounded. Identical descriptions are one event.
- Each retrieved answer retains its own source, events and coverage. If one
  answer lists a split that another covering answer omits or describes with a
  different ratio, the event is unresolved regardless of how far apart the
  reported dates are. A merged list cannot turn contradictory answers into
  multiple splits. A request that does not cover the event, or failed, does
  not contradict it. Warnings name the individual answers that disagree.
  A count measured before an unresolved event remains withheld even if its
  filing came afterward; the later filing alone does not establish its basis.
- A vendor list that was not retrieved establishes nothing: without one, and for
  any day it does not cover, no filed share count is put on a price's basis.
  Coverage spans join only where they overlap or touch; a gap of any length,
  weekend or not, is uncovered, and a session after the coverage ends is too.
- A Yahoo split event whose numerator or denominator is zero, negative or equal
  to the other makes that answer's split list unavailable (its prices stand).

**What is withheld, and what stands.** Withheld figures are left empty at the
source — EPS and share counts on the statement rows, the keyless market cap,
market-cap history, enterprise values and free float — so no downstream
calculation can rebuild them: EPS growth, P/E from EPS, DCF and excess-return
per share, the reverse DCF, REIT price × shares (P/FFO, P/AFFO), the share-count
trend, dilution, the grades built on them, and the AI payload all read the empty
value. Figures that need no share count (revenue, margins, free cash flow,
capex, EV/sales on a vendor market cap) are unaffected.

**Provider conventions, mapped to the fields used.** "Documented" means stated
by the provider; "tested" means exercised by a test in this repository. No test
here calls a live provider: every tested behaviour is on synthetic responses.

| Source and field | Adjustment basis | Documented | Tested here |
| --- | --- | --- | --- |
| FMP `historical-price-eod/full` `close` | split-adjusted, as of the day served | yes — FMP FAQ (site.financialmodelingprep.com/faqs, as read by the reviewer on 2026-09-30; not fetchable from the build environment): "close is split-adjusted" | synthetic rows: a series served before a split is priced on that day's basis (`tests/keyless.splitBasis.test.ts`) |
| FMP `adjClose` | splits and dividends | yes — same FAQ | not used by this code |
| FMP `quote`/`profile` `price`, `marketCap` | the quote's own session | current values; the FAQ's history statement does not apply | vendor market cap used as served (P/E fallback), unverified |
| FMP `shares-float` `outstandingShares`, `enterprise-values` `numberOfShares` | "historical prices and shares outstanding are adjusted for splits" | by the FAQ's wording, which names no endpoint or field | not tested |
| FMP `income-statement` `eps`, `epsDiluted`, `weightedAverageShsOut`, `weightedAverageShsOutDil` | not stated by the FAQ | **no** | for a row for a period before a known split, each field is kept only when it matches the filer's same field on the same basis (±3% relative to the filer's magnitude; zero must match exactly); no absolute EPS allowance can approve a large proportional difference in a small amount. A field that does not match, or that the filer does not state, is withheld on its own, and EPS is never rebuilt from net income (`guardVendorShareFields`) |
| FMP `key-metrics`, `ratios` (own-history multiples) | ratios of price to per-share figures; basis-invariant only if both sides share one | not stated | not tested |
| FMP `analyst-estimates` `epsAvg` | not stated | **no** | not tested; shown as "currency unknown" and not registered (D-28) |
| Yahoo chart `close` | adjusted for the splits the same answer lists | no published contract (unofficial endpoint) | synthetic responses only |
| Yahoo chart `adjclose` | splits and dividends | no published contract | synthetic responses only (beta) |
| Yahoo chart `events.splits` | dated by the first split-adjusted session; `numerator`/`denominator` post:pre | no published contract | synthetic responses only (`tests/yahoo.client.test.ts`) |
| SEC companyfacts share and per-share facts | as filed, each with its own filing date | SEC | `tests/edgar.splits.test.ts`, `tests/edgar.statements.test.ts` |

---

## EV bridge

Enterprise value is computed the same way everywhere it is used:

```
EV = market capitalisation
   + total debt
   + preferred stock
   + minority interest (non-controlling interests)
   - cash and short-term investments
```

Preferred and minority interests are claims senior to common equity, so they
belong in EV. Undisclosed preferred stock is treated as zero. Minority interest
is not zero-filled. When consolidated equity has no resolved parent/NCI split,
or differs from parent equity with no NCI figure, the NCI allocation is unknown.
EV, the EV multiples and the DCF's per-share equity bridge are then withheld.
NCI is taken as zero only from the filing itself. That happens when the filer
tags only equity including NCI at that date, its net income attributable to NCI
for the period ending there is explicitly zero, and its latest earlier NCI
balance, within about a year, was zero. One of those zero periods must start
by the day after that balance, so the zero earnings cover the whole span since
it; a zero final quarter alone does not show the earlier quarters held none.
The row discloses the inference (audit
SNOW-2), and the inferred figure counts as parent equity wherever parent equity
is read: P/B, returns and the DCF inputs, not only the EV bridge. The DCF's equity bridge is the same identity read backwards: equity
value = EV − net debt − minority interest − preferred equity + non-operating
marketable equity securities (D-60, when identified) + the long-term
investments sales-to-capital removed as non-operating (D-65). Minority interest
enters both at its book carrying amount, not a market or earnings-share value.

**Three enterprise values, three labels (D-65).** The key-data box's
**Enterprise value (market)** is the quote's market cap plus the D-60 net debt
(equity securities are not cash), and since D-65 the EV multiples (EV/EBITDA,
EV/Sales, and their own-history ranks, each quarter on its own filed equity
securities) use exactly that net debt, so the box and the multiples agree (NVDA:
$5.21T, EV/EBITDA 25.9×, EV/Sales 17.2×; before D-65 the multiples netted the
$42.78B of equity stakes as cash and reconciled to $5.17T). The DCF bridge's
**Intrinsic enterprise value (DCF, operating assets)** is the model's value of
the operating business; it excludes the non-operating assets the bridge adds
back. The **Provider enterprise value (vendor definition, period end)** is the
vendor's own figure at its period end (that date's market cap + debt − cash and
equivalents) and is shown only as provider data.

**Long-term investments (D-65).** Sales-to-capital removes the balance sheet's
long-term investments from invested capital as non-operating (D-60); the bridge
now adds the same amount back at its filed carrying value, so an asset left out
of operating capital is never left out of value too. Where the companyfacts
carry the issuer's non-marketable carrying value
(`EquitySecuritiesWithoutReadilyDeterminableFairValueAmount`: cost less
impairment, adjusted for observable price changes) it is cited beside the line
(NVDA: $51.16B, of which $47.90B non-marketable equity). No fair-value estimate
or marketability discount is applied. Equity stakes a filing places inside
other assets (NVDA's $4.96B long-term portion of locked-up public equity, 10-Q
Note 5) are tagged only with a dimension the companyfacts omit, so they stay in
operating capital and outside the bridge.

**Share basis (D-65).** Per-share values divide by the latest weighted-average
diluted count, which carries option and RSU dilution; the bridge table also
prints the shares outstanding the quote implies (market cap ÷ price) and says
which one divides.

`src/pipeline/stageB/netDebt.ts` owns the versioned net-debt resolver: debt minus
the combined cash-and-short-term-investments field, or minus both separately
disclosed cash components when the combined field is unavailable. Negative
total debt, absent debt, missing cash components, or contradictory combined
cash evidence withholds house net debt. Combined cash below reported cash,
or disagreement with the component sum beyond `max(1, abs(combined) × 1e-6)`
is a conflict; it cannot fall back to a narrower cash-only convention. Vendor
net debt is diagnostic evidence only, because it can omit short-term investments;
since D-60 it is no longer a row in the statement extracts the narrative reads.

**Marketable equity securities are not cash (`NET_DEBT_V3`, D-60).** NVDA's
"cash and short-term investments" of $99.37B (2026-07-26) is cash $22.44B +
marketable debt securities $34.14B + publicly-held equity securities $42.78B,
most of the equity under lock-up (10-Q Note 5). Stage B reads the issuer's own
fair-value fact at the balance date (`EquitySecuritiesFvNiCurrent`, else
`EquitySecuritiesFvNi`) and excludes it from cash only when cash + current debt
securities (`DebtSecuritiesCurrent` or
`AvailableForSaleSecuritiesDebtSecuritiesCurrent`, or none) + the equity
securities reconcile to the combined total within 0.01%; an equity stake the
filing places outside short-term investments is never subtracted from cash. Net
debt, net debt/EBITDA and the current-capital debt bridge use that one figure
(NVDA bridge: −$23.22B rather than −$66.0B). The DCF equity bridge then **adds
the equity securities back as a separately disclosed non-operating asset** at
the filed fair value: their gains sit below operating income, so the FCFF path
does not value them. No marketability discount is estimated, because the
lock-up terms are not structured data; the note says so. Invested capital still
subtracts them, being non-operating.
The anchor compares the latest quarterly and annual whole rows. It selects the
newer unless that row lacks finite debt, stockholders' equity or combined cash
and the older row has all three; then it uses the older whole row with a note
and info gap. When neither is complete, the newer remains selected and missing
inputs withhold affected results. The bridge never assembles debt and cash from
different fiscal periods.

**The OPERATING-lease liability is excluded by default; the finance-lease
liability is not.** The option to keep the operating slice in is
`METIS_EV_INCLUDE_LEASES=1`. The split is the whole point. Under US GAAP
(ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA
are already *after* it and adding that liability to EV as well double-counts the
leases in EV/EBITDA. Finance-lease cost is split between right-of-use
amortisation, which is included in EBIT and added back in EBITDA, and interest,
which sits below EBIT ([ASC 842, 842-20-45-4](https://storage.fasb.org/ASU_2016-02_Section_A.pdf)). The finance-lease liability remains financing debt in both frames
and stays in enterprise value and in net debt, always. The provider's
`totalDebt` contains both, so the default subtracts the operating slice back out
and leaves the finance slice where it is.

Only the EDGAR route resolves the split: the lease chain there sums a separately
resolved operating and finance liability, and the operating slice is published
as its own balance-sheet field. FMP publishes one combined
`capitalLeaseObligations` and no split, so on that route **no lease adjustment
is made at all** — enterprise value is reported as-is and an info-level
`valuation.multiples.enterpriseValue.leases` manifest entry says that removing
the combined figure would strip an unknown amount of finance-lease debt out of
EV. The same entry fires when no lease liability is disclosed at all. Nothing is
guessed, and nothing unknown is netted.

**The operating slice is removed only when total debt is shown to hold it.**
The removal assumes the operating-lease liability is inside `totalDebt`. It is
proven when the row's total lease liability covers the operating slice, or
when current plus noncurrent borrowings plus the leases reconcile to the total.
An operating lease enriched from SEC onto a provider row whose total is
borrowings only is not removed. Net debt and EV are then used as reported, and a
warning-level `valuation.dcf.netDebt.leaseScope` entry says so (audit
2026-10-19, CODE-1). The same proof applies to the WACC debt leg and to the key
data net debt excluding operating leases.

Both enterprise values — as reported, and less the operating-lease liability —
are computed, together with the total lease liability and its finance slice.
They are published in the EV bridge basis string, which is a computed valuation
note and is quoted verbatim into the EV/EBITDA and EV/sales basis lines and into
the DCF equity-bridge note; there is no separate assumption-block row for them.
Turning the option on raises a warning-level manifest entry stating that
EV/EBITDA then pairs a lease-inclusive numerator with a lease-expensed
denominator and is not comparable to the default basis. The DCF equity bridge
follows the identical convention through net debt, so the two can never
disagree.

**Invested capital and the WACC's debt leg share the lease basis.** ROIC's
invested capital (debt + equity − cash and short-term investments, with the
disclosed cash-only fallback when investments are unreported) and the
average debt behind the effective cost of debt and the E/D weights remove the
same operating-lease slice by default and keep it when the option is on, so
the discount rate, the return on capital and the enterprise value are on one
basis: NOPAT and interest expense are both after operating-lease cost under
ASC 842, and a lease-inclusive denominator understated ROIC for every
lease-heavy issuer (a discount retailer: 6% on the inclusive base against 11%
on the consistent one) and could push the effective rate below the acceptance
band. Where no split is disclosed the ROIC notes say the provider's total
debt, lease liabilities included, was used unadjusted.

**Annual return denominators require adjacent balances.** ROIC, ROTE and
DuPont average the closing balance with the balance matched to the next older
annual income period only when the two balances are 300–430 days apart, the
same fiscal-continuity range used by the forensic layer. This accommodates
52/53-week calendars. A missing year or a shorter transition stub uses the
existing single-period denominator and records a warning instead of silently
averaging capital from nonconsecutive years.

**The own-history enterprise value carries the same adjustment.** Each
historical quarter window removes *its own* operating-lease liability whenever
the current EV removed one, so the rank compares like with like. A window whose
balance sheet discloses no operating-lease liability cannot be put on that basis;
its EV/EBITDA and EV/sales are dropped from the distribution — never ranked
against a differently-defined history — and the count of dropped windows is
disclosed as `valuation.multiples.ownHistory.evLeaseBasis`. The vendor's
pre-baked EV ratios are built on the vendor's own lease-inclusive enterprise
value, so when the adjustment fires those bands are withheld under the same
manifest entry rather than published on a basis the current number does not
share.

---

## Multiples and own-history ranks

Current multiples are computed from raw statement fields, never from a
vendor's pre-baked ratio. Which multiples are meaningful depends on the route:
banks and insurers never get EV multiples, because debt is their raw material;
equity REITs lead with P/FFO and P/AFFO.

The own-history figure is an **empirical percentile rank within the retained
sample**, on a 0-100 scale with interpolation between order statistics. It is
not an ordinal position among the quarters or an estimate of a population
percentile. The 8 to 20 observations are a small sample, and input definitions
and period comparability limit interpretation. The audit export retains the
individual period ends, market observation dates, unrounded multiple values,
source method and available capitalization source identity. Vendor ratios do
not establish their underlying market observation date.

Each window's market cap comes from the vendor enterprise-values history when
it has a row within 45 days before the quarter end, else (D-60) from the
bundle's five-year daily market-cap history (close × shares): the vendor
history stops at five quarters, so no issuer reached the eight-quarter minimum
(NVDA report #34: valuation completeness 70%). Only the market cap is taken;
each window's EV is rebuilt from that quarter's own statement components.

**N is rendered separately from the percentile scale**: the multiples row carries
`ownHistoryObservations`, and every surface prints "empirical percentile 62/100
(n = 12 quarters)". A report persisted before that field existed still parses and
still renders, without inventing an N. The field is optional in Zod for exactly
that reason and is stripped from the judge's request schema — the judge never
authors this table (`applyMultiples` replaces it wholesale from computed
numbers), so carrying it costs nothing against the request schema's
optional-parameter budget. The score drivers built from the rank are named
`peOwnHistoryRank`, `priceToTbvOwnHistoryRank` and `pFfoOwnHistoryRank` with
unit `rank`, the valuation aspect note says rank, and the Stage C prompt
instructs the model in the same terms, so the narrative cannot call it a
percentile either.

Fewer than 8 quarters produces no rank at all. Fewer than 20 (a full five
years) flags the window as low-sample, because at those sizes the 5th and 95th
percentiles track the near-minimum and near-maximum rather than stable
quantiles; the median and quartiles remain robust. A multiple rendered "n/m"
(a negative or zero denominator) loses its rank too, so the report can never
show a rank for a number it declines to print.

Peer medians are trimmed of n/m values and 1.5×IQR outliers and suppressed
below four surviving peers. With FMP access, optional collection inspects at
most ten provider candidates within 25 seconds. A candidate FMP refuses by
symbol (HTTP 402 on that symbol only) does not stop the collection: with an
SEC contact configured it is read from SEC companyfacts and a Yahoo quote,
its market capitalization is that price times the filed share count on the
quote's split basis, and its industry is established by an SEC SIC code equal
to the subject's. Same-industry, sector, valuation-route, currency,
issuer/share-class and date checks govern eligibility; contradictory statement
identifiers are rejected. Quotes and quarterly statements must be timely and
filings available by the quote date. Business-model, accounting and
metric-definition evidence that is supplied but invalid or different from the
subject's excludes a peer; no source supplies it independently yet, so a
median resting on the screens alone is published with a stated comparability
caveat (D-59). The report lists the method, metric-specific counts and
excluded candidates. Keyless, reserved fixture symbols, unavailable data and
thin coverage publish no unsupported median. This is a screened provider list,
not an exhaustive or independently optimized peer universe.

**Size screen (D-65).** A candidate whose market capitalization is more than
`PEER_SIZE_RATIO_LIMIT` = 100 times smaller or larger than the subject's is not
a comparable company: it is excluded at discovery (on the discovery row's
market cap, so it costs no provider reads), again at comparison (on its own
quote), and left out of the peer list the analysis reads, with a note naming it
and the ratio. Size is a priced risk characteristic (Fama and French 1992) and
multiples differ systematically with it; comparable-company practice selects
on industry first and size second, and industry is the decisive screen (Alford
1992), so the bound is deliberately loose. NVDA ($5.24T) keeps AVGO, AMD, INTC,
ARM, MRVL and QCOM (1/3 to 1/27 of its size) and drops CoreWeave (1/136),
Cerebras (1/163) and the $265M and $29M listings the rerun's peer table printed.
CoreWeave is also an NVIDIA customer; no structured source identifies customer
relationships, so the screen removes it here on size alone. Unbacktested house
convention (RESEARCH §8).

Market-cap/common-earnings comparisons use four quarterly observations with
established common ownership and appear separately from price/weighted-EPS
multiples. Those definitions can differ with changing share counts and are
never silently combined. P/B and P/TBV require supported positive denominators.
Peer comparisons provide context; they do not change scoring or intrinsic-value
formulas.

---

## Financial-company routes

How a company is routed, what each route withholds and why, how a financial is
valued instead, which route metrics are computed, and how FFO and AFFO are
defined. Decisions D-16 and D-17.

### Routing

#### Three inputs, in order

A company's base route is decided by the vendor industry string, the SEC SIC
code, and tag evidence read from EDGAR companyfacts.

1. **Industry prefix** (case-insensitive, trimmed): `Banks…` → bank,
   `Insurance…` → insurer (except `Insurance - Brokers`, which is fee-based and
   goes to the general map), `REIT…` → REIT.
2. **SIC fallback**, consulted only when there is no industry string at all. A
   known industry that matched no prefix — credit services, mortgage finance,
   asset management, exchanges, and every
   non-financial industry — is a decided classification and goes to the
   general map (the FIN-OTHER treatment); the SIC is not consulted behind it.
   With no industry: 6020-6036 (depository institutions; major group 61,
   non-depository credit, has no deposits and stays FIN-OTHER) → bank,
   6300-6399 (insurance carriers) → insurer, 6400-6499 (agents, brokers and
   service) → the general map, 6798 → REIT (sub-map undecided; see *The REIT
   sub-map* below),
   sector "Financial Services" → the general map.
3. **XBRL evidence** (`src/pipeline/stageB/routingEvidence.ts`), read-only from
   the bundle's companyfacts payload. Broad financial labels (`Capital Markets`,
   `Financial - Capital Markets`, `Financial Conglomerates` and diversified
   financial-services labels) are refined to the bank map when recent deposits
   and loans or net interest income corroborate a deposit-funded business.
   Explicit fee-based insurance-broker industry or SIC classifications retain
   their general route; conflicting evidence is disclosed. No ticker overrides
   are used.

#### What the tags decide

| Evidence | Conclusion |
| --- | --- |
| deposits **and** (loans **or** net interest income) | bank |
| premiums earned **and** loss or policy reserves | insurer |
| `RealEstateInvestmentPropertyNet` / `…AtCost` | equity REIT |
| mortgage-backed securities **or** mortgage loans held for investment, **and no** investment property, **corroborated** (see below) | mortgage REIT |

Deliberate properties:

- **A single line item is not a business model.** Deposits alone do not make a
  filer a bank; a loan or net-interest-income tag must accompany them. An
  industrial holding customer deposits is not misrouted.
- **The tags in a group name the business model.** The mortgage-REIT groups
  carry only elements whose names are mortgage-specific
  (`MortgageBackedSecurities…`, `MortgageLoansOnRealEstate…`,
  `LoansReceivableHeldForInvestmentNet`). Generic elements —
  `AvailableForSaleSecuritiesDebtSecurities` and its two spellings, which is
  what any corporate treasury tags for its bond portfolio, and
  `NotesReceivableNet` / `LoansAndLeasesReceivableNetReportedAmount` /
  `FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss`,
  which is what a manufacturer with vendor financing tags — are **not** in them.
  They were, and they routed ordinary industrials to the mortgage-REIT map,
  which suppresses the DCF, the reverse DCF, EV/EBITDA and ROIC−WACC, drops
  Piotroski to three signals and leads the report with book value per share.
- **Two rules fire on a single tag group.** Evidence sets a route where no
  classification has decided one, or refines a broad financial label using the
  corroborated bank rule above. Bank evidence needs two groups and insurer
  evidence needs two; the equity-REIT rule (investment property) and the
  mortgage-REIT rule fire on one. The mortgage rule is the weakest evidence the
  module produces: before it may SET a base route, either the repo funding a
  levered mortgage book cannot run without
  (`SecuritiesSoldUnderAgreementsToRepurchase`) or an already-financial
  SIC/sector must corroborate it. Either single-group rule may set a route
  only on a profile with no industry string, or one whose SIC or sector already
  says "financial"; against a declared non-financial industry and SIC (a
  taxable real-estate operator that tags investment property, an industrial
  with vendor financing) the tags are filed as `route.evidence.conflict`
  (`warn`) and the route is left where it was.
- **A retired tag cannot classify a filer today.** A tag counts only when its
  newest non-zero fact, from a core form (10-K/10-Q/20-F/40-F and their amendments,
  after the max-`filed` dedup), falls within 24 months of the newest evidence
  fact on file.
- **The property tag wins for hybrids.** A REIT that files investment property
  *and* mortgage assets is an equity REIT; the mortgage classification requires
  the absence of investment property.

#### Evidence confirms or contradicts; it does not silently override

- Neither industry nor SIC matched → evidence **decides** the base route, and
  the note names the tags, their values, their period ends, and the industry and
  SIC inputs that failed to decide. Two qualifications: the mortgage-REIT rule
  fires on a single tag group and must first be corroborated (*What the tags
  decide*); and
  "neither matched" means there is no industry string, or the SIC or sector
  already says "financial" — a known non-financial industry beside a
  non-financial SIC is itself a classification (major groups 65 and 66,
  real-estate operators and developers, are not financial for this purpose),
  and evidence against it is filed as `route.evidence.conflict` and changes
  nothing.
- Industry/SIC matched and evidence agrees → the note records the confirmation.
- A broad financial label with corroborated bank evidence → refine to bank,
  explicitly naming the label and supporting facts in the route note.
- A specific industry/SIC matched and evidence disagrees → **the declared classification
  stands**, and the disagreement is filed as `route.evidence.conflict` (`warn`).
  A vendor string and an SEC code are evidence too; the honest outcome is a
  disclosed conflict, not a silent re-route.
- Companyfacts unavailable → `route.evidence` (`info`), raised only for
  financial candidates, so an ordinary industrial's manifest is not padded with
  a check that was never relevant.

#### The REIT sub-map, and why SIC 6798 cannot decide it

SIC 6798 is "Real Estate Investment Trusts" and covers equity and mortgage REITs
alike. The two maps disagree about which metrics are meaningful: FFO is the
equity REIT's earnings measure and is close to meaningless for a mortgage REIT,
whose assets are marked securities and whose headline is book value.

The sub-map is therefore decided by evidence or by an explicit vendor sub-type,
never by the SIC:

- `RealEstateInvestmentPropertyNet` present → **equity**.
- Mortgage assets present without investment property → **mortgage**.
- Vendor industry naming a sub-type (`REIT - Mortgage`, `REIT - Industrial`) →
  that sub-map. A vendor mortgage label contradicted by filed investment
  property is kept but flagged (`route.reitSubmap.conflict`).
- Otherwise → **`undetermined`**.

A keyless profile derives its industry string from the SIC map itself, so
`REIT - Diversified` on SIC 6798 carries no information beyond the SIC and is
**not** read as a vendor sub-type. Treating it as one would launder the SIC into
evidence it is not.

`undetermined` withholds **both** metric families — FFO, AFFO, P/FFO, the AFFO
payout ratio and the implied cap rate on one side; book value per share, the net
interest spread and assets/equity leverage on the other — with the reason on the
`route.reitSubmap` manifest entry. Publishing either set would assert a business
model the evidence does not support.

### Valuing a financial company

#### What is withheld, and why

Damodaran's treatment of financial service firms is the authority for the
central point: for a bank, an insurer or a mortgage REIT, debt is **raw
material**, not financing. Four consequences, each withheld with a stated reason
in the notes and the missing-data manifest:

| Withheld | Manifest key | Reason |
| --- | --- | --- |
| FCFF/WACC DCF | `valuation.dcf` | FCFF is before debt service, but debt, cash and reinvestment cannot be separated reliably into operating and financing items for these balance sheets ([Damodaran](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/finfirm09.pdf)) |
| FCFF reverse DCF | `valuation.reverseDcf` | inverts the same model; the growth or margin it solves for inherits the same category error |
| EV/EBITDA | `valuation.evEbitda` | enterprise value adds debt and subtracts cash, both operating items here — a profitable bank can show a negative EV |
| ROIC − WACC | `returns.roicVsWacc` | invested capital (debt + equity − cash) is undefined when deposits, policy reserves or repo fund the assets and cash is itself an earning asset |

Industrial FCF, FCF conversion and growth, P/FCF, net debt/EBITDA, EBIT interest
coverage, maintenance-capex heuristics, and gross/operating-margin scoring are
also withheld on these routes. Their missing inputs are not treated as data
failures. Common-share issuance, repurchases, dilution and SBC/revenue remain
useful and are retained.

Equity REITs additionally withhold a **net-income DCF**
(`valuation.netIncomeDcf`): GAAP net income is struck after real-estate
depreciation, a large non-cash charge against assets that typically hold or gain
value, so discounting it understates the company. FFO exists precisely because
of this.

#### The excess-return equity model

The replacement is an equity-side residual-income model — Damodaran's excess
return model, stated as:

```
Equity value = BV0 + Σ_{t=1..N}  (ROE_t − CoE) × BV_{t−1} / (1 + CoE)^t
```

with, all printed as assumptions in their own right:

- **Horizon `N`** — explicit, 10 years by default. The excess return is
  discounted year by year to year `N`. A continuing value is added beyond it
  only when durable excess returns are evidenced (next bullet).
- **Fade** — ROE fades **linearly** from the current return to its terminal
  target over exactly that horizon. The target is the DCF core's own terminal
  excess-return house convention, applied on the equity side (D-41): when the
  same return (ROTE for banks, common ROE otherwise) beat that fiscal year's own
  cost of equity in **every** one of the last 4+ years, the target is the cost
  of equity plus half the median spread, capped at 5pp (below 0.5pp the
  evidence is treated as noise). That carried spread is valued past year `N` as
  residual income growing at `min(2.5%, risk-free)`:
  `CV_N = (ROE_T − CoE) × BV_N / (CoE − g)`, discounted `N` years, behind the
  DCF's 2pp `CoE − g` guard. Without that evidence the target is the cost of
  equity, the year-`N` excess is zero and no continuing value is added — the
  behaviour before D-41, which valued every high-ROTE bank as if its returns
  collapsed by year 10 (JPM's price "required" a 54% starting ROTE). A caller
  may still override the terminal ROE; the override wins over the evidence.
- **Discount rate** — the **cost of equity**, never a WACC. A WACC would blend
  in the cost of deposits, policy reserves or repo, which are this company's raw
  material rather than its financing. A null cost of equity **suppresses** the
  model with a critical gap rather than defaulting a rate.
- **Opening book value `BV0`** — banks use annual tangible common equity
  (stockholders' equity less goodwill, other intangibles and preferred stock)
  with the matching fiscal-year ROTE. Insurers and mortgage REITs use annual
  common book equity (stockholders' equity less preferred stock), with earnings
  available to common divided by average common equity. Return and opening
  book value share a dated fiscal-year basis; vendor total-equity ROE is never
  substituted into a common-equity valuation. Later
  years compound at `ROE × retention`, where retention is `1 − payout`. A loss is
  retained in full: `roe × retention` on a negative ROE would return a fraction
  of the loss to book value, which is arithmetically a capital injection.
- **Common earnings and payout** — use filed income available to common first;
  otherwise deduct disclosed preferred distributions from net income. When
  preferred stock is outstanding and the adjustment is unavailable, withhold
  the return and model rather than credit preferred earnings to common. Payout
  is common dividends plus net common buybacks over income available to common,
  averaging up to three years with at least two usable years. Missing history suppresses the model
  rather than assuming a universal payout.
  If preferred stock is outstanding and SEC facts give only aggregate cash
  dividends, the total is not labeled common dividends. A preferred earnings
  allocation is not a cash payment. Common payout and the valuation remain
  unavailable without sufficient separate cash-distribution evidence; ROTE and
  tangible book metrics remain available when their own inputs are established.

The model also reverse-solves the **starting** ROE that reproduces the current
market cap, under the same fade the forward path uses. Inverting a *different*
model (a flat ROE, as an earlier version did) made the solved figure
systematically low, because a flat path is worth more than a fading one, and
biased every financial toward "the market is too pessimistic". A clean property
follows from the identity: an issuer priced at book solves to exactly the cost
of equity.

#### P/TBV against ROTE

The multiple a financial is actually read on is price to **tangible** book, and
the return that justifies it is return on **tangible** common equity. Both use
the same denominator — equity less goodwill, other intangibles and preferred —
because goodwill absorbs losses only after common equity is gone, and pairing a
book-value multiple with a tangible-equity return would compare two different
bases. A goodwill-heavy acquirer at 1.0× book can be at 2.0× tangible book.

The current multiple names its balance date; the annual return and model name
their fiscal-year date. Preferred stock is deducted in both tangible bases.
Undisclosed preferred is treated as zero and that convention is disclosed.
From EDGAR companyfacts, preferred is the carrying value
(`PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount`, then
`PreferredStockIncludingAdditionalPaidInCapital`) before the par value
(`PreferredStockValue`). Other intangibles are `IntangibleAssetsNetExcludingGoodwill`,
else the sum of the finite- and indefinite-lived pieces the filer tags.
Mortgage servicing rights are not deducted, following the TCE convention, so
a servicer's EDGAR intangibles can sit below FMP's, which include them (D-42).
Statements reconstructed from EDGAR companyfacts cannot independently verify
themselves: their FMP↔XBRL check is marked skipped with an informational identity
disclosure. Balance-sheet identities and other independent checks still run.

The justified multiple is a **stable-growth cross-check**, in the Gordon form of
the residual-income identity:

```
justified P/TBV = (ROTE − g) / (CoE − g),
g = min(ROTE × retention, terminal-growth cap 2.5%, risk-free rate)
```

Two things it is **not**:

- It is **not the forward model read as a multiple.** *The excess-return equity
  model* fades ROE linearly to the cost of equity over ten years and adds no
  continuing value; this identity
  assumes ROTE persists in perpetuity. They rest on different assumptions and
  can legitimately disagree — the difference is the value of persistence, and
  the basis string says so. (An earlier version of this section, and of the
  basis string, claimed the two "cannot disagree". That was false: at ROTE 16%,
  CoE 10% and a 50% payout the forward model reads 1.26× tangible book while the
  uncapped identity read 4.00×.)
- It is **not exempt from the house growth rule.** `g` obeys the same ceiling the
  DCF terminal value obeys — nothing grows faster than the risk-free rate
  forever. Uncapped, `g = ROTE × retention` reached 9.4% for a regional bank at
  ROTE 14% with a one-third payout, giving a justified 7.45×, so a bank at 1.5×
  tangible book printed a premium of −5.95× while the pipeline's own fair value
  called it roughly fairly priced. Capped, the same bank reads 1.53×. When no
  risk-free rate is supplied the cap is the 2.5% terminal-growth ceiling alone,
  and the basis string says which bound applied.

The multiple is **withheld, never clamped**, when `CoE − g` falls below 0.5pp:
the ratio diverges through infinity there, and any number it produced would be an
artefact of the arithmetic rather than a valuation. When ROTE, the cost of equity
or the payout history is missing, the multiple is still shown and the justified
figure is withheld with its reason.

### Route metrics

`src/pipeline/stageB/financialMetrics.ts` computes the figures each financial
route leads with, from the filer's own XBRL tags, read-only. Two rules govern
every metric:

1. **A named metric is computed only from the figures its definition calls
   for.** Where those figures are not on file the metric is **withheld with a
   reason**, which reaches the manifest as `financialMetrics.<key>`.
2. **A stand-in is published under its own name**, never the name of the metric
   it stands in for, and is marked `proxy`.

#### Banks

| Metric | Definition | When withheld |
| --- | --- | --- |
| Net interest margin | net interest income / average **earning** assets | whenever the filer tags no earning-assets element. us-gaap carries no standard average-earning-assets concept, and total assets include premises, goodwill and other non-earning items, so dividing by them would understate the margin. |
| Net interest income / average total assets | the honest denominator that *is* available | published as a labeled stand-in beside a withheld NIM, stating that it sits below a true NIM |
| Efficiency ratio | noninterest expense / (net interest income + noninterest income) | when the noninterest split is not tagged. This split exists in the filings even though vendor income statements omit it. |
| CET1 | company-reported CET1 capital / risk-weighted assets | when no CET1 element is tagged (it is often only in the regulatory-capital footnote text). Display only, never graded (D-46): none of JPM, BAC, WFC, C or PNC tags it after 2013. |
| Tangible leverage | (equity − goodwill − intangibles − preferred) / (assets − goodwill − intangibles) | computed whenever equity and assets are on file, CET1 or not (D-46); marked a stand-in only when CET1 is untagged. Its numerator and denominator differ from regulatory CET1, so it is not comparable and has no guaranteed ordering relative to it. [Basel risk weights](https://www.bis.org/committees/bcbs/basel-framework/standard/cre/20/inforce/2023-01-01/published/2022-12-08) can exceed 100%. |
| Net charge-offs / average loans | the fiscal year's charge-offs net of recoveries / average of the same loan element at the two year ends (the FDIC Quarterly Banking Profile net charge-off rate) | when no fiscal-year after-recovery element or write-off/recovery pair from one family is tagged, a pair's periods differ, or the prior year-end loan balance is not tagged under the same element (D-46) |
| Loans / deposits | total loans / `Deposits` at one balance-sheet date | when either is untagged or the two dates differ (D-46) |

"Total loans" in these ratios is gross of the allowance first
(`FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss`, then
`LoansAndLeasesReceivableGrossCarryingAmount`), as in the FDIC Quarterly
Banking Profile coverage and charge-off rates; net loans are the fallback, and
each basis names the element used (review of D-46/D-47, 2026-10-13).

The bank balance-sheet grade (see *Numeric grades and completeness*) reads
tangible leverage, the charge-off rate, the NPL ratio and loans / deposits.
Since payload 1.14.0 the analysts see them, with CET1, as citable rows in a
"Bank capital, credit and funding" section whose notes say they are
public-filing proxies, not a supervisory rating.

Rate-risk and credit-cycle figures (D-47) are shown in the same block and
section and are **never graded**:

| Metric | Definition | When withheld |
| --- | --- | --- |
| HTM unrealised loss (net) | `HeldToMaturitySecuritiesAccumulatedUnrecognizedHoldingLoss` − `…Gain`; else amortised cost (`DebtSecuritiesHeldToMaturityExcludingAccruedInterestBeforeAllowanceForCreditLoss`, then `HeldToMaturitySecurities`) − `HeldToMaturitySecuritiesFairValue` | when neither pair is tagged, or a pair's two facts are at different dates or in different units |
| HTM loss after tax | the loss × (1 − 21%). The 21% US federal statutory rate is an assumption (state taxes and the bank's deferred-tax position are not modelled), printed as its own row | with the loss |
| HTM loss / TCE | after-tax loss / tangible common equity | with the loss, or when the loss and the balance sheet differ in date or currency |
| Marked TCE ratio | (TCE − after-tax loss) / (tangible assets − pre-tax loss). AFS losses are already in TCE through AOCI, so only the HTM loss is deducted | as above |
| ACL / loans | `FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest` (else `LoansAndLeasesReceivableAllowance`) / loans at one date. Its direction is ambiguous: conservative reserving or a riskier book | when either is untagged or the dates differ |
| Loan growth, 3-year | CAGR of the same loan element at four fiscal year ends; includes acquisitions | when any of the four is untagged or they do not span three years |

**Bank warning signs** (`bankRiskFlags`, `BANK_FLAG_THRESHOLDS`). Each is a
heuristic threshold, not validated, evaluated only when its input is on file:
tangible leverage below 5%; HTM loss after tax above 25% of TCE; marked TCE
ratio below 4%; three-year loan growth above 15% a year; loans / deposits above
110%; and provisions below net charge-offs while the NPL ratio rose (only when
provisions, charge-offs and the NPL ratio for both years are tagged). The
payload prints each evaluated sign's value, threshold and status as citable
rows, with digit-free caveats as notes; the report's route-metrics notes state
every triggered one. The judge prompt requires every triggered sign to be
discussed, HTM losses to be presented as conditional on deposits having to be
funded by selling the securities (a sticky deposit base offsets them), loan
growth to be said to include acquisitions, a count of signs never to be
presented as a probability, and the figures to be called public-filing
proxies with no supervisory rating.
| NPL ratio | nonaccrual loans / total loans | when nonaccrual loans are filed only by loan class (dimensional facts companyfacts does not expose as a total) |
| Provisions / loans | provision for credit losses / total loans | when neither the provision element nor its component sum resolves |
| Cost of deposits | interest expense on deposits / average deposits | when `InterestExpenseDeposits` is untagged — total interest expense covers borrowings too and would overstate it |

#### Insurers

| Metric | Definition |
| --- | --- |
| Loss ratio | incurred claims / premiums earned |
| Expense ratio | (other underwriting expense **+** deferred-policy-acquisition-cost amortisation) / premiums earned — **both** components required |
| Combined ratio | loss ratio + expense ratio |
| Reserve development | incurred claims attributable to prior accident years; positive is adverse, negative is a favourable release |

The expense ratio's numerator is the sum of `OtherUnderwritingExpense` and
`DeferredPolicyAcquisitionCostAmortizationExpense`, and **both** must resolve.
A partial component sum is not a total: an insurer tagging only the
acquisition-cost amortisation would publish a 12% expense ratio and a 77%
combined ratio — an underwriter that does not exist — so the ratio is withheld
naming the component that is missing. `InsuranceCommissionsAndFees` is not in
the numerator: it is a credit-balance revenue element, and summing it inflated
both the expense and combined ratios.

The denominator is **GAAP premiums earned**. A statutory expense ratio divides by
premiums *written*, so the computed figure is not directly comparable to a
statutory filing, and the company-reported combined ratio remains the gold
standard — the computed one is labeled a computation. The combined ratio is
**withheld outright when either half is missing**: a loss-ratio-only figure
reads materially flattering (64% where the real combined figure is 92%).

#### Mortgage REITs

| Metric | Definition |
| --- | --- |
| Book value per share | (total equity − preferred) / shares |
| Leverage | total assets / total equity |
| Net interest spread | interest income / average earning assets − interest expense / average interest-bearing liabilities — **withheld**, see below |
| Net interest spread (repo-funded) | interest income / average total assets − **total** interest expense / **average** repurchase agreements — the labeled stand-in |

Total assets is a fair yield denominator here — unlike at a bank — because a
mortgage REIT's assets are interest-earning securities and loans. The funding
leg is a different matter: companyfacts exposes only the repurchase-agreement
balance, while the interest-expense numerator covers every borrowing the REIT
runs. Dividing one by the other overstates the cost of funds and can flip the
sign of the spread — interest income 3.9bn on average assets 75bn against
interest expense 3.0bn over 50bn of repo prints −0.8% for a company reporting a
positive spread. So the named metric is **withheld** and the repo-funded
computation is published under its own name and marked a proxy, exactly as NIM
gives way to net interest income over average total assets. Both legs are
averaged over the current and prior period ends, so the two halves use the same
denominator convention. Either figure is withheld when a leg or its balance is
missing; a one-legged figure would misstate it.

### FFO and AFFO (NAREIT)

The app reconstructs the following components of NAREIT FFO:

```
FFO = net income (GAAP)
    + real-estate depreciation and amortization
    − gains on sales of property
    + impairments of depreciable real estate
```

The result is always **approximate**: affiliate/joint-venture adjustments are
not fully reconciled, nor is consolidated income reconciled to the common,
noncontrolling and preferred interests needed for a common-equity valuation.
NAREIT requires the affiliate adjustments but does not prescribe one ownership
attribution for every presentation. The app cannot claim equality with a
filer's FFO, or a guaranteed direction of error. Two component stand-ins can
individually increase the reconstruction:

- Where **real-estate** depreciation is not tagged separately, total
  depreciation and amortization is added back; NAREIT adds back only the
  real-estate portion.
- Where the **real-estate impairment** element is not tagged, the generic
  `AssetImpairmentCharges` is added back; NAREIT adds back only impairments of
  depreciable real estate, so a goodwill write-down inside that charge does not
  belong in FFO. `ImpairmentOfInvestments` — a securities write-down — is not in
  the chain at all.

The gain the definition subtracts is a gain on selling **real estate**:
`GainLossOnSaleOfProperties`, `GainsLossesOnSalesOfInvestmentRealEstate` (the
element most equity REITs use), `GainLossOnSaleOfRealEstate` and the
net-of-tax spelling. The generic `GainLossOnDispositionOfAssets1` is not one of
them — it covers disposals NAREIT does not exclude. Untagged gains and
impairments are treated as zero and the note says so, naming the direction: a
disposition gain the filer did not tag leaves FFO overstated by that gain.

AFFO subtracts recurring (maintenance) capital expenditure and straight-line
rent where the filer tags them. Where it does not, AFFO falls back to
`FFO − all capital expenditure`, which also subtracts development spending.
AFFO inherits FFO's approximation and omits some issuer-specific adjustments;
neither fallback is a guaranteed bound on the issuer's AFFO.

For example, Realty Income's [2025 reconciliation](https://www.sec.gov/Archives/edgar/data/726728/000072672826000009/realtyincomeq42025supple.htm)
contains unconsolidated-entity and noncontrolling-interest adjustments. Even
using its real-estate-only components, the app's unreconciled formula is
USD 12.105 million below common FFO, disproving an unconditional upper bound.

The implied cap rate divides NOI by the **house enterprise value** — market
capitalisation + net debt + preferred + minority interest, less the
operating-lease slice by default — the same definition the multiples and the
DCF bridge use, so a report carries one EV. The own-history P/FFO and P/AFFO
bands are built from net income + D&A per rolling four quarters, the only
construction quarterly statements support; when the current FFO adjusts
additional NAREIT components (a property-sale gain, an impairment or real-estate-only depreciation
netted) the bands are withheld with `valuation.multiples.ownHistory.ffoBasis`
rather than rank one definition inside another.

FFO is measured on **one** period: the latest fiscal year. Every XBRL component
resolves at that period end, so the statement fallbacks are read from the same
fiscal year rather than from a trailing window — a fiscal-year net income against
trailing depreciation is a hybrid of two periods, not a figure. The REIT
valuation block carries that period end as its as-of, and the notes say that the
share price in P/FFO is current while the FFO it divides is up to three quarters
old.

P/FFO and P/AFFO are computed from these figures. When the REIT sub-map is
`undetermined` (*The REIT sub-map*, above) every FFO-based figure is withheld.

### Forensic batteries by route

Piotroski (2000) built the F-score on non-financial firms; Altman excluded
financial institutions from every Z-model estimation sample; Beneish (1999)
excluded them from the M-score sample (p. 5). The routing layer honours those
sample definitions rather than producing a number outside them.

#### Altman Z, Beneish M, accrual ratios

All three are withheld on the bank, insurer and mortgage-REIT routes, and on any
issuer whose sector is "Financial Services" or whose SIC falls in 6000-6499 or
6700-6799 (equity REITs excepted, with a caution note). Each files its reason in
the manifest — `forensics.altmanZ`, `forensics.beneishM`,
`forensics.accrualsRatio` — because a blank cell with no reason reads as a fetch
that failed rather than as a deliberate refusal.

SIC major group 65 (real-estate operators, agents and managers) is deliberately
outside the exclusion band: those are ordinary operating companies with
inventory, receivables and a working-capital cycle.

#### Accrual definition, Beneish and Piotroski decompositions (D-61)

**Accruals.** The cash-flow accrual ratio is financial-asset-adjusted
(Richardson, Sloan, Soliman & Tuna 2005):
- the numerator is NI − CFO − operating CFI, where operating CFI is investing
  cash flow without purchases and sales/maturities of investments;
- net operating assets exclude cash, short-term **and** long-term investments.

Capex, acquisitions and investing flows the statement leaves unclassified
remain operating investment. If the statements do not report the investment
flows (FMP `purchasesOfInvestments`, `salesMaturitiesOfInvestments`) and
long-term investments in both years, the ratio is operating accruals
NI − CFO. Statements built from companyfacts always take this path. The
result's `definition`, the forensic notes, the payload and the report's
"Variant" cell name the construction used. Above 30% revenue growth a note
gives the fiscal year's revenue and NOA growth: accruals of a fast grower are
mostly NOA growth (Fairfield, Whisenant & Yohn 2003). The note is not graded.

**Acquisitions and NOA composition (D-68).** When the year's increase in
goodwill and other intangibles, or the cash paid for acquisitions, is at least
10% of the NOA increase (house rule), a note gives goodwill and intangibles at
both year ends, the cash paid (the statement's acquisitions line plus a
payment the filer tags as `PaymentsToAcquireBusinessTwoNetOfCashAcquired`
when the row carries it in other investing) and the acquired share of the NOA
increase. With that note or the growth note, a second note splits the NOA
increase into receivables, inventory, net PP&E, goodwill and intangibles,
other operating assets and operating liabilities. Neither is graded.

**Beneish.** The report prints all eight indices and M with SGI at neutral
1.0. When only SGI carries M over −1.78, the zone reads "flag (growth-led)"
and the quality signal is graded on the SGI-neutral M. When M is above the
"unlikely" band (D-68), AQI above 1 is explained from the balance sheet
(goodwill, other intangibles, long-term investments and the remaining
non-current assets at both year ends, and AQI without the first three), and
GMI above 1 from the gross margins and the inventory write-downs the filer
tags (`InventoryWriteDown`), with GMI and the margin decline recomputed with
them added back. Context, not graded.

**Notes, not flags (D-68).** The accrual definition, its house bands and the
growth, acquisition, AQI and GMI context are the report's forensic notes,
printed under the forensic table. The flags list carries findings only.

**Piotroski.** The zone names the failed signals, and the payload carries all
nine outcomes.

#### Piotroski F, on three scales

The score is reported over the signals that remain, with its own denominator,
and the result carries a variant and a label so a reduced score is never read
against the 9-point scale. The label's withheld count is derived from the
signals that are actually null and names them, so a data gap that drops a
further signal is never reported as one of the route's own withholdings. In the
composite score the Piotroski signal is banded on the fraction achieved but
weighted by the share of the nine signals that were evaluable, and the
shortfall counts against the quality aspect's data completeness — two
coin-flip signals cannot swing the aspect the way nine do.

| Scale | Applies to | Signals withheld |
| --- | --- | --- |
| 9 | general route | none |
| 5 | FIN-OTHER: sector "Financial Services" or a financial SIC, but routed to the general map (asset managers, exchanges, insurance brokers) | CFO > 0, CFO > net income, current ratio, gross margin |
| 3 | bank, insurer, mortgage REIT | the four above **plus** ΔLEVER and ΔTURN |

Reasons:

- **The two cash-flow signals** presume an operating cash flow that measures
  earnings quality. A bank's is dominated by loan, deposit, trading-asset and
  reserve flows. (JPMorgan scored 2/6 in the 2026-09-02 keyless sweep with both
  misses on these tests.)
- **The current ratio** presumes a current/non-current split an unclassified
  financial balance sheet does not have.
- **Gross margin** presumes a cost of revenue; revenue − cost of revenue is
  meaningless on a net-interest-spread or premium income statement.
- **ΔLEVER** treats long-term debt over assets as a solvency burden. On these
  routes debt is an input, and the funding that matters — deposits, policy
  reserves, repo — is not long-term debt at all, so a falling ratio is a
  funding-mix change. A bank shrinking bond issuance while deposits grow would
  score a deleveraging point it did not earn.
- **ΔTURN** reads revenue over assets as operating efficiency. A financial
  company's assets *are* its revenue-generating book, so the ratio tracks the
  rate environment and balance-sheet mix; it falls when a bank adds low-yield
  liquidity.

The 5-signal scale exists because the FIN-OTHER issuers are fee-based with
ordinary balance sheets: their debt is debt and their assets are not their
revenue-generating book, so ΔLEVER and ΔTURN still mean what the paper says.
This mirrors the ROTE-vs-ROIC switch, which is likewise narrower than the
forensic classifier.

Nothing is dropped silently at any scale: each withheld signal keeps its reason
on the signal itself, the manifest entry names every withheld signal and the
denominator used, and the notes state that the score is not comparable to a
9-point F-score.

---

## FCFF arithmetic, sensitivity and reverse valuation

`src/pipeline/stageB/valuation.ts` returns full-precision model values. Rates
ending in `Pct` are percentage units (8 means 8%); the debt tax shield uses
a fractional effective rate. Display rounding does not feed the DCF engine.

For each explicit year `t`, with rates converted to fractions:

```
revenue_t = revenue_(t-1) × (1 + growth_t)
EBIT_t = revenue_t × EBIT_margin_t
reinvestment_t = max(0, (revenue_t − revenue_(t-1)) / sales_to_capital)
FCFF_t = NOPAT_t − reinvestment_t
PV_t = FCFF_t / (1 + WACC)^(t − 0.5)
```

The reinvestment floor means shrinking revenue releases no capital in this
model. NOPAT is EBIT less cash tax: a loss earns no cash tax refund. Projected
losses accumulate a net-operating-loss balance and shelter later positive EBIT
inside the explicit horizon. No jurisdictional carryforward limits, opening
tax-loss asset or residual tax asset in the terminal value are modeled. The
year rows report the effective tax rate actually applied, including shelter.

The continuing value uses the last explicit margin and tax assumption:

```
EBIT_(N+1) = revenue_N × (1 + terminal_growth) × margin_N
NOPAT_(N+1) = EBIT_(N+1) × (1 − tax_N), if EBIT_(N+1) > 0
             EBIT_(N+1), otherwise
terminal_FCFF = NOPAT_(N+1) × (1 − terminal_growth / terminal_ROIC)
terminal_value = terminal_FCFF / (WACC − terminal_growth)
PV_terminal = terminal_value / (1 + WACC)^(N − 0.5)
EV = sum(PV_t) + PV_terminal
```

The mid-year timing applies to the terminal discount as well as explicit cash
flows. Terminal reinvestment greater than 100% is capped at 100% with a note;
non-positive terminal ROIC substitutes zero reinvestment with a note. Negative
terminal growth is not floored here. Missing net debt prevents EV-to-equity
bridging; missing/non-positive diluted shares prevents per-share valuation.
Preferred and minority claims are subtracted separately, with null treated as
zero. The bridge recorded on the base result is reused by scenario reruns.

The **5 × 5 sensitivity grid** uses WACC offsets of −2, −1, 0, +1 and +2
percentage points (D-60; ±1pp spanned less than one regression beta's
uncertainty) and terminal-growth offsets of −1, −0.5, 0, +0.5 and +1. It holds
explicit paths fixed and retains the base terminal excess spread above each
cell's own WACC. A cell inside the 1.5pp Gordon guard is null, rather than
moved to a different growth rate. Sensitivity growth is an axis experiment; it
is not a new base-case terminal-growth recommendation.

The **growth × margin grid** (D-60) varies the two inputs that decide the
value: year-one revenue growth shifted by −20, −10, 0, +10 and +20pp on the
reverse DCF's convergent-shift family (the shift is gone by year 10), against
the operating margin shifted by −10, −5, 0, +5 and +10pp in every year and the
terminal value. WACC, terminal growth, tax and the bridge stay at base. A cell
whose margin would exceed the scenario margin ceiling (below) above the base
path is withheld rather than priced.

The terminal transition is disclosed: the explicit years reinvest revenue
growth ÷ sales-to-capital, the Gordon year reinvests terminal growth ÷
terminal ROIC, and where the two disagree FCFF steps at year N + 1 (NVDA:
−9.9%, reinvestment 1.8% → 13.7% of NOPAT). The step is where two
conventions meet, not a forecast, and the terminal-reinvestment assumption row
says so.

Sales-to-capital divides TTM revenue by **operating** invested capital (D-60):
total debt + equity − cash and short-term investments − long-term
investments, whose income is below the EBIT the DCF projects. When removing
them would leave no operating capital the D-58 basis stands and says why.

The **reverse DCF** first searches year-one revenue growth over [−20%, 60%],
widened to base year-one growth + 30pp when that is higher. It retains the
base margins, taxes, sales-to-capital, terminal assumptions and bridge. The
path family is `convergent-shift-to-terminal` (D-58). Year one moves to the
solved rate, and every later year moves by the same amount times its
convergent fade weight, so the shift is gone by year 10. The base path is the
family member at base year-one growth, so implied minus base year-one growth
(the `reverseImpliedVsAchievable` grading signal) compares like with like.
Reports stored before D-58 carry `linear-fade-to-terminal` and are read as
written. A 17-point prescan finds exact roots or sign-change intervals;
multiple branches choose the interval nearest base year-one growth. Bisection stops at 0.01pp interval
width, 80 iterations, or valuation error under 0.05% of price. A non-positive
year-one base FCFF skips that inversion; no growth root also falls back to
solving a terminal EBIT margin in [0%, 60%], with a margin fade over the full
explicit horizon and the base growth path held. Failure to bracket either
quantity reports no solution and explains the range; it does not extrapolate
an answer. See `tests/stageB.valuation.test.ts`,
`tests/stageB.dcfLossTax.test.ts` and `tests/stageB.dcfDisplay.test.ts`.

## Overlays and cash runway

`src/pipeline/stageB/sectorRouting.ts` composes overlays with the base business
route. **Unprofitable** means negative selected net income or negative selected
operating cash flow, with dated annual fallbacks when TTM is unavailable.
For banks, insurers and mortgage REITs, negative OCF alone cannot trigger it:
funding flows are operating cash flows on those balance sheets. The overlay
suppresses the general FCFF DCF; it is a house applicability rule and does not
establish that every future cash flow will be negative.

**Pre-revenue** means selected revenue below USD 10 million. The threshold is
evaluated only on established USD statements; a foreign-currency amount is
not compared with the dollar cutoff. Missing revenue does not imply zero.
**Recent IPO** requires an actual, valid, non-future IPO date within 24 months
of the bundle's analysis date. Fewer than eight quarters alone is incomplete
coverage, not proof of a recent listing. The overlays replace or suppress
inapplicable long-history and valuation sections with disclosed reasons.

Runway uses the newest whole quarterly/annual balance as its liquidity anchor,
cash plus short-term investments (with supported balance-sheet fallbacks), and
up to four usable recent cash-flow quarters. Average quarterly burn is the
negative of mean `(OCF + signed capex)`, using **before-SBC** cash flow.
It does not average only loss-making quarters: positive quarters remain in
the average. Missing component rows are excluded with reasons; a mean at or
above zero is self-funding and has no exhaustion estimate. Runway quarters
equal liquidity / average burn, and exhaustion date is anchored on the
balance date plus `runway × 365.25/4` days. Burn quarters must share an
established currency and liquidity must share that currency before the ratio
can be published. The estimate assumes unchanged burn and no financing, asset
sales or operating response. See `tests/compute.runwayAnchor.test.ts`,
`tests/stageB.sectorRouting.test.ts` and `tests/currency.stageB.test.ts`.

## Projections, scenario targets and intrinsic-value display

`src/pipeline/stageB/projections.ts` displays the first five years of the
general-route DCF's explicit path, with up to four annual historical points.
Revenue, operating margin and FCFF come from the DCF year rows. Forward EPS
(D-60) is operating EBIT less interest expense, held flat, taxed at that year's
DCF rate, divided by diluted shares compounded at the applied share-count
trend. D-65: the interest is the latest quarter's run-rate when a quarter
newer than the latest fiscal year exists — the quarter's interest over its
average debt (opening and closing balances, operating leases excluded) is the
issuer's own effective rate, applied to the closing debt so debt issued during
the quarter is priced for a full year; without both balances, the quarter × 4;
else the latest fiscal year's. NVDA: FY2026 $0.26B predates $25B of notes
issued in Q2 FY2027; Q2's $227M on $20.9B average debt is 4.34% a year, $1.45B
on $33.4B. Interest income, investment gains and other non-operating items are
excluded, so it is operating EPS, not a forecast of GAAP EPS, and the export
tables, the chart and the page-1 forward P/E say "operating EPS" (D-65); the
former median historical net-income/EBIT ratio (NVDA 0.9525) carried low-tax
years and investment gains into every forecast year. A missing positive share
anchor withholds EPS. Fiscal labels advance from the DCF's statement anchor, so
a TTM-anchored path need not start from the last annual fiscal-year label.
Forecast-only tables are headed by the forecast measure ("Free cash flow to the
firm (FCFF)", "Operating EPS (diluted shares)"); the chart, which also plots
history, keeps the two-part labels.

The base EPS holds the share count flat (a positive dilution trend is kept). A
repurchase authorization is discretionary capacity, not a committed schedule;
the capital-return note names the remaining authorization from the latest
earnings release and the annual share change it would fund if spent evenly
over the horizon at the current quote, beside the observed trend (NVDA: $99B,
−0.38%/yr against −0.47%/yr observed). The historical-share-trend EPS remains a
labelled hypothetical that deducts no repurchase cash.

Sample revenue-growth dispersion uses at least three positive, approximately
annual growth intervals (0.7–1.3 elapsed years); sample operating-margin
dispersion uses at least three margin levels. Off-annual revenue pairs are
excluded individually, so surviving intervals can still support a fan.
Growth sigma is capped at 25pp and margin sigma at 12pp. The joint shock is
`dg = sigma_growth` and `dm = sigma_margin × correlation(growth, margin)`
from at least three paired annual observations. Missing correlation leaves
scenario margins at base with disclosure. Neither sigma nor the band is a
fitted confidence interval.

**Shocks mean-revert (D-60).** Each shock is full size in year one and is
multiplied in later years by the base path's convergent fade weight (3-year
half-life, rescaled to zero in year 10), so terminal growth and the terminal
margin equal the base case and only the revenue level the shock built up
persists. NVDA report #34 held +25pp for ten years (revenue to about $7.9T) and
carried a 72.5% margin into perpetuity; growth beyond one or two years is not
persistent (Chan, Karceski and Lakonishok 2003) and profitability
mean-reverts (Fama and French 2000). The perturbation gives the growth and
margin bounds headroom for the shock rather than reapplying the narrower
base-case clamps. **Scenario margins are capped** at gross margin (TTM, else
the latest fiscal year) less the leanest operating-expense ratio among the TTM
and the last five fiscal years, never below the base path: operating margin is
gross margin less operating expenses, so no scenario can earn more than today's
gross margin with the leanest cost base the issuer has run (NVDA: 74.67% −
9.46% = 65.21%). Without gross profit the cap is unavailable and the
construction text says so. D-65: when the cap (or a bound) cuts a requested
shock, the scenario construction carries `effectiveMarginDeltaPp`, and the
construction table, the price-target basis and each scenario's inputs print the
shift that remains beside the one requested (NVDA bull: +10.12pp requested,
0pp after the cap, because the base year-one margin already sits at the
ceiling; bear −10.12pp). The weighted margin then reconciles to the shifts
shown: it sits below the base by a quarter of the bear shift. The decay-and-cap
paragraph is stated once, as that table's note; the price-target basis points
to it.

The versioned `UNBACKTESTED_SCENARIO_PRIOR_2026_07` weighted projection is
25% bull + 50% base + 25% bear, a fixed display prior on the operating
projections only. The orchestrator supplies `capital.fcf.series[].fcf` as the
chart's historical FCF: levered free cash flow **after** the house SBC
deduction where disclosed, unadjusted where SBC is absent, and the series
assumptions say so (D-60); the FCF CAGR row is labelled before SBC because it
runs on the vendor figure. Forward FCF is unlevered FCFF, also after SBC
because SBC is an expense inside the projected EBIT; the seam is disclosed as
a change of leverage basis, not a forecast improvement. Scenario FCF paths can
cross because growth also requires reinvestment.

`src/pipeline/stageB/scenarioTargets.ts` reruns the same DCF and base equity
bridge (including any non-operating assets) for two joint shocks. It labels the
more valuable extreme bull and the less valuable one bear, retaining the deltas
that produced each. Negative correlation can therefore make the bull target's
growth delta negative, although with decaying shocks only a margin dispersion
far above the growth dispersion still inverts the order. The base target reuses
the DCF per-share. Perturbed targets are floored at zero with a warning. A
non-positive base DCF per-share suppresses the entire target block; thin
dispersion, unavailable WACC/bridge and non-DCF routes also suppress it. Sigma
rounding to 0.00pp in either series makes target correlation unavailable and
gives a degenerate-dispersion disclosure. The fan and targets share the
dispersion helper. When targets are available, chart paths use the same
value-ordered labels; weights move with their paths, leaving the base and
weighted projections unchanged. A disclosure identifies reversals where a
lower-growth shock produces the higher valuation.

Both consumers use the same effective-shock rule when either dispersion rounds
to 0.00pp: the margin shock is zero and correlation is unavailable.

**Price targets carry no weight (D-60).** A 25/50/25 weight beside each target
implied a weighted per-share value (NVDA report #34: about $284, above the
quote) that the report never showed and its grade contradicted. New reports set
every scenario's weight to null and the scenario-weight basis says once that
targets carry no weight and that the projection prior is not a calibrated
probability; a stored report that recorded weights still renders them.
Scenario inputs describe the computed shocks and paths; model-authored
assumptions are preserved as qualitative commentary. Sensitivity conclusions
summarize the actual grids against the comparable quote. D-65: both grids
decide — the WACC × terminal-growth grid and the year-one growth × sustained
margin grid (its cells withheld above the margin ceiling are outside its tested
range). "Robust" requires every valid cell of both on one side of the price;
otherwise the conclusion counts the cells at or below the price in each grid and
names the growth × margin cells (NVDA report #34 rerun called the value robust
because every WACC × g cell sat above $217.23 while four growth × margin cells
sat below it). An incomplete WACC grid cannot establish robustness, and no grid
is described as an empirical prediction interval.

Model-derived thesis review conditions disclose a threshold, horizon, source,
fixed assumptions and the consequence of crossing it, and (D-60) each is
observable. The reverse-DCF condition also names the first modeled year's
revenue the price implies, beside the base case, consensus and the guided
run-rate; guidance adds the guided quarter's revenue and GAAP gross-margin low
ends, each citing the registered guidance-table record it reads
(`payload.issuer-filings.<period>-<metric>-guidance-low`, D-65) rather than the
8-K accession, which no registry record carries. The first-year projection
milestones restated the base path and are no longer emitted. Unsupported routes or missing values produce no fabricated
triggers. The same details appear in the app, Markdown and printable report.
See [report evaluation](REPORT-EVALUATION.md) for immutable snapshots and
eligible realized-outcome comparisons.

The payload sets the reverse-DCF implied year-one growth beside the base-case
year one, the guided run-rate, the guided sequential pace, consensus year one
and the latest quarter's year-over-year growth, all over the same TTM revenue,
so "demanding" is a comparison rather than an adjective.

`src/pipeline/stageB/fairValue.ts` resolves the deterministic route value:
FCFF DCF for general companies and excess-return equity value for financial
routes. Equity REITs, pre-revenue and DCF-suppressed routes have no intrinsic
per-share card in this implementation. The published card floors a negative
model value at zero and discloses the raw result; raw valuation arithmetic
can remain negative. Upside uses the published rounded per-share divided by
the comparable positive current price, minus one. Unknown/unmatched price
currency prevents upside. Scenario targets are present-value DCF
sensitivities, not twelve-month analyst forecasts. The horizon label beside
each target is set in code (`SCENARIO_TARGET_HORIZON` in `passes.ts`):
"explicit DCF horizon" when that scenario's computed per-share target is
non-null and "n/a" otherwise (including a null target inside an available
block), on AI and data-only reports alike; the judge does not set it.
`verified: true` on these
computed records means traced to deterministic inputs, not predictive or
independent factual verification.

See `tests/stageB.projections.test.ts`, `tests/stageB.scenarioTargets.test.ts`,
`tests/projection.operatingIncome.test.ts` and `tests/stageB.fairValue.test.ts`.

## Numeric grades and completeness

`src/pipeline/stageB/grading.ts` owns versioned house bands
(`SCORE_BANDS_VERSION`, currently `SCORE_BANDS_2026_10_NVDA_AUDIT`, stamped
when D-61 changed the durability and buyback-timing bands). Each metric is mapped to 0–100 by piecewise-linear
interpolation between the source's named breakpoints and held at endpoint
scores beyond them. A/B/C/D/F thresholds are 85/70/55/40; there is no E.
These bands have not been outcome-backtested.

| Aspect | General weight | Financial weight | Equity-REIT weight | Quantitative evidence |
| --- | ---: | ---: | ---: | --- |
| Fundamentals | 20 | 15 | 15 | Revenue/EPS/FCF growth and operating-margin slope |
| Valuation | 20 | 22 | 25 | DCF upside, reverse-implied growth and own-history ranks; financials use implied-vs-current starting ROE and book ranks; equity REITs use FFO/AFFO rank |
| Quality | 15 | 26 | 15 | ROIC−WACC and applicable forensic models; financials score current ROTE/common ROE − cost of equity in the ROIC−WACC slot (D-41) |
| Balance sheet | 15 | 10 | 15 | Net debt/EBITDA, interest coverage, before-SBC FCF conversion, SBC/FCF (the only scored SBC signal, D-49); banks: tangible common equity/tangible assets, net charge-offs/average loans, NPL ratio, loans/deposits (D-46) |
| Moat | 15 | 15 | 15 | Latest ROIC (0.45), durability as the lowest annual ROIC in the window (0.30, D-61) and gross margin (0.25); financials substitute ROTE level and floor |
| Leadership (capital stewardship) | 10 | 7 | 10 | Repurchase timing, the price actually paid against the same year's average price (0.30, only when the company repurchased; D-61), and net share-count trend (0.25, scored only here, D-49). ROIC − WACC is scored once, under quality (D-61); SBC/revenue is displayed, not scored |
| Technicals | 5 | 5 | 5 | 12-1 month SPY-relative return 0.45, distance below the 52-week high 0.35, SMA50/200 gap 0.20 (D-48); RSI-14, the six-month window and the 52-week range position are displayed, not scored |

The financial vector covers banks, insurers and mortgage REITs. For insurers
and mortgage REITs the numeric balance-sheet aspect is explicitly unscored
(route-inapplicable). Since D-46 a bank's is graded on capital, credit and
funding:

| Bank input | Weight | Band (convention, not fitted) |
| --- | ---: | --- |
| Tangible common equity / tangible assets | 0.40 | 4% → 20, 5% → 35, 6% → 50, 8% → 70, 10% → 85, ≥ 12% → 90. House cut points (convention, not fitted) on a holding-company GAAP ratio that excludes preferred stock and so runs below the regulatory Tier 1 leverage ratio; they echo the PCA leverage line (12 CFR 324.403) in scale only, and a bank below a cut point is not below a regulatory minimum |
| Net charge-offs / average loans | 0.25 | ≤ 0.25% → 85, 0.5% → 70, 1% → 50, 2% → 25, ≥ 3% → 10; the FDIC Quarterly Banking Profile rate definition |
| NPL ratio (nonaccrual / loans) | 0.15 | ≤ 0.25% → 85, 0.5% → 75, 1% → 60, 2% → 40, ≥ 4% → 15 |
| Loans / deposits | 0.20 | ≤ 80% → 80, 90% → 70, 100% → 50, 110% → 30, ≥ 125% → 15; a low ratio is not penalised, because custody and trust banks run low by design |

The aspect is graded only when tangible common equity / tangible assets and at
least one other input are on file; otherwise it is unscored with that reason
and counts as missing evidence in the composite, not as route-inapplicable. A
withheld input (usually the NPL ratio, which the large filers tag only by loan
class) drops out, the remaining weights renormalise, and completeness falls by
its weight. A leverage ratio is not comparable across business models, CET1 is
shown when tagged and never graded, and no supervisory rating is used; the
aspect note says all three. `WEIGHTS_FINANCIAL.balanceSheet` stays 10.
Moat and leadership scores are quantitative proxies, not a finding about the
company's competitive advantage or management competence.

D-61 changed four signals:
- **Moat durability** was the population standard deviation of the ROIC
  series. That read a rising return as instability: NVDA's 23% → 198% scored
  12. It is now the worst year's ROIC (ROTE on financial routes), banded on
  the level band, because a moat is the persistence of returns above the cost
  of capital, not their steadiness.
- **Leadership** no longer re-scores the ROIC − WACC spread that quality
  already scores (same number, same band). Its buyback signal is timing,
  not the appreciation of today's quote over the proxy paid price. A company
  that repurchased nothing has no timing signal, so the share-count trend is
  its whole stewardship score. A company that repurchased without tagged
  execution prices is missing that evidence, and its completeness shows it.
  The score is labelled "Leadership (capital stewardship)". Management
  quality, guidance execution and governance are not inputs; they belong to
  the analyst grade alone.
- **Beneish.** A Beneish flag that the sales-growth index alone carries over
  −1.78 is graded on M with SGI at neutral 1.0 (`beneishMSgiNeutral`).
- **Accruals** use the financial-asset-adjusted construction described under
  "Forensic batteries by route".

An aspect is the weighted mean of available, route-permitted signal scores.
Its `dataCompleteness` is used signal weight / all intended signal weight,
and its `applicableCompleteness` the same over the weight the route does not
suppress (null when the route cannot score the aspect at all);
Piotroski's used weight is additionally scaled by `outOf/9`. Missing data
contributes no score but reduces completeness; zero available evidence yields
a null score. The composite first weights each available aspect by its route
weight times that completeness. Its coverage ceiling excludes wholly
route-inapplicable aspects and signal weight suppressed by route policy.
If `R` is that evidence-weighted mean and `C` is available weight / the
route-applicable ceiling, the published composite is `50 + (R − 50) × C`.
Thus sparse favorable evidence shrinks toward neutral; full route-applicable
coverage leaves the mean unchanged. A null composite is retained when no
aspect has evidence. This score completeness is distinct from the report's
provider/XBRL, citation and consistency coverage measures. Since 2026-10-13
(D-44) the AI payload prints each aspect's completeness as its own row and
record (`<aspect> evidence completeness`, a fraction), not inside the score
row's unit, so a number citing the score record is read as the score.

Altman values are mapped onto the original model's 1.81/2.99 zones before
scoring, so different variants share comparable grade bands. Scoring growth
prefers a genuine 5Y CAGR, then 3Y, then 1Y; a span differing by more than
0.25 years is excluded as that named window. The stricter revenue-acceleration
benchmark has its own ±0.05-year rule. See `tests/stageB.grading.test.ts`.

## Technical indicators

`src/pipeline/stageB/technicals.ts` computes indicators locally from supplied
EOD OHLCV; it does not use FMP indicator endpoints. Invalid dates and unusable
prices are dropped and rows are sorted ascending. Unavailable volume becomes
null and preserves valid price observations; a volume average requires the
entire recent window rather than treating missing volume as zero.

SMA uses 50/200 trading rows. RSI-14 and ATR-14 use Wilder smoothing, seeded
by the simple mean of their first 14 changes/true ranges; a flat RSI is 50.
ATR true range is `max(high−low, |high−prior close|, |low−prior close|)` from
the second bar. EMA is SMA-seeded with multiplier `2/(n+1)`; MACD uses
12/26 EMAs and a nine-observation signal EMA. SMA and MACD crosses ignore
exact-zero spreads and require reversal of the last nonzero sign.

52-week ranges and 1/3/5-year drawdowns use calendar dates rather than a
fixed row count, with seven-day start tolerance. The range requires adequate
calendar coverage, and drawdown discloses incomplete history. Relative
strength is the stock's close-price return minus benchmark return in percentage
points over 3/6/12 calendar months. Endpoints must be shared dates and within
seven days of each series' latest observation; starts are shared dates on or
before the requested cutoff, with seven-day tolerance. Conflicting same-date
closes cannot establish an endpoint. These are price returns, not dividend
total returns. The scored momentum window (D-48) is 12-1 months: on the same
common end, its start is the latest shared date on or before 12 months back
and its end the latest shared date on or before one month back, each within
seven days, so the latest month (which tends to reverse; Jegadeesh 1990,
Lehmann 1990) is skipped. A window that cannot be aligned is withheld with a
`technicals.relativeStrength.<benchmark>.12m1m` gap, never filled from the
6- or 12-month window. Its grade band (−30pp → 15, 0 → 50, +20pp → 75, +40pp
→ 90) is an unfitted monotone mapping, a convention: Jegadeesh and Titman
(1993) give the direction, not the scale of the formation-period return. The
52-week signal is the distance below the 52-week high, (close / high − 1) ×
100, the ratio George and Hwang (2004) rank on, on a convention band (−50% →
15, −30% → 30, −15% → 50, −5% → 70, at the high → 85); the range position is
displayed only (review of D-48, 2026-10-13). Momentum is a 3–12
month tilt that has reversed sharply after market rebounds (Daniel and
Moskowitz 2016), not an entry-timing signal; RSI-14 has no standalone
predictive evidence and is shown for context only (RESEARCH §9.1). The AI
payload prints the 12-1 and 6-month windows as citable technicals rows, the
12-1 row dated at its own window end. Volume trend compares complete 20-row and 90-row averages:
at least 1.2 is rising, at most 0.8 falling, otherwise flat. RSI 70/30, proximity
to highs/lows, recent crossover and drawdown flags are house display rules,
not return forecasts. See `tests/stageB.technicals.test.ts`,
`tests/stageB.range52wHistory.test.ts` and
`tests/charts.relativeStrengthRebase.test.ts`.

## Stage A checks and report verification

`src/pipeline/stageA/validate.ts` checks up to four annual balance-sheet
identities with a 0.5%-of-assets tolerance. Total equity including minority
interest is preferred; otherwise stockholders' equity plus disclosed minority
interest is used. Legitimately negative equity is retained. Missing identity
inputs are skipped with reasons, not passed.

Revenue/net-income FMP↔XBRL checks cover the latest annual and quarterly
periods at a 0.5% tolerance, using the applicable tag chains and filed currency.
EDGAR-reconstructed rows are marked as the same source and skipped for that
cross-check: comparing a number to the facts that produced it is not independent
verification. A total consolidated-income fallback versus vendor common-income
figure carries a basis caution. Staleness checks separately consider filing
cadence, stale statement-cache envelopes, quote as-of dates (seven days),
and the last institutional quarter whose 45-day deadline passed. ADR cadence
allows a half-year reporting interval instead of assuming domestic 10-Qs.
Fixture staleness markers denote synthetic mode and do not count as cache-TTL
failures. Implausible zero interest expense/SG&A values are recorded as
undisclosed. Validation describes gaps and cautions; it does not certify every
input or force the whole report to stop on every failed check.
See `tests/stageA.validate.test.ts`, `tests/report.completenessXbrl.test.ts`
and `tests/stageA.manifest.test.ts`.

`src/pipeline/stageC/payload.ts` builds numeric and citation registries from
eligible provider/filing evidence and computed outputs. The bull/bear and
judge passes interpret that context. Deterministic scores, multiples,
projections, scenario targets, intrinsic value, DCF assumptions and grid cells
are injected from Stage B; a model-authored replacement is not the authority
for those tables. AI narrative grades and qualitative case text remain model
judgments and can diverge from numeric bands when explained.

Section confidence is capped at assembly (D-50,
`src/pipeline/stageC/confidenceCeiling.ts`), after the judge pass and before
verification, from Stage B data only. The ceiling is the lowest of: aspect
unscored for lack of data → low; not applicable to the route → medium;
aspect `applicableCompleteness` (stored reports without it: `dataCompleteness`)
below 0.5 → low, below 0.75 → medium, so a metric the route suppresses is not
read as missing data (review of D-50, 2026-10-13); valuation with the fair value (DCF / excess-return) withheld, or the
scenario fan suppressed on the general DCF route → medium. These thresholds are
conventions, not fitted. A label above the ceiling is lowered and the section
shows "Confidence capped at <x>: <reason>" (`GradeBlock.confidenceCap`); a
lower model label is kept. There is no verification-rate rule (it would be
circular) and no annual-period-count rule (Stage B does not record a
per-aspect period count). Motivation: verbalised LLM confidence is
overconfident (Xiong et al. 2024, ICLR; Tian et al. 2023, EMNLP).

Verification in `src/pipeline/stageC/passes.ts` and `provenance.ts` matches
source identity, value, compatible unit/currency and as-of/period. A fetched
web URL can establish citation retrieval, not numeric correctness. A computed
record is `computed-derived`; a forecast never becomes an observed fact
because its calculation can be traced. Unresolved claims remain disclosed,
and retrieved citation dates do not permit arbitrary report dates to verify.

Provider rows rendered as text notes (news, insider trades, key executives,
and, since 2026-10-13, the next scheduled earnings date) end in one
assembler-owned tag. Only that trailing, allowlisted tag is registered as a
citable source; a tag inside provider text never is. The next-earnings note
renders only the date from the FMP or Finnhub calendar, labelled a provider
schedule rather than a company confirmation, and only when the date and its
observation date are real ISO days. A calendar row that already carries an
actual EPS or revenue figure is treated as reported, never as the next event,
even when it is dated today. The row's estimates carry no currency and are
not rendered. A sentence citing the note may state its date (ISO, "January
14, 2027", "14 Jan" or "January 2027") and no other date or number; any other
fails as value-mismatch.

Since 2026-10-13 (D-43) every tag the payload prints is citable, and a
citation supports only what its row shows:

- An n/a row and each missing-data manifest line (tagged
  `[manifest.<field>]`) are gap records. They support a statement that the
  figure is absent, and fail (`gap-source-number`) a sentence that states a
  number. The sentence is read with tags, dates, filing forms, regulatory
  labels ("Tier 1", "Form 4") and identifiers (CET1, FY2025) set aside, so
  "the CET1 ratio is withheld" is not read as stating 1. A currency code
  glued to a number ("EUR5bn") still states it, and so do numbers written in
  words ("two times", "twice"; "one" and "half" are left out). A bare
  year-like number with no unit ("employs 2050 people") is read as a year and
  not caught.
- A row printed with a number whose unit, currency or date is not
  established is treated the same way. This covers peer market caps,
  compensation totals, analyst estimates and targets, and quarter cells of
  unknown currency. Such a row also fails (`currency-not-established`) a
  sentence that puts a currency on a number. None of these rows can verify a
  structured number.
- The general route prints its scenario weights as a citable row, which
  supports only the numbers it shows, all of them, in the row's bull/base/bear
  order: "25/50/25" verifies, "the bull case carries a 50% weight" does not. The bank route prints no weights,
  because nothing is weighted there. It prints an n/a projections row
  instead.

A claim naming a person that cites a key-executive, executive-compensation or
insider-trade row passes only when the cited rows, at the claim's as-of, list
that person and any title the claim states:

- The name must be spelled as the row spells it. The first and last names
  must match, with no nickname and no initial the row lacks.
- The title must be one whole role of the row, keeping its modifiers and
  scope. "CEO" does not match "Co-CEO, Commercial & Investment Bank". A title
  is read after the name ("as", ", the", "(", "is", "was", "serves as",
  "remains", "became", "has been") or as a role written just before it
  ("CFO James Dimon").
- Every name in such a claim must be the rows'. Besides the known names and
  role patterns, the claim is read for capitalized word runs, split at
  function, title and document words and at the person rows' title words;
  organisations, initials and one word opening the sentence (unless a verb
  such as "received" follows it, as in "Sandberg received …") are skipped. So
  "Sheryl Sandberg is CEO" citing JPM's compensation rows fails, and a
  capitalized word that is not a name fails closed. A first name alone is not
  read as a person.

This reads the rows' identity content only. Verbs and comparisons in the
sentence ("pay rose") are not checked.

Units (D-44, 2026-10-13). Every numeric payload row prints a bare unit the
model can copy; RSI, the MACD histogram and the MSPR rows print "index", the
registry's dimensionless bucket (for the MACD histogram, a difference of price
averages, that is the bucket and not its true dimension). The verifier reads
the indicator spellings "RSI", "RSI index", "rsi" and "MACD histogram" as
index, but only on that indicator's own record: the report prints the unit
beside the number, so "RSI" on the MACD record fails as unit-mismatch.

Numbers cited to a filing or transcript excerpt (D-45, 2026-10-13) are read
against that excerpt's text — the exact excerpt the number cites (source and
as-of), without the truncation marker — in
`src/pipeline/stageC/excerptNumbers.ts`. Such a number verifies, logged as
`excerpt-match`, only when all of these hold:

- Its unit is "%", "currency", "count" or "shares", and the excerpt prints it
  that way: a percent with "%"/"percent"; money with "$", read as the
  issuer's reporting currency only when its statement records establish one
  dollar currency; a count with neither, as a whole number or a scaled
  figure ("3.60 billion"), never a bare decimal cell. A comma-grouped whole-number cell
  takes the scale of an "(in millions" header above it when the table is a
  money table; a decimal cell never does, and no "$" cell does under an
  "except per share" header. Per-share and every other unit fail.
- The value is what the text prints, at the printed precision: "$915
  billion" supports 915e9, not 915.3e9.
- The printed figure is specific: three significant digits, or two with a
  decimal or a scale word. "7%", "20%" and a bare Change-column "4" are
  `text-ambiguous`.
- More than half of the distinctive words of the number's own description
  appear beside it. The description is its unit text beyond the bare unit
  ("% Standardized CET1 ratio"), the label of the metric row it sits in, and
  the name of the named row it sits in (a segment, a peer, a macro series).
  "Beside it" means within 250 characters and inside its sentence or bullet,
  or, for a table cell, in that row's own label. A number with no
  description words fails (`text-context-mismatch`).

The period is not compared with the column a figure was printed in, and two
figures that share the description's words in one sentence ("Standardized
and Advanced CET1 ratios were 14.6% and 14.1%") cannot be told apart. The
log note on every match says the period is not machine-checked. News rows,
string figures and insider notes carry no text to read and stay
`text-source`.

`src/pipeline/stageC/consistency.ts` separately checks locally identifiable
direction words against signed changes, year phrases against cited record
years, unit words against record families, and sourcing of named individuals.
The period-word check compares years only; it does not adjudicate fiscal
quarters. A number that cannot be located confidently in its sentence is
unchecked, not guessed. Coverage and checked counts accompany the results,
so these checks are not a comprehensive proof that the narrative is true.

`src/pipeline/stageC/dataOnlyReport.ts` preserves available deterministic
sections and missing reasons when AI is unavailable or a pass fails. The
report's execution metadata distinguishes requested mode and actual outcome;
data-only does not mean a complete provider bundle. Historical stored reports
retain their original computation and version stamps; changing this document
does not recompute them. See `tests/stageC.deterministicInjection.test.ts`,
`tests/stageC.provenance.test.ts`, `tests/stageC.verifyChecks.test.ts`,
`tests/degradation.report.test.ts` and `tests/report.executionMetadata.test.ts`.

## Disclaimer scope

New reports carry this text verbatim; historical reports retain the disclaimer
saved when they were generated:

> Informational only — not investment advice. This report contains A-F letter
> grades and scenario price targets; both are model outputs derived from the
> data and assumptions disclosed here, and neither is a recommendation to buy,
> sell, or hold any security.

The disclaimer names the report's output families. Seven aspects have
deterministic numeric scores and A–F bands when applicable evidence supports
them; AI reports additionally carry model-authored qualitative grades. Data-only
reports do not invent narrative assessments, and unsupported aspects can remain
unscored. Bull, base and bear scenario price targets are deterministic model
outputs only when the DCF and dispersion evidence support them; otherwise the
target block is suppressed with reasons. Neither kind of grade is a
recommendation. The report contains no
buy, sell or hold recommendation, no allocation directive, and no price target
authored by a person.

Renderers print the disclaimer stored on the report as written, so a report
generated under an earlier version keeps the text that was in force when it was
produced.
## META report audit improvements (October 2026)

Fresh reports distinguish business quality, price attractiveness and evidence availability. Score bands, scenario display weights and forensic thresholds remain unbacktested house rules. They are not calibrated probabilities of returns or accounting misstatement. The score audit records each signal's measured dates, raw value, transformation, effective weight, missingness and contribution. Correlated signals are grouped into factor families so overlapping ROIC evidence is visible.

Capital metrics use complete compatible TTM flows and a matching balance sheet when available, with an explicit annual fallback. Annual history remains available. Cash bridges distinguish operating cash flow minus cash capital expenditure, lease-principal-adjusted FCF, an explicitly supplied issuer definition, and after-SBC economic adjustments. Historical levered FCF and forecast unlevered FCFF are different measures. Debt, liquidity, lease liabilities, enterprise value, equity and diluted shares are reconciled separately.

Forward and reverse DCF use the same growth-path family. Rolling forecasts retain exact start/end dates; a June TTM anchor is not a December fiscal-year estimate. Bull/base/bear labels share one scenario identity across intrinsic values and projection paths. Since D-60 scenario shocks decay to the base path by year 10 and scenario margins stay below gross margin less the leanest operating-expense ratio on record (the decaying shock is the main construction, so no alternative is listed). EPS uses flat shares because an authorization is not a committed schedule; the authorization-funded share change is stated and an unfunded historical-share-trend sensitivity is labeled hypothetical.

Filing context uses bounded section-aware passages and discloses omitted categories. Numeric factual prose is checked against metric, unit, date and retained source evidence. A typed record's metric is its registry label, with time words ("latest", "quarter end") and common abbreviations (FCF, SBC, capex) normalized; a named window must be the record's own, a bare "trailing" means twelve months, and an exact date names a window record's endpoint. Citation presence is reported separately from supported numeric claims, contradictions and unchecked content, and the headline states how many unchecked claims carry no figure to check. Qualitative claims are not established as true by numeric matching. Executive execution or guidance credibility is assessed only from a FACT in that executive's evidence that names them and whose figure the verifier matched to its cited record; otherwise it is not assessed (D-59). A reported-earnings reconciliation for an FMP quarter without SEC start dates is bounded by the issuer's preceding fiscal quarter in the same statement. Company-confirmed earnings dates take precedence over vendor estimates; enrichment preserves conflicting SEC/vendor observations instead of silently choosing one.

### Grade and reproducibility safeguards

Section grades are anchored to the deterministic A/B/C/D/F band. A different
letter requires a structured reason, admitted reasoning citations and at most
one band of distance; D to F is one step. Conflicting section/strip letters,
excessive changes and unsupported overrides remain raw audit proposals with
withheld headlines. Citation admission and numeric contradiction checks do not
establish the entire reasoning as true. Accepted overrides still obey the
independent evidence floor. Saved-report views apply this validation without
rewriting their stored bytes or original analyst-generation metadata.

TTM diluted EPS preserves the sum of four eligible quarterly observations.
P/E explanations identify this convention when used. Share-count changes and
period-specific dilution can make that sum differ from full-period EPS; the
calculation does not reconstruct missing numerator, instrument or split data.
See the [EPS definition and fixtures](audit/2026-10-17-ttm-eps-convention.md).

Production input snapshots include local build custody only when the retained
compiled artifacts and build identity can be verified. A current checkout is
not proof of which build ran. Missing identity is not retrospectively filled
with present code, and a lock hash does not attest installed dependencies.
See the [implementation disposition](audit/2026-10-17-book-to-code-disposition.md)
and [verification record](audit/2026-10-17-safeguard-verification.md) for the
bounded scope, evidence and remaining analytical work.

### Common-cash payout admission

Aggregate cash dividends do not establish the common distribution when preferred
claims existed during the payment window. APIC-inclusive preferred balances are
existence evidence even when their currency differs; subtraction still requires
compatible currency and flow periods. Direct common cash, including an explicit
zero, remains usable. Compatible total cash less preferred cash is admitted only
when both outflows have consistent signs and preferred does not exceed total.
Uncontested aggregate zero remains zero; an explicit source refusal remains
unknown through serialization and payout estimation, including when aggregate
cash is zero. Fewer than two usable annual payout observations withhold the
excess-return valuation rather than infer a payout. This can reduce available
valuations while preserving separately supported TCE and earnings/returns.

Cash payments are not preferred earnings allocations. No entitlement, arrears,
accretion or participating-security bridge is invented. See the
[source evidence and regression record](audit/2026-10-17-preferred-payout-admission.md).

### Common-earnings admission

An admitted common numerator retains its sign, including zero/losses. Otherwise,
known preferred claims require an earnings-allocation bridge; preferred cash
does not supply that bridge. Annual and rolling-quarter joins retain actual
field intervals, currency and ownership. Known incompatible, duplicated,
overlapping or gapped intervals cannot become a complete TTM merely because
their display dates look contiguous. Missing vendor starts remain unknown.

Disclosed consolidated NCI allocations retain their sign and compatible scope; a known
nonzero allocation with unknown ownership cannot be assumed already deducted
or subtracted a second time. The existing filed-Basic common-stockholder
numerator convention remains admitted and labeled: participating-security
allocations can make it differ from issuer common-equity income. TCE and that
house return convention are not redefined. Missing evidence and the retained
annual zero-closing-NCI inference are documented limits. See the
[admission tests, conventions and remaining limits](audit/2026-10-18-common-earnings-admission.md).

### Reported fiscal commitment payment evidence

The existing commitment disclosure can retain optional issuer-reported fiscal
payment buckets, exact source-table tokens, scale/currency, supplying exhibit
and row/category reconciliation. Coverage describes only the supplying table.
Missing timing, unexplained dashes and ambiguous cells remain unknown; only
complete source-bound category buckets enter the numeric model context. Raw
evidence and independently supported totals remain distinct from that admission.

Fiscal labels do not establish exact calendar maturity dates. A table Total is
a check, not another obligation. This disclosure adds nothing to net debt or
DCF deductions and does not assess obligor liquidity, covenant compliance,
funding capacity or solvency. The bounded text parser can withhold legitimate
unit-like category labels rather than guess their meaning. See the
[source, admission policy and limits](audit/2026-10-18-commitment-payment-evidence.md).

### Offline outcome evaluation

`npm run research:evaluate -- frozen-evaluation.json [report.json]` consumes the versioned `research-evaluation-v1` contract without provider, model or database calls. Inputs require immutable snapshot identity, information availability dates, a point-in-time universe including delisting coverage, exact forecast periods, currency/share basis, and frozen baselines. Outcome labels are separate first-reported filing values or benchmark-relative total returns including distributions and delistings. Future restatements, unavailable training labels, mismatched periods and current-constituent-only cohorts fail closed.

The runner reports model and paired-baseline MAE, RMSE and bias; interval coverage and width; Brier scores and reliability only for explicitly defined binary events; missingness cohorts, frozen factor ablations, comparable-version grade stability, factual adjudication and order sensitivity. Chronological holdouts use labels known before each cutoff. Seeded issuer-cluster bootstrap intervals require at least five issuers. Sample counts and insufficient-evidence states are explicit. Synthetic fixtures validate the machinery; prospective forecasts with no realized outcome stay pending. Neither constitutes historical investment validation, and evaluation never retunes production weights.

### IREN source-scope conventions (October 19, 2026)

A generic cash-PPE tag is not a complete cash-investment total when the primary filing explicitly excludes a separately disclosed hardware payment. The reviewed IREN FY26 adapter admits only disjoint, same-issuer, same-period, consolidated USD cash PPE and hardware components, retaining primary-document identity, namespace, scale and source provenance. The result excludes all other investing flows. Either operating-cash-flow alias can supply FCF when valid; populated aliases must agree with each other and with a compatible directly filed CFO operand. Contradictory aliases and dependent FCF are withheld, without comparing cumulative CFO with a quarter. A corrected or refused capex basis recomputes or invalidates existing FCF and aliases, and a refused recent-quarter investment scope withholds burn-based runway rather than substituting older quarters. Cross-filing quarter reconstruction remains withheld until component-definition and filing-lineage continuity are proved. Direct-quarter evidence is resolved by actual interval before filing priority, so later cumulative observations cannot mask it. Multiple eligible intervals without an explicit row start and conflicting latest observations for one interval are refused; newer exact-period refusals and currency conflicts cannot fall back to older favorable values.

Noncurrent convertible carrying debt is completeness evidence for noncurrent financing debt. It is not automatically added to a generic aggregate that may already include it. Where no long-term-debt aggregate is tagged, it composes the noncurrent financing debt itself (see the instrument-class rule below). A lease-only or otherwise insufficient partition is withheld. Historical EV separately requires exact-date, class-compatible outstanding shares and a compatible split basis; weighted-average EPS shares and post-period cover counts never establish historical capitalization. A balance-date count can be reported in a later filing once that filing is available by the acquisition cutoff; the prospective effective interval used for current capitalization does not govern this historical observation. Missing convertible debt alone is an isolated sensitivity, not a corrected EV.

Broad disclosed SIC 6199 remains statutory source evidence, with an unresolved economic sector/methodology rather than an automatic Credit Services or Technology assignment. When both sector and industry remain unresolved on a general route, Beneish and accrual exclusions and the reduced Piotroski battery retain their numerical withholding, but all qualifications, labels and manifest reasons describe unresolved operating-method eligibility rather than an established financial company. The live company panel also labels that reduced Piotroski result as eligibility unresolved and displays its evaluable-signal denominator. Direct reported EPS is preserved. A derived basic EPS requires an established common-earnings numerator and complete compatible weighted-share lineage, and its provenance uses currency per share. Annual and earlier-quarter diluted weighted shares alone do not establish quarter-specific diluted EPS or antidilution treatment. Dated class observations do not establish complete economic class coverage or aligned measurement dates. Segment-member continuity and geographic allocation bases remain explicit admission requirements.

Primary sources: [IREN FY2026 10-K](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), F-10 and pages 122–123; [March 2026 10-Q](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000026/iren-20260331.htm), balance sheet and convertible note. Exact issuer, period, scope and refusal examples are retained in the source-admission unit fixtures. These conventions are versioned as report spec 1.31.0, payload 1.36.0 and Stage B accounting evidence 13; historical stored outputs are not rewritten.

### Independent audit fixes (October 20, 2026)

**Financing debt from instrument-class tags.** Some filers tag no long-term-debt aggregate (`LongTermDebtNoncurrent`, `LongTermDebtAndCapitalLeaseObligations`, `LongTermDebt`). REITs tag their unsecured notes and term loans as `NotesPayable` and `LoansPayable`. Some issuers tag their only debt as a convertible note, and some tag all debt as `DebtLongtermAndShorttermCombinedAmount`. For such a filer, the keyless build used to publish total debt as leases and commercial paper alone. When every aggregate misses, noncurrent financing debt now comes from the filer's own classes:
- the combined debt amount, when tagged;
- otherwise, the sum of one figure per class (notes, loans, secured debt, convertible notes and long-term revolver). Each class takes its inclusive total first. Otherwise it takes its noncurrent variant plus the current variant that the noncurrent tag excludes (`ConvertibleDebtCurrent` beside `ConvertibleDebtNoncurrent`, for example). Notes falling due within a year therefore stay in debt, and no class is counted twice.

The row discloses the substitution. These class figures can include current debt, or the same obligation under two classes, so the figure is withheld, never doubled, in five cases. A current-debt figure of zero holds nothing that could be counted twice, so it never triggers the first three:
- the combined amount sits beside a separately resolved current-debt figure;
- a current-variant class figure sits beside any resolved current-debt figure;
- an inclusive class total sits beside a current-maturities line;
- both a generic notes total and a convertible-notes total are tagged;
- two class figures lie within 2% of each other. Secured debt classifies by collateral, so it can hold the same notes or loans another class holds. Across SEC filers' FY2025 facts, every multi-class pair this close was one obligation tagged twice (Sun Communities' `LoansPayable` 2,429.0m beside `SecuredDebt` 2,472.2m, for example). REIT mortgages beside unsecured notes sit far apart and still compose. A secured class that holds only part of another class cannot be seen from the tags; the debt plausibility check below catches understatement, not that overlap.

A withheld noncurrent figure withholds total and net debt. A composed figure that holds current debt (an inclusive class total or a class's current variant) is right as part of total debt but is not noncurrent debt. The forensic tests that read long-term debt alone (Piotroski ΔLEVER, Beneish LVGI) therefore treat it as missing, with a `forensics.longTermDebt` info gap: ΔLEVER is not evaluated and LVGI takes Beneish's neutral 1.0.

**Debt plausibility.** Tag lists cannot cover extension tags, so Stage B also tests resolved debt against the interest it carried. Resolved debt here is current debt, noncurrent debt and finance leases, or the published total for rows without components. Finance leases are not added again when long-term debt was tagged with them (`LongTermDebtAndCapitalLeaseObligations`). The year's interest expense is divided by the most debt resolved at any balance date of that year; an annual row also counts the quarterly balances inside its year, so a borrowing repaid between year-ends still explains its interest. Above 25%, the components cannot be the debt that carried the interest, so total, net and long-term debt are withheld with a manifest gap, and every leverage, EV, WACC and forensic leverage consumer sees the gap. That includes the report's derived historical EV for that date. Quarters are judged on the smaller of their trailing four quarters and the latest fiscal year, so one unusual quarter cannot trigger the check. A reported interest expense of zero is read as undisclosed (the zero-vs-undisclosed policy), so it never stands in as the smaller basis. Interest rows join balance rows within ±5 days of fiscal-date drift, as statement joins elsewhere do. The check does not run in three cases:
- interest below 0.25% of total assets;
- resolved debt of zero, whose interest can come from tax positions, deposits or deferred compensation;
- the bank, insurer and mortgage-REIT routes, where interest expense funds deposits and float.

**A missing operating-lease maturity.** Some filers tag only one maturity of
their operating-lease liability: Freeport-McMoRan tags the noncurrent portion
and reports the current one inside accrued liabilities. That alone used to
withhold total debt, which removed WACC, the DCF, EV multiples and the Balance
Sheet aspect. The tagged portion is now kept, disclosed as one maturity, and
included in total debt. Its provenance names the one maturity, so the existing
lease-scope rule admits the row only on the lease-excluded basis. That basis
requires same-filing current and noncurrent financing components that reconcile
to the total with the disclosed portion. A complete finance-lease liability may
sit in that total too, when it comes from the same filing and reconciles with
the rest; it stays in debt on the excluded basis. The lease-inclusive basis stays
unavailable. On that excluded basis:
- the DCF measures invested capital without the operating portion;
- net debt/EBITDA states net debt without it, since EBITDA is already after
  operating-lease cost.

Each basis note says so. A missing finance-lease maturity still withholds total
and net debt, because finance leases are debt in every frame (audit FCX-1).
An aspect whose signals apply to the route but whose inputs were withheld or
missing reads "applicable signals unavailable (data gap…)", not a route
choice (audit FCX-14).

**Withheld debt leaves no leverage figure.** Once a total-debt figure is
withheld, the Balance Sheet aspect scores without net debt/EBITDA and
renormalises over its remaining signals; it does not fall back to an older
balance. EV and the EV multiples are withheld with it. The report's Key data box
then shows EV/EBITDA as "withheld" whenever the current EV lacks net debt,
whichever stage withheld the debt, rather than omitting the row as if the
input were merely absent (audit O-3).

**Zero and immaterial outside ownership.** A filer that deconsolidates its last
partly owned subsidiary may stop tagging parent equity and minority interest.
It then keeps only the total including NCI, and Métis used to read that as
unknown outside ownership, which withheld every EV multiple. The builder now
infers zero NCI when the filing shows it (see "EV bridge"). Parent-common P/FCF
and its history are withheld for outside ownership only when the known NCI
balance or the NCI share of earnings exceeds 1% of consolidated equity. Below
that, NCI cannot move the multiple (audit SNOW-2). A stake bought out before
the balance date leaves a zero balance but still earned its share of the cash
flow, so earnings above the floor still withhold P/FCF. A non-zero NCI balance
with no NCI earnings figure also withholds it: an ending balance cannot bound
the period's earnings.

**A grade needs corroborating evidence.** No surface shows an aspect's letter
when its score rests on less than half of its intended signal weight (D-67).
It also shows none when the score rests on one signal carrying only part of
that weight, such as an insurer's own-history P/B rank without the ROE
reverse-solve signal. The label is "Not assessed — limited evidence (score N/100
on one signal, X% of signals)". The score and the composite are unchanged,
since the composite already weights each aspect by its evidence. A route that
designs a single signal and observes it in full, such as the REIT P/FFO rank, is
not affected. A P/TBV rank that falls back to P/B is labelled a P/B rank
(audit PGR-4).

### AMZN audit fixes (October 20, 2026)

**Rate limits on the inputs the valuation depends on.** FMP answers a burst of
requests with HTTP 429. The client then pauses every live request for that key:
for as long as the vendor's `Retry-After` says, or 15 minutes when the vendor
names no pause. The AMZN run of October 20 lost its analyst consensus and the
vendor balance sheet this way, and nothing asked again. Seven requests now wait
out the pause once: analyst estimates and the annual and quarterly income
statement, balance sheet and cash flow. Each waits for the vendor's stated
pause, or for one rate window (60 seconds) when the vendor named none, and then
asks again. No request waits more than 90 seconds in total, and a pause longer
than that is not waited for. A request still refused keeps its rate-limit gap,
which then says how long it waited. One more warning entry, `fmp.rateLimit`,
names every such member and says the valuation is degraded. When the refused
member is the analyst estimates, the DCF's `valuation.dcf.analystGrowth` record
becomes a warning that names the rate limit as the cause, instead of the
informational "no usable analyst revenue estimates", and the DCF notes carry a
"Valuation degraded" line. The report is still published. Statements still come from
the keyless SEC substitutes, which carry their own entries.
