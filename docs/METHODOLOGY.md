# Valuation methodology

What Metis computes, from which inputs, under which conventions, and where a
convention is this project's own choice rather than a standard.

The current source declares report 1.52.0 / payload 1.54.0 and Stage B
STAGE_B_2026_10_ACCOUNTING_EVIDENCE_33 (2026-10-30, D-137). Its bounded evidence fixes
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
hold. Under unresolved model eligibility, Altman Z, Beneish M and the accrual
ratios are withheld and Piotroski is reported on its eligibility-unresolved
scale; the reasons name unresolved eligibility, not an established financial
classification. The exclusion is not evidence of financial health.
REIT historical P/AFFO comparisons separately require compatible AFFO
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
  `PAYEMS` is read as the change from the prior month (FRED `units=chg`) and
  labelled so; `PCE`, `PCEND` and `PCEDG` are seasonally adjusted annual rates;
  `APU000072610` is the U.S. city-average electricity price per kilowatt-hour.
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

A failed annual revenue cross-check with unreconciled definitions withholds
annual revenue from growth and margin series, scenario dispersion and projection
history, revenue-based forensic inputs and growth-dependent valuation. The
forensic and projection gaps name that refusal; raw source observations remain.
This mask does not change quarterly revenue, independent financial-route metrics,
capital allocation or returns calculations. Runs without a failed FY revenue
check retain their existing inputs.

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
The AI context's statement blocks apply the same rule before they take their
periods (audit 2026-10-27 AI-505, D-124): one column per fiscal period, the
provably latest row (by acceptance time, or by filing date where none is
given), the figure Stage B uses; a period served twice with no provable order
is left out. When such a period falls inside the block's window (five annual or
four quarterly columns), the block says so, and it does the same for a period
it collapsed. A row whose date is not a real day keeps its 'unknown' column,
which no claim can cite.

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
multiples, the financial-route P/TBV pairing and its premium to justified P/TBV,
market-cap reverse valuations, market-value capital weights and
upside calculations. An equity-only intrinsic figure that does not require
the quote can remain in statement currency; FCFF valuation also depends on
the WACC's market-value weights. Same-currency checks do not independently
resolve ADR ordinary-share/receipt ratios: established share basis remains a
separate prerequisite.

A minor-unit quote code (`GBp`, `GBX`, `GBx` pence; `ZAc`, `ZAC` cents;
`ILA`, `ILa` agorot) is never treated as its major currency in a price
comparison, technical-price label or admitted peer multiple. The raw code
and unit explain the refusal; no price or market cap is rescaled because the
provider's market-cap unit for that listing is unproven. Unknown-currency
technical levels cannot become verified monetary indicators. Lowercase ISO
codes such as `gbp` still mean GBP. B3's preliminary same-market discovery
size heuristic is unchanged; discovery does not establish peer comparability.

**B6 publication compatibility.** For a levered issuer whose `GBp` quote was
previously case-folded to the same GBP as its statements, WACC retains the
previous market-cap weighting and DCF, with an explicit unproven-unit warning.
This narrow exception avoids newly blocking an existing report. It does not
admit a previously refused currency pair, infer a cap conversion, or replace
WACC with cost of equity. The market-cap unit for that retained weighting
remains unresolved; price comparisons are still withheld.

**Provider rows without a currency (D-57).** FMP's analyst-estimate,
price-target, executive-compensation and stock-peer rows carry no currency
field. `src/pipeline/estimateCurrency.ts` gives each row its own
`reportedCurrency`/`currency` when it has one. Otherwise an estimate, target or
compensation row inherits the issuer's currency (a stock-peer row never does,
see below), but only when three things agree:

- the reporting currency the statements establish (the model currency);
- the listing currency on the profile;
- the issuer is not an ADR.

An ADR's provider rows may be per receipt in the listing currency or per
ordinary share in the reporting currency, so inheritance is withheld. It is
also withheld when the reporting and listing currencies differ, or when either
is unknown. An inherited figure is rendered "(USD, inherited)" in the AI
payload, its registry record carries `currencyBasis: "inherited"`, and the
`valuation.analystEstimates.currency` manifest entry says the estimates were
inherited. Stock-peer market caps do not inherit (AI-301, D-124, revising
D-57 for peers): FMP documents its peers as same-exchange, but its own answers
list foreign exchanges (a NASDAQ subject's list holds `.T`, `.TW`, `.HK` and
`.SS` symbols), so the premise cannot establish a currency. A peer cap is money
only in a currency the run holds for that peer: its own provider row's
`currency`/`reportedCurrency`, else the listing currency of a profile the peer
collection read for that symbol (admitted or excluded; `PeerCollection.
listingCurrencies`). A raw code is taken as stated, never uppercased: only three
uppercase letters count, so a minor-unit code such as `GBp` (pence), `ZAc` or `ILa`
establishes nothing (an LSE cap served in pence would otherwise be registered 100
times too large). Otherwise it is rendered "(currency unknown)", is not
registered, and no citation of it verifies as money; the prompt's peer-table
rule leaves that peer's metrics empty. On an entry-tier key most peer profiles
are refused, so U.S. peer caps will often read "(currency unknown)": an honest
unknown is preferred to a cap in the wrong currency. All estimate rows must resolve to
the model currency to enter the consensus growth method and the year-one
revenue anchor. A row in another currency is excluded, as is a row whose
currency stays unknown, and no FX conversion is attempted. D-57 replaces
D-28's own-row-only rule, which discarded USD consensus, peer sizes and
executive pay for a USD issuer (NVDA report #34); for peer caps the own-row
rule of D-28 is restored.

**Insider statistics (AI-117, D-125).** FMP's insider statistics are
calendar-quarter rows. Its `totalPurchases` and `totalSales` are counts of
open-market transactions (Form 4 codes P and S), not shares; the acquired and
disposed share volumes are separate fields that cover every reported
acquisition or disposition, awards, option exercises, gifts and tax
withholding included (SEC, "Ownership Form Codes"). The payload sums the
trailing four complete calendar quarters before the quarter that contains the
fetch day and states the window in every label ("four calendar quarters ended
2026-06-30"), in the record's `period` (the window end) and in its
`periodContext` (`duration`, with `basis: "rolling-12-month"` when four quarters
are summed). The end date is named because FMP may serve no row for the newest
complete quarter. Five figures are registered: open-market purchase and sale
transaction counts (unit `count`), shares acquired and shares disposed (unit
`shares`), and the acquired/disposed transaction-count ratio (acquired
transactions over disposed transactions, all codes). The quarter in progress is
left out of the sums (its Form 4 rows are still listed one by one). A missing
quarter ends the window, so fewer than four quarters are labelled as what they
are, a repeated quarter keeps its first row, and a sum with a missing value is
withheld. With no complete quarter there is no statistics figure and a note
says which quarter is in progress. Covered by `tests/stageC.insiderStatistics.test.ts`.

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
| Risk-free rate | **FRED `DGS10`** (latest finite observation; keyed API, then `fredgraph.csv`), else FMP treasury rates (`year10`), else the last good cached `DGS10` observation if it is at most 10 business days old, else the U.S. Treasury daily par yield curve 10 Yr | The source and the observation date are both stated. D-60: DGS10 comes first so the current WACC and every per-year WACC share one series; the other three are fallbacks, and any of them is disclosed as a substitution. With every source down the WACC is withheld. |
| Equity risk premium | FMP market-risk-premium `totalEquityRiskPremium` for the issuer's domicile, with country-code/name alias matching; an absent or conflicting domicile row falls back to the unambiguous US row with disclosure, then the dated **Damodaran US** implied-ERP fallback if the selected input is missing or implausible | Conflicting distinct premiums for one country are not chosen by array order. The static fallback is 4.18%, dated 2026-07-01 in `returns.ts`; it requires a valid analysis date, cannot post-date that analysis, and expires after 210 days. A value outside [3%, 25%] falls back. This domicile rule is a house assumption, not an estimate of geographic revenue exposure. D-60: the vendor row carries no vintage, so its date is printed as the acquisition date with "vintage not published by the vendor", beside the dated Damodaran reference. |
| Beta | Provider profile beta, **mean-reversion adjusted** (0.667·raw + 0.333 — the Bloomberg 2/3–1/3 weighting of Blume's finding, not his fitted 0.371 + 0.635·β; see [RESEARCH §7.1](RESEARCH.md)), clamped to [0.6, 2.0] | Raw beta outside (0, 4] is unusable and the WACC fails closed rather than inventing market exposure. One set of constants serves the WACC and the keyless beta estimate, so a report prints one adjusted beta. D-60: a vendor beta publishes no window or fit, so the basis also prints the same 60-month OLS the keyless route uses, run on the bundle's own daily prices against SPY (completed months before the analysis day): observation count, window, price basis, slope, R² and standard error. The WACC keeps the beta it used; no bottom-up beta is built without an industry data source. |
| Cost of equity | rf + beta × ERP | Clamped to [rf + 2.5%, 25%]. |
| Cost of debt | `effective` (interest expense ÷ average debt), `historical` (the issuer's last year that still disclosed interest), or `synthetic` (rf + rating spread from interest coverage, Damodaran's January 2026 table) | The method actually used is named. An effective rate outside [rf − 1, rf + 19] is rejected in favour of the synthetic rating. Debt below 2% of assets is treated as noise, and the note says whether a synthetic rating then ran. Interest expense and the EBIT it is scored against come from **one** statement basis — the trailing twelve months when both are available, else the latest annual statement for both legs — and the basis is named; a mixed pair is the last resort and is labelled as such. |
| Tax rate | Select the first ratios-TTM row, or the first annual-ratios row when no TTM row exists; use its effective-rate field, otherwise TTM tax expense ÷ pre-tax income. Audit 2026-10-22 B-32: with no vendor rate, a TTM pre-tax loss gets a **0% shield**; with no complete TTM tax pair, the **latest annual** tax expense ÷ pre-tax income is used, or a 0% shield when that year's pre-tax income is not positive | A present TTM row lacking tax does not cause a second lookup in annual ratios. Clamped to [0%, 35%], and a clamp is disclosed. Where it came from is named, and an annual or 0% fallback is also an info entry (`returns.wacc.effectiveTaxRate.basis`). With neither a TTM nor an annual pair the levered WACC is still withheld. On the EDGAR path, a filer that tags only domestic and foreign pre-tax income has them summed into pre-tax income, with the composition disclosed; the derived EBIT reads the same pre-tax evidence. No universal statutory rate is assumed. |
| Weights | Market value of equity (market capitalisation) and book debt as a market-value proxy: total debt **less the operating-lease liability** where the balance sheet discloses it (the EV bridge's lease rule, below), D-60: the weight uses the latest balance sheet (the balance the EV bridge nets); the effective cost of debt still divides a year of interest by the average of the two quarter-ends of the trailing-twelve-month window when the interest figure is TTM, else of the latest two fiscal-year ends | Stated as E% / D%, with the balance dates and the lease basis named. When the statements' currency differs from the quote currency (the ADR case) the weights are suppressed rather than silently mixed. On the financial routes, which value on the cost of equity alone, the WACC and the cost of debt are not computed at all (audit 2026-10-22 B-31, below). |

**Retained ADR limitation (FIN-307).** The levered WACC retains its existing
capitalization when ADR scope alone is unproven, with an explicit
`returns.wacc.adrMarketEquityScope` warning that its equity weight is unverified.
Refusing this previously used cap would newly block the DCF; that part of the
scope correction is deferred. Currency mismatches and established class-scope
refusals keep their existing guards. Debt-free WACC still equals cost of equity.

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

**No WACC on a route valued at the cost of equity (audit 2026-10-22 B-31).**
The bank, insurer and mortgage-REIT routes value equity at the cost of equity
(the excess-return and price-to-book models), so nothing on them uses a WACC.
Their interest expense is also mostly the cost of deposits, policy reserves and
repo, and over the debt the WACC divides by it is not a borrowing cost: BAC
printed a 22.7% pre-tax cost of debt (all $74.09B of interest expense over
$326.64B of long-term debt; its long-term-debt rate is 3.88%) and a 13.5% WACC
above its own 9.8% cost of equity. On those routes the cost of equity is
computed as above, and the WACC, the cost of debt, the E/D weights and the
synthetic rating are withheld, with an info entry in the manifest saying the
route values equity at the cost of equity. No surface shows them: the Returns
table has no WACC or cost-of-debt row and its cost-of-equity row says why, the
LLM payload lists neither, and the company page shows "not used" for them
and for the weights and tax rate of its WACC build. This holds even when the
cost of equity itself lacks an input. No per-fiscal-year WACC history is
computed on those routes; the excess-return evidence compares each year's
return with the current cost of equity, as it did before.

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
temporary equity (redeemable preferred and redeemable non-controlling
interests) plus stockholders' equity less cash and short-term investments, and
the operating lease adjustment described below. An unavailable observed tax rate withholds
that year's NOPAT/ROIC; non-positive invested capital is not interpreted as
an exceptional return. This historical NOPAT is separate from the forward
DCF's projected loss-carryforward logic.

When short-term investments are genuinely unreported, returns can instead net
cash alone and disclose that narrower invested-capital basis. Conflicting
combined cash/component values do not qualify for this fallback; they withhold
the affected invested capital and return. A year withheld because a debt or
capital input was refused (a total debt the admission refused, a lease
conflict or lease-scope refusal, a negative total debt, or conflicting cash
components, or a temporary-equity operand the admission refused or whose total
contradicts its parts) is listed in one `returns.roic` manifest entry that
gives each year's refusal. It is critical only when the latest fiscal year's ROIC is
withheld by the same balance's debt refusal that withholds the WACC (the
balance the WACC names, refused for its debt rather than its cash), and a
warning otherwise, including a latest year withheld while the WACC exists
(audit 2026-10-29, KNW-03; review fix I-1). A year withheld for a refused
temporary-equity operand is a warning, never critical, since the WACC does not read it.
Where a balance date's temporary-equity enrichment was withheld (the SEC
fill-in was refused or unavailable, so the claim is unknown rather than
absent), the year keeps its invested capital without the claim and the ROIC
notes say a redeemable claim at that date could not be established (audit
2026-10-27 FIN-119-V1).

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
net debt/EBITDA where the route permits them. Capex/D&A is shown for the latest
year and as the mean of up to five years; the label states how many years the
mean covers (`capexToDAAvgYears`, the count of finite ratios averaged, so "5y"
only at five). Conversion requires positive
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
  year's average price (Dittmar & Field 2015). The report labels it "year-average
  cost vs cost paid; negative = paid above average", because "price paid vs the
  year's average" read the sign backwards (AMZN audit 2026-10-20 finding 15).
- **Recency.** Timing is graded only when a priced year falls within the
  issuer's last three fiscal years, counted back by date from the latest
  annual cash-flow row, so a missing year cannot stretch the window. Older timing is named as stale in the
  capital notes and left ungraded; with no repurchase at all in those three
  years the signal is absent, as for an issuer that never repurchased (finding 15).
- **Exclusions.** A year whose paid price is more than 1.6× away from its
  average price is excluded as a basis or tagging mismatch. Timing is
  withheld below 50% coverage of repurchase dollars.
- **Missing side (D-68).** The year's average price is the market cap over
  the fiscal window ÷ basic weighted shares. A year is priced only when the
  market-cap history starts no more than seven days after the window opens;
  a partial window is unpriced, like an empty window. Left-out years and their
  reasons are named even when the remaining timing coverage clears 50%.
  When timing is not measured,
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
   consensus at or above the twelve-month floor the guidance implies: the
   guided quarter's low end plus the other three quarters at their year-ago
   level, reduced at the low-end year-over-year pace if it is negative.
   Both compared quarters are on a 13-week basis. Each fiscal-year
   estimate is spread over its days and weighted by its overlap with the
   window. The spread follows the issuer's own seasonal shape when its last
   complete fiscal year has four reported quarters in the model currency
   ending on that year end, each of the last three 84-98 days after the one
   before: each quarter's share of
   the year goes to its three months, and each month's share to its days.
   Otherwise the spread is even, and the anchor basis says why (AMZN audit
   2026-10-20 finding 19; an even spread overstated a seasonal year one).
   For a 52/53-week issuer, at least three newest filed year ends, chained
   364 or 371 days apart, must establish exactly one rule: the last named
   weekday of a month, or the named weekday nearest its last day. Provider
   estimate dates within ten days of that rule's end are snapped to it;
   each year starts after the preceding snapped end. When the preceding
   estimate is absent or not contiguous, an admitted year end uses the rule's
   preceding year end to establish its start, including December rules that
   spill into January; it does not substitute a 365/366-day anniversary.
   Without an applicable rule, the existing anniversary fallback remains.
   An ambiguous or broken
   weekday calendar keeps provider dates and discloses that the boundaries
   are approximate by up to a week. Calendar month ends stay as provided.
   The estimates must cover at least 97% of the window. D-65: the
   fiscal year the window starts in contributes its consensus **less the
   revenue already reported** in it (the quarters after the latest annual
   statement through the TTM end, consecutive 13/14-week quarters in the model
   currency), spread over its unreported days; a consensus at or below what
   is already reported is stale and leaves the window uncovered. NVDA FY2027:
   $409.80B − $177.84B reported for H1 = $231.96B for 2026-07-27..2027-01-31,
   where an even share gave $205.5B. The next fiscal year's share is still an
   even spread, which for a fast grower overstates its early quarters
   (disclosed in D-65; no within-year shape is assumed). Consensus covers the
   window's four quarters; guidance covers one, and an issuer that reports
   above its own range each quarter makes this guidance-implied floor a lower
   bound rather than a central case. A consensus below that floor predates or
   contradicts the outlook and is not used for year one. The same breadth and
   agreement gates as later years apply (below).
2. **Management guidance** for the next fiscal quarter
   (`DcfAssumptionInputs.guidance`, from the 8-K earnings release). The guided
   quarter, on a 13-week basis, is divided by its **growth-adjusted seasonal
   factor**, multiplied by four and carried 4.5 months at its year-over-year
   pace. For each of up to three years, the same quarter's share of its own
   trailing year is divided by the share constant growth would give it:
   `s = (quarter / TTM) / (rho^3 / (1 + rho + rho^2 + rho^3))`, where
   `rho = (TTM / prior TTM)^(1/4)`. Every quarter is on a 13-week basis;
   the factor is the mean of those yearly factors. Below eight contiguous
   quarters ending at the year-ago quarter, the fallback is the base revenue
   carried twelve months at the guided year-over-year pace.
   The compared quarter must end 350–380 days before the guided quarter and
   250–300 days before the base period, in the model currency. Without it,
   guidance sets no revenue level or floor. The sequential pace is retained
   only as evidence; it carries the season. This applies to annual bases too.
   Guidance must end 80–100 days after the base and be published after it.
   The issuing release's raw qualifiers travel with the guidance. A quantified
   ex-item year-over-year effect is stated in the anchor basis, but never
   adjusts a revenue level or changes the selected anchor source. Its filtered
   caveat accompanies the growth row when that row is present. The effect
   disclosure does not itself assert that guidance was admitted or selected.
   The new guidance evidence fields are omitted when there is no stated guide;
   unguided anchors retain their preceding evidence contract.
   A guided fourth quarter uses the established fiscal-year rule when its end
   is 84–105 days after the reported base. Other weekly quarters are dated
   base plus 91 days, even when the base happens to be a month end. In a
   53-week fiscal year, that assumed 13-week length is disclosed because the
   release does not establish which quarter holds the extra week.
   A guided operating margin, if
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

Filed quarter lengths put each quarter on a **13-week basis** before its
year-over-year comparison or annualisation: an exact w-week quarter is
multiplied by 13/w. Calendar quarters of 90–92 days read as 13 weeks; other
lengths that are not exact multiples of seven stay unscaled. An unknown
length stays unscaled and is disclosed as "length not established; read as
13 weeks". A filed start takes precedence; otherwise only an adjacent preceding
quarter (the existing 70–135-day quarter-end window) establishes the next day's
start. A missing quarter leaves the length unknown, rather than treating the
whole gap as one quarter. Annual fallback periods separately use the preceding
annual end when a filed start is absent. The run-rate basis names every scaled
quarter. A **53-week DCF base period** (371 days) is put on a 52-week basis
(× 52/53): revenue, operating income, gross profit, pretax income, tax and any
tagged one-off are scaled together, preserving the base margins. The start
revenue basis says so.
Margin and tax ratios are evaluated from the filed amounts (including the
filed tagged one-off): the common 52/53 factor cancels, and evaluating the
ratios before scaling preserves their existing precision and scenario shocks.
Sales-to-capital retains the filed revenue numerator; this annualisation
changes the DCF starting flows, not the observed capital-efficiency ratio.

**A broken-input guard bounds year-one revenue relative to the run-rate.** Its
range is [−10%, +25%], widened (D-60) to the guided year-over-year pace and
the latest quarter's year-over-year growth, never the sequential pace. It catches a
mis-scaled estimate without overruling the issuer's own reported trajectory.
Without a run-rate it is measured against the TTM. When it binds, the anchor
row prints both values.
The independent quarterly-versus-annual comparability guard also reads the
quarter's range on a 13-week basis before multiplying it by four. Its refusal
rule is otherwise unchanged: an entirely non-overlapping range withholds the
quarterly extrapolation; it does not substitute annual guidance for NTM.

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

On NVDA's 2026-10-15 illustrative inputs, consensus exceeds the guidance-implied
floor ($353.96B with the year-ago quarter; no floor without it), so it
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
TTM, else the five-year median. The TTM (or annual) margin leaves out tagged
one-off items inside operating income, gains and charges alike (see "AMZN
audit fixes (October 20, 2026)"). It fades to a target over 5 years and is held
flat thereafter. The target is the five-year median under a stable regime. Under a
dated declining regime (a slope below −0.5pp per year) it is the lower of median
and current. Under a dated improving regime (a slope above +0.5pp per year) it is
the higher of median and current, raised toward a bounded target: half the
dated slope carried over the five fade years, but never past the scenario
margin ceiling (today's gross margin less the leanest operating-expense ratio
on record). With no gross margin on record the improving target stays at the
higher of median and current. When the target was raised, the margin basis
states the value with the margin held flat (see "AMZN audit fixes (October 20,
2026)").

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
flows, so it is not counted twice. The bridge reads the balance sheet dated at
the statement date, also when the DCF base falls back to the fiscal year while a
newer quarterly balance exists, and also when the trailing window ends before a
newer annual anchor (audit 2026-10-27 FIN-103). The market EV keeps its own
anchor: the newest balance row, or the newest whole one when the newest lacks
total debt, parent equity or cash and short-term investments.
At the statement date the order follows the DCF's basis: a fiscal-year base takes
the fiscal-year row first and then the quarter row, a trailing-twelve-month base
the quarter row first and then the fiscal-year row (at a fiscal-year end they are
the same instant). The first row at the statement date that carries all three operands, and that the
ownership gate (see "EV bridge"), the parser's refusals, a lease conflict, a lease-scope
refusal (on the run's own lease switch) and a refused temporary-equity operand do not withhold,
is the bridge row, so the DCF never raises on the chosen row a refusal the anchor did not have. Otherwise the bridge keeps the market EV's anchor, which is the row and the
figure the DCF had before this rule, for one of four causes, each stated in the
info gap `valuation.dcf.bridgeBalanceDate` and in the valuation-date basis, which
then names the balance used, how many days it falls after or before the statement
date, and whether the flows between the two dates are in both that balance and the
first window or in neither, instead of "stays at the statement-date balance":
no balance sheet is filed at the statement date; the one filed lacks an operand
(the gap names it); the one filed is withheld, so the bridge keeps the anchor and
its figure; or the anchor itself is withheld, so the bridge keeps it and the DCF
stays withheld, because another date's balance never cures a refusal on the
newest one. A quote more than `MAX_ROLL_FORWARD_DAYS` =
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
held inside [0.5, 5], except that the lower bound yields to a lower ratio the
issuer's own filings establish (audit 2026-10-22 A-2, below). Both are broken-input guards in the sense of
[RESEARCH §7.5](RESEARCH.md), not views on what a company can earn: they exist
so that a mis-scaled statement cannot print a confident number.

EBIT itself is the issuer's operating income: the filed line where the filer
reports one, otherwise a derivation from pre-tax income that adds back interest
expense and removes the non-operating results the filing discloses. It is never
pre-tax income plus interest on its own. That sum reintroduces every
non-operating item the derivation removed, and where the derivation is refused
outright — a bank, where interest is an operating cost — EBIT is withheld and
named in the missing-data manifest rather than published under a second name.
Interest the taxonomy nests inside the non-operating aggregate the filer
tagged is not added back (audit 2026-10-22 B-39, below).

The derivation's pre-tax operand is the same evidence as the pre-tax field: the
filed total, else the B-32 domestic + foreign composition (audit 2026-10-27
FIN-507-V1, D-134), and the disclosure says when the composition was taken as
the full total. The interest operand is not required beside a filed
`NonoperatingIncomeExpense` aggregate. An interest element that is filed but
unusable on the row (another currency, another period) is likewise skipped
beside the aggregate and the disclosure says so, with no mismatch withholding
left beside the published value; without the aggregate the part's own mismatch
reason is the withholding. Where the derivation is refused, the
operand it lacks is named in the `operatingIncome` withholding, and `ebit` is
withheld with it, so a missing operand is never a silent gap.

What the derivation removes is the aggregate, else its components the filer
tags (`InvestmentIncomeInterest` and `OtherNonoperatingIncomeExpense`), plus
equity-method results; each subtracted item is named in the disclosure with its
amount (audit 2026-10-27 FIN-509, D-134). A component is never subtracted
beside a filed aggregate, which already holds it, and when the aggregate is not
filed the disclosure says so and lists the components taken instead. An
adjustment the filer files for the period in another currency or for another
period than the row is never a withholding beside the published figure (B13
final review M-3): beside the aggregate a component is named as already inside
it, and an item that would be subtracted is not subtracted and is named in the
error band with why, so the figure is computed as it would be without that
item, plus that disclosure. When that item is the `NonoperatingIncomeExpense`
aggregate itself, it is not used: the components the filer tags stand in for
it, as where no aggregate is filed, and the disclosure says why, so the figure
can differ from the one published before this batch. Johnson &
Johnson's quarter ended 2026-09-27 files pretax income of 34 million,
`InterestExpenseNonoperating` of 217, `InvestmentIncomeInterest` of 186 and
`OtherNonoperatingIncomeExpense` of -5,780 (litigation charges and reversals),
and no aggregate or operating income: its EBIT is 5,845 million, not 65. The
"other" element is by definition the line beside separately tagged interest
(Regulation S-X Rule 5-03, caption 7(d), and the interest of caption 8 are
separate captions; XBRL US rule DQC_0181 gives interest its own element under
the aggregate). In the planner's offline scan of the 50 retained filers, every
filer that files an operating income, pretax income, the "other" element and
interest ties out with the "other" line excluding interest. A filer can still
tag an interest-inclusive total under it (NNN 2025; eBay's 2014 10-K), and
companyfacts carries no calculation linkbase to tell. So when the "other" line
is subtracted and an interest expense was added back, the disclosure states the
net interest added back (interest expense less any investment income
subtracted) as the amount by which EBIT is overstated if the "other" line
already holds that interest.

A bank-routed filer's `interestIncome` is its operating total: the resolver
tries `InterestIncomeOperating`, `InterestAndDividendIncomeOperating`,
`InvestmentIncomeInterestAndDividend` and `InvestmentIncomeInterest` in that
order (audit 2026-10-27 FIN-510-V1), because at a bank the investment-income
element is only the securities interest inside the total. A non-bank keeps the
investment-income elements first. The mortgage-REIT spread reads the statement
`interestIncome` only as a fallback when no operating tag is filed, so its value
does not change for a filer that tags an operating total.

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

When FRED and the provider both have no value (audit 2026-10-22 B-4), the
current WACC takes the newest `DGS10` observation still in the local cache,
provided it is at most 10 business days before the analysis date (weekdays
counted; holidays are not removed, so the count can only overstate the age).
Failing that, it reads the 10 Yr column of the U.S. Treasury's daily par yield
curve file for the current year, the rate FRED's `DGS10` republishes. Only in
January, when the current year's file can still be missing, empty or without a
row, is the previous year's file read; at any other time its last rate would be
months old. The WACC line prints which of the two it
was (`FRED DGS10 last cached observation` or `U.S. Treasury par yield curve
10 Yr`) and its observation date, and the missing-data list carries a
`riskFree.substitution` entry naming the source and why. If neither answers,
a `riskFree.fallback` gap names both reasons and the WACC is withheld. FRED
answering HTTP 200 with an HTML maintenance or outage page (a body opening with
`<`, whatever the content type says) is treated as an outage: it is retried with
backoff, then the keyed path tries `fredgraph.csv`, and the gap names an HTML
page rather than an unknown series.

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
aspect note states the definition. The graded value is the current-capital
ratio: the trailing twelve months when complete, current, currency-compatible
quarterly windows exist, else the annual window (D-60). The capital
section's fiscal-year row is labelled "latest fiscal year". On the trailing-
twelve-month basis it is not the graded value and is not called graded; on the
annual basis the current-capital section names the graded annual window and
says the fiscal-year row covers the same window only when its fiscal year ends
on that window's end date, rather than calling that row not graded (audit
2026-10-27 AI-511, D-124). Price to free cash flow uses the **before**
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
or flat (within ±1%), annualised over the span actually available. The total change is
measured over up to five fiscal years; its payload label names the span measured ("(3y total)" for
three years, one decimal for a span that is not a whole number of years), and a shorter or irregular
window is stated in the capital notes with its start and end dates. A five-year span keeps the "(5y total)"
label and adds no note.

Per-share values use the weighted-average diluted count from the newer of the
latest quarterly and latest annual income statement; when only the annual count
is available, the report says the figure may lag recent buybacks or issuance.
A loss period's count is replaced as "Share basis (D-65)" describes.

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
per share, the reverse DCF, the REIT block's market cap (P/FFO, P/AFFO) and its FFO and AFFO per share, the share-count
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
   + redeemable preferred and redeemable non-controlling interests (temporary equity)
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
value = EV − net debt − minority interest − preferred equity (each including its redeemable part, below) + non-operating
marketable equity securities (D-60, when identified) + the long-term
investments sales-to-capital removed as non-operating (D-65) − the estimated tax
on those investments (see "AMZN audit fixes (October 20, 2026)") − filed
asset-retirement, environmental, pension and OPEB, loss-contingency and
contingent-consideration obligations, each after tax at the marginal rate (audit
2026-10-22 E-7 and audit 2026-10-27 FIN-305, below). Minority interest
enters the market EV at its book carrying amount, not a market or earnings-share
value. The market EV uses the balance anchor (the newest balance sheet that carries
total debt, parent equity and cash and short-term investments), and the DCF's
bridge the one dated at the DCF statement date (see "Valuation date (D-65)"). The
two can differ even on a trailing-twelve-month base: a 10-K filed before its
quarter reaches the quarterly feed makes the annual row the newer anchor, while
the window still ends at the last quarter, and the bridge reads that quarter.

**Redeemable preferred and redeemable NCI (temporary equity; audit 2026-10-27
FIN-119).** Preferred stock and non-controlling interests that the holder can
force the issuer to redeem are carried in temporary (mezzanine) equity, outside
every equity field above, and their carrying amount is the redemption claim
(ASC 480-10-S99). They are claims senior to common, so the house definition of
"claims senior to common" has two parts. Preferred is permanent preferred plus
temporary equity attributable to the parent (`TemporaryEquityCarryingAmountAttributableToParent`). A balance whose positive `PreferredStockValue`
equals that parent part (within max(1, 1e-6 x amount), the same date) is one mezzanine series tagged
twice. The temporary-equity reader (`temporaryEquityClaims`, behind the bridge, every EV, invested capital, the
guards and the own-history windows) then leaves the parent part out and counts the claim once, as the preferred
line main already deducts (the claim consumers: the bridge, every EV and the ownership guards); invested capital,
sales-to-capital and ROIC add no preferred line, so they read the unreduced temporary equity (`capitalTotal`), counted once, and a
duplicate tag changes no capital figure; every balance row stays as filed, so the financial-route key data, the displayed
statements and the field provenance are unchanged. The info gap `valuation.preferredOverlap` names both tags
once per date; unequal amounts are both deducted (B4b's overlap territory).
Non-controlling interest is book NCI plus redeemable NCI
(`RedeemableNoncontrollingInterestEquityCarryingAmount`). The DCF bridge deducts
the parent part beside preferred, and the redeemable NCI joins book NCI as the
book floor of the larger-of test in the next paragraph, so it is never deducted
twice. A null book NCI beside a filed redeemable NCI is not a zero book: the
per-share value is withheld, as E-5 withholds it, and the reason names the
redeemable amount. A filed total with no parent/NCI split is deducted beside
preferred; if the earnings key would also size the NCI, the per-share value is
withheld (`valuation.dcf.temporaryEquityAllocation`), because the unsplit amount
may be NCI the key already counts. The market EV and the own-history EV add the
same claims. An operand Stage A refuses (a conflict between sources, a
non-finite value, a total that contradicts its parts) withholds what it touches:
the DCF and the EV multiples
(`valuation.multiples.enterpriseValue.temporaryEquity`). It is never zero-filled.
In the own history, a quarter window whose temporary-equity operand is refused drops its EV, and the vendor's
EV/sales and EV/EBITDA history may not stand in for it, exactly as for a lease-scope refusal: the vendor ratios cannot
resolve the disputed claim. The withheld bands carry the warn gap `valuation.multiples.ownHistory.evTemporaryEquity`,
which names the refused operand; windows without a refusal and the equity-based vendor history are unchanged.
On the DCF bridge row the refusal withholds the whole DCF, not only the per-share
value: sales-to-capital (invested capital) cannot be established without the
claim's amount, so the `valuation.dcf.salesToCapital` gap is raised at warn
severity, never critical, and the fair value and scenario targets quote it with
the refused operand and its balance date. The same refused operand withholds
that fiscal year's ROIC, also at warn. These checks run after the existing
critical ones: a row that is missing equity, debt or cash, or whose invested
capital is not positive, keeps its critical gap. The vendor's balance sheet is
not a second route to a double count of redeemable NCI: the SEC enrichment
admits a temporary-equity field only when the vendor's `minorityInterest` equals
SEC's `MinorityInterest` for the same filing, which excludes redeemable NCI, so
a vendor NCI that already included it fails the match and the claim is treated
as unknown (no claim added).
The unsplit rule holds wherever the NCI deduction is decided: any sensitivity
cell, growth/margin cell, reverse-DCF step or scenario path whose deduction is on
the earnings share while an unsplit total is deducted is withheld, and cells on
book publish as before. Each grid, the reverse DCF and the scenario targets say
so in their own note when they withheld a cell or path this way, and one
`valuation.dcf.temporaryEquityAllocation` gap says it once for the run. The same claims reach every guard that asks whether
preferred or NCI exists. The P/FCF cash-ownership guard and the three
own-history common-allocation checks count an admitted claim and a refused one (a
refused operand is a filed claim of unknown amount). In the P/FCF guard alone (which
also tests each retained TTM window), a redeemable NCI is the same claim as book NCI
and takes the same 1% floor: it withholds P/FCF unless the book and redeemable NCI together,
and the NCI income, are each at most 1% of consolidated equity (a null book NCI beside a
redeemable NCI counts as none, so the floor applies to the redeemable NCI alone, with the income
known; with no redeemable NCI a null book NCI is main's test). A redeemable preferred, an unsplit amount or a refused operand
withholds at any size, as permanent preferred does. Forecast operating EPS is
withheld, with the disclosure `projections.eps.ownershipScope`, when the DCF
publishes beside an admitted temporary-equity claim above zero, and also through
the deducted preferred and book NCI fields as for permanent preferred. A
redeemable NCI beside a null book NCI, whose bridge fields stay null, is covered
by the claim itself; at main the null-book case is withheld only when the
period's NCI income is non-zero. When the DCF is withheld (a refused operand on
the bridge row, above), no projection series is built at all, so there is no EPS
series to carry the disclosure.

When an issuer has tagged temporary equity in some period but the SEC enrichment
for a balance date was withheld, the claim at that date is unknown, not absent:
the bridge and the EVs keep their figures and one warn gap
(`valuation.temporaryEquity.unknown`) says the claim may be missing. The gap
reads each consumer's own balance date: the DCF bridge's (the statement-date row)
and the enterprise values' (the anchor row, which can be newer), and names only
the consumer whose date matched. It names no DCF bridge when there is no
published DCF (an equity REIT, a suppressed or withheld DCF), and is not raised on
bank, insurer or mortgage-REIT routes, which have neither. It reads only the
enrichment's own withheld reasons (no vendor CIK, no compatible SEC period, an
unknown vendor permanent-equity scope, operands that do not match). The
SEC-silent refusal ("temporary carrying amounts are absent or explicitly refused
for this SEC period") is excluded: it means the SEC period holds none. A residual
is disclosed in the report itself, in the DCF bridge note and in the EV basis: the
parent caption can also hold redeemable common shares (shares subject to
possible redemption, an ESOP put) that the diluted share count (and the quoted
market cap) may already include; companyfacts do not separate them, so such
shares would be counted both as a claim and in the divisor.

**NCI on the earnings key in the DCF bridge (audit 2026-10-22 E-5).** The DCF
values consolidated free cash flow, so its enterprise value includes the outside
holders' share of partly owned subsidiaries. Book NCI can understate that claim
by a wide margin: FCX's outside holders earned 35.8% of trailing consolidated
profit (1,645 of 4,590 million to 2026-06-30), and on that share their claim on
the about $44.3B consolidated equity value is about $15.9B, against $12.11B at
book. Deducting book published $22.31 a share, about 13% above common holders'
claim. The bridge now works out consolidated equity value (EV − net debt −
preferred equity + non-operating assets). It then works out NCI's share of
trailing four-quarter consolidated profit: profit attributable to noncontrolling
interests ÷ the filed ProfitLoss (else net income on a consolidated basis, else
net income known to be the parent's plus NCI income; a net income of unknown
ownership sizes nothing). When the trailing four quarters cannot size it, the
latest fiscal year does, the same fallback the DCF's own income uses, and the
disclosure then says "fiscal-year consolidated profit". A zero NCI income sizes
the key only when a filing reports it, and a trailing sum with a quarter that
reports zero without a filed fact cannot size it (the vendor feed can report an
omitted figure as 0). The key applies whenever book NCI is nonzero or NCI income
is positive: a zero book balance does not negate the claim the income shows.
When NCI income is nonzero (a profit or a loss) but book NCI is unavailable,
neither deduction can be set, so the per-share value is withheld. Book NCI here
includes redeemable NCI (above), so the larger-of test floors at book plus the
redeemable amount.

When that share is above 10% (`NCI_EARNINGS_KEY_MATERIALITY_PCT`, a house
convention) and above book NCI ÷ consolidated equity value, NCI is deducted at
that share of consolidated equity value. Otherwise it is deducted at book. So
when the share is above 10%, the deduction is the larger of the two.

This rule is an owner decision. It replaces the audit's "NCI book ÷ total book
equity" wording, which would have kept FCX at book (its book ratio is 37.6%,
above the 35.8% profit share). FCX now values at about $19.70.

The sensitivity grid, the growth × margin grid, the reverse DCF and the scenario
paths apply the same rule to their own consolidated equity value. The bridge
table shows the amount deducted with its basis and, when the earnings share is
used, the book figure beside it. The DCF notes name the basis that was not used.

When a noncontrolling interest is on the balance sheet but its share of trailing
profit cannot be established, the DCF per-share value is withheld with a
`valuation.dcf.noncontrollingEarningsKey` warning. That covers four cases, in
both the trailing window and the fiscal year: no NCI income (a zero counts only when a
filing reports it, in every quarter of the window or in the fiscal year: the
vendor feed can report an omitted figure as 0), no consolidated
profit, consolidated profit that is not positive, or NCI income above
consolidated profit (the parent's own share negative, so the share is no claim
on value). When an earlier gate (diluted shares, net debt) already withheld the
per-share value, that reason leads and the NCI warning only joins the manifest.
Book NCI alone is not presented as the outside holders' claim. The market EV and
the EV multiples still use book NCI.

**Debt-like obligations in the DCF bridge (audit 2026-10-22 E-7, extended by
audit 2026-10-27 FIN-305, D-135).** A mine, a power plant or a well must be retired, and a
polluted site cleaned up. The filed liabilities for those costs are claims on
the enterprise, but the FCFF path projects operating cash flow and capital
spending only, so it never pays them. FCX's companyfacts carry a $3.84B
asset-retirement obligation and $2.02B of environmental accruals at 2025-12-31,
and the bridge had no line for either. Audit 2026-10-27 FIN-305 added three more
families of recognised liabilities that the FCFF path never pays (below).
The bridge subtracts them when the
issuer tags them: `AssetRetirementObligation`,
else `AssetRetirementObligationsNoncurrent` plus `AssetRetirementObligationCurrent`;
`AccrualForEnvironmentalLossContingencies`, else
`AccruedEnvironmentalLossContingenciesNoncurrent` plus
`AccruedEnvironmentalLossContingenciesCurrent`. The undiscounted
`AccrualForEnvironmentalLossContingenciesGross` is not the recognised liability
and is not read. Only facts filed by the run date count. When none of the
obligations is tagged, nothing changes. This is an owner decision.

Three families join them (audit 2026-10-27 FIN-305, an owner decision delegated
to research, decisions spec 4.3). **Pension and OPEB deficits** are the filer's
broadest recognised liability family at the date, never summed across families,
in this order: (a) `PensionAndOtherPostretirementAndPostemploymentBenefitPlansLiabilities`
(`Noncurrent` plus `Current`), (b)
`PensionAndOtherPostretirementDefinedBenefitPlansLiabilities` (`Noncurrent` plus
`Current`), (c) `DefinedBenefitPensionPlanLiabilities` plus
`OtherPostretirementDefinedBenefitPlanLiabilities`, each noncurrent plus current.
Postemployment benefits (ASC 712) count only when family (a) includes them, and
are never read on their own. The look-back is date first: the bridge date, then
each earlier balance within E-7's look-back, newest first, and at each date the
families are tried in the order (a), (b), (c); the first date at which any family
is filed gives the reading. A family filed as zero never blocks a positive family
at the same date (as for E-7's own readings); a filed zero ends the look-back only
when no family is positive at that date. Overfunded plans are not credited: a surplus is not equity value
one-for-one (a US employer reversion pays a 20% excise tax, 50% unless a
replacement plan or benefit increase applies, IRC 4980), and practitioners
ignore it. **Loss-contingency accruals** are `LossContingencyAccrualAtCarryingValue`,
else `LossContingencyAccrualCarryingValueNoncurrent` plus `...Current`; only the
amount above any same-date environmental accrual, read as the environmental
line reads it (`AccrualForEnvironmentalLossContingencies`, else its noncurrent
plus current parts), is deducted, so an environmental accrual inside the total is
never counted twice. An environmental accrual found only at an earlier date than
the loss accrual is not netted.
**Contingent consideration** is `BusinessCombinationContingentConsiderationLiability`,
else its `Noncurrent` plus `Current` parts. For these two families a current
portion filed alone counts as the whole balance: litigation accruals and earn-outs
are commonly all current, and a current part alone can only understate the claim
(for retirement, environmental and pension readings a current portion alone is
still not the obligation). None of these obligations joins the market EV (nor
did the retirement and environmental ones); the EV basis says so in one sentence
whenever the bridge deducts one, naming only the families it deducted (never the
pension deficit of a rate-regulated utility, which it discloses).

**Rate-regulated utilities.** For a filer whose SIC code (the EDGAR submissions
`sic`) is one of 4911, 4923, 4924, 4931, 4932 or 4941, the pension and OPEB
deficit is disclosed, not deducted: the code is read as a rate-regulated utility (ASC 980), and the offsetting regulatory asset is
reported only in dimensional XBRL, which the SEC companyfacts the bridge reads
does not carry (`valuation.dcf.debtLikeObligations.rateRegulated`, info). These
are exactly the codes the repository's SIC map sends to a regulated electric,
gas or water utility or a diversified utility (`RATE_REGULATED_UTILITY_SIC`,
`src/edgar/sic.ts`). 4922 (pipelines), 4953, 4955 and 4959 (waste) and 4991
(cogeneration) are not among them, because those filers do not recover costs
through rates, and the group-49 fallback (4900, 4950, 4961) does not count. A
filer whose SIC is not established is read as not rate-regulated; when, and only
when, a pension line is then deducted, the info gap
`valuation.dcf.debtLikeObligations.sicUnknown` says so. A filer under one of these codes whose rates do not recover the deficit (a merchant generator under 4911) is overstated by it after tax; the note says so. Its loss contingencies,
earn-outs and E-7 lines are deducted as for any filer. Residual, routed to the
free-data-source batch: net the deficit against the pension regulatory asset
once dimensional XBRL is available.

**A successor registrant (audit 2026-10-27 FIN-403, D-135).** A holding company
that succeeded an operating registrant in a reorganisation (ExxonMobil Holdings
Corp, CIK 2115436, for Exxon Mobil Corporation, CIK 34088) has a companyfacts
payload that begins at the reorganisation, so until its own first annual report
its 10-Qs may tag only some of these families (ExxonMobil Holdings tags its
pension and OPEB deficit, which is deducted, but no asset-retirement obligation),
and the bridge deducted nothing for a family it does not tag.
While the successor holds no 10-K, 20-F or 40-F balance sheet of its own dated on
or before the bridge date, and only when its own filings re-present the
predecessor's periods unchanged in net income and per-share basis (B-36, one
reporting entity), each family it does not tag at all is read from the predecessor by the
same rules (the predecessor supplies only the families the successor leaves
untagged, the 12.518B asset-retirement obligation in the ExxonMobil case; a family
the successor tags, a filed zero or an accrual that nets to nil included, is its
statement and is never replaced), its basis prefixed "predecessor (CIK ..., one reporting entity under
B-36)". The merge is per family: a family both registrants tag is read once, from
the successor, never summed and never taken from the predecessor first; the
settlement assets follow the retirement obligation they offset. The same-date
environmental netting above also runs across the merge: when the loss-contingency total comes from one
registrant and the environmental accrual from the other, the total is reduced by the environmental accrual the
other registrant files for the total's own date (the total, else noncurrent plus current), floored at nil, so
an accrual both filings repeat is deducted once. A date mismatch keeps the existing reading, with its recorded
residual (D-135 OD-4). The predecessor's
non-marketable equity carrying value is cited beside the long-term investments,
under the same no-annual-report and continuity conditions but at the bridge date
only (no look-back), with the predecessor's CIK named in the citation. Once the successor files an annual balance sheet of its own, the
predecessor is no longer read. When a predecessor is present but continuity is not
established, nothing is read from it and the info gap
`valuation.dcf.debtLikeObligations.predecessor` says so.

**After tax (decisions spec 4.3).** Every debt-like line, the two E-7 families
included, is deducted after tax: `net × (1 − rate)`, where `net` is the amount
deducted (an asset-retirement obligation after its settlement-fund offset; the
relief is applied to the amount deducted, never to the offset) and `rate` is the
marginal-rate floor the bridge already uses to tax the investments it adds
(`investmentTax`, D-58 and D-98: 21% for a US domicile, the 26 U.S.C. §11(b)
federal rate with state taxes excluded; 15%, the global minimum, elsewhere). It
is not the filer's deferred-tax asset, which is not tagged per obligation. This
revises E-7's original before-tax convention (D-104) and resolves known issue
B2b-1. For a pension deficit it is the after-tax cost of funding the deficit at
once: the deficit is discounted at a pretax high-quality bond rate (ASC 715), the
contribution is deductible (26 U.S.C. §404), and the fund then earns that rate
untaxed (Feldstein, "Private Pensions as Corporate Debt", NBER 1982, pp. 75-90:
unverified (evidence lost 2026-10-28); FE Training and IB
Interview Questions carry the same convention). A deficit funded later costs more
in present value; the bridge does not model the funding schedule. The relief is
approximate and the notes say so: the rate omits state and local taxes and assumes
the deduction is taken against taxable income in the year the claim is paid (26
U.S.C. §461(h)); a payment that is not deductible (a government fine or penalty,
§162(f)) or that only adds to tax basis (contingent consideration) is credited a
relief it will not earn, or not for years, so that claim is understated by up to
the rate times the amount. If no marginal rate is resolved, a line is deducted at
its full amount and labelled "before tax".

Three house conventions sit beside it; they are project choices, not owner
decisions. First, each obligation is read at the bridge's own balance date,
else at the latest date in the year before it that tags it, and the bridge
names that date: its line reads "(filed, after tax at 21%; balance at 2025-12-31, the
latest filed)" in the bridge table, "(balance at 2025-12-31)" in the scenario
paths' fixed bridge, and the notes add "the latest filed balance, as the
2026-06-30 balance sheet does not tag it". Many filers tag these only in the
10-K: FCX's 10-Qs carry neither, so a rule bound to the quarter's date would
miss them three quarters a year. A balance more than a year older than the
bridge's is not read. An annual report's balance sheet (a date at which an
`Assets` fact was filed on a 10-K, 20-F or 40-F, though later 10-Qs re-file
it as their comparative column) that does not tag an obligation means the
obligation is gone (settled or sold): when the bridge's own balance sheet is
one, no earlier balance is read, and otherwise the look-back stops at the
latest one before the bridge's date. A balance filed as zero (the total, or
the noncurrent part with no current part; for loss contingencies and contingent
consideration a current part alone) also means it is gone. A quarter
that omits it cannot be told apart from one where it was settled, so a
settlement within the year is caught at the next annual report. When the parts of a
retirement, environmental or pension reading are summed, the noncurrent part must be
among them: a current portion alone is not the obligation, and the look-back
continues to the full balance.
Second, assets the issuer tags as legally restricted to settle the retirement obligations
(`AssetRetirementObligationLegallyRestrictedAssetsFairValue`,
`DecommissioningFundInvestments` or `DecommissioningTrustAssetsAmount`, the
first one filed, read at the retirement obligation's date) offset the
retirement obligation, as rating agencies net
nuclear decommissioning trusts. Only the part of the fund beyond the long-term
investments and marketable equity securities the bridge already adds back is
credited, so a trust is never counted twice. That is conservative when those
investments are unrelated to the trust: the fund is then under-credited. The
offset never goes below zero; a surplus fund adds nothing, and when the fund
covers the whole obligation the notes say nothing is deducted. Third, the
obligations are deducted after tax, as above, so the bridge adjusts for the tax
relief a settlement earns. Filers also
charge the retirement obligations' accretion to operating income, so the
projected NOPAT already bears their time value, and deducting the obligation
counts that time value twice. The bridge adjusts for the tax and states the
accretion, which it does not adjust for.

The deduction sits inside the non-operating total, so the sensitivity grid,
the growth × margin grid, the reverse DCF, the scenario paths and the E-5 NCI
key all use the same bridge. The bridge table prints each line as "Less
asset-retirement obligations (filed, after tax at 21%)", "Less environmental
remediation accruals (filed, after tax at 21%)", "Less pension and other
postretirement benefit deficits (filed, after tax at 21%)", "Less loss-contingency
accruals (filed, after tax at 21%)" or "Less business-combination contingent
consideration (filed, after tax at 21%)", and the DCF notes give the tags,
the filed amount, the amount after tax and the filing. The scenario paths' fixed
bridge keeps the words "after tax" on each line. When net debt itself does not bridge, no obligation is
deducted.

**Key-data dividend yield.** The yield is computed only when the dividend's
currency and the quote's are one known currency; otherwise the row reads
"withheld" with the reason. The quote must carry its own currency evidence;
the model-currency fallback used for a price label cannot establish that
comparison. The existing quarterly dividend × 4 annualisation is unchanged;
payment-frequency handling remains B9's.

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
of operating capital is never left out of value too; a holding that meets or exceeds
invested capital is added back all the same (sales-to-capital takes the house cap,
FIN-304). Where the companyfacts
carry the issuer's non-marketable carrying value
(`EquitySecuritiesWithoutReadilyDeterminableFairValueAmount`: cost less
impairment, adjusted for observable price changes) it is cited beside the line
(NVDA: $51.16B, of which $47.90B non-marketable equity). No fair-value estimate
or marketability discount is applied, but since the AMZN audit of October 20,
2026 the bridge subtracts an estimated tax on the investments it adds (below).
Equity stakes a filing places inside other assets are counted when the filing
tags them with a non-current investment element (below). Those tagged only with
a dimension the companyfacts omit (NVDA's $4.96B long-term portion of locked-up
public equity, 10-Q Note 5) stay in operating capital and outside the bridge.

**Share basis (D-65).** Per-share values divide by the latest weighted-average
diluted count, which carries option and RSU dilution (except a loss period's, below); the bridge table also
prints the shares outstanding the quote implies (market cap ÷ price) and says
which one divides.

*Loss periods (FIN-404).* A period with a loss from continuing operations files
a diluted count equal to its basic count, because every potential share is
antidilutive (ASC 260-10-45-17..20); that count is right for the period's EPS
and carries no award dilution as a divisor. When the divisor row is such a
period (`diluted <= basic + 1`, both counts positive, and continuing-operations
income, else net income, below zero), the divisor is that row's basic count plus
the award dilution of the newest profitable period among the four latest
quarters and the latest fiscal year that shows one; the note names the donor as
a quarter or a fiscal year with its date. Award dilution is the donor's diluted
minus basic count, less the if-converted shares the filer reports for that exact
period (`IncrementalCommonSharesAttributableToConversionOfDebtSecurities` and
`...OfPreferredStock`, a duration fact of the period's own length, core forms),
floored at 0, because the equity bridge already deducts those convertible
instruments as claims; the note names the amount taken out. When the issuer
files a convertible carrying value (the families `ConvertibleNotesPayable`,
`ConvertibleDebtNoncurrent`, `ConvertibleLongTermNotesPayable`,
`ConvertibleDebtCurrent`, `ConvertibleNotesPayableCurrent`, `ConvertibleDebt`
or the convertible-preferred option value) with a nonzero balance, in any reporting currency, within 366
days before the latest quarter, but no conversion increment is filed for the
donor period, nothing is restored: the filed count divides and the note says the
restored increment could hold conversion shares the bridge already deducts; a
loss period's filed count equals its basic count, so that kept count carries no
award dilution either, and the D-60 note's tail says so (as it does for the
basic case). With no such donor the basic count divides, and the note says it carries no option or
RSU dilution. A zero or missing count (FMP's undisclosed sentinel) is missing,
not filed, so the annual-statement fallback and its note apply as before. The
info gap `valuation.perShare.lossPeriodDivisor` (and the D-60 divisor note's
wording on the DCF route) is raised only where a DCF, excess-return or REIT
FFO/AFFO per share that divides by the count is published, in the substituted, basic and
not-restored cases; an unprofitable report with no DCF gains neither. The DCF,
the excess-return route, the REIT block, the scenario paths and forecast EPS
(`dilutedSharesProj`, on its pre-B-37 count) read the same substituted divisor.
A profitable divisor row is unchanged.

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
guessed, and nothing unknown is netted. The "FMP route publishes no split" wording
is kept only for a total whose provenance is not the SEC filing. A total with no
tagged operating slice whose finance-lease liability reconciles to it (within the
lease-integrity tolerance) is a finance lease: the EV basis and the DCF bridge
note say so ("a total lease liability of 2,387M is a finance lease, which stays in
EV and net debt on both bases"), no leases entry is raised, and no figure moves.

**The operating slice is removed only when total debt is shown to hold it.**
The removal assumes the operating-lease liability is inside `totalDebt`. It is
proven when the row's total lease liability covers the operating slice, or
when current plus noncurrent borrowings plus the leases reconcile to the total.
An operating lease enriched from SEC onto a provider row whose total is
borrowings only is not removed. Net debt and EV are then used as reported, and a
warning-level `valuation.dcf.netDebt.leaseScope` entry says so (audit
2026-10-19, CODE-1). The same proof applies to the WACC debt leg and to the key
data net debt excluding operating leases. The entry names what it compared: no
total lease liability, or one smaller than the operating slice, and borrowings
that are not disclosed or do not reconcile. The WACC debt leg, the DCF's
sales-to-capital, its filed-history ratios and ROIC apply the same proof (audit
2026-10-27, FIN-303 and FIN-303-V1; one shared predicate,
`operatingLeaseOutOfDebt`): on the default switch the slice leaves their debt
exactly when it leaves the bridge's. When the scope is unproven the current
balance's sales-to-capital and ROIC keep total debt as reported, their basis or
year note naming the unproven reason, and the A-2 history then keeps every year
on that same lease-inclusive basis. On the default basis with a proven current
row, an unproven history year is left out of the A-2 median with a note (below).
With the switch set every consumer keeps total debt as reported, and the
sales-to-capital basis says the operating lease is kept in invested capital.

**A withheld value states its refusal (audit 2026-10-29, VAL-4, VAL-10,
KNW-04).** When enterprise value cannot be built, its basis and the
`valuation.multiples.enterpriseValue` entry read "EV withheld:" with the actual
reason (the net-debt refusal, the market-cap or share-scope gate, unresolved
NCI, or the lease-scope refusal). They never say EV is reported as-is or that
its components are missing. A total debt the admission refused is named as
withheld, with the refusal, in net debt, invested capital and net debt/EBITDA;
"missing" is kept for a value that is absent. A DCF withheld for want of a
WACC says why the WACC is unavailable, and a suppressed fair value quotes the
DCF gap, or the bridge gap and the net-debt refusal behind it. The generic
reason remains only when no gap says. When the WACC refuses a market cap because
the issuer's class scope is unresolved, it is called withheld, with that reason, in
the WACC weights entry and so in the DCF and fair-value lines, and in the
multiples' market-cap entry ("market cap withheld — most multiples not
computable: ..."); "market cap missing" is kept for a quote that has none. The net-debt entry says the
equity bridge passed over FMP's cash-only `netDebt` field only when the
balance came from FMP; a keyless report has no such field. A quoted reason
that already ends a sentence is not given a second period.

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
invested capital (debt + temporary equity + equity − cash and short-term
investments, with the disclosed cash-only fallback when investments are unreported) and the
average debt behind the effective cost of debt and the E/D weights remove the
same operating-lease slice by default and keep it when the option is on, so
the discount rate, the return on capital and the enterprise value are on one
basis: NOPAT and interest expense are both after operating-lease cost under
ASC 842, and a lease-inclusive denominator understated ROIC for every
lease-heavy issuer (a discount retailer: 6% on the inclusive base against 11%
on the consistent one) and could push the effective rate below the acceptance
band. Where no split is disclosed, the ROIC notes say the provider's total debt,
lease liabilities included, was used unadjusted. Where a split is disclosed but
not shown to sit inside total debt (the proof above), the year's note names the
unproven reason and says total debt is used as reported. The DCF's sales-to-capital denominator
is the same capital: the proven operating-lease slice leaves its debt by default
(its cost is inside the projected EBIT, so keeping its liability in the capital
that reinvestment rebuilds would charge the lease twice, D-25), the basis naming
the amount removed or the unproven reason.

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

The P/E is ranked on the construction of the history actually selected. For a
single-class issuer with a derived market-cap/common-income history, the P/E
shown as price/diluted EPS is ranked using current market cap/common income.
The history basis names that ranked figure and the difference between diluted
and outstanding share counts. If common income is withheld, the displayed P/E
remains but has no rank; grading can use EV/EBITDA, then Price/FCF instead.
Multi-class price/quoted-unit-EPS histories and vendor P/E histories continue
ranking the displayed price/EPS construction. Historical common-ownership and
class-scope refusals still apply.

The P/E is not ranked when non-operating income is more than 25% of pre-tax
income: the earnings then rest on gains, not operations. `peOwnHistoryRank`
then ranks the next multiple in its list (EV/EBITDA, then Price/FCF), the score
driver is labelled with the multiple it ranks and says why, and Key data
caveats the headline P/E. The multiples table shows no own-history rank for
that P/E, and its history basis says it is not ranked (see "AMZN audit fixes
(October 20, 2026)").

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
a comparable company: it is excluded at discovery, again at comparison (on its
own quote), and left out of the peer list the analysis reads, with a note naming
it and the ratio. Caps are compared only between established equal currencies
or, when no currency is established for the peer (neither its own row nor a
profile read for it states one), between listings on the same
market (the same exchange suffix: none for a U.S. listing, `.T` for Tokyo), one
rule shared by Stage B discovery and the payload (`peerDiscoveryScreen`). A
same-market or same-currency row is screened on the discovery row's cap at no
provider read; a row on another market is "size not compared" at discovery (the
payload's Peers notes state why) and goes to the profile read, where the listing-currency gate
and the screen on its own quote decide. The suffix presumption only decides
whether a name is size-screened; it never makes a cap money. Size is a priced risk characteristic (Fama and French 1992) and
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
never silently combined in a peer median or an own-history rank. P/B and P/TBV require supported positive denominators.
The company's own comparison figure uses the issuer-common market capitalization
the multiples use (B-8): the class sum when established, the provider's cap when
its scope is unverified, and none when unresolved. The latter row reads withheld
with its reason, while the peer median remains context. The comparison's size
screen uses the class sum when established, otherwise the provider's cap.
The D-98 gain test also applies to both sides of this comparison: non-operating
income above 25% of positive trailing pre-tax income excludes a peer from
common-earnings and P/E medians, and withholds the subject's company figure.
Every one of the four quarters must carry finite pre-tax and operating income;
absent operands leave the test unknown. Exactly 25% and non-operating losses do
not trigger it. A median still requires four surviving peers; P/B and P/TBV stay
eligible under their existing rules. The stricter P/E construction gate also
remains. Peer earnings carried by gains are excluded, not adjusted: the bounded
peer fetch has no item-level one-off evidence to adjust them with.
Peer P/B uses the subject's common-equity rule: explicit common equity when
disclosed, otherwise parent stockholders' equity less preferred stock; a
consolidated basis additionally requires a disclosed noncontrolling-equity
allocation. Undisclosed preferred reads as zero. Both sides retain the existing
positive reported-stockholders-equity admission gate, so this correction does
not admit a previously ineligible balance. Peer P/TBV retains its existing
reported-equity-minus-goodwill/intangibles/explicit-preferred formula; its
handling of explicit common equity or consolidated NCI is outside this fix.
Peer comparisons provide context; they do not change scoring or intrinsic-value
formulas.

A subject whose route rests on SEC evidence (D-34) is compared only with peers
the profile screen routes the same way; a same-label peer whose own routing
evidence was not fetched is excluded as unconfirmed. Existing earlier industry
and sector screens still apply, and no additional SEC request is made.

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
4. **Managed care** (SIC 6324, hospital and medical service plans; audit
   2026-10-22 E-6) goes to the general map whatever its industry string or
   tags say, with a note. Its earnings and free cash flow measure it, and its
   debt finances the business rather than float. The keyless SIC label is
   `Healthcare` / `Medical - Healthcare Plans`, FMP's own classification.

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

Known limitation (FIN-308): an undetermined sub-map still uses the existing
industrial grading and forensic policy. A broader hold remains deferred because
the plan's protected saved O and NNN cases also have undetermined sub-maps;
their current figures are retained. This does not establish that industrial
signals fit every undetermined REIT.

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
  cost of equity in **at least 4 of the last 5** fiscal years (4+ years on
  record), the target is the cost of equity plus half the median spread,
  capped at 5pp (below 0.5pp the evidence is treated as noise). The window is
  the latest five fiscal years on record: a year whose return is not
  established stays in it as a year without evidence, so an older year cannot
  take its place, and the note names it. The FCFF DCF
  keeps its every-year rule; the equity model's 4-of-5 rule is an owner decision
  (audit 2026-10-22 C-10, D-102), after one acquisition year vetoed the carry
  COF's 2021-2024 record had earned. A **business-combination year** is
  annotated beside the rule's decision, and when its return is below the cost
  of equity it is set aside rather than counted as a miss, and kept out of the
  median spread. At most one year is set aside (the latest); any other
  below-hurdle combination year counts as a miss, so set-aside years never
  stand in for the evidence. A year qualifies when its goodwill step-up, or one of the
  filer's annual `GoodwillAcquiredDuringPeriod`,
  `BusinessCombinationConsiderationTransferred(1)`,
  `BusinessAcquisitionCostOfAcquiredEntityPurchasePrice` or
  `FinancingReceivableAllowanceForCreditLossesAcquiredWithDeterioratedCreditQuality`
  (the Day-1 allowance on purchased credit-deteriorated loans) facts, read
  from a 10-K, 20-F or 40-F or an amendment (a restated year's figure from the
  latest filing) in the balance sheet's currency (none when that currency is
  unestablished), is at
  least **10% of the opening common equity** — a house threshold, not a
  standard (`src/pipeline/stageB/excessReturnStart.ts`). That carried spread is valued past year `N` as
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
- **Opening book value `BV0` and the starting return** — banks use tangible
  common equity (stockholders' equity less goodwill, other intangibles and
  preferred stock) with the matching ROTE. Insurers and mortgage REITs use
  common book equity (stockholders' equity less preferred stock), with earnings
  available to common divided by average common equity. The start is the
  **trailing four quarters** when that window is complete and ends after the
  latest fiscal year (audit 2026-10-22 C-10, D-102) and is in the annual
  statement's currency: four quarters of income
  available to common, admitted by the same rule as the fiscal-year figure,
  over the average of the equity at the window's end and four quarters
  earlier (the closing balance alone when no earlier balance sheet exists, as
  for the fiscal year), with `BV0` the equity at the window's end. Otherwise
  the latest fiscal year is the start. When the trailing start is used, the
  fiscal-year start is valued with the same fade target, carry and payout path from
  its own fiscal-year book value, and whenever the two starts are more than
  **5pp** apart (house convention) that value is printed beside the headline
  and in the fair-value basis. COF's FY2025 ROTE of 4.2% (the Day-1 allowance on
  the acquired Discover loans went through provision) against about 17% over
  the trailing four quarters is the case that set the rule. Return and opening
  book value always share one dated basis; vendor total-equity ROE is never
  substituted into a common-equity valuation. Later
  years compound at `ROE_t × retention_t`, where retention is `1 − payout_t`.
  The payout fades linearly from the three-year average in year 1 to the
  steady state `1 − g / ROE_T` in year `N`, clamped to 0–100% (a terminal
  return at or below zero pays nothing). `ROE_T` is the terminal return (the
  cost of equity plus any carried excess, else the cost of equity) and `g` the
  continuing growth, `min(2.5%, risk-free)`. That is the payout at which book
  grows at `g`, as the continuing value assumes (Damodaran's stable-growth
  consistency). Held flat for ten years, PGR's 13% three-year payout compounded
  book 6.5× at above-cost returns before the carry applied (owner decision,
  audit 2026-10-22 C-10 follow-through, D-102). The path is stated in the
  valuation note and the payout basis. A loss is
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

The model also reverse-solves the **starting** ROE at which its value per share
equals the quote price, on the exact admitted diluted share count the forward
per share uses and under the same fade. Market cap is only a disclosed fallback
when price or that divisor is unavailable. The basis is named even when the
quote lies outside the return bracket. Currency, ADS and economic-class guards
still apply; this share-basis correction adds no date roll or conversion bridge.
Inverting a *different*
model (a flat ROE, as an earlier version did) made the solved figure
systematically low, because a flat path is worth more than a fading one, and
biased every financial toward "the market is too pessimistic". A clean property
follows from the identity: an issuer priced at book solves to exactly the cost
of equity.

**Stored implied-return signals (FIN-506).** A report built before spec 1.52.0
with the `roeImpliedVsAchievable` valuation driver gains a display-only note:
its implied return used market cap rather than the price times the forward
divisor. At the tested price-to-book ratios, a 1% share-count gap moved the
implied return by about 0.3pp, downward when the diluted count was larger and
upward when it was smaller. The separate frozen cutoff is independent of B5a's
annualization disclosure. All stored figures, scores and audit fields remain
unchanged; the note is composed into the screen, exports and stored-report view.

**What the reader sees of the start (audit 2026-10-22 C-11).** The trailing
four-quarter return is a row of its own in the returns block and in the LLM
payload: "ROTE (trailing four quarters)" for banks, "common-equity ROE
(trailing four quarters)" otherwise, sourced to
`computed.returns.commonReturnTtm`. The valuation section carries a 3×3
**start-return × cost-of-equity grid** of per-share values. The columns are the
cost of equity and ±1pp. The rows are the headline start and ±5pp; when the
model starts from the trailing window and a fiscal-year start exists, that
start replaces the shifted row on its side and starts from its own
fiscal-year book value. Each column moves the discount rate and the fade target
together: the carried evidenced excess is held, and dropped where the same
2pp `CoE − g` guard fails. The horizon and the year-1 payout stay the
headline's, and each column's payout fades to its own steady state
`1 − g / ROE_T`, so the centre cell is the headline value and the fiscal-year row at the base cost of
equity is the value printed beside it. A cell below zero shows 0, as the
headline does (limited liability). Each cell is a citeable payload figure,
and the scenario section's sensitivity conclusion reads this grid on the
excess-return route, on the same rules as the DCF grids. A Stage C check
(`src/pipeline/stageC/returnPathLanguage.ts`) reads the verdict and the base
scenario as the report shows it (its commentary, else the legacy assumptions,
and what would have to be true). When the return the model starts from (the
trailing return, or the fiscal year's when the model started there) already
exceeds its terminal target, a sentence describing returns rising, recovering
or improving, in any tense, toward the cost of equity (or along a "recovery
path") misdescribes current data. The rise must be in returns: a return (returns,
ROE, ROTE, ROTCE or return on equity) names the verb's subject or its object
("a recovery in ROE"), so margins or capital improving in a sentence that also
names the cost of equity are not flagged,
and each one is named in a `verify.check.returnPath` warning in the
missing-data manifest. A sentence that has returns rise to a level above or
exceeding the cost of equity is not flagged. The sentence itself is not rewritten.

#### P/TBV against ROTE

The multiple a financial is actually read on is price to **tangible** book, and
the return that justifies it is return on **tangible** common equity. Both use
the same denominator — equity less goodwill, other intangibles and preferred —
because goodwill absorbs losses only after common equity is gone, and pairing a
book-value multiple with a tangible-equity return would compare two different
bases. A goodwill-heavy acquirer at 1.0× book can be at 2.0× tangible book.

P/TBV and its premium are withheld unless quote and statement currency are
both known and equal. Justified P/TBV and ROTE remain because they use
statement figures, without the quote. Stored reports carrying the financial
currency-refusal gap show the same withheld pair on the web page, Markdown
and print views, without changing the stored report or audit export.

Each P/TBV row is dated at the balance its tangible equity comes from, and the
ROTE row at the period its return covers: the trailing window's end for a bank
using its trailing four quarters, otherwise the fiscal-year end. An insurer's
pairing retains its fiscal-year basis even when its forward model starts from
a trailing common-equity return. Preferred stock is deducted in both tangible bases.
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

A fiscal year served twice is collapsed to the provably latest filing before
any financial route metric is read, using the same period normalizer as growth,
returns and capital. An ambiguous duplicate is dropped with a warning and its
reason; it is not described as a resolved restatement. This applies to the
annual balance and income rows on bank, insurer and mortgage-REIT routes. The
independently selected share-count input retains its existing admission rule.

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
  That stand-in is the filer's total: a combined tag below the same period's
  `Depreciation` or `AmortizationOfIntangibleAssets` is skipped by the same
  floor and allowance as the statement builder's D&A (see "D&A from separate
  lines (B-7)"), so a subset line is never added back as the total (audit
  2026-10-27 FIN-510-V2).
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

The REIT block takes its market cap and its enterprise value from the multiples
framework (FIN-311, FIN-108, FIN-119-V2; it builds neither itself). P/FFO and
P/AFFO are the quote's admitted market cap divided by FFO and AFFO, the same
figures the multiples publish, so a report carries one P/FFO; FFO and AFFO per
share divide by the weighted diluted count ("Share basis (D-65)"). The implied
cap rate divides NOI by the **house enterprise value** — market capitalisation
+ total debt + preferred + redeemable preferred + minority interest +
redeemable noncontrolling interest − cash and short-term investments, less the
operating-lease slice only where its scope is proven (and by default) — the
same definition the multiples and the DCF bridge use, so a report carries one
EV ("EV bridge", above). The REIT EV note states that it is the multiples' EV
and quotes the multiples' own basis text verbatim, so its components and
amounts cannot differ from the multiples'. Operating
partnership units, permanent or redeemable, are not common shares, so they enter
the EV through the noncontrolling-interest terms and never double count against
the quote's market cap. When the multiples withhold the EV (a partial lease
maturity whose embedded slice cannot be proven, an unknown noncontrolling
allocation, a refused temporary-equity operand), the REIT EV and cap rate are
withheld with it; an unproven lease scope otherwise publishes the EV with the
lease liability left in total debt. Every guard that withholds the price
(currency, ADR or economic-class security basis) withholds the REIT market cap
and EV too, inside the block itself, so P/FFO, P/AFFO, the EV and the cap rate
are withheld together while FFO and AFFO per share stand. A REIT whose quote
carries a price but no market cap withholds P/FFO and the EV with a warn gap
(OD-8), where the earlier block priced on price × diluted shares.
The own-history P/FFO and P/AFFO
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
market cap in P/FFO is at the current quote while the FFO it divides is up to three quarters
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

Altman Z alone is also withheld for a regulated utility (the regulated-utility
overlay, audit 2026-10-22 A-3). Z'' read DUK, NEE and SO as distressed on
working capital and retained earnings that a commission, not the market,
determines; their leverage is scored on Moody's regulated-utility ranges
instead (see "Balance sheet of a regulated utility" below). Beneish and the
accrual ratio still apply.

SIC major group 65 (real-estate operators, agents and managers) is deliberately
outside the exclusion band: those are ordinary operating companies with
inventory, receivables and a working-capital cycle.

**Altman market-equity scope (FIN-307).** The original model's X4 refuses an
ADR capitalization whose issuer-common scope is unestablished. A structural
currency or scope refusal permits substitution of Z-prime, using book equity
and its separately calibrated coefficients (0.717, 0.847, 3.107, 0.420, 0.998)
and 1.23/2.90 zones; a merely missing cap still fails closed. This is a disclosed
house adaptation for a public issuer with unusable market equity, not a claim
that the issuer is private or a book-equity substitution into the original
coefficients. The calibration is described in [Altman's July 2000 paper,
pages 25–26](https://moodle2.units.it/pluginfile.php/322514/mod_resource/content/0/Zscores.pdf).
The source's prose and gray-zone row use 1.23; a separate footer prints 1.21.
The existing 1.23/2.90 house zones remain unchanged.

Forensics retains its profile-before-quote cap selection. An explicit
issuer-common declaration is taken only from that selected cap's own row and,
when admitted, retains unverified vendor-scope status; a declaration on another
row cannot validate it. Existing filing-based class and economic-share evidence
guards stay dominant. No ADS ratio
is inferred, and this Altman correction does not claim to fix the deferred
WACC scope limitation above.

#### Accrual definition, Beneish and Piotroski decompositions (D-61)

**Accruals.** The cash-flow accrual ratio is financial-asset-adjusted
(Richardson, Sloan, Soliman & Tuna 2005):
- the numerator is NI − CFO − operating CFI, where operating CFI is investing
  cash flow without purchases and sales/maturities of investments;
- net operating assets exclude cash, short-term **and** long-term investments.
  When long-term investments are 0 on both balance sheets nothing is removed,
  and the note says so instead of claiming the exclusion (audit 2026-10-29,
  FIG-4).

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

Known limitation (FIN-306): for reduced financial or eligibility-held batteries,
the completeness ceiling still includes tests withheld by route. Quality and
composite coverage can therefore understate the evidence the route can use.
The proposed correction remains deferred; existing scoring behavior is preserved.

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
zero. Minority interest is subtracted at book, or at its share of trailing
consolidated profit when that is the larger claim above 10% ("NCI on the
earnings key in the DCF bridge", above). The bridge recorded on the base result
is reused by scenario reruns.

**Domain of the model** (audit 2026-10-22 B-29). The base DCF is outside its
domain, and publishes no fair value, when either test fails:

- the equity value is at or below zero: enterprise value does not cover net
  debt and the senior claims;
- the terminal value is more than 100% of enterprise value: the
  explicit-period present value is below zero, so the forecast years destroy
  value and the Gordon year alone carries it.

The fair value then has the status "outside-domain" ("Model outside its
domain" in Key data, the valuation section and both exports) and a critical
gap `valuation.dcf.domain` that names the failed test and its figures. The
per-share value is withheld, and nothing built from it is published: no
sensitivity grid, growth × margin grid, reverse DCF or scenario targets. The
valuation grade treats the DCF upside and the reverse-DCF signals as missing.
The year rows and the bridge stay visible, so the reader can see why.

The same two tests apply to each cell of the sensitivity grid and the growth
× margin grid when the base DCF is inside the domain: a cell whose own rerun
bridges to an equity value at or below zero, or has an explicit-period present
value below zero, is withheld, and the grid's notes count those cells. In the
2026-10-22 panel replay that withholds 47 growth × margin cells across nine
issuers (BA and WMT ten each) and no WACC × g cell.

**House base rate** (audit 2026-10-22 B-30). The house conventions value most
large caps well below price, and a reader needs to know that before reading any
one value. The base rate comes from the audit census of 2026-10-22 (FRED DGS10
5.12% on 2026-10-20, ERP 4.18%, terminal growth capped at 2.5%): 16 of 18
general-route DCFs in the 2026-10-22 audit census were below price (median
−53%; 15 of 18 more than 30% below). The Key data note under a general-route
"Model fair value (DCF)" states it beside the upside, as "house base rate: …"
(`DCF_BASE_RATE_CENSUS`). The excess-return and REIT routes do not show it,
because the census figure describes only the FCFF DCF. It is a dated panel, not
a live statistic, and changes only with a new census. This batch only discloses
the base rate. The calibration behind it (B-3) and the valuation band's
dependence on it (B-33) are left for a later batch.

**Degraded inputs** (audit 2026-10-22 F-13, an owner decision). An available
fair value built on a substituted input carries a `valuation.fairValue.degradedInputs`
entry in `fairValue.reasons` that names each substitution:

- a risk-free rate that is not FRED `DGS10`, with the source and its observation
  date;
- on the DCF route, a ROIC-vs-WACC history that had no `DGS10` observation at all
  (FRED down), so every fiscal year was compared to the current WACC and the
  terminal ROIC rule read that comparison;
- each statement, quote or price member that the keyless layer served after FMP
  refused it, grouped by the source that served it (SEC EDGAR, Yahoo, or computed
  from filed facts and prices). The sector ETF prices (technicals only) and the
  shares float (read nowhere in Stage B) feed no fair value and are not named
  here; the run-level line below still lists them;
- the analyst-consensus growth method, when it was left out because the provider
  refused the analyst estimates.

The entry ends "A run with these providers healthy can give a different value." It
prints beside the headline value in both layouts and in the Key data note, the
Markdown and print exports, the data-only verdict and the AI context, which is told
to say so wherever it cites the model value. A keyless-by-configuration run
substitutes by design (its keyless entries are `expected`), so its value carries
no entry. So does a member the key's subscription never serves: FMP marks that
refusal `expected` (a restricted endpoint or symbol), and its stand-in is
`expected` too, while a quota or outage refusal on the same key is not. Neither does a withheld rate, which its own gap already discloses. The
peer medians do not feed the headline value, so a peer refusal is not named here.

**Provider fallback line** (audit 2026-10-22 F-1, an owner decision). When a run's
providers fell back, one line under the report header names them and what
replaced them: "Provider fallback · FMP did not serve every member, so the annual
income statement … are from SEC EDGAR and the quote is from Yahoo; the risk-free
rate is … (observation …), not FRED DGS10." It is built from the recorded
`keyless.<member>` substitutions that are not `expected` and from the
`riskFree.substitution` entry, in a fixed member and source order
(`src/report/providerFallback.ts`). It appears in the saved-snapshot header in
both layouts, under the classic report header, at the head of the Markdown,
audit and print exports, and in the AI context, which is told never to
attribute a substituted figure to FMP or FRED `DGS10`. A keyless plan, or
`THESIS_STATEMENT_SOURCE=edgar`, substitutes by design and shows no line, and
neither does a member the key's subscription never serves. The
fair value's degraded-inputs entry uses the same wording.

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
total debt (less the proven operating-lease slice on the default lease switch,
FIN-303) + temporary equity + equity − cash and short-term investments −
long-term investments, whose income is below the EBIT the DCF projects. The
temporary equity is the redeemable preferred and redeemable non-controlling
interests the bridge deducts, which are financing capital whichever caption
holds them; a refused operand
withholds the DCF with a `valuation.dcf.salesToCapital` gap at warn severity,
never critical (the claim exists, only its amount is disputed), rather than
being zero-filled, and the basis names the added amount. When removing
them would leave no operating capital (a holding at or above invested capital, FIN-304,
house rule D-135), the operating ratio is unbounded and takes the house cap 5.0, the
basis says why and names the cap as the limit the ratio approaches from below, and
the bridge still adds the holding back at its carrying value less the investment tax
(the line keeps its filed provenance and says the holding meets or exceeds operating
capital). On the current-capital rule one more of long-term investments therefore never
lowers the DCF value: the cap is the value the ratio reaches just below the boundary,
and the holding is added back on both sides. The A-2 history median's 0.1 cutoff
(below) predates this and can still step when the bridge row is also a history row. The
A-2 history below counts a year whose holding meets or exceeds its capital at the same
cap. Capital the lease removal itself emptied takes the issuer's own history instead
(FIN-303), whatever the holding.

**The issuer's own sales-to-capital (audit 2026-10-22 A-2).** The 0.5 floor is
a guard against a mis-scaled input, not a view of capital intensity, and a
regulated utility turns over its capital about a quarter of a time a year
(DUK 0.22, NEE 0.16, SO 0.27 in companyfacts). Forecasting its reinvestment at
0.5 halved the capital its growth needs and doubled DUK's DCF. The floor now
applies only when the issuer's own history does not establish a lower ratio:
each fiscal year with filed revenue and positive invested capital at
the same date (a year whose holding meets or exceeds its capital counts at the house cap 5.0 and is listed as "house cap: holding >= capital", not as a measured ratio, FIN-304; measured as above, with debt on the current balance's lease
basis and that year's own temporary equity) gives a ratio, and with at least three such years the median of the
newest five is the issuer's established ratio. One median is on one lease basis,
the current balance's: on the default switch a year whose operating lease is not
shown to sit inside its total debt cannot be put on that basis, so it is left out
of the median and the basis names it and why; it is never kept lease-inclusive
beside lease-excluded years. With the switch set, or a current balance that keeps
its lease because the scope is unproven, every year keeps its debt as reported. When it is below 0.5 it is the
lower bound in place of 0.5, so a current ratio at or above it is used as
filed and one below it is raised to it. With fewer than three years, or an
established ratio of 0.5 or more, the house floor applies as before. The
sales-to-capital basis lists the years and ratios, or says why the house floor
stands. A year whose temporary-equity operand is refused is left out of the
median, and the basis names it. The median, rather than the newest year or the mean, and the
three-year minimum are project choices: one restated or acquisition year does
not move the median, and fewer than three years do not establish a ratio. So
is a lower bound of 0.1 on the established ratio. Capital-heavy filers sit
near 0.15 to 0.25, so a median below 0.1 is read as a scale error, which
would repeat in every year; the house floor then stands, and the basis says
why.

When removing the proven operating-lease slice makes invested capital not
positive (a negative-equity lessee, FIN-303), the current balance cannot
establish a ratio, and the lease is not put back (that would mix the bases). The
DCF takes the issuer's own history on the same lease-excluded basis (at least three
usable years with a median of at least 0.1, held to the house cap of 5.0) and says
so in the basis, which still states that any long-term investment is non-operating
and added back by the bridge; without an established history ratio (three usable
years, median at least 0.1) it is withheld with a warn
`valuation.dcf.salesToCapital` gap (lead `LEASE_EMPTIED_CAPITAL_LEAD`; warn because main
published a DCF on the lease-inclusive capital and a critical gap would block the report) that
names the invested capital and the lease basis; the fair value and scenario targets quote it. Capital that is already not positive before the lease is removed, or with
no lease removed, keeps the plain "invested capital <= 0" gap.

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
an answer. When every prescan value lies on one side of the price, the result
records `growthOutsideRange` (the side, the range end and the value there), and
the reverse signal is graded at that end rather than left out: a price above the
value at every growth in the range scores the band floor, as the most demanding
case, and its trigger reads "above" (AMZN audit 2026-10-20 finding 10, where even
60% growth gave less than the price and the missing signal was averaged as
neutral). See `tests/stageB.valuation.test.ts`,
`tests/stageB.dcfLossTax.test.ts` and `tests/stageB.dcfDisplay.test.ts`.

## Overlays and cash runway

`src/pipeline/stageB/sectorRouting.ts` composes overlays with the base business
route. **Unprofitable** means negative selected net income or negative selected
operating cash flow, with dated annual fallbacks when TTM is unavailable.
For banks, insurers, mortgage REITs and FIN-OTHER issuers (sector Financial
Services on the general map), negative OCF alone cannot trigger it: trading
assets, loans held for sale and funding flows are operating cash flows on
those balance sheets (ASC 230-10-45-20 and -21). The overlay
suppresses the general FCFF DCF; it is a house applicability rule and does not
establish that every future cash flow will be negative.

When removing the FIN-OTHER OCF-only overlay would introduce a critical DCF
failure, the prior withheld valuation is retained if that prior treatment had
no critical valuation failure. The disclosure names the unsupported inputs
without labelling the issuer unprofitable. Existing eligibility holds, input
checks and gap severities remain unchanged. This compatibility exception
defers those DCFs; it does not supply missing inputs or perform an FX conversion.

**Pre-revenue** means selected revenue below USD 10 million. The threshold is
evaluated only on established USD statements; a foreign-currency amount is
not compared with the dollar cutoff. Missing revenue does not imply zero.
**Recent IPO** requires an actual, valid, non-future IPO date within 24 months
of the bundle's analysis date. Fewer than eight quarters alone is incomplete
coverage, not proof of a recent listing. The overlays replace or suppress
inapplicable long-history and valuation sections with disclosed reasons.

**Regulated utility** (audit 2026-10-22 B-13, an owner decision) applies on the
general route when the SEC SIC is 4911 (electric services), 4924 (natural gas
distribution), 4931 (electric and other services combined), 4932 (gas and
other services combined) or 4941 (water supply), and the issuer's companyfacts
show rate regulation: `RegulatoryAssets`, `RegulatoryAssetsCurrent`,
`RegulatoryAssetsNoncurrent` or a `RegulatedOperatingRevenue*` element (electric,
electric non-nuclear, gas, water, pipelines, other or the total), with a fact
filed by the run date and ending within 24 months of it (a period re-filed after the run date, as
the next year's comparative column, is read as it was first filed). The SIC alone also covers merchant
generators and energy marketers, so without the evidence the overlay is not
applied and the note says why. `RegulatedAndUnregulatedOperatingRevenue` is a
total and evidences neither. The overlay changes no base route and no
valuation: the DCF still values a utility. It withholds Altman Z and scores
the balance sheet on Moody's ranges.

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

**Stored valuations read under the 13-week convention (D136).** Reports built
before the frozen `ANNUALIZATION_CONVENTION_SPEC` 1.51.0 gain display-time
notes where their stored evidence identifies an extra-week quarter annualised
times four, a guided quarter used times four for year one or its consistency
floor, or a provider fiscal-year date on the wrong weekday. A note never
invents an exact fiscal-year end from a single period. Quarter-length examples
use the stored filed revenue before rounding when it matches the printed
run-rate; otherwise they label the result as approximate. The shared numeric
version comparator governs each row separately. These immutable, idempotent
notes appear in the report and its exports; stored figures, prose and
verification entries are never recomputed or rewritten.

`src/pipeline/stageB/projections.ts` displays the first five years of the
general-route DCF's explicit path, with up to four annual historical points.
Revenue, operating margin and FCFF come from the DCF year rows. Forward EPS
(D-60) is operating EBIT less interest expense, held flat, taxed at that year's
DCF rate, divided by diluted shares compounded at the applied share-count
trend. D-65: the interest is the latest quarter's run-rate when a quarter
newer than the latest fiscal year exists — the quarter's interest over its
average debt (opening and closing balances, operating leases excluded) is the
issuer's own effective rate, applied to the closing debt so debt issued during
the quarter is priced for a full year; the quarter's interest is first put on
the same 13-week basis (× 13/w for an exact non-13-week quarter), both for the
effective-rate calculation and the quarter × 4 fallback without both balances;
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
from at least three paired annual observations. The margin shift is applied
only when it moves with its scenario: the bull's is never a cut and the
bear's never a gain; otherwise that scenario's margin stays at base (AMZN
audit 2026-10-20 finding 11, where a correlation of −0.38 gave the bull a
1.17pp margin cut). The scenario paths and targets carry the method stamps
SHARED_SCENARIO_PATHS_2026_10_D99 and SCENARIO_TARGETS_2026_10_D135 (D-102 added
the domain test on each run; D-135 moved the bridge each target re-runs), and the fair value FAIR_VALUE_2026_10_D135. Missing correlation leaves
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
that produced each. The bull takes the growth shift that raises value with the
margin at base; it carries lower growth only when growth itself destroys value
(incremental returns below the cost of capital), and the ordering disclosure
names that cause. The base target reuses
the DCF per-share. A base DCF outside its domain (B-29, above), which
includes every non-positive base per-share, suppresses the entire target
block, and so does a bull or bear run outside it (an equity value at or below
zero, or a terminal value above the whole enterprise value): a perturbed
target is withheld, not floored at zero, and the warning names the run and
the failed test; thin
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
year one, the guided quarter's year-over-year growth, consensus year one
and the latest quarter's year-over-year growth. Base-case and consensus growth
are measured over the same TTM start revenue; each quarter is compared with
its own year-ago quarter. No guided run-rate or sequential row is sent: a level
dated at the guided quarter is not twelve-month growth (D136). Stored reports
keep their D-67 labels. The thesis trigger's year-one window likewise omits
the guided-quarter run-rate. Thus "demanding" is a comparison rather than an adjective.

The guided-quarter growth row carries the issuing release's outlook caveats
as valuation notes. The latest-quarter growth row carries those of the earlier
release paired with that quarter by the guidance track record (within three
days). Caveats are omitted when their row is absent and pass the existing
rating-language filter for display. A raw issuer sentence explicitly saying
that, excluding a named item, year-over-year growth would be a number of basis
points higher or lower supplies a signed percentage-point effect, before
display filtering. The first matching sentence is stated in the revenue-anchor
basis. It is disclosure only and adjusts no modeled revenue level. The anchor
keeps its independently selected source, including consensus or the fallback
when guidance is rejected or lacks a year-ago comparison. An unmatched
sentence leaves today's behavior unchanged. A timing
event cannot safely be distinguished from a persistent item such as FX or a
divestiture by this sentence pattern alone (D136/R4).

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
| Balance sheet | 15 | 10 | 15 | Net debt/EBITDA on the enterprise value's lease basis, interest coverage, before-SBC FCF conversion, SBC/FCF (the only scored SBC signal, D-49; at its band floor when FCF before SBC is not positive and SBC is, D-99); banks: tangible common equity/tangible assets, net charge-offs/average loans, NPL ratio, loans/deposits (D-46); regulated utilities: CFO before working capital/debt and debt/book capitalization (B-13) |
| Moat | 15 | 15 | 15 | Latest ROIC (0.45), durability as the lowest annual ROIC in the window (0.30, D-61; a pre-tax-loss year with operating profit is taxed at the marginal-rate floor, D-99) and gross margin (0.25); financials substitute ROTE level and floor |
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

**Balance sheet of a regulated utility (audit 2026-10-22 B-13).** A utility in
its capex cycle borrows against a rate base the commission lets it recover, so
the general bands (net debt/EBITDA, EBIT coverage, FCF conversion, SBC/FCF)
read DUK, NEE and SO as distressed: DUK's balance sheet scored F. On the
regulated-utility overlay the aspect is scored instead on the two leverage
ratios of Moody's Investors Service, *Rating Methodology: Regulated Electric
and Gas Utilities* (6 August 2024, replacing the 23 June 2017 edition),
Financial Strength factor, Standard Grid. The public copy used is Exhibit
TDS-1, page 6, in South Dakota PUC docket EL26-003
(https://puc.sd.gov/commission/dockets/electric/2026/EL26-003/Vol2Section6/Exh1TStevens.pdf).
Moody's weights the two at 15% and 7.5% of its scorecard, so they are weighted
two to one here. Using Moody's ranges is the owner's decision; the weighting
follows Moody's own.

| Utility input | Weight | Moody's Standard Grid | Band |
| --- | ---: | --- | --- |
| CFO pre-W/C / debt | 2/3 | Aaa ≥ 40%, Aa 30–40%, A 22–30%, Baa 13–22%, Ba 5–13%, B 1–5%, Caa < 1% | 0% → 5, 1% → 20, 5% → 40, 13% → 55, 22% → 70, 30% → 85, ≥ 40% → 95 |
| Debt / book capitalization | 1/3 | Aaa < 25%, Aa 25–35%, A 35–45%, Baa 45–55%, Ba 55–65%, B 65–75%, Caa ≥ 75% | ≤ 25% → 95, 35% → 85, 45% → 70, 55% → 55, 65% → 40, 75% → 20, 100% → 5 |

Each Moody's grade boundary is a house letter boundary: Aa and better grade A
(85 and up), A grades B (70), Baa grades C (55), Ba grades D (40), and B and
below grade F. That mapping is a house convention, not Moody's. Moody's also
scores business risk, the regulatory framework and two more financial ratios,
which are not modelled, so the aspect is not a rating. The Standard Grid is
used for every utility; Moody's lower-business-risk grid, for networks and
transmission companies, is looser, so this is the conservative choice.

CFO pre-W/C is operating cash flow less the cash-flow statement's
working-capital change, over total debt (leases included, as the house debt
reads it). It is withheld when the working-capital change is not on file: the
large utilities tag the individual changes but not a total, so on the keyless
path it is usually withheld and the aspect rests on debt / book
capitalization. Book capitalization is Moody's definition: debt plus total
equity, noncontrolling interests included, plus deferred income taxes. The
deferred taxes are the net liability tagged at the same balance date
(`DeferredIncomeTaxLiabilitiesNet`, else
`DeferredIncomeTaxesAndOtherTaxLiabilitiesNoncurrent`, else
`DeferredTaxLiabilitiesNoncurrent`); untagged, or with a capitalization that is
not positive, the ratio is withheld. When neither ratio can be computed, the
aspect is unscored with that reason and counts as missing evidence; the
industrial bands are never used in its place.
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
A valuation withheld because model applicability is unresolved (D-96) is
applicable but unscored: the signals the hold still treats as applicable
count as missing evidence, and the section's confidence is capped low.
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
  The claim reader (`claimEvidence.ts`, which the second gate below runs)
  scales a table the same way: a table's "(In millions)" scales its money
  amounts, its share counts and its cells with no stated unit (the last
  cannot validate: their unit is not established); a percent, ratio or day
  count is never scaled. Under an "except per share data" declaration, at
  any scale, a decimal cell is a per-share figure only when its own row names
  a per-share basis ("per share", "per basic share", "per diluted share",
  "per common share", "per ordinary share", with up to two of those
  qualifiers as in "per diluted common share", or "EPS": "Net income per
  share: Basic", "Diluted EPS"); decimal precision
  alone never makes it one, so "Revenue $ 5.0" under "($ in millions, except
  per share data)" is $5.0 million (PR #71 review). A row whose own label
  names no basis keeps the table's money scale, even inside a per-share
  block (NVIDIA's Note 3 "Diluted (2)" row follows "Net income per share:
  Basic"). A per-share cell is read as dollars per share. A claim that names the
  per-share basis in its words ("per share") is compared with it only when the
  cell's own row names a per-share basis (the declaration is a scale rule, not
  the row's description); "EPS" alone is not read as that basis in a claim
  (DECISIONS, "Audit batch B2: known residuals of the claim-verifier number
  fixes"; post-fix audit check V7).
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

Since D-66 the second gate compares the number's period with the column a
figure was printed in (the claim reader binds a table cell by its column's
date and fiscal label), and two figures that share the description's words in
one sentence ("Standardized and Advanced CET1 ratios were 14.6% and 14.1%")
cannot be told apart. The first gate (`excerptNumbers.ts`) does not check the
period; the log note on a match is the second gate's. News rows,
string figures and insider notes carry no text to read and stay
`text-source`.

A figure is read with its own description (audit 2026-10-27 AI-305 and
AI-305-V1; D-129, OD-1). The clause rule above still holds (every word of the
claim is stated in the clause, and a definition-changing modifier the clause
states is in the claim), and the claim must now also name every content word of
the figure's own description. Before the figure, that is the text from the
latest of the clause start, the previous figure's end, the last "(" when no ")"
follows it (only the last "(" is looked at; an earlier unclosed one is not
searched for) and the last colon or semicolon after that. After the figure, it is
the text up to the first comma, semicolon, colon, parenthesis, em or en dash,
the next figure or the clause end; a comma inside a date ("as of September 3,
2026") does not cut. For a table cell, it is the row label after its last colon,
with the table's scale declaration blanked. The same description is read for a
prose claim and for a traced number on the second gate. These are not content
words: ordinal period phrases ("the second quarter", "third-quarter"),
comparison bases ("the prior year", "year over year", "yoy", "qoq"), every
window token (TTM, YTD, "for the quarter": the code drops all of them from the
own description, and a window the claim states is compared as a period), a
prior fiscal year-end ("the end of the prior fiscal year") that no comparison
word ("compared with", "compared to", "versus", "vs.", "relative to",
"against", "than") and no "from" or "since" comes before in the description
(after one it is a base or a start, so its words stay content words and a claim
that names that year-end as its own period stays unchecked), and a
closed list of context words. The list holds pronouns (we, us, they, them,
their, there, which, who, whose, he, she, him, her, his), recognition verbs
(totaled, totalled, totaling, totalling, amounted, came, represented, posted,
generated, delivered, achieved, incurred, recognized, recognised, booked), the
links associated, related, relating, attributable, driven, due, primarily,
mainly, largely, partly, partially and reflecting, approximation hedges
(approximately, approx, about, around, nearly, almost, roughly, some),
"record", and the point abbreviations "pt" and "pts". It never holds a noun,
adjective, comparator, definition modifier or direction word. A word of the
description that comes before the figure must be named by the claim's own
clause. A word that comes after the figure may also be named by the claim's
words after an "and", "but", "while", "whereas", "versus" or "vs" that has no
figure after it ("invested over USD 76.7 billion in research and development");
such a continuation never extends to words before the figure. A total with its
per-share restatement ("$973 million, or $0.92 per share, of cash dividends
paid") share the trailing metric as their description. A figure the sentence
gives to another noun then stays unchecked: "a record of nearly $26.0 billion
to shareholders" is not a free-cash-flow figure, "benefiting our diluted
earnings per share by $1.93" is not the diluted EPS, and "cash, marketable
investments, and restricted cash of $73.48 billion" is not "cash". The own-description check can only leave a claim unchecked. Each claim is judged
twice, with the clause rule alone and with the own-description filter, and
when the filter would give the claim a different result from the clause rule
alone, the claim is unchecked; it never makes a claim validated or contradicted.
If the filter leaves no candidate, the claim is unchecked. An invalid or
locale-ambiguous date among the clause candidates still leaves the claim
unchecked, as `period-mismatch` unless the filter leaves no candidate (then the
filter's own reason is given). A correct
figure whose description carries words the claim leaves out is left unchecked,
and that recall cost is accepted: a trailing explanation with no comma ("net
discrete tax expense of $15.9 billion attributable to upward adjustments to our
investments"), a subject noun ("the DDTL Credit Agreement provides for a $17.5
billion ... facility"), a qualifier ("the remaining Commitment Amount"), a
fronted phrase ("Under the new lease accounting guidance, operating lease
liabilities were $2.5 billion": the claim must name the phrase, or the source
must put it after a comma).

A figure the source introduces with "from", "compared with", "compared to",
"versus", "vs." or "against" is a comparison base (audit 2026-10-27 AI-503,
AI-503-V1 and AI-503-V2; D-130): it supports only a claim figure introduced the
same way (a claim figure after these words binds only a source base), and it
does not take the excerpt's reporting period. In "<metric> increased from $A ...
to $B" the metric and the direction belong to $B, so "commitments increased to
USD 279 billion" is read against $279 billion, not the $119 billion the move
started from. $B's description is the words before $A's "from" (the move's
head, starting where $A's own description starts) plus $B's own words after it;
the words between $A and "to" ("last quarter", "a year ago") describe $A and
never $B, so "commitments increased to USD 279 billion last quarter" is not
supported. The periods, windows and fiscal year-end those words state are $A's
too: $B keeps only the periods of its clause that lie before $A or from $B on. Against
a quarterly excerpt, "Total debt decreased from $10.0 billion at fiscal year-end
to $8.5 billion" does not support "Total debt decreased to USD 8.5 billion at
fiscal year-end" (the year-end is $A's); $B then reads the excerpt's own period
and windows, so under a fiscal-year title "increased to USD 31.6 billion at
fiscal year-end" is read against the title's year-end (audit 2026-10-27 final
review). $B gets no head, and the claim stays unverified, when any of these
holds: no direction word (rose, increased, fell, declined and the rest of the
consistency reader's list) governs "from $A"; $A is in another clause than $B;
a digit, "$", a currency sign, ";", a bullet or a line break lies between $A and
"to"; the text between $A and "to" holds punctuation (a comma, colon,
parenthesis, em or en dash), a direction word or any word outside this list:
last, ago, earlier, sequentially, quarter, year, prior, first, second, third,
fourth, fiscal, month, months, the, a, an, in, at, of, end. So a range
("expected to range from $4.0 billion to $4.2 billion"), "went from", a verb
far from "from", and a second move or a new subject ("... due to Data Center
revenue growing to $41.1 billion") all leave $B without the metric.

`src/pipeline/stageC/consistency.ts` separately checks locally identifiable
direction words against signed changes, year phrases against cited record
years, unit words against record families, and sourcing of named individuals.
The number scanners that feed these checks (the consistency number scanner and
the prose quantity reader) are linear in claim length: a long run of whitespace
in model or filing text cannot make the verify step slow (audit 2026-10-27
SEC-203). The comparison-base reader (`comparisonCueEnd`, AI-402) reads each
amount between a cue and its period one way: its digits take a comma only as a
thousands group, and a space before a unit belongs to the unit. So a
comma-grouped table row cannot make it backtrack; it backtracked exponentially
before (about 1,000 characters of such rows took 33.6 seconds to verify).
A direction word reads the figure as a move or as a level (audit 2026-10-27 AI-401). "Increased to (about) X" is a level, and "increased by (about) X", "rose around X" or "<change noun> of (about) X" is a change, for each change noun the verifier reads with "of" (increase, decrease, decline, drop, rise, fall, expansion, contraction; the plural of each except expansion and contraction). An approximation or bound word (about, around, approximately, roughly, nearly, almost, some, close to, more than, less than, fewer than, at least, at most, just over, just under, in excess of) between the direction word and the figure does not change which. "A gain of X" is read as neither, because an accounting gain is a level, so a claim and a source that read it differently stay unverified and one that read it alike compare as usual. A change is never validated against a level. A direction word after the figure and across a comma, semicolon, colon, em dash, en dash (an ASCII hyphen is not read as one) or parenthesis describes a comparison, not the figure ("a tax rate of 16.5%, an increase from a year ago" reads 16.5% as a level; audit 2026-10-27 AI-401-V1).
A minus written directly before the currency (-$5 billion, −USD 5 billion)
negates the amount; a dash that follows a letter, digit or point ("$1.0-$1.2
billion", "FY2025-$5 million"), or a figure and one space ("$1.0 -$1.2
billion"), or one followed by a space ("$1.0 - $1.2 billion"), is not read as
that sign (audit 2026-10-27 AI-202).
Scale words, units and currency codes are read only as whole words (the M of
"Marketable" is not millions, the AUD in "fraud" is not a currency, a
hyphenated compound such as "Share-based" is not a unit, except that
"percentage point", "percentage-point", "basis point" and "basis-point" are
units, and the symbol % and the ratio "x" are the only units a hyphenated word
may follow: "10x-ish" reads 10x); "N months" (any whole or decimal N) is a
period phrase, not a quantity. The scale abbreviations read are k, m, mm, mn,
mln, mil, mio, b, bn and bln, besides the spelled-out words (audit 2026-10-27
AI-304). The consistency number scanner reads whole words too, with the scale
words thousand, million, billion, trillion, bn, mm and k only. In the unit
check, a figure written with $, US$ or an uppercase ISO currency code directly
before it (at most one space; not part of a pair such as EUR/USD) is an amount of
money, whatever noun follows it ("USD 99 billion share repurchase
authorization", "a $45.32 share price"), and so a share count written that way
("$15.2 billion shares") is a unit mismatch. Other currency signs (€, £, ¥) are
not read there (audit 2026-10-27 AI-304-V2).
A figure the source states as a bound ("less than 1%", "over $76.7 billion") supports only a claim that states the same kind of bound. The prose quantity reader marks a comparator directly before a figure, with only whitespace or the currency between: "more than", "over", "above", "exceed(s/ed/ing)", "in excess of", "greater than" and ">" are strict lower bounds; "at least", "a minimum of", "no less than", "not less than", "no fewer than" and "≥" are inclusive lower bounds; "less than", "fewer than", "under", "below" and "<" are strict upper bounds; "up to", "at most", "no more than", "not more than", "a maximum of", "not to exceed" and "≤" are inclusive upper bounds (the negated forms are read before "less than" and "more than"). One hedge from the consistency reader's hedge list (about, around, approximately, roughly, nearly, almost, some, close to, and the others it lists) may sit between the comparator and the figure ("at least about $5 billion" is an inclusive lower bound). On a filing excerpt, a source bound supports a claim bound of the same direction and value only when the claim is no stricter: a strict source bound supports a strict or an inclusive claim bound, and an inclusive source bound supports only an inclusive claim bound ("> $5 billion" does not validate against "≥ $5 billion", because the claim is false at exactly $5 billion; "≥" validates against ">"). An exact claim never validates against a source bound, a bound claim never validates against an exact source figure, and opposite directions never validate; two source figures that differ only by their bound or its strictness stay ambiguous. A bound states no value, so a bound is never contradicted by a value: a bound claim whose figure differs from its source bound's stays unverified, even where the source implies it ("over USD 70 billion" against NVIDIA's "over $76.7 billion"), and only an exact claim against an exact source figure can be contradicted by its value. The wording of the claim must still be in the source clause (D-63), so a claim of "at least" against a source "more than", or "more than" against "over", stays unchecked, and so does an "up to" claim against a source bound in other words (its "up" is a direction word); an "up to" claim against a source "up to" validates. A cited typed record is not changed: a bound in the claim is still read as a value there (audit 2026-10-27 AI-409).
A period that directly follows a comparison word ("compared with $10.2 billion
in second quarter 2025", "up 23% from the second quarter of fiscal 2025") is
the comparison's base: it belongs to the amount between the comparison word and
it, never to a figure before the comparison word, which is read under its own
clause or the excerpt's own period. "From" and "over" count as comparison
words after a change word ("up 23% from", "grew 20% over"), and a bare "from"
only across an amount ("from $10.1 billion in the second quarter of fiscal
2025"), never directly before a period ("from 2025-07-27 to 2026-07-26"); the
release parser (D-98) reads them more widely. "At" or "as of", followed only by
connecting words, may stand between the amount and the period ("compared with
$25.8 billion at the prior fiscal year-end", "as of January 26, 2025"). The
fiscal year-end and a prior fiscal year-end are instants and are read as a date
is, so in "Inventory was $31.6 billion, up from $25.8 billion at the end of the
prior fiscal year" the year-end is $25.8 billion's, never $31.6 billion's; no
other window is a base. A year-end directly after "from" or "since" ("Since the
end of the prior fiscal year, inventory increased by $5.8 billion") is where a
change starts: it is read as the figure's base, never as its period, in the
claim and in the source alike (audit 2026-10-27 final review). A base the claim names must be a
base the source names. A record citation establishes a base only when the record
is a year-over-year or quarter-over-quarter figure, which is measured against a
known base period: the base is compared with its fiscal label one year (or one
quarter) earlier for an FY-labelled base, otherwise with that label, the
shifted date itself or, for a phrase that names a year and nothing finer, the
calendar year of the shifted date. A phrase that names an exact date, a month,
a quarter, a half, or a count of months or weeks is not established by its year:
it must name the shifted date (or the fiscal label), or be a calendar quarter
that closes on it ("second quarter 2025" or "Q2 2025" for 2025-06-30), so
against a growth rate measured against 2025-06-30, "compared with 2025-01-01",
"January 2025" or "first quarter 2025" leaves the claim unverified, on a cited
record and in the period-word check alike (PR #71 review). A base spelled with "fiscal" is read as its
fiscal label ("the second quarter of fiscal 2026" is Q2 FY2026) and compared
with the shifted fiscal label only; "fiscal 2025" and "fiscal year 2025" are
fiscal years, not the quarter a year-over-year figure is measured against, so
they never match it. A base on any other record (a level, a period-less
figure) and a base that does not match leave the claim unverified, never
validated. Guidance,
target, estimate, outlook, forecast and consensus phrases are not comparison
bases and keep the claim's own period.
The period-word check reads a spelled fiscal period as the citation check does ("the second quarter of fiscal 2027" is Q2 FY2027, "fiscal 2025" is FY2025) and compares a record that carries an issuer fiscal label through the citation check's own period rule first (so "fiscal 2025" agrees with a 52/53-week year ending 2026-01-03), then by calendar year; it never fails a phrase the citation check accepts. An exact date against a record registered only under a fiscal label is checked only against its as-of date or period end. A failure leaves the claim unverified and is listed in the missing-data manifest. A number that cannot be located confidently in its sentence is
unchecked, not guessed. Coverage and checked counts accompany the results,
so these checks are not a comprehensive proof that the narrative is true.
A claim that states one figure is read for its periods as a whole: a period
named anywhere in it, whichever clause or sentence names it, is read as the
figure's period, except one named only in a forward-looking clause ("NVIDIA
expects strength in Q3 FY2027"), which is not lent to a figure whose own clause
is not forward-looking. The claim is therefore validated only when the figure
matches the source for that period. A claim with several figures is read clause
by clause.

"Contradicted" means a value conflict only: a stated amount outside its cited
figure's rounding interval, or a direction word against the sign of its cited
change (audit 2026-10-22 F-22, an owner decision). A bound ("more than", "up
to") states no amount, so on a filing excerpt a bound claim or a bound source
figure is never contradicted by its value (audit 2026-10-27 AI-409). A period, unit or currency
the cited record does not establish is a metadata gap, so the claim or figure is
unverified (period or unit not established), never contradicted. A claim whose
direction word conflicts with its cited change stays contradicted even when its
period or unit word also fails. That covers a
missing or null record period (a record that carries no period establishes only
its own as-of date, a date its period context declares, a fiscal label it
declares when the prose names it as an FY label such as "FY2026" or "the second
quarter of fiscal 2027", and a window its own label names; any other year,
quarter, date or window named against it leaves the claim unverified), a prose period or year the period-word check
cannot match to the record's window ("the twelve months ended June 30, 2026"
against `ttm: 2025-07-01 to 2026-06-30`), and a unit or currency mismatch. The
period-word and unit-word check failures are still listed in the verification
log and the missing-data manifest. A stored report whose log recorded such a
metadata gap as contradicted is read under the same rule: its counts move the
entry to unverified, and the audit export prints "unchecked (recorded
contradicted; period or unit not established; value not rechecked)" in the
entry's status column, with its numeric-support and prose-support columns
("cited" for the latter) read the same way. Such an entry kept only its first
failure, so whether its value also conflicted cannot be rechecked from the
stored report; unverified is the reading that claims no more than was checked.
Its outcome column reads "Cited; prose unchecked", and a claim contradicted for
its value reads "Cited; contradicted by its source" (it was cited, never
"uncited"). The audit export's factual-claim sentence gives these displayed
statuses, and its evidence-class table gives the coverage counts with
grade-strip reasoning included.

**Stored payload-record corrections (D-124, D-125, D-127).** A report saved before report
spec 1.45.0 is displayed, on the page, in the Markdown, print and audit exports
and in the history view, through `withLegacyPayloadRecordSafety`
(`src/report/legacyPayloadRecordSafety.ts`). The stored report, its bytes and
its recorded counts are unchanged (D-67); a report at or after 1.45.0 is passed
through as the identical object. The view makes six display-time corrections and
every note it adds is a fixed string. (1) A peer market cap whose symbol has a
different exchange suffix from the subject's is shown without a currency and
without the check mark (a unit that names the currency, such as "USD", reads
"currency"): reports before this spec gave it the subject's currency
(D-57), and a peer's currency is established only by that peer's own data; a
same-market peer cap is left as stored. (2) The insider "total purchases" and
"total sales" figures are shown as transaction counts, unverified: they counted
open-market transactions, not shares, over one calendar quarter at the fetch
date. (3) The capex/D&A average labelled "5y average" is shown as "average of
up to 5 fiscal years (the number averaged was not recorded)". (4) In a data-only
report's macro rows, the generator's own sentences "Displayed in USD per therm."
(APU000072610) and "Displayed in USD (FRED serves billions; …)" (PCE, PCEND,
PCEDG) read "per kilowatt-hour" and "at a seasonally adjusted annual rate"; only
the generator's exact sentence, on those FRED series, is replaced, and any other
relevance text (the model's own included) is left as written. (5) The provider's annual
"geographic" rows (not SEC-parsed rows) are kept as served but shown unverified
with no share, and the reason, when the report's own XBRL segment tables
contradict them (the same record cited elsewhere in the report, such as a key
number, is shown unverified with the same reason): the rows name the issuer's reportable business segments, or the
issuer tags its own geographic revenue and a provider region name is not one of
its labels (the stored-report form of OD-4; rule 7). (6) A data-only "FCF conversion
(FCF before SBC / net income — the graded ratio)" row reads without "the graded
ratio": the row is a fiscal-year series, and the graded figure is the
balance-sheet driver row (rule 8). A log entry for a corrected figure moves from
validated to unchecked (and verified to unverified) with the note "(display
correction, D-124, D-125, D-127)", and the displayed coverage counts exclude the corrected
entries: the stored-report rule above, applied to these entries. One
"presentation.payloadRecords" missing-data entry discloses the correction. The
stored report and its recorded counts are unchanged. Known limitation: in a
report whose 8-K event excerpts were selected before `section-evidence-5/event`,
a kept amount may belong to a person the cut excerpt did not name (audit
2026-10-27 AI-101). The stored report does not keep the excerpt, so this cannot
be found or corrected at display; such figures are shown as stored.

**Legacy reports built from SEC statements (audit 2026-10-27 B13, D-67).** A report
saved before report spec 1.49.0 whose income statements came from SEC filings is
marked in one of two classes. FULL: the manifest holds a `keyless.incomeAnnual` or
`keyless.incomeQuarterly` entry (exactly that field) whose reason starts "served by
edgar" (the wording of the `record()` entry in `src/pipeline/keyless.ts`, unchanged
since 2026-09-01). BACKFILL, when no FULL entry exists: only older periods came from
SEC filings, shown by a `statements.backfill.incomeAnnual` or
`statements.backfill.incomeQuarterly` entry, an `edgar.predecessor` entry whose reason
says older periods "were taken from the predecessor's filings" (the "no
pre-reorganization periods were appended" form does not count), or a scoped
`keyless.incomeAnnual.backfill.*`, `keyless.incomeQuarterly.backfill.*`,
`keyless.incomeAnnual.predecessor.*` or `keyless.incomeQuarterly.predecessor.*` entry.
FULL wins when both are present. An appended `edgar.predecessor` entry covers all six
statement members, so a predecessor history without income periods also carries the
BACKFILL notes, and a member served wholly by predecessor rows carries the BACKFILL
wording; both are conservative over-inclusions. A `keyless.<member>.shareBasis` entry never marks a
report: `keyless.ts` files it only when the member holds vendor rows, the opposite
of an SEC-built statement. The report is shown, on the page and in the Markdown,
print and audit exports, through
`withLegacyEdgarDerivedLines` (`src/report/legacyEdgarDerivedLines.ts`), which
follows the payload-record view above. It adds up to three fixed-string notes and
changes no figure; the stored report and its bytes are never rewritten. The
since-version is a frozen constant (`EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION`), never
the current `REPORT_SPEC_VERSION`, compared numerically through
`specVersionBefore`. (a) When the fair value is available, one line is added to its
basis: the statement lines were built before the derived operating income stopped
dropping a period that files the non-operating aggregate without an interest
element, removed a filer-tagged other non-operating result and stopped adding back
interest the filer placed inside the aggregate, before D&A and R&D stopped taking a
synonym below their own filed component, and before derived quarters and growth
cells were checked for one presentation where the filings show a re-presentation,
or withheld. For the BACKFILL class, line (a)
opens "The older statement periods on this report that were backfilled from SEC
filings were built before report spec 1.49.0." instead (`LEGACY_EDGAR_BACKFILL_FAIR_VALUE_NOTE`),
and the rest is unchanged. (b) When the manifest holds an
income restatements entry (`keyless.incomeQuarterly.restatements`,
`keyless.incomeAnnual.restatements`, or a scoped one such as
`keyless.incomeQuarterly.backfill.restatements`) whose reason names a revenue line
or ends its list with "and N more" (a revenue line may sit past the six listed),
the first quarterly-trend row's
growth notes say the YoY/QoQ cells and derived fourth quarters were computed
without checking whether the two quarters sit on one filed presentation. (c) The
quality notes always say the one-time-items screen was skipped without notice where
the filer tags no NonoperatingIncomeExpense aggregate (so "no flags were raised" may
mean it was not evaluated), and that D&A could be a sub-line below the filer's own
Depreciation, which moves EBITDA, net debt/EBITDA and capex/D&A; for the BACKFILL
class the first clause reads "Statement-derived screens on this report's older
periods backfilled from SEC filings were computed before report spec 1.49.0:"
(`LEGACY_EDGAR_BACKFILL_QUALITY_NOTE`). (c) does not wait for an available fair
value, because (a) does. The trend note (b) keeps its own trigger in both classes.
A report carrying either class's text never gains the other's. A report at or after
the since-version, or in neither class (an FMP-route report), is returned as the
identical object.

A stored DCF, excess-return or REIT value made before the equity-bridge batch
(audit 2026-10-27 B4a, D-67) is shown through `withLegacyBridgeMethod`
(`src/report/legacyBridgeMethod.ts`), which follows the EDGAR-derived-lines view
above. It changes no figure and rewrites no stored byte. Its since-version is a
frozen constant (`BRIDGE_METHOD_SINCE_SPEC_VERSION`, 1.50.0), never the current
`REPORT_SPEC_VERSION`, compared numerically through `specVersionBefore`. Each
clause carries its own cutoff and the wrapper has no module-wide early return, so
a later batch's clauses still reach a report at this one's version. (a) When the
fair value is available and its method is the FCFF DCF or the excess-return model,
one line is added to its basis after any line the view above added: "Valued under
the equity-bridge method before report spec 1.50.0: {clauses}. Re-run the report
for the current method." Its clauses, in order: on the FCFF DCF route only, "the
bridge did not read temporary-equity (redeemable) claims, pension and OPEB
deficits, loss-contingency accruals or contingent consideration, so any the issuer
filed were not deducted" (a condition, because no stored byte shows a claim); "it
deducted the filed retirement and environmental obligations shown in its bridge at
their full amount, before the tax relief a settlement earns" (only when a stored
bridge component is labelled "(filed, before tax"); "sales-to-capital kept the
{amount} operating lease the EV left out in invested capital" (only when the stored
EV basis names that lease as left out of net debt AND a stored `sales-to-capital`
assumption row exists whose basis does not affirmatively state the lease was
removed or kept by the switch; with no such row the clause is absent); and, on both
routes, always as a condition, "if the divisor period was a loss quarter, its
divisor carried no award dilution". The excess-return route has no E-7 bridge and
no sales-to-capital, so it carries only the divisor clause. (b) A REIT route report
gets one line in its route notes: "Priced under the REIT method before report spec
1.50.0: P/FFO, P/AFFO and the implied cap rate used price × weighted diluted shares
and the block's own enterprise value, so they can differ from the multiples
table." (c) A stored EV basis that says a total lease liability "is disclosed but
its operating slice is not" is shown with the finance-lease sentence of the current
EV basis when the stored lease amounts show the total is wholly a finance lease (no
operating-lease amount, and the filed finance lease reconciles to the total, the
rule of Stage B's `financeLeaseOnlyTotal`), and the stored "the FMP route publishes
no split" entry is hidden. The wrapper is idempotent and returns the identical
object when nothing applies.

A computed figure Stage B takes from one fiscal year's statement rows carries
that year's issuer label (for example FY2025) and its period end only when the
annual income row for the date Stage B states for it carries a fiscal label
(`issuerFiscalLabel`: the row's fiscal year and a full-year period) and that
date equals the as-of the figure prints. Otherwise it carries neither. The label
is never inferred from a calendar year. An annual period served twice with no
provable order is dropped by Stage B and by this lookup alike: the figure then
falls back to the prior year and carries that year's label and as-of, and when
only the tied period is left no record is labelled. These are the latest margins, ROIC, DuPont ROE, free cash flow,
FCF conversion and capex rows, and the accrual-year rows. Neither is printed, as
a statement cell's are not. They let prose name that fiscal year or "the fiscal
year", and, as for a statement cell, a sentence naming another year stays
unverified (audit 2026-10-27 B3, D-124). The label is the one the statement data
carries (the provider's or the keyless builder's), which can be wrong (FCX's keyless
2024-12-31 row carried "2023"), so the lookup keeps it only when it is plausible for
the period end: the year of the end, or the year before when the end falls in January
to March (52/53-week and March year ends). Otherwise the figure carries no label and
no period, as when the row has none. A `(latest)` record now carries its fiscal
period, so a key number written with a descriptive period ("latest", "latest fiscal
year") fails the period check, while one written with the date or the FY label
passes. This is the safe direction: a correct claim may go unverified, a wrong-year
claim does not validate.

The report header's verification line and the Verification table count as
contradicted both the prose claims the coverage counts contradicted and the
cited figures the verification log marks contradicted (a value mismatch). These
are the records the audit export prints. When a figure
is counted, the count names the split, as in "1 contradicted (1 cited figure, 0
prose claims)". The audit export's prose-claim sentence still counts prose
claims only. A pass that ran on a plan allowance (ChatGPT or Gemini CLI) sends
the supplied evidence with no web-search tool. When any pass did, the report
header and run details carry an Evidence line, for example "bull, bear and judge
used only the supplied evidence (payload-only; no web search)". It is derived
from the same execution entries whose per-pass note the audit export prints,
counting only passes that ran to a usable analysis: a failed attempt a
data-only report lists, or a model the registry refused, is left out (see
"AMZN audit fixes (October 20, 2026)").

The verification line leads with the share of numeric factual claims
numerically matched to a cited figure, as a fraction and a percentage, for
example "40/109 (36.7%) numeric claims numerically matched to a cited figure
(not whole-claim validation); 0 contradicted; 41 qualitative claims cited, not
machine-checkable" (audit 2026-10-22 B-10). The figures traced to a cited
source and the factual claims carrying a citation follow on a separate
Provenance line in the report header, the print header and the page header,
because a citation shows where a figure came from, not that the prose matches
it. A stored report with no recorded validation result reads "numeric claims
not validated: no verification result recorded". The Verification table lists
the numeric validation row first and the provenance rows after it.

Each factual claim (FACT or ESTIMATE) the verify pass logged carries its
status after its citation, in the page, Markdown and print reports: `[validated]`
when a figure it states matched the cited record, `[contradicted]` for a value
conflict, `[qualitative]` when it is cited and states no figure to match, and
`[unverified]` otherwise (audit 2026-10-22 F-21). The mark comes from the
claim's own verification-log entry, matched by report path and text; a
judgment, a data-only report and a note written after the verify pass carry
none. The counts on the verification and provenance lines and in the
Verification table are counts of those marked claims. The grade strip prints
each section's grade and one-line why, not its reasoning, so the verify pass's
entries for grade-strip reasoning (often a copy of the section's own claims)
stay in the verification log but are left out of the factual and judgment
counts, and the audit export says how many were left out. A removed log entry
marks nothing and counts nothing: the earnings-reference guard's rows record a
rewritten pointer, not a counted claim, and a claim the legacy entity check
withholds when a stored report is read prints as an unmarked placeholder, so the
read view takes it out of the counts at the status it was recorded with.

A data-only report runs no citation-check pass. Its figures carry
`verified: true` only because the pipeline computed them, so they print
"computed" where a checked report prints ✓: in the Cited column of the
Markdown and print tables, beside each figure on the page, in the figure's
citation-status detail and in the audit export ("computed (no citation check
ran)"). The Markdown and print reports add a legend line under the first
table with a Cited column (audit 2026-10-22 F-23). The stored `verified`
value is unchanged, because the enterprise-value and debt checks read it.

Statements the code writes about the analysis itself are labelled JUDGMENT,
never FACT, matching the rule the analysis prompts give the model
("Methodology, data-gap and coverage statements describe this analysis").
The rule covers the capital grading basis and the debt-bridge convention on
every report, and, on a data-only report, these statements:

- each aspect's score-to-band sentence or its "score unavailable" reason;
- the net-debt method note and any interest-coverage gap note;
- the HEURISTIC maintenance-capex and buyback-price notes;
- an unavailable dilution overhang;
- the comparison of today's price with the average repurchase price proxy.

The repurchase total stays a FACT sentence of its own. The proxy comparison
and the timing measure follow it as a separate JUDGMENT sentence. Sentences
that state a computed figure stay FACT: net debt to EBITDA, interest cover,
capex intensity, the share-count change, stock-based compensation and a
computed dilution overhang (audit 2026-10-22 F-20). No figure changes.

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

Business quality shows its letter only when the business aspects carry at least
half of their route-applicable evidence, the same floor as the composite. The
unrounded evidence share is stored separately (zero when no applicable weight
exists); the summary line, Markdown and dossier cover show the score and
"not graded: evidence N.N%" below that floor. The audit table retains the recorded
band. Legacy reports without the optional share keep their recorded presentation.
This display rule does not change scores, bands or their weighting, including the
reduced-battery denominator limitation disclosed under FIN-306.

Capital metrics use complete compatible TTM flows and a matching balance sheet when available, with an explicit annual fallback. Annual history remains available. Within a selected TTM snapshot, incomplete operating income withholds EBIT, EBITDA, interest coverage and net debt/EBITDA: vendor EBIT, which can include non-operating gains, and annual operating income are never substituted for that trailing flow (D-31, FIN-112). Cash bridges distinguish operating cash flow minus cash capital expenditure, lease-principal-adjusted FCF, an explicitly supplied issuer definition, and after-SBC economic adjustments. Historical levered FCF and forecast unlevered FCFF are different measures. Debt, liquidity, lease liabilities, enterprise value, equity and diluted shares are reconciled separately.

Forward and reverse DCF use the same growth-path family. Rolling forecasts retain exact start/end dates; a June TTM anchor is not a December fiscal-year estimate. Bull/base/bear labels share one scenario identity across intrinsic values and projection paths. Since D-60 scenario shocks decay to the base path by year 10 and scenario margins stay below gross margin less the leanest operating-expense ratio on record (the decaying shock is the main construction, so no alternative is listed). EPS uses flat shares because an authorization is not a committed schedule; the authorization-funded share change is stated and an unfunded historical-share-trend sensitivity is labeled hypothetical.

Filing context uses bounded section-aware passages and discloses omitted categories. Numeric factual prose is checked against metric, unit, date and retained source evidence. A typed record's metric is its registry label, with common abbreviations (FCF, SBC, capex) normalized; a window is read however it is written ("for the quarter", "this quarter", "the quarter's", "latest-quarter", "for the latest fiscal year", "fiscal-year"), and horizons, plurals and comparisons ("five-year", "four quarters", "a year ago", "year one") are not windows; a named window must be the record's own, and a record with no period or fiscal basis establishes none. A year word that a year follows ("fiscal year 2026") names that year, not an annual window as well. "At fiscal year-end" and "at the end of the fiscal year" name the fiscal year-end instant, which only a record with an FY or fourth-quarter fiscal label or a fiscal-year basis establishes (on a filing excerpt, a source clause that states the year-end itself, or an FY or fourth-quarter title with a clause or table column dated to the excerpt's own reporting date; a claim's date that no source states stays unverified). A prior fiscal year-end ("at the end of the prior year", "at the end of the last or previous fiscal year", "at the prior, previous or last (fiscal) year-end") is a different instant: it is established only by the same relative phrase in the cited figure's own clause on a filing excerpt, stated as that figure's own instant (after a comparison word it is the base's, after "from" or "since" a change's start, and for a move's end it is never the words between $A and "to"). No typed record establishes it, by its label ("net debt at the prior fiscal year-end") or by its basis. A title, a table header, a window the excerpt inherits and the current fiscal year-end never establish it either, so such a claim is otherwise unverified for its period (`period-mismatch`), never validated and never contradicted on the strength of the title, and a source's prior year-end does not establish a claim's "at fiscal year-end" either (audit 2026-10-27 final review). A period of any kind (a date, a month, a year, a fiscal label, a window, the fiscal year-end or a prior fiscal year-end) inside a parenthetical that holds another figure is never a period of a figure outside the parenthetical, in the claim and in the source alike. Such a parenthetical can state the outside figure's own period as well as the inner figure's ("Inventory was $25.8 billion (at the end of the prior fiscal year, up from $20.0 billion a year earlier)"), so a figure that loses any period to one has periods that cannot be read: it takes no period, window or year-end from the excerpt's title, and every claim it could bind by its metric is unverified (`period-mismatch`), as is a claim whose own figure loses a period that way. So against "Inventory was $31.6 billion (at the end of the prior fiscal year, $25.8 billion)" or "(prior fiscal year-end: $25.8 billion)" a claim of either figure is unverified, never validated or contradicted, and against the $25.8 billion source above "USD 25.8 billion in Q2 FY2027" is unverified, not read under a 10-Q title's quarter. A parenthetical runs from "(" to the ")" that closes it, found by counting nested parentheses, or to the end of the clause when none does; one with no figure of its own ("$31.6 billion (at the end of the prior fiscal year)", "(at the end of the prior fiscal year (unaudited))") still states the period of the clause's figure. A clause's parentheticals are read once for all its figures. "Latest", "most recent" or "newest" directly before, or one word before (a space or hyphen between the words), a period or filing word (quarter, year, annual, fiscal, FY or an FY label, Q1 to Q4, period, month, results, reported, figure, 10-Q, 10-K, filing, report: "the latest-quarter", "latest full-year", "latest FY2026") on a figure from a dated statement, quarterly-trend or segment series requires the newest period of that series the payload registers, even when the claim also names an exact period; the word before anything else ("the latest guidance") is not a recency claim; on a filing excerpt it is not checked. On a filing excerpt, a claim's window must be the clause's own or, when the clause names no period, the window the excerpt's title states. A forward-looking clause of a filing is read under no period of the excerpt and binds only a claim that is itself forward-looking; a reported result binds only a claim stating a result (OD-3). The wording read as forward-looking is "is/are/was/were/be/been/being/remains/remained (now, currently, still or also) expected, projected, forecast or forecasted, anticipated, estimated or guided to", "expect(s)", "expecting", "anticipate(s)", "anticipating", "forecast(s)", "outlook", "guidance for", "guidance of", "guidance range", "guidance calls for", "guidance is", "guidance was", "guidance issued", and "our", "its", "management's" or "the company's" followed by up to three words and "guidance". So "Under the accounting guidance for leases, …", "Under guidance issued by the FASB, …" and "our new lease accounting guidance" are read as forward-looking too. Wording that does not match is a result: "under the new lease accounting guidance", a bare "as expected", "estimated useful lives". Whether a claim is forward-looking is judged from the clause of the figure the claim states, so a result figure beside a forward-looking clause binds no forward-looking span. A bare "trailing" means twelve months, and an exact date names a window record's end; its start counts only inside the complete stated interval (both dates named). Citation presence is reported separately from supported numeric claims, contradictions and unchecked content, and the headline states how many unchecked claims carry no figure to check. Qualitative claims are not established as true by numeric matching. Executive execution or guidance credibility is assessed only from a FACT in that executive's evidence that names them and whose figure the verifier matched to its cited record; otherwise it is not assessed (D-59). A reported-earnings reconciliation for an FMP quarter without SEC start dates is bounded by the issuer's preceding fiscal quarter in the same statement. Company-confirmed earnings dates take precedence over vendor estimates; enrichment preserves conflicting SEC/vendor observations instead of silently choosing one.

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

A withheld noncurrent figure withholds total and net debt. A composed figure that holds current debt (an inclusive class total or a class's current variant) is right as part of total debt but is not noncurrent debt. The forensic tests that read long-term debt alone therefore do not take it as noncurrent debt, with a `forensics.longTermDebt` info gap: LVGI, which adds it to current liabilities, takes Beneish's neutral 1.0. ΔLEVER compares the composed figure year on year when both years compose it from the same tags, and is not evaluated, with both tag sets named, when they differ (audit 2026-10-22 E-8).

**Debt plausibility.** Tag lists cannot cover extension tags, so Stage B also tests resolved debt against the interest it carried. Resolved debt here is current debt, noncurrent debt and finance leases, or the published total for rows without components. Finance leases are not added again when long-term debt was tagged with them (`LongTermDebtAndCapitalLeaseObligations` or `LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities`). The year's interest expense is divided by the average debt resolved at the balance dates of that year, opening to closing; an annual row also counts the quarterly balances inside its year, so a borrowing repaid between year-ends still explains part of its interest. Above 25%, the components cannot be the debt that carried the interest. A collapse is tested as well: debt that fell by more than 60% from the previous balance date, to a closing balance on which the interest implies more than 25%, needs net debt repayment in the period's cash flow of at least half the fall. In either case total, net and long-term debt are withheld with a manifest gap, and every leverage, EV, WACC and forensic leverage consumer sees the gap. That includes the report's derived historical EV for that date. Quarters are judged on the smaller of their trailing four quarters and the latest fiscal year, so one unusual quarter cannot trigger the check. A reported interest expense of zero is read as undisclosed (the zero-vs-undisclosed policy), so it never stands in as the smaller basis. Interest rows join balance rows within ±5 days of fiscal-date drift, as statement joins elsewhere do. The check does not run in three cases:
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
the period's earnings. A redeemable NCI (temporary equity) counts toward the same
floor, added to the book balance (FIN-119).

**A grade needs corroborating evidence.** No surface shows an aspect's letter
when its score rests on less than half of its intended signal weight (D-67).
It also shows none when the score rests on one signal carrying only part of
that weight, such as an insurer's own-history P/B rank without the ROE
reverse-solve signal. The label is "Not assessed — limited evidence (score N/100
on one signal, X% of signals)". The score and the composite are unchanged,
since the composite already weights each aspect by its evidence. The
composite's own letter has the same floor, measured over the whole route
(F-19, under audit batch 1 below). A route that
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
asks again. No request takes more than 90 seconds of wall-clock time in total:
the clock starts before the first attempt, a pause that would end at the bound
is not waited for, and the retry is a single attempt that times out when the
bound ends. A request still refused keeps its rate-limit gap, which then says
how long it waited; a retry the bound cut off still names the rate limit. One more warning entry, `fmp.rateLimit`,
names every such member and says the valuation is degraded. When the refused
member is the analyst estimates, the DCF's `valuation.dcf.analystGrowth` record
becomes a warning that names the rate limit as the cause, instead of the
informational "no usable analyst revenue estimates", and the DCF notes carry a
"Valuation degraded" line. The report is still published. Statements still come from
the keyless SEC substitutes, which carry their own entries.

**Investment stakes on the SEC statements, and the tax on them.** The
statements rebuilt from SEC companyfacts had no long-term investments line, so
when a run fell back to them (Amazon's did, after the rate limit above) every
stake counted as zero in the equity bridge and stayed inside the operating
capital that sales-to-capital divides by. Amazon carries its Anthropic and
OpenAI stakes in "Other assets", not on a line of their own. The SEC statements
now fill `longTermInvestments` with the filed `LongTermInvestments` total when
the filing tags one. Otherwise they add up the non-current pieces the filing does
tag:

- non-current debt securities (`MarketableSecuritiesNoncurrent`, else
  `AvailableForSaleSecuritiesDebtSecuritiesNoncurrent`);
- a filed other-investments line (`OtherLongTermInvestments`), or, when there is
  none, non-marketable equity securities
  (`EquitySecuritiesWithoutReadilyDeterminableFairValueAmount`) plus
  equity-method investments (`EquityMethodInvestments`). The other-investments
  line already holds those two, as Alphabet's "Non-marketable securities" does,
  so they are never added to it.

An absent piece is named in the statement notes, never taken as zero. The
undivided `AvailableForSaleSecuritiesDebtSecurities` total is never a piece:
in most filings it also holds current and cash-equivalent securities that are
already in cash and short-term investments, and the statements cannot split it.
For Amazon at June 30, 2026 the line is $122.7B: $122.3B of non-marketable
equity and $0.4B of equity-method investments. Its $97.9B of Anthropic
convertible notes are tagged only with that undivided total, so they stay out.
This is a known understatement, not an estimate.

**The same stakes on the provider path (D-133).** A provider balance row
carries its own `longTermInvestments`, and for Amazon it was 0 with no source,
so report #51 (audit 2026-10-29, VAL-3 and FIG-4) added no stake to the equity
bridge and kept them inside net operating assets. A provider row whose
`longTermInvestments` is 0 or absent is now read as undisclosed when the
same-period filing shows noncurrent investments, and is filled with the chain
above: the same tags, period and currency, and the filing as the field's
provenance. One info entry in the manifest lists every filled date with its
amount and quotes the latest date's pieces, naming any absent one. The enrichment fills it when the bundle is built, and Stage B's
balance admission fills a provider row frozen before that. A nonzero provider
value, a refused one and one the SEC statements built are left as they are.
The Amazon line above is therefore the same on both paths.

The bridge then subtracts one more line: **estimated tax on non-operating
investments**. A stake reaches shareholders when it is sold, and the gain is
taxed. The rate is the marginal-rate floor the DCF's terminal tax converges to
(D-58): the 21% US federal rate for a US issuer, and the 15% global minimum
where no statutory rate is sourced. It is charged on the whole carrying value
of every non-operating asset the bridge adds, meaning the D-60 marketable
equity securities and the long-term investments. The filings do not give each
holding's tax basis, so a zero basis is assumed. That makes this the most the
tax could be. It is exact for stakes bought for next to nothing, and it
overstates the tax for holdings carried near cost, such as bond portfolios.
This treatment is an owner decision (D-98). The bridge table prints the line as
"Less estimated tax on non-operating investments (21% marginal rate, zero tax
basis assumed)". The scenario assumptions and the DCF notes state the amount
and the basis.

**Guided quarters: the year a release names, and the pace year one carries.**
Amazon's releases name the year-ago quarter in their comparisons ("compared
with $167.7 billion in second quarter 2025", "to grow between 9% and 12%
compared with third quarter 2025") and name no other year in those sentences.
The release parser took the first quarter-and-year phrase it found, so both
the quarter a release reported and the quarter it guided were labelled a year
early: the Q3 2026 outlook read "Q3 FY2025". The two mistakes cancelled in the
check that the outlook lies ahead, but the outlook-against-actual comparison
matches the guided quarter to the release that reported it, so the Q4 2025
outlook ($206.0B to $213.0B, actual $213.4B) was never scored. A quarter-and-year
phrase that directly follows a comparison word in its own clause ("compared with", "versus",
"vs.", "relative to", "against", "from"), with nothing between them but amounts
and connecting words ("compared with $18.2 billion, or $1.68 per diluted share,
in second quarter 2025"), is now skipped when a guidance
sentence or block is labelled. A comparison word earlier in the clause that
governs something else ("the impact from foreign currency, revenue for the
fourth quarter of 2026") does not skip the period. The reported quarter is read from the phrase
that names the same quarter as the "quarter ended" sentence; when the only
such phrase is a comparison base, the year after it is taken. A phrase heading
an outlook ("Third Quarter 2026 Guidance", or "Outlook for Second Quarter
2026" with the heading word first) is never taken as the reported quarter, so a release whose "quarter ended" sentence names no quarter is not
labelled with the quarter it guides. On Amazon's five
releases from July 2025 to July 2026 every reported and guided quarter now
carries its own year, and the three prior quarters' outlooks are all scored.

Year one then carried the guided quarter at its sequential pace: Q3 2026
guidance of $199.5B over Q2's $200.6B, annualized, is −2.2% a year, though
Amazon guided +9% to +12% over Q3 2025. Q3 is below Q2 every year, so the
sequential pace read the season as a slowdown. D-136 takes the guided quarter
out of its growth-adjusted season before multiplying by four and carrying it
at its guided year-over-year pace ($199.5B over $180.2B, +10.7% in this
example). With three yearly factors on the saved census inputs, year one is
about $834.60B (the pre-flight's one-factor illustration was about $828B);
below eight quarters the TTM-at-guided-growth fallback is about $858.8B.
Without that year-ago quarter in the model currency, guidance sets no level.

**Improving margins fade up to a bounded target.** A declining margin regime
faded the margin down toward its five-year median, but an improving one was
held at today's level for ten years: Amazon's 12.08% stayed flat under an
improving regime with a dated slope of +2.01pp a year, while its quarterly
operating margin had already reached 13.7%. The improving target is now the
lower of two bounds, and never below the current margin or the median:

- half the dated slope carried over the five fade years (current + 0.5 × slope
  × 5), so a trend is not extrapolated in full;
- the scenario margin ceiling, today's gross margin less the leanest
  operating-expense ratio among the TTM and the last five fiscal years. That is
  the margin the issuer would earn at today's gross margin with costs it has
  already run at. It also bounds the bull and bear scenarios (D-60).

Without a gross margin on record the ceiling is unavailable and the margin is
held flat, as before. The broken-input margin cap still applies on top. For
Amazon the trend bound is 17.1% and the ceiling 14.03% (50.77% gross margin less
FY2021's 36.74% operating-expense ratio), so the margin fades from 12.08% to
14.03% by year five. Both the half-trend share and the ceiling as the bound are
owner decisions (D-98). Because the raised target is a judgment, the margin
basis and the DCF notes state its value: the per-share value on the faded path
and with the margin held flat at the current level ("margin-fade
sensitivity").

**Earnings carried by one-off gains.** Amazon's TTM pre-tax income included
about $80B of investment gains, below operating income. Its GAAP P/E read 21.1x
against roughly 36x to 40x on operating earnings, and a rank of that P/E in its
own history (2.72, scored 88) was the valuation grade's only positive signal.
The headline P/E carried no caveat. When non-operating income (pre-tax income
less operating income) is more than 25% of positive pre-tax income, the P/E is
now flagged as resting on gain-inflated earnings. It is still shown, with a
caveat in Key data that states the share. The valuation grade does not rank it:
`peOwnHistoryRank` takes the next multiple in its list, EV/EBITDA and then
Price/FCF, which do not include those gains. The 25% line is an owner decision
(D-98). Non-operating losses are not flagged; they make the P/E look dear, not
cheap.

The same idea applies inside operating income (audit item 15, FCX-9): a one-off
there set the DCF margin for every forecast year. Freeport-McMoRan's TTM to June
30, 2026 included a $699M insurance settlement gain. The TTM (or annual) margin
that seeds the DCF now leaves out tagged one-off items over the same twelve
months, in both directions:

- gains (`InsuredEventGainLoss`) are subtracted;
- impairment charges are added back: `AssetImpairmentCharges` when it is filed,
  else `GoodwillImpairmentLoss`, `ImpairmentOfLongLivedAssetsHeldForUse` and
  `ImpairmentOfIntangibleAssetsExcludingGoodwill`, so a total and its parts are
  never both counted.

Each tag is summed as the fiscal-year fact plus the year to date less the prior
year to date, from facts filed by the build. An untagged current year to date
counts as zero, because a one-off is tagged in the filing for the period it fell
in and that filing is the latest. The fiscal year and the prior year to date
split the year at the window's start, so when one of them carries an amount the
other must be filed too. Otherwise the tag is withheld: none of it is removed,
and the DCF notes say which tag was kept and why. Amazon's 10-K tags a $1.3B
impairment for 2025, $610M of it in the fourth quarter, but its 10-Qs never tag
the rest, so how much fell inside a June 2026 TTM is unknown and none of it is
removed. The margin basis says "excluding tagged one-off items" when any item is
removed, and the DCF notes name each tag and amount. For Freeport-McMoRan the
$699M gain lowers the margin seed from 26.8% to about 24.1%; its 2025 impairment
of $73M has no filed half-year amount and stays in. The tag list
is an owner decision (D-98). Impairments are assumed to sit inside operating
income, where US GAAP places them when an operating-income subtotal is shown.
Restructuring charges are not treated as one-offs.

**What the report itself discloses.** Two facts appeared only in the audit
export. First, all three Amazon passes ran on the ChatGPT plan with only the
supplied evidence and no web search. That was stated only in the export's
per-pass notes. The report header, run details and print header now carry an
Evidence line derived from the same execution entries. Second, the export marked
the $185,000 salary figure contradicted (a unit mismatch against its cited 8-K),
but the header said "0 contradicted", because it counted prose claims only. The
header and the Verification table now add cited figures the verification log
marks contradicted and name the split. The prose claims still come from the
coverage count, so a stored report without a log keeps its count. The live
report view shows both lines too.

### Deferred AMZN audit fixes (October 20, 2026)

The AMZN audit's remaining findings, recorded as D-99. Every rule is
class-wide; none names a ticker. Figures quoted for Amazon are from its stored
run inputs, replayed offline.

**Stock pay beyond all free cash flow (finding 8).** SBC/FCF is undefined
when free cash flow before SBC is zero or negative, so the balance sheet's only
scored SBC signal used to drop out and the aspect re-weighted without it.
Amazon's $19.3B of stock pay carried no weight. When FCF before SBC is not
positive and SBC is positive, stock pay exceeds all the free cash flow, so the
signal now scores at its band floor; the ratio stays blank and the note says
the score is the floor, not a measured ratio. It stays unscored when SBC is
unknown or a credit.

**A loss year in the ROIC floor (finding 9).** A year with non-positive
pre-tax income had no tax rate, so its ROIC was skipped. Amazon's 2022 pre-tax
loss came from a non-operating mark on its Rivian stake while operating income
was $12.2B, so the moat's "lowest annual ROIC" was 2023's 16.7% and its label
implied a complete window. Such a year's operating income is now taxed at the
D-58 marginal-rate floor (21% in the US, 15% where no statutory rate is
sourced), the same floor the DCF uses, and the year says so. A year with an
operating loss is still left out, and the floor's label names
any year inside its window that has no return. Amazon's 2022 ROIC is 6.9%. That
year also sits below the cost of capital, so the terminal excess-return rule,
which needs returns above it in the recent years, no longer grants one: the
terminal ROIC falls to the WACC, which lowers the fair value.

**Buyback timing (finding 15).** See "Growth, annual returns and capital
diagnostics" for the measure, the reworded label and the three-year recency
rule. Amazon's only priced repurchase year was 2022, so its timing is now
named as stale and not graded. The figure the payload dates is
the newest priced year, not the capital block's statement date.

**A reverse DCF with no root (finding 10).** See "FCFF arithmetic, sensitivity
and reverse valuation". Amazon's price was above the value at 60% year-one
growth, so the reverse signal now scores at the band floor instead of being
averaged as neutral. The thesis triggers point away from the base case ("above"
when the implied value is above the base path).

**Scenarios (finding 11).** See "Projections, scenario targets and
intrinsic-value display": a bull scenario's margin no longer moves against it.
Amazon's bull/base/bear on its stored inputs moves from $96.25 / $87.88 / $77.28
(bull margin −1.17pp) to growth-only scenarios.

**Consensus calendarization (finding 19).** See "Year-one revenue anchor
(D-58, D-60)": each fiscal-year estimate follows the issuer's own quarterly shape when
its last complete fiscal year supplies one. With the consensus the audit cited
injected (FY2026 $828.6B, FY2027 $949.3B), Amazon's year one is $874.7B rather
than the $917.2B an even spread gives.

**Net debt/EBITDA (finding 20b).** The leverage ratio now uses the enterprise
value's lease basis: under the house default it removes the operating-lease
liability exactly where EV does, so its net debt equals the DCF bridge's. It
removes nothing when total debt is not shown to hold the lease, and gives no
ratio when the lease-excluded basis is refused. Amazon's ratio is 0.14x rather
than 0.71x on lease-inclusive net debt.

**Segment rows (finding 13).** A revenue row is nested under another only when
the sum holds in every quarter where the parent and all its children are
tagged, and in at least two of them. In one quarter Amazon's online, third-party
and physical stores summed to its net service sales by coincidence, so product
sales were shown as parts of service sales. Members renamed between filings are
still not joined (D-63), so an annual-only member can leave a fourth-quarter
cell blank.

**Provider geography (audit 2026-10-27 AI-509, D-127).** FMP's annual
"geographic" rows are company geography only when the issuer's own XBRL in the
same run does not contradict them. They are withheld when a key names one of the
issuer's reportable business segments (segment revenue is not entity-wide
geographic revenue, ASC 280-10-55-21). They are also withheld when the issuer
tags its own geographic revenue (at least one row on its geographic axis; an
axis with no rows is no evidence) and a provider region name is not one of the
issuer's geographic labels (a single such name withholds the whole set); the
quarterly segment section then carries the issuer's geography under its own
labels. The withholding applies in the AI context, to the segment-share basis
(`applySegmentShares`) and to the data-only report alike. Otherwise they are shown as FMP's
normalised names, not checked against the filing, and the section is titled
"keys as each source names them", not "as-reported". The reason is a data gap in
the report (`validation.providerGeography`). SEC-parsed geography (D-80) is
unchanged.

Segment growth uses the same windows as the consolidated trend: quarter over
quarter only against the quarter ending 80-100 days earlier, year over year
only against the one ending 350-380 days earlier (a 14-week quarter and a
53-week year still count). With no such quarter the rate is withheld, in the
AI context and in the classic segment table, which shows a dash. The dated
segment revenue rows still show the latest quarter, the next older column in the
filing and the year-ago column (the one ending 350-380 days before the latest),
each labelled with its own quarter end. The next older column is not read as
"the prior quarter": a quarter-over-quarter rate uses only the column ending 80-100
days before the latest quarter, and is withheld when no column does.

**Wording (finding 20).** A failed Piotroski signal states what its figures did
("current ratio fell"), never the test it failed. The accrual scaler is labelled
"average NOA or total assets", because it falls back to total assets when net
operating assets are not positive. The remaining repurchase authorization is
also read from the 10-Q notes ("we have $X remaining under the repurchase
program"), under the same issuer, document and date checks as Item 2. Under an
officer the evidence gate did not assess, only cited facts appear, not judgments
for the withheld grade. The enterprise-value bridge is stated once beside the
multiples, which point to it, and names the lease setting as the house default
rather than an environment variable.

**Evidence for the passes (findings 6 and 16).** A notes family for remaining
performance obligations (backlog, contracted revenue not yet recognized) keeps
the amount and timing sentences first: Amazon's $496B and 6.4 years had been
dropped. The 25% reservation for pending cases also holds government cases
(an agency or attorney general as plaintiff), antitrust or monopolization
claims actually alleged, relief in the billions or structural relief beside a
legal proceeding, a regulator's fine, and a trial a legal proceeding has
scheduled (never a clinical or commercial trial). None of them holds a passage
that only states a risk the issuer may face ("regulators could bring
actions"); the check reads the words up to the matched claim, so a case that
goes on to a possible consequence keeps its place. The notes and risk readings carry the selection version
section-evidence-4. The FTC case against Amazon
now reaches the passes. Its 2027 trial date was in no filing the run had.

**Peers (finding 7).** The audit read the empty peer table as a screen that was
too strict. Replaying the run shows the screen excluded nobody it should have
kept: the vendor's rate limit stopped peer collection after one candidate, and
the provider's peer list holds no cloud company. The peer summary now counts
candidates the provider never served (any refusal the peer loader treats as
terminal), and those past the house's own candidate limit, separately from
those the screen excluded, and leaves out the subject itself. Segment-aware peers would need a peer source
per segment; none is fabricated.

**Verdict stance (finding 18).** The judge's executive summary now opens with a
stance: whether the price looks undemanding, about right or demanding on the
evidence, and which evidence decides it. It is a valuation judgment, not a
rating. When the consensus price target, the model's value and the price share a
currency, the analyst-estimates section states each value's implied move and
their gap in points of the price. Beyond 20 points (a project convention) the
summary must reconcile them. For Amazon the gap was about 92 points.

### Audit batch 1: headline numbers (October 22, 2026)

The independent audit of 2026-10-22 found reports publishing wrong headline
figures with no warning. This batch fixes them. Decision: D-100.

**Outlook ranges and full-year periods (B-25).** Meta prints its outlook as
"$73-76 billion" and "between 15-17%". The release reader took the scale word
only when it directly followed a number, so it read $73, and it read the range
hyphen as a minus sign, so it read −17%. Each was stored as a point. A money
range now gives the scale printed after its high end to both ends, and a bare
high end takes the low end's currency symbol ("$73-76 billion", "$58–$61
billion", "between $58 and $61 billion"). In a percent range the high end's %
covers the low end, and a hyphen that follows a number or % is never a sign. A
stated range with only one readable end is left unread rather than published as
a point, but a span of years ("from 2027 to 2028") is not a range of values,
nor is a range of the other kind ("up 2-3%" beside a money guide). An amount
the guide is compared with ("an increase from our prior outlook of 13-16%",
"versus $3.00 in 2025", "vs. $4.5 billion") is not read as the guide, and a
year after "over", "above", "below" or "than" is a comparison, not the
outlook's period. An
outlook that names its year without "full year" ("2026 capital expenditures",
"Adjusted EPS of $2.25 to $2.35 in 2026") guides that fiscal year, and
"full-year revenue guidance" with no year guides the outlook block's fiscal
year. Before, both took the block's quarter, so annual guides from Meta, Lilly,
NextEra, AT&T and Verizon were labelled as quarters. A sentence about a quarter
or part of a year ("remaining quarters of 2026") keeps the block's quarter,
but a quarter named only as the base of a comparison ("compared with fourth
quarter 2025 revenue of $1 billion") neither makes the sentence quarterly nor
names its year. A maturity's year ("notes due 2030") names no outlook, and when the block's
period is known only its fiscal year or the next can be the outlook's ("the
2024 divestiture" in a 2026 release is not).

As a backstop, a revenue outlook must lie within 0.2 to 5 times the revenue of
the latest quarter its release could see (four such quarters for a full-year
outlook). Outside that band the guide is left out of the DCF's year-one anchor,
the outlook table and the checks against actuals, and a note names the guide
and the quarter it was compared with. The anchor then takes the next
plausible guide for the same quarter, never one for a later quarter. A guide
printed in another currency is reported as such before the band is applied. The band is a house convention: no
issuer guides a quarter at a fifth or five times its last one, and a lost
"billion" misses by a factor of a billion.

**Depositary-share market cap (B-19).** Without an FMP key, the market cap is
the quoted price times the share count on the filing cover. For TSM that is the
price of one American depositary share times 25.93 billion ordinary shares,
while one ADS is five shares, so the report printed $11.2 trillion. The issuer
was not even flagged as an ADR: the flag came from the statements builder,
which builds nothing from a filer that reports under IFRS. The flag now falls
back to the filed forms (20-F or 40-F) whenever no statement row could be
built, not only when there are no company facts at all. For an issuer that
files Form 20-F, the keyless market cap, quote market cap and market-cap
history (including days derived beside a plan-limited vendor history) are
withheld with a gap that says why: no filed fact read here states how many
ordinary shares one quoted share represents. A Form 40-F filer is a Canadian
issuer whose listed security is its common share, so its market cap stands. A
20-F filer that lists its ordinary shares directly loses the keyless figure
too, because the filed facts read here do not say which security is quoted.
Métis does not guess a depositary ratio or apply a static ratio table. A market cap Métis computed from a
quote and a filed count is now labelled "derived" in Key data and the market
data table, with the note "quote price × filed share count, computed by
Métis", instead of "raw provider observation".

ADR disclosures describe the path that runs: dividend yield is gross of foreign
withholding tax and depositary pass-through fees, with no withholding rate
applied. A currency annotation names the statement and quote currencies only
when both are known and different; it says price comparisons are withheld and
no depositary ratio or FX rate is applied. Unknown or minor-unit currencies
retain their existing valuation gaps without an invented currency mismatch.

**Noncurrent notes and loans (B-14).** Oracle tags its noncurrent debt as
`LongTermNotesAndLoans` and its current notes as `NotesPayableCurrent`. No
long-term-debt chain read the first tag, so the instrument-class fallback
composed long-term debt from the current notes alone: $7.6B where Oracle
carried $125.3B. Long-term debt now reads `LongTermNotesAndLoans` with its
current portion (`NotesAndLoansPayableCurrent` or `NotesPayableCurrent`) after
the long-term-debt aggregates and before the combined debt total. Beside the
balance sheet's current-debt line, which already carries the current notes,
the current portion is dropped from long-term debt, so Oracle's May 2026 debt
is $7.2B current plus $122.3B noncurrent, the $129.5B Oracle tags as its
combined debt. As a backstop, a same-period debt total the filer tagged
(`LongTermDebtNoncurrent`, `LongTermNotesAndLoans`, `LongTermDebt`,
`LongTermDebtAndCapitalLeaseObligations`, the inclusive total below, or
`DebtLongtermAndShorttermCombinedAmount`) can never exceed the composed
current debt, noncurrent debt and finance leases by more than 1%. When one
does, a component no chain read is missing, so total and net debt are
withheld with a note naming the total rather than published as a partial sum.
The guard runs in the statements builder and again in Stage B's debt admission,
the only debt gate a vendor statement row passes, so a vendor row whose
components fall short of the filer's same-period total is withheld the same
way.

**Long-term debt including current maturities (B-15, B-17).** Chevron tags
its long-term debt and finance leases, current maturities included, as
`LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities`. No chain
read it, so Chevron's quarterly debt was its short-term borrowings alone
($0.4B where Chevron carried $37.1B). The tag is now the last long-term-debt
aggregate. Because it holds finance leases, only the operating-lease liability
is added beside it, as for `LongTermDebtAndCapitalLeaseObligations`. Because
it holds current maturities, it is netted against a current-maturities line
the same way as `LongTermDebt`; when that line cannot be separated from it,
long-term debt is withheld. In its annual report Chevron files current debt
of $10.9B before reclassifying $10B of it to long-term, beside long-term debt
that already includes the reclassified amount, so the year-end debt counted
the $10B twice ($50.7B of financing debt against $40.8B). When the inclusive
total is filed for a period whose debt was composed from other tags, it is the
filer's own reconciliation: a composition more than 1% away from the
inclusive total plus short-term borrowings is recomposed as the short-term
borrowings plus the inclusive total, with a note. With no short-term
borrowings tagged, a composition above the inclusive total is withheld.

**Debt plausibility against the published balance (B-16).** The interest
check divided the year's interest by the largest debt resolved at any balance
date of the year. One complete balance therefore cleared every later row:
Chevron's June 2026 quarter published $0.4B of debt beside $56.7B at the
previous year-end, and the check saw 2.4% where the published balance implied
over 100%. The basis is now the average of the year's balances, opening to
closing. A collapse check sits beside it: debt that fell by more than 60%
from the previous balance date, to a closing balance on which the year's
interest implies more than 25%, is withheld with a gap unless the period's
cash flow shows net debt repayment of at least half the fall. When the net
issuance is not disclosed because the filer tags its repayments
(`RepaymentsOfLongTermDebt`) but no issuance, the repayments alone are the
evidence: they show at least that much debt leaving, and an undisclosed
issuance could only add some back. Both thresholds are house conventions. A
borrowing repaid during the year with the cash flow to show it still passes,
and so does a closing balance that carries the interest on its own.

**An inclusive total whose split is refused (B-40).** Prologis files an
unclassified balance sheet: `LongTermDebt` is all of its carrying debt,
current maturities included. When the debt-maturity schedule's
next-twelve-months bucket sits beside a remainder-of-fiscal-year bucket, the
bucket is not established as current carrying debt, so short-term debt and
the noncurrent remainder are withheld. Total debt was withheld with them,
although it never depended on the split: 13 Prologis quarters lost total and
net debt. When `LongTermDebt` is the only long-term tag and the refused
bucket was the only current component, total debt is now `LongTermDebt` plus
leases, with a note that only the split is withheld. The statements builder
and Stage B's debt admission apply the same rule. Short-term borrowings beside
the refused bucket still withhold the total, because the bucket's share of
them is unknown, and so does a debt component refused for any reason other
than the split itself.

**A zero remainder-of-year bucket (A-10).** Meta's June 2026 10-Q tags the
remainder of its fiscal year at zero and $2.75B "in next twelve months",
which is the next fiscal year's bucket. Only a remainder above zero refused
the bucket, so it stood in as current debt that Meta's balance sheet does not
carry, and total debt counted $2.75B twice. Any tagged remainder-of-year
bucket, zero included, now shows the schedule runs by fiscal year, and the
next-twelve-months figure beside it is refused as current debt. Before that
test, when the balance sheet's own `LongTermDebt` equals its
`LongTermDebtNoncurrent`, the balance sheet carries no current maturities,
so the bucket is declined. With no other current component, short-term debt
is that zero, sourced to both tags.

**The composite's evidence floor and the neutral band (F-19).** Each aspect
already withheld its letter below evidence for half its signal weight, but
the composite did not. TSM's composite printed "D (51/100)" on evidence for
5% of the route-applicable signal weight, its one scored aspect a technicals
B. The composite now carries the same floor. Below evidence for 50% of the
route-applicable signal weight it prints "Not graded: evidence N%" with the
numeric score and no letter: in Key data, the scorecard, the history diff,
both exports and the judge's payload, whose composite grade reads "Not
graded: evidence N%". The audit export keeps the stored band as its raw
field. Key data also prints the evidence share and the band thresholds beside
the composite. The score itself and its calculation are
unchanged. A second problem was the band table. It puts the neutral prior
(50) in D, so a technicals score of 50.4 printed as D and the judge read it
as weak momentum. A deterministic band letter for a score that rounds to 45
through 55 (the whole number every surface prints) now carries a "neutral"
qualifier ("D (neutral)", "C (neutral)") wherever it is shown, including the
history diff, the audit tables and the data-only reasoning, and the payload's
score units and band note say the same. An analyst letter that differs from the band is not qualified. The
letters and thresholds themselves (A ≥85, B ≥70, C ≥55, D ≥40) are unchanged
house conventions. The band is set on the unrounded score, so a printed score
never rounds up across a threshold: where rounding would carry it across
(54.6 printed "55" beside D and the legend "C ≥55"), it is cut, not rounded,
to one more decimal ("54.6", and "54.99" where two decimals are shown). Every
surface that prints a score beside its band uses this rule; the judge's
payload already printed the unrounded score. No score or band changes.

### Security audit fixes (October 22, 2026)

Recorded as D-101. These change what the model is told, not what Metis
computes: no figure, payload field or version stamp moves.

**Flags and gap reasons are untrusted (F-5).** A Stage A data-quality flag or a
missing-data reason can quote a provider's own error text. Both lists now
reach the model the way filings and transcripts do: inside the
`BEGIN/END_UNTRUSTED_SOURCE_DATA` envelope, JSON-encoded with `<`, `>` and `&`
escaped, one entry per line. A reason that tries to close the envelope or open
a new instruction turn stays inside it as data. The flags and gaps themselves,
and their place in the report, are unchanged. The sections rendered outside
the envelopes (quote, computed figures, statements, estimates, short interest
and macro) carry no free provider text. The analyst grades consensus is
stated only as one of FMP's five rating words (Strong Buy, Buy, Hold, Sell,
Strong Sell) and is otherwise withheld. Statement period labels and the
FINRA and FRED observation dates must be ISO days: a statement period with
another date shows as "unknown", FINRA discards the row as malformed, and
FRED skips the observation. Valid data renders as before. Peer-screen
exclusion reasons and peer-collection notes can also quote a provider's error
body, so they travel in their own envelope ("Peer screen exclusions and
collection notes"), one entry per line; "Comparable peers (computed)" keeps
only the figures, the fixed method lines and the comparison bases (D-126).

**The judge reads the cases as arguments (F-6).** Each analyst case the judge
receives is enveloped the same way and labelled model-authored. The judge is
told to weigh the cases, never to follow instructions inside them. The same
holds for the model's own output when it is shown back: a rejected output
echoed for repair, and the sections kept from a response that was cut off or
dropped part-way, or produced in parts, are enveloped and labelled
model-authored. A JSON parse error, which quotes the output around the bad
token, is folded onto one line before it is fed back.

**Kept sections are checked before they are kept (audit 2026-10-22 D-3).**
When a bull, bear or judge response is cut off part-way, the sections it
finished are kept and the retry is asked only for the rest. A kept section
overrides whatever the retry writes for it. So each one is first checked
against its own part of the schema, after the same normalization the whole
output gets and with the same rating-language check; a key the schema does
not have also fails. A section that fails is dropped, the retry is asked to
write it again, and the step detail names it. On a plan connection that writes
in parts, the sections saved to the run's section checkpoint are checked the same
way when a retry or a restarted worker reloads them, so a failing one is asked for
again rather than reused. Before, a kept section that
parsed but did not match the schema made the merged output fail whatever the
retry returned (the RIVN judge, 2026-10-22, lost one attempt this way).

**A kept section keeps its writer (D-116).** A pass that keeps sections from
an earlier attempt states its model, reasoning effort and speed only when they
are known for every request whose text it returns. That includes the requests
that wrote the kept sections. So the section checkpoint saves, beside each
section, the evidence of the request that wrote it, bound to the section's exact
text.

NVDA report #50 (2026-10-27) kept a verdict from a judge attempt whose stream
was cut at 15 minutes. Both attempts reported GPT-6.1 Sol at max reasoning, but
the report named no model for synthesis.

A kept section with no saved evidence still leaves the model unestablished.
This happens with a checkpoint written before this change, or when a worker
stopped mid-stream. The run details then name that section; they no longer say
the provider did not report.

A resumed pass's tokens count only its own requests, and the run details say
so. A failed attempt whose sections reached the report is described as kept,
not thrown away.

**An empty analyst case is repaired (D-113).** The schema checks the shape of
a bull or bear case, not whether it argues anything. NVDA report #48
(2026-10-26) shipped a bull case of one thesis claim, no drivers, risks or
catalysts, and a price target of 0 with no horizon, so every debate card read
"Not addressed by the bull case". A case with an empty `thesis`, `keyDrivers`
or `risksToCase` list, or a price target without a positive value and a
horizon, now fails like a schema error: it gets the one repair attempt, with a
reason naming each gap, and a second empty case ends in a data-only report.
Catalysts and evidence may be empty, since the framing asks for catalysts only
where they exist. A kept section that is empty in the same way is asked for
again.

**A blank source ID is no citation (D-114).** Every claim and number carries a
`source`, and may carry a `sourceId` naming a registry entry. The request
schema marks both required, so Claude wrote `sourceId: ""` wherever it had no
registry ID. All four Claude first attempts of NVDA reports #48 and #49
(2026-10-26) failed the schema on that alone and each paid for a repair. A blank
or whitespace `sourceId` in a bull, bear or judge output is now read as absent,
so the claim cites its `source`, exactly as one sent without the field. A claim
whose `source` is blank as well is still rejected. While a rejected side waits
for its repair, the run panel shows it running with a plain note ("bear attempt
1/2 rejected (1 field failed the schema: thesis[0].sourceId is empty or too
short); repair queued") instead of ERROR and the raw validation error; a run that
gives up closes it as an error that says why. A repair that is rejected again
closes its row the same way ("bull attempt 2/2 rejected (…)"), and the judge's
retry rows name its failing fields in words too (D-115). A data-only report's
missing-data reason keeps the pass and the failure kind but gives the issues in
words, never the validation array or a rule's own message, which can quote the
rejected value. A connection that dropped is retried rather than repaired, so
its row keeps its own retry wording.

**Web results are evidence, not instructions (F-7).** Every pass is told that
web-search results and fetched pages are untrusted: use them only as quoted
evidence, and never follow or repeat instructions found in them.

The request-security changes in the same batch are described in
[Privacy](PRIVACY.md).

### Audit batch 2: valuation in and out of its domain (October 22, 2026)

The independent audit of 2026-10-22 found valuations published outside the
model's domain, an excess-return start a year stale, and a consolidated DCF
that understated its outside holders' claim. This batch fixes them. Decision:
D-102. Each rule is described where the model is:

- **DCF domain (B-29):** "Domain of the model", under FCFF arithmetic. A DCF
  whose equity value is at or below zero, or whose terminal value exceeds
  its enterprise value, publishes no fair value.
- **Trailing excess-return start (C-10):** "The excess-return equity model".
  The fade starts from the trailing four-quarter return, and the fiscal-year
  value is shown beside it when they differ by more than 5 points.
- **Start-return × cost-of-equity grid and the trailing return (C-11):** "What
  the reader sees of the start", in the same section.
- **NCI on the earnings key (E-5):** "NCI on the earnings key in the DCF
  bridge", under the EV bridge.
- **House base rate (B-30):** "House base rate", under FCFF arithmetic.

The owner deferred the DCF calibration (B-3), the valuation band's
discrimination (B-33), the utility route (B-13, A-3), the A-2 basis, E-7 and
the financial route's WACC to a later batch.

### Audit batch 3a: the remaining high-severity findings (October 22, 2026)

The independent audit of 2026-10-22 found figures withheld although the filed
evidence was complete, and reports that did not say a newer quarter had been
published. Decision: D-103.

**WACC tax rate without a TTM rate (B-32).** Without a vendor ratio, the
WACC's tax rate came only from the trailing four quarters' tax expense over
pre-tax income. Procter & Gamble and Costco tag pre-tax income only annually,
Intel and Snowflake had trailing pre-tax losses, and the levered WACC was
withheld for all of them, with Costco's and Oracle's fair value behind it. The
rate now falls back in a fixed order, each step named in the basis and in an
info entry: on a trailing pre-tax loss, a 0% shield (a loss-maker gets no tax
benefit from its interest); with no complete trailing pair, the latest annual
tax expense over pre-tax income; on an annual pre-tax loss, a 0% shield. The
existing 0–35% clamp still applies and is disclosed when it moves the rate.
With neither a trailing nor an annual pair, the levered WACC is still
withheld. Oracle tags no pre-tax total, only its domestic and foreign
components, so on the SEC path pre-tax income is now their sum when no total
is tagged, with the composition disclosed. The derived EBIT's pre-tax operand
reads the same composition (audit 2026-10-27 FIN-507-V1).

**Principal beside carrying debt (B-5).** When the current and noncurrent
debt lines do not both resolve, the debt check compares the filed debt aggregate
(`DebtInstrumentCarryingAmount`, which many filers tag at principal) with the
carrying components. It allowed one part per million, so Meta's 2024 notes
($29.000B principal against $28.826B carrying, the gap being the tagged
unamortized discount) and McDonald's June 2026 balance (0.09%) lost total
debt, net debt and everything built on them. An aggregate above the
components by up to 2% of the financing debt (current plus noncurrent, leases
excluded), or 50 million in the reporting currency, whichever is larger, is
now read as unamortized discount and issuance cost and the components are
admitted. A discount is part of the notes it discounts, so the 50 million
floor reaches at most 10% of the financing debt, and with no financing debt
(leases alone) only the old rounding allowance applies. Beyond that band total
and net debt are still withheld, with a gap naming both figures. A tagged carrying total
(`LongTermDebt` and the other aggregates of the B-14 check) stays at 1%: it is
on the components' own basis, so only rounding can separate them. The band is
a house convention.

**Vendor figure against the filed figure (A-11).** Wherever EDGAR confirms the
issuer, a statement figure the bundle holds (a provider's on the provider path;
on the keyless route, the SEC-built row's own) is checked against the filed SEC
figure for the same period: revenue, cost of revenue, gross profit and
operating expenses; cash, cash-flow totals, operating cash flow and short-term
investment flows; lease liabilities; debt lines against the same filing; and temporary-equity
operands, including the recheck of operating cash flow against a filed
cash-investment period. The check allowed one part in ten billion, so Meta's December 2025
quarter (vendor revenue $59,894M, filed $59,893M) was refused as a conflict,
the quarter's revenue was nulled and the trailing basis fell back to the
annual statement. The two figures now agree when they differ by no more than
one reporting unit (the largest power of ten up to a million dividing both;
companyfacts carries no decimals attribute) or 0.01% of the larger figure,
whichever is wider. The reporting-unit allowance applies only when the larger
figure is at least 100 units, so it is never more than 1% of it: 2 million
against 1 million is a conflict, not rounding. A difference beyond that is
still a conflict, refused as before. A zero against a nonzero figure gets no
reporting-unit allowance. The same tolerance decides whether the vendor's
noncurrent debt covers a filed noncurrent convertible carrying amount (vendor
$3,687.7M against a filed $3,687.832M is covered; before, total and net debt
were withheld); two filed figures are still compared near-exactly. The
tolerance is a house convention. It is far narrower than the debt band above
because it judges two statements of one figure, not a principal amount beside
a carrying amount.

In the SEC enrichment of the bundle's cash-flow and lease rows
(`src/edgar/financialEnrichment.ts`), a quarterly flow that no three-month copy
states (operating cash flow, buybacks, the investing and financing totals, the
cash movement, the short-term investment flows, a finance-lease principal) is
derived on the SEC side as the fiscal year or year to date less the prior year
to date, and the pair is chosen by the statement builder's one-presentation
helper ("Derived quarters on one presentation (audit 2026-10-27 FIN-511)"
below; audit 2026-10-27 FIN-511-V2). Before, the newest year was netted against
the nine months filed before it: a year a later 10-K re-presented, netted
against nine months on the old basis, refused a vendor's one-basis operating
cash flow (and nulled free cash flow) against a figure no filing reported, and
the same mixed figure was written into a missing vendor finance-lease
principal. A pair the helper withholds (two presentations, or a copy that a
material re-filing labelling no re-presentation superseded) is no SEC value:
nothing is compared, so no conflict is raised, and nothing is filled. A vendor
figure left unverified that way is disclosed in one info entry per field that
lists its dates ("vendor operatingCashFlow kept unverified for 2024-12-31,
2023-12-31: the filing's year and year-to-date figures sit on different
presentations, so no one-presentation SEC value exists to check it against");
a field the vendor left empty gets no entry. A year
re-filed within 1%, or labelled with a discontinued-operations line, while its
year to date was not re-filed with it, is compared or filled on the
first-reported pair; an amendment, a year whose year to date moved with it, and
a copy that only re-rounds keep the as-filed pair (the bullets of "Derived
quarters on one presentation" give every case).

A vendor figure against a derived SEC value agrees within the larger of the
tolerance above and the operands' rounding allowance, the latter capped at 1%
of the larger figure. The rounding allowance is the sum, over the filed copies
the compared figure nets (two, or four for short-term sales plus maturities),
of half each copy's rounding unit: the largest power of ten up to a million
that divides it exactly, 1 for a zero (a zero never widens it) and none for a
figure with a fraction. Before the cap it reaches 1 million on a two-operand
line whose operands are whole millions, and 2 million on sales plus
maturities. The cap is A-11's own bound above, so for a derived value too 2
million against 1 million is a conflict, a zero against a nonzero figure is a
conflict, and so is a sign change: each gap is more than 1% of the larger
figure, and A-11 alone already refuses it. A figure the filing states only to
the million is itself uncertain by half a million, so a difference within the
operands' stated precision is not a disagreement. AEP's FY2024 operating cash
flow, re-rounded from 6,804.3 to 6,804.0 million in the next 10-K, less nine
months of 5,076.9 million gives a fourth quarter of 1,727.1 million, the
quarter the statement builder publishes; a vendor 1,727.4 million is within its
0.55 million (0.5 + 0.05; the cap is 17.27 million) and is kept, and 1,728.0
million is a conflict. A directly filed figure keeps the tolerance above
alone. (Controller ruling of 2026-10-29, revising A-11 for derived values;
D-134.) The rule applies to the enrichment's cash-flow and lease comparisons
above only. The income-classification check (revenue, cost of revenue, gross profit and
operating expenses, `src/edgar/incomeClassification.ts`) still compares a
vendor figure with the statement builder's quarter, a derived fourth quarter
included, under A-11 alone, and its reason says "filed": after a re-rounding
like AEP's, a vendor fourth-quarter revenue on the first-reported pair can
still be refused by a few tenths of a million (a recorded residual of audit
2026-10-27 FIN-511-V2). The conflict reasons of the enrichment's checks
(operating cash flow; buybacks, the investing and financing totals and the
cash movement; the short-term investment buckets; a finance-lease principal)
and the enrichment note of a filled field call a derived value derived, with
its period and its two filings
("derived 100M USD for 2024-10-01 through 2024-12-31 (fiscal year or year to
date less the prior year to date, from the 10-K of 2025-02-12 (accession) and
the 10-Q of 2024-11-01 (accession))"; the reasons print the amounts in
millions, the note prints none). A first-reported pair reads "(the
first-reported fiscal year or year to date less the prior year to date, from
the ... and the ...; re-filed later in the 10-K of ...)". None says "filed"
or an "exact quarter period". A directly filed figure keeps its "filed" or
"exact" wording, with its amounts also in millions (the lease-liability and
principal conflict reads "vendor/SEC conflict for <field> at <date>: <vendor>
versus <filed> <currency>", both in millions). Where a reason sets a vendor
amount beside the SEC amount and the two would read alike in millions while
they differ, both print in full with grouped digits ("1,000,237 versus
1,000,000 USD").

**D&A from separate lines (B-7).** On the SEC path, depreciation and
amortization came only from a combined tag (`DepreciationDepletionAndAmortization`,
`DepreciationAndAmortization`, `DepreciationAmortizationAndAccretionNet`).
Microsoft, Alphabet, Oracle, Intel and Tesla tag none of them in recent
periods, so they had no D&A and no EBITDA, and EV/EBITDA, net debt/EBITDA and
the capex split were withheld. When no combined tag is filed for a period, D&A
is now the filer's `Depreciation` + `AmortizationOfIntangibleAssets`; when no
amortization is tagged for the period either, it is `Depreciation` alone.
A combined tag is the D&A only when it is not below the same period's
`Depreciation` or `AmortizationOfIntangibleAssets` (and, for
`DepreciationDepletionAndAmortization` only, not below the same period's
`DepreciationAndAmortization`: McDonald's quarterly $111M beside $565M). A floor
applies only when its component is filed for the same period; a component filed
for another period is not compared. The rounding allowance is
the larger of 0.5% of the component and 2 million in the row's currency
(a house constant). Total D&A contains total depreciation and the
amortization of intangibles, so a combined tag below either is a subset line
(McDonald's `DepreciationDepletionAndAmortization` of $457M beside its own
`Depreciation` of $1,600M). us-gaap defines `Depreciation` as including
production and non-production depreciation, while `DepreciationAndAmortization`
is defined as the non-production charge. A combined tag below a component is
skipped, with a note, and the next combined tag is tried, then the composition
below. With no combined tag that passes and no `Depreciation` filed (Cisco's
FY2026: $700M combined beside $916M of amortization), D&A is withheld with the
reason, never published as a figure known to be partial. A non-production
`DepreciationAndAmortization` at or above `Depreciation` cannot be told from a
total in companyfacts and is kept. The same rule applies to R&D:
`ResearchAndDevelopmentExpense` below the same period's
`ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost` is not the total,
because the first includes acquired in-process R&D and software and the second
excludes them (audit 2026-10-27 FIN-510 and FIN-510-V1, D-134).
Either is a stand-in for the period and is disclosed as a lower bound,
because a combined cash-flow line can hold other amortization: Microsoft's
"depreciation, amortization, and other" is larger than the two tagged lines.
EBITDA built on it is understated by that amount, so EV/EBITDA leans high.
Amortization alone is never taken as D&A. Within one trailing year, quarters
can mix the two compositions (Alphabet tags amortization in some quarters
only); each quarter's composition is disclosed.

**Market cap across share classes (B-8).** An issuer with more than one
common class needs every class's outstanding count and its economic relation
to the quoted class before Métis states a market cap. Covers that tag each
class's count with a class member (Meta, Berkshire Hathaway, Mastercard,
Comcast, Visa) were outside the two cover layouts Métis read, so their market
cap, P/E, EV/EBITDA, P/B and the WACC weights were withheld. Such a cover now
establishes the scope when all of the following hold: each class's count is
tagged at one date; the trading symbol is bound to one of those classes (by
the class on its context, or the single class its registered title names); and
the filing's own text states every class's economic relation in a sentence
Métis reads. Two forms are read: identical liquidation and dividend rights
(Meta: "The holders of our Class A and Class B common stock ... have identical
liquidation and dividend rights but different voting rights."), and a stated
fraction (Berkshire: Class B has dividend and distribution rights equal to
1/1,500 of Class A's). Market cap is then the sum over classes of the count x
the class's economic units per quoted share x the quoted class's price; a
Berkshire Class A share counts as 1,500 Class B shares. This is an
approximation, named in the basis, because a class with its own quote is not
valued at that quote. The scope is still withheld when a class has no stated
relation (Mastercard, Comcast, Visa state none Métis reads), when a sentence
says the classes differ in dividends, distributions or liquidation, when such
a sentence states a relative entitlement Métis does not read (a percent, a
multiple such as "twice", a fraction such as "one-half" or a priority, such as "Class B is entitled to 110% of
the dividends paid on Class A"), when a relation names a class with no tagged
count, or when the relations conflict. A sentence reporting the dividends each
class was paid states no relation and is not a reason to withhold.
When the classes carry different weights, a filed diluted EPS is per share of
a class the facts do not identify (Berkshire reports per Class A equivalent),
so P/E is market cap over common income rather than price over EPS, with an
info entry. Per-share intrinsic value still needs a diluted share count on the
same basis and stays withheld (B-37, left for a later batch). When the scope
stays unresolved because the issuer has more than one common class, the Key
data table shows issuer-common capitalization as withheld instead of the
quote's market cap, which can cover one class only, and the market data table
labels that figure as possibly covering one share class only. Only class
evidence in force on the price day counts: an inventory that ended before it
says nothing about the classes now. A scope unresolved for another reason (an ADR without its ratio evidence, a vendor
cap on the quoted security) names no share class and keeps the provider
market cap, labelled scope unverified.

**Newer results than the statements (B-24).** Statements come from XBRL
filings, so in the weeks between a quarter's results 8-K and its 10-Q the
report's statements, TTM and multiples end a quarter earlier than what the
company has already published. Reports said nothing about it. A results
release now raises a notice when it was filed after the newest statement
period ended and reports a later period: its stated quarter end is more than
45 days after the newest statement date, or, when it states no end date, its
fiscal quarter label is later than the newest statement row's (a full year
counts as the fourth quarter). The stated end is the latest "quarter ended"
date in the opening text, since a year-ago comparison can come first; an end
exactly four quarters before the quarter the fiscal label implies is that
comparison, so the label decides and the notice names no end. The notice
cites the exhibit that states the results (the release, else the commentary).
The notice reads, for example: "Results for Q3
FY2026 (quarter ended 2026-09-30) were published in 8-K <accession> on
2026-10-13; statements, TTM and multiples here end 2026-06-30 and do not
reflect them." It appears as a banner in the web view and both exports and as
a warn entry in the data gaps. Only a release that states results counts: an
amount for net income, earnings, EPS, diluted earnings per share or operating
income in its opening text, outside a sentence giving an outlook or a
dividend, whether the outlook word comes before the amount or right after it
("Diluted EPS of $3.10 is expected", or projected, forecasted, anticipated,
targeted or guided, states none; nor does a sentence raising, reaffirming or
reiterating a range). A headline list printed
without full stops is not one sentence, so only the 60 characters after an
amount are read for it. A deliveries or operational update filed under the same 8-K item
does not. The release's headline revenue and diluted EPS are shown in the Key
data table, labelled "unaudited, from the results release", only when every
statement of each in its opening text gives the same amount (two different
amounts for one figure yield none). Revenue is read only where it opens its
sentence, as revenue or total, net or consolidated revenue after at most the
issuer and the quarter, so a segment's revenue is never taken for the total. A
figure in a sentence that names "adjusted", "non-GAAP", "core",
"underlying", "managed", "excluding" or "pro forma" anywhere, or right after
"operating", is not read; nor is one in a sentence giving an outlook ("Third
quarter revenue of $1.4 billion is expected") or one that states a loss (a loss
per share is printed without its sign) or a full-year, year-to-date or annual
amount, which would sit under the quarter's label. Their currency must also be established: "US$", or "$" while the statements report in US dollars. They
never enter a statement, the TTM or a valuation. To date such releases, a
title that names its quarter only in compact form ("3Q26", "Q3 2026 Update")
is now read when the release has no ordinal title for the quarter it reports
(an ordinal phrase heading guidance, "Third Quarter 2026 Guidance", is not
one) and no "quarter ended" sentence; a compact label heading an outlook, or after a comparison word, is
skipped. A hyphenated ordinal title ("Lilly reports second-quarter 2026
financial results") is read as the title too; before, it was missed and a
later quarter named in the text ("submit ... in the first quarter of 2027")
dated the release, which would have raised a false notice. This is only the part of B-26 (release dating and ordering) that the
notice needs; ordering releases that state no period is left for a later
batch.

**8-K event excerpts (D-124).** An Item's operative passages keep its dated lead, the parties it names and its amounts, and an award of shares ("for 4,912 shares") ranks with the dollar amounts. Only for 8-K event excerpts, a selected passage that begins with an honorific and surname ("Ms. Testcase’s annual salary is ...") is added together with the nearest earlier passage that names that surname in full, and a passage that begins with a third-person pronoun (optionally after an introductory "In 2026," phrase) is added together with the passage immediately before it, whatever that passage says. This repeats for up to three referent hops, stopping at a passage already kept or one the chain already holds (a cycle); when an honorific has no earlier full name, the passage is kept alone. The chain is all or nothing: if it does not fit the remaining budget, none of it is added. A continuation passage that already keeps its previous passage (funding, marketing or backlog context) keeps that one passage instead of a chain. Coverage version `section-evidence-5/event`; the business, financial and interim readings keep `section-evidence-2`.

**A newer 10-Q's update of a 10-K operating figure (C-16).** The 10-Q MD&A
reaches the analysis passes as a 12,000-character selection read for
financial families. Southern Co.'s 10-K excerpt stated large-load contracts of
"approximately nine GWs"; its newer 10-Q stated about 16 gigawatts 70% of the
way into a 172,377-character MD&A, the selection dropped it, and the passes
argued from the superseded figure. When the 10-Q's period ends after the 10-K
excerpts' (Item 1 and Item 7 as selected for the payload), the operating
measures those excerpts state with a count are now read: gigawatts and
megawatts of capacity (not megawatt-hours), backlog (with a dollar amount),
customers, subscribers or paid members, and physical units (not goodwill
reporting units, operating, geographic, reportable or organizational units,
units of account or stock, performance and partnership units). A count ends in a digit or is a number word; a bare year ("in 2025
customers") is not one. The 10-Q passages stating a count of the same measure
are kept first, one per measure in turn and in source order, within 15% of
the same 12,000-character budget, displacing lower-ranked text; the budget
does not grow. The excerpt's title then names the measures whose passages
that step kept (none when the whole 10-Q text fits the budget), for
example "[kept first: passages updating the 10-K's figures for gigawatts,
megawatts]". The 10-Q passage is selected, not compared: Métis does not judge
whether the newer figure supersedes the older one, and the passes see both
with their filings and dates.

**An older 10-Q (audit 2026-10-27 AI-507, D-124).** Between an issuer's 10-K and its next 10-Q, the newest 10-Q reports an earlier period than the 10-K. The 10-Q MD&A, notes and Item 5 (other information) excerpts are then titled "[older than the 10-K for the period ended <date>]" (the Item 4 controls and signatures excerpts carry no such marker), and the analysis rules prefer whichever notes excerpt reports the later period, not the 10-Q by default. The marker compares reporting periods, never filing dates, and an equal period end is not older. The 10-K's own Item 9B is not read, so the 10-Q's Item 5 stays the dated source for trading arrangements.

**A release's fiscal label (audit 2026-10-27 AI-512, D-124).** An excerpt title takes a quarter's fiscal label from the earnings release only where the run's own income-statement rows support it. (1) If a labelled annual or quarterly income row ends within three days of the release's quarter end, the label is kept unless that row gives another fiscal year or, for a quarter label, another quarter; an annual row's FY2025 agrees with Q4 FY2025 only, and contradicts any Q1 to Q3 label, because an annual period ending at the quarter end makes that quarter the fiscal fourth. (2) If no labelled row lies within three days but labelled quarterly rows exist, as on earnings day when the release is newer than every statement row, the label is kept only when the quarter end falls 80 to 100 days after the newest labelled quarterly row's period end and the label is that row's successor quarter (Q1 to Q2 to Q3 to Q4 to Q1 of the next fiscal year). A release more than 100 days later, or older than that row, is withheld. (3) If no quarterly income row carries a fiscal label but a labelled annual income row exists, the label is kept only when its fiscal year is that newest labelled annual row's fiscal year plus one (a quarter ending after a fiscal year's end belongs to the next fiscal year) and its quarter number n fits the days between that row's period end and the quarter end, which must be 91n-11 to 91n+9 inclusive and at most 366 (Q1 80 to 100, Q2 171 to 191, Q3 262 to 282, Q4 353 to 366); otherwise it is withheld. (4) Only a bundle with no labelled income row (an annual row with an FY label or a quarterly row with a Q label) leaves nothing to contradict the release, and its label is kept; this is a stated limit. When a label is withheld, the earnings-release and CFO-commentary titles state the quarter-end date and that the label was withheld, while the 10-Q and 10-K titles simply drop the label. A claim naming the label then stays unchecked, while a figure stated with no period still takes the date (D-63). The check is skipped when the release has no parseable quarter end: the title then prints the release's label alone, with no quarter-end date, and no 10-Q or 10-K title takes a label from that release. The same check applies when a stored run input is replayed, so a stale label in a release parse made by an earlier parser is withheld too. The guidance rows' own fiscal labels are not checked this way yet.

### Audit batch 3: stop withholding where the filed evidence is complete (October 26, 2026)

The independent audit of 2026-10-22 found figures withheld although the filed
evidence was complete. Batch 3a fixed the high-severity ones; this batch fixes
the medium ones on the same code paths. Decision: D-105.

**Diluted weighted shares (B-35).** On the SEC path the diluted weighted share
count came only from `WeightedAverageNumberOfDilutedSharesOutstanding`. Exxon
Mobil has tagged none since FY2013, so it had no diluted count and no
per-share fair value, although its basic and diluted EPS are the same figure
in every period. Two changes: the combined elements
`WeightedAverageNumberOfShareOutstandingBasicAndDiluted` and
`EarningsPerShareBasicAndDiluted` are read as both the basic and the diluted
figure; and when a period has no diluted count but the filer reports basic and
diluted EPS that are equal, for the same interval as its basic weighted count
and neither derived, the basic count stands in for the diluted count. The
stand-in is disclosed per period as an info entry: dilution too small to move
EPS at its reported rounding is not reflected. In a loss from continuing
operations (ASC 260's control number: the filed continuing-operations result,
or net EPS when no discontinued result is filed) the entry says instead that
potential shares are antidilutive and excluded, so the basic count is the
diluted count by definition. When basic and diluted EPS
differ, or either is missing, the diluted count stays withheld.

**The lower-bound D&A on the EV/EBITDA row (B-7, left by batch 3a).** Batch
3a composed D&A from `Depreciation` and `AmortizationOfIntangibleAssets` when
no combined tag is filed, and disclosed it as a lower bound in the data gaps
only. The EV/EBITDA row now says so itself. When any statement period behind
the multiple's EBITDA (the four trailing quarters, or the annual row on the
annual fallback) has a composed D&A, the row's basis and its Key data line
carry the caveat, naming those periods and the composition: EBITDA omits any
other amortization, so EV/EBITDA may read high. Unlike the P/E caveat for
gain-inflated earnings, the own-history rank stays, because the history uses
the same composed D&A. A D&A taken from the cash-flow statement, or from a
vendor row without SEC provenance, carries no caveat.

**Per-share value for issuers with more than one common class (B-37, left by
batch 3a).** A per-share intrinsic value needs a diluted share count on the
same basis as the all-class equity value. The valuation accepted only a count
marked as issuer-economic, but nothing ever marked one, so every issuer with
more than one common class (Expedia, Meta) had its per-share value withheld.
The filed diluted count is now marked issuer-economic when three tests pass:
the issuer's class scope is resolved from the filed class inventory; the
basic weighted count from the same income row matches the inventory's
all-class economic share total on exactly one class's unit basis, within 3%
and within half the smallest class's share of that total, so a count that
leaves out a class cannot pass; and that row ends within 120 days of the
inventory date. The diluted count is then restated in quoted-share units (a
count filed in Class A equivalents is multiplied by the Class A units per
quoted share) and the basis is disclosed as an info entry. When that count was
substituted or is a loss period's basic count (FIN-404, "Share basis (D-65)"),
the entry (and its refusal text) calls it "the diluted count", not "the filed
diluted count", in the substituted and loss-period-basic cases only; when the
not-restored case keeps the filed count it stays "the filed diluted count", and
every other filer's text is unchanged. Otherwise the
per-share value stays withheld, and the warning names the test that failed.
ADRs are out of scope: their per-share bridge needs a depositary ratio and
dated security evidence that no data path supplies yet.

**The quote's market cap in the AI context (B-8, left by batch 3a).** When a
second common class leaves the issuer's economic scope unresolved, the report
labels the quote's market cap as possibly covering one share class only, but
the AI context's quote section stated the figure bare. It now carries the same
caveat, citing the filing that shows the second class, and says the figure is
not the issuer's market capitalization.

**NCI from the quarter's own equity statement (C-15).** Some filers tag their
noncontrolling interest on the 10-K face (`MinorityInterest`) but in each 10-Q
only as a dimensional fact: the consolidated-equity concept on
`StatementEquityComponentsAxis = NoncontrollingInterestMember`. Companyfacts
drops dimensional facts, so the latest quarterly balance had consolidated
equity only, and the ownership gate withheld the DCF and every EV and book
multiple (Southern Co.). The primary 10-Q and 10-K documents Métis already
fetches are now read for that NCI column. A balance row with consolidated
equity and neither NCI nor parent equity takes the split from the latest such
filing at the same date, but only when the filing's undimensioned consolidated
total at that date equals the row's total equity; parent equity is the total
less the NCI, and the source is disclosed as an info entry. A column on any
other member (a co-registrant subsidiary on `LegalEntityAxis`) is not the
issuer's; an instant whose facts disagree, or whose total does not tie, is not
admitted, and a warning says why. No NCI is carried forward from an older
balance, and no zero is inferred from a filing that tags no NCI column, so an
issuer with no evidenced NCI stays behind the gate. When the gate does
withhold the DCF, the critical gap now names it ("noncontrolling ownership
unresolved at <date>") instead of "DCF inputs not provided by caller".

**Average debt behind a refused balance (C-1).** The WACC's cost of debt
divides a year of interest by an average of two balances, and its debt weight
uses the newest balance. A lease-scope refusal on the newest balance (AT&T's
10-Q tags only the noncurrent operating lease, so its lease-exclusive debt is
not established) withheld the whole WACC, and with it the DCF, although the
two balances averaged were clean; the critical gap said only "average total
debt missing". Owner decision: such a refusal now withholds only what it
touches. When the newest balance is outside the averaged pair, the debt
weight uses the clean average instead, and the basis says the newest balance
is not used and why. When the refusal falls on the TTM window's quarter-end
pair, the average falls back to the latest two fiscal-year-end balances if
both are present, both carry total debt and neither is refused, and the basis
names the pair not used; otherwise the quarter pair's refusal stands and the
gap names it. The refused balance is
never used, so the EV bridge at that date stays withheld. A refused debt
carrying total (an incomplete debt note) still withholds the WACC wherever
it falls. When no average is established, the critical gap names the balance
date and the cause.

**Operating income when interest sits inside the non-operating total
(B-39).** A filer with no `OperatingIncomeLoss` line gets EBIT derived as
pretax income + interest expense − the non-operating items it tags. When its
interest is tagged `InterestExpenseNonoperating`, which the us-gaap
calculation makes a component of the `NonoperatingIncomeExpense` aggregate it
also filed, adding the interest back would count it twice, so the figure was
withheld, and EBIT with it. Eli Lilly had no EBIT, so when its effective cost
of debt (2.35%) fell below the acceptance band there was no synthetic rating
to fall back on, and no WACC or DCF. Pretax income less that aggregate is the
operating result exactly, so EBIT is now derived that way: the interest is
not added back, and the disclosure says why (LLY FY2025: 25,731 + 571 =
26,302 million). Owner decision: the taxonomy nesting is taken as the filer's
presentation, as the withholding rule already did; the disclosure says that
where a filer's aggregate leaves its interest out, the figure understates
EBIT by that interest. A period that files the aggregate and no interest
element at all is derived the same way (audit 2026-10-27 FIN-507, D-134):
pretax income less the aggregate, with a disclosure that no interest element is
filed and that an interest line outside the aggregate would leave the figure
understating EBIT by that interest. The nesting is read from the period: when the
filer tags the period's interest as `InterestExpenseNonoperating` in any
filing (Eli Lilly re-filed FY2022 and FY2023 that way in its FY2024 10-K; the tag is accepted from any filing for the period, not only a later one), the
interest is not added back, whichever interest element serves the row, even
when that tag's quarter is itself withheld for presentation (audit 2026-10-27
FIN-508, FIN-511). A period with neither the interest nor the
aggregate is withheld, with the missing operand and the missing aggregate named
(Eli Lilly's 2026 quarters, with the aggregate and no interest element, moved
from no EBIT to 8,915 and 8,978 million).

**Derived quarters on one presentation (audit 2026-10-27 FIN-511).** A
quarter derived by subtraction (the fiscal year less the nine-month year to
date, a year to date less the previous year to date, or the year less three
quarters) nets two figures, and they must sit on one presentation. Filing-date
lineage (D-13) is the minimum: each operand is the newest copy filed no later
than the minuend's own filing. Lineage by date is not lineage by presentation,
so the pair is also checked by one pure helper
(`src/edgar/presentationLineage.ts`), in the statement builder and in the SEC
enrichment of the bundle's cash-flow and lease rows, provider or keyless
("Vendor figure against the filed figure (A-11)"). The notes, withholdings and
quoted refusals the bullets name are the statement builder's; in the
enrichment a withheld pair is no SEC value to compare or fill, and a vendor
figure it leaves unverified is disclosed (see the A-11 paragraphs):

- A copy that only re-rounds is not a move: when the later copy is a whole
  multiple of 1,000,000 in a money unit and differs from the earlier copy by no
  more than 500,000 (half the million rounding unit; SEC filers present in
  thousands or millions), no test below treats the period as re-filed. A
  quarter derived on a re-rounded line can therefore differ from the
  first-reported quarter by up to 0.5 million (small lines: AEP's
  equity-method income Q4 2023 is -1.9 against -2.4 first reported, its NCI 2.1
  against 1.6).
- A year (or year to date) that a later filing re-filed, whose subtrahend did
  not move with it, is derived from its first-reported copy only when the
  re-filing changed it by no more than 1% (the note says "a change within 1%",
  with the percentage, because a small change that is not a re-rounding can be
  a retrospective accounting change) or labels the period a re-presentation
  with a new or changed non-zero discontinued-operations line for it
  (ASC 205-20-45-3). When the first-reported copy has no subtrahend filed on or
  before it, the quarter is withheld, with that reason. A larger move that
  the re-filing does not label withholds the quarter, naming both filings,
  because a corrected figure replaces the original (ASC 250-10-45-23) and
  companyfacts cannot tell a correction from an unlabelled re-presentation
  (decision C-9). Bank of America's FY2024 revenue, re-filed from 101,887 to
  105,856 million (+3.90%) with no discontinued-operations line, leaves its
  fourth quarters of 2024 and 2025 withheld (29,316 and 31,180 million before);
  neither the mixed pair nor the first-reported quarter (25,347 million) is
  published.
- A pair that moved together (a re-presentation first filed in a 10-Q, then in
  the 10-K, as SEC Financial Reporting Manual 13110.4 sequences it) keeps the
  later copies, and an amended 10-K keeps its corrected figure.
- The same test applies to the subtrahend: a year to date (or quarter) that a
  later filing re-filed by more than 1%, with no discontinued-operations line
  for it, withholds the quarter naming both filings, while the later copy itself
  is never netted against the older 10-K (D-13).
- The quarter is also withheld, naming both filings, when the minuend's filing
  re-presented earlier periods of the concept by more than 1% against the copy
  filed just before it and the filing that supplies the subtrahend did not (a
  10-K may carry a year on a new basis while the 10-Q nine months filed before
  it stay on the old one, FRM 13110.3). A filing that only repeats a recast an
  earlier filing already made re-presented nothing, and only an amendment (any
  form ending in `/A`) is excused for moving its own year.
- A presentation withholding ends the field. No later step of any chain serves
  it: not a narrower synonym, not a stand-in (cash interest paid for interest
  expense), not a derivation (consolidated profit for profit attributable to the
  parent, derived EBIT for a filed operating income). The withheld field quotes
  the refusal. The one exception is a synonym the component floor would skip
  anyway: a combined synonym whose quarter is withheld is judged against each
  floor tag as for a withheld floor tag (below). Where a filing carries both
  tags for the periods the quarter nets, those filings decide: the synonym is
  skipped as a subset line, and the next synonym is tried, if it sits below the
  floor tag beyond the allowance in such a filing. Only against a floor tag no
  filing carries beside it does its as-filed derived quarter decide. So a
  McDonald's-shaped `DepreciationDepletionAndAmortization`, below `Depreciation`
  in the 10-Q that carries both, gives way to the total
  `DepreciationAndAmortization`. Home Depot's quarter ended 2023-01-29 stays
  withheld: its `DepreciationDepletionAndAmortization` is the larger tag in
  every filing that carries both (FY2022 2,975 million against 2,455 million,
  2,796 million against 2,455 million in the 10-K that split 179 million of
  intangible amortization out of the year; nine months 2,216 million against
  1,830 million), although its as-filed quarter (580 million, the re-filed year
  less the original nine months) is below `DepreciationAndAmortization`'s 625
  million. A withheld synonym at or above its floors still ends the field (B13
  final review M-6, final re-review N-1).
- A derived EBIT whose adjustment or optional interest part is withheld for
  presentation is itself withheld, quoting that reason (never read as "not
  filed"), when the derivation uses that operand. An operand the derivation does
  not use never refuses the EBIT (B13 final review I-1). Three kinds of operand
  are not used: a component inside a `NonoperatingIncomeExpense` aggregate that
  served for the period (`InvestmentIncomeInterest`,
  `OtherNonoperatingIncomeExpense`); an equity-method result beside a pretax
  element measured before it; and, beside a served aggregate, interest the
  B-39/FIN-508 nesting leaves out (the withheld tag is
  `InterestExpenseNonoperating`, or another filing tags the period's interest
  that way). Such an operand is resolved quietly, only for its "already contains
  them", "measured before them" or nesting disclosure, and writes no withholding,
  so where only an unused operand was re-presented the EBIT is published as it
  was before this batch. An adjustment or interest part that is simply not
  filed keeps the "filer tags none" and the FIN-507 disclosures. The FIN-508
  nesting test asks only whether the filer tags the period's interest as
  `InterestExpenseNonoperating`, so a quarter of that tag withheld for
  presentation still counts as tagged.
- A combined-total floor tag (for example `Depreciation` under a combined D&A
  tag) that is withheld for presentation still bounds the floored tag: the
  decision is made from filed copies on one basis, never from the refused
  quarter: the candidate's copy of each period it nets is compared with the
  floor tag's copy of the same period in the same filing (for a fourth quarter,
  the fiscal year and the year to date through the previous quarter; for a
  year-to-date difference, the year to date and the one before it), and the candidate is skipped only if it sits below the floor beyond
  the 0.5% / 2 million allowance in such a filing. If no filing carries both
  tags for those periods, the floor tag's as-filed derived quarter (the newest
  copies filed no later than its own minuend's filing) decides. The floor is a
  magnitude check that is never published. A floor tag that is not withheld is
  compared by its one-basis quarter, not by the as-filed pair, so a real total is
  published and not a lower bound (a synthetic case: 3,000 where the as-filed
  pair gave 2,940). A floor tag that is not filed at all leaves no floor.
- A withheld revenue quarter suppresses the TTM window, which then falls back to
  the annual statement.

(Revises D-13, "one filing lineage": it now means one presentation; D-134.)

**Quarterly trend growth on one presentation (audit 2026-10-27 FIN-511-V1).**
Where the filings show a re-presentation, each year-over-year and
quarter-over-quarter cell of the quarterly trend divides two quarters on one
presentation, or is not shown with a note. The test reads what the SEC
statement rows carry: the revenue provenance, the re-presentation flag and
first-reported copy, and a marker naming the filing that supplies the
quarter's revenue and whether that filing re-presented earlier periods of the
concept (`revenuePresentation`, the test the derived-quarter rule above
applies to a minuend). Rows from the FMP route carry none of these and keep
plain arithmetic. Three cases:

- The comparison quarter was re-presented by a filing newer than the printed
  quarter's own supplying filing, and the printed quarter was not: the cell
  divides by the comparison's first-reported copy when that copy was filed on or
  before the printed quarter's filing, which puts both on the earlier
  presentation. The note names that copy (amount and filing) and the filing
  that re-presented it (Bank of America Q3 2025 against Q2 2025: 28,088 /
  26,463 = +6.1%, not +2.4% against the re-presented 27,443). When no
  first-reported copy was filed on or before the printed quarter's filing, or
  the first-reported copy is not positive, the cell is not shown, with a note.
- The printed quarter was re-presented by a filing newer than the comparison's
  supplying filing, and nothing re-presents the comparison: the cell is not
  shown, with a note, because any rate would sit beside a level on a different
  presentation (Bank of America Q1 and Q2 2025 year over year, +9.4% and +8.1%
  before).
- The printed quarter's own filing re-presented earlier periods and the
  earlier filing that supplies the comparison did not (the rule
  applied to the pair that the derived-quarter rule applies to a minuend and a
  subtrahend): the cell is not shown, with a note. A synthetic case: a 10-Q
  files a quarter of 90 and re-presents the prior-year quarter, while the prior
  quarter, from the earlier 10-Q, is 110 on the old basis; 90 / 110 = -18.2%
  would net two bases (on one basis it would be 90 / 88 = +2.3%), and the
  year-over-year cell, both quarters from that 10-Q, is kept. In every other
  case (both filings re-presented, neither did, only the comparison's did, the
  two share a date, or the comparison's filing is the later one) the cell is
  unchanged.

Limits. A quarter whose revenue is a sum of several tags, or a row without the
marker (the FMP route, stored rows), keeps plain arithmetic. A comparison whose
own filing re-presented for an earlier, separate change counts as on the newer
basis. The re-presenting filing named in a note is the one that supplies the
newest copy of the re-presented quarter, which can be later than the filing
that first changed it. Re-presentation is judged for the whole filing, not for
each period, as in the derived-quarter rule: a quarter re-filed unchanged by a
filing that moved other periods counts as on that filing's presentation, so
its cell can be withheld although its figure is the same on both. The notes follow the table in the classic report and the
quarterly-trend section of the payload, where a dashed cell registers no
figure. A growth cell against a withheld quarter stays a dash, as before. This
follows the presentation rule above and SEC Financial Reporting Manual 13110.4,
under which a later 10-Q re-presents only the periods it shows (D-134).

The quarterly-trend table note carries the sentence "where the filings show a
re-presentation, each growth cell divides two quarters on one presentation or is
not shown, with a note" only where that check ran: the stored filing disclosures
carry `quarterlyTrendPresentationChecked: true`, which the builder sets only when
a shown quarter's SEC-built row carries `revenuePresentation` (report spec 1.49.0
on). Otherwise the field is omitted, and reports built before the check and
provider-route (FMP) reports keep the earlier note, which says only how YoY and
QoQ compare (Task 9b).

**Cash chains (B-43, B-34).** Two cash rules withheld net debt and invested
capital although the filing establishes the figure.

- *Restrictions tagged as restricted cash (B-43).* When a filer tags no
  unrestricted cash line, cash is derived from the combined
  restricted-plus-unrestricted total less the current and noncurrent
  restrictions, all from one filing. The restrictions were read only as
  `RestrictedCashAndCashEquivalentsAtCarryingValue` and
  `RestrictedCashAndCashEquivalentsNoncurrent`. Chevron, whose balance-sheet
  cash line has used a custom tag since Q3 2024, tags them
  `RestrictedCashCurrent` and `RestrictedCashNoncurrent`, so its cash, net
  debt and invested capital were withheld and no DCF was built. Those two
  tags are now read, each after the cash-and-equivalents form; both sides are
  still required, from the same filing, and none is presumed zero (2026-06-30:
  9,582 − 236 − 819 = 8,527 million, Chevron's balance-sheet cash).
- *A combined total narrower than its components (B-34).* Cisco's FY2026 10-K
  tags `CashCashEquivalentsAndShortTermInvestments` as the total of its
  fair-valued investment schedule, 14,297 million, which leaves out bank
  deposits; its balance-sheet cash (7,218) and short-term investments (8,700)
  sum to 15,918. The combined field won, so net debt was refused for the
  conflict while sales-to-capital used the narrower figure. Owner decision:
  when the combined figure is below the same filing's cash plus short-term
  investments, the two components are disjoint balance-sheet lines, so their
  sum is used, in net debt and invested capital alike, and the substitution is
  disclosed. A combined figure above the components, or from another filing,
  is left as it is, and net debt still refuses a conflict. A shortfall within
  display rounding is not a narrower scope: two separately rounded lines can
  sum above their rounded total, so the combined figure stands when the gap is
  no more than the coarsest rounding unit the three figures share (up to a
  million) or 0.01% of the total, the vendor-agreement tolerance of audit A-11.
  Johnson & Johnson's quarters (38,780 against 38,474 + 307) keep their total.
- *Current debt securities (D-106).* The keyless short-term investments read
  `ShortTermInvestments`, `MarketableSecuritiesCurrent`,
  `AvailableForSaleSecuritiesDebtSecuritiesCurrent` and
  `InterestBearingDepositsInBanks`, then `DebtSecuritiesCurrent`, the
  taxonomy's current debt securities of every class. NVIDIA moved its
  marketable securities line to `DebtSecuritiesCurrent` with its FY2026 10-K
  (39,065 million at 2026-01-25, 34,143 million at 2026-07-26), so whenever
  FMP was unavailable its cash and short-term investments fell to cash alone
  and invested capital rose by the whole securities balance (sales-to-capital
  1.53 against the vendor path's 2.58). The tag is read last, so a period that
  tags an element above keeps it. Equity securities are not added here: the
  undivided `EquitySecuritiesFvNi` does not say whether a stake is current,
  so NVIDIA's 42,783 million of marketable equity stays in invested capital
  on the keyless path, where the vendor's combined total lets D-60 carry it
  as non-operating.
- *Net income attributable to the parent (D-108).* The keyless net income
  reads `NetIncomeLoss`, the parent's figure. A filer that omits it but tags
  consolidated `ProfitLoss` and `NetIncomeLossAttributableToNoncontrollingInterest`
  for the period gets the parent figure by the taxonomy's own calculation,
  ProfitLoss less the noncontrolling interests' share, and the derivation is
  disclosed for each period it serves. Only without an NCI tag does the chain
  fall to consolidated profit, then to the amount available to common, as
  before. Freeport-McMoRan files no `NetIncomeLoss` in its 10-K/10-Q facts, so
  its net income, net margin and DuPont ROE carried the NCI share (FY2025
  4,152 million against 2,204 million to the parent; ROE 22.8% against about
  12%; audit 2026-10-22 B-18). Stage B reads the derived figure as parent
  income, so the NCI share is not deducted a second time, and a TTM window
  mixing derived and `NetIncomeLoss` quarters is one ownership basis. The
  cash-flow statement still starts from consolidated profit.

**Net charge-offs from cash-flow recoveries (C-13).** The bank route's net
charge-off rate needs a year's write-offs net of recoveries, from a net tag or
an allowance roll-forward pair. Capital One tags its write-offs on the
roll-forward but its recovery total only as a dimensional fact, which
companyfacts drops; undimensioned, the recoveries appear only on the
cash-flow statement as `ProceedsFromRecoveriesOfLoanPreviouslyChargedOff`.
The rate was withheld and the balance-sheet grade renormalised without it.
When no roll-forward pair is filed, write-offs now pair with that cash-flow
line for the same fiscal year, unit and filing, and the basis says the
recoveries come from the cash-flow statement (COF FY2025: 18,166 − 5,064 =
13,102 million, its reported net charge-offs; 3.35% of average loans against
the 3.30% it reports on average loans held for investment).

**Managed care is not a life insurer (E-6).** SIC 6324 (UnitedHealth,
Elevance, Cigna, Humana, Centene, Molina) was labelled "Insurance - Life" on
the keyless path and routed to the insurer map, which withholds financial debt
and values on excess return over book value (UNH: $73.3B of filed debt
withheld). Owner decision: these issuers go on the general route with a note.
Their earnings and free cash flow are the right yardstick, and their debt is
financing debt, not float. The premium and claim-reserve tags a health plan
files match the insurer evidence rule, so for SIC 6324 that evidence is noted
rather than used to re-route. The forensic financial band (SIC 6000 to 6499
and 6700 to 6799) still includes 6324, unchanged, so a health plan's Altman
Z, Beneish M-score and accruals ratio are still withheld as for a financial
company, and its Piotroski score uses the financial variant; whether managed
care leaves that band too is left for a later owner decision.

**Piotroski leverage on a composed long-term debt (E-8).** Realty Income and
NNN compose long-term debt from instrument-class totals (`NotesPayable`,
`LoansPayable`) that may hold current notes. That figure is kept out of the
forensic long-term debt, which nulled ΔLEVER and renormalised the F-score
over the other signals (O's passing signal and NNN's failing one were both
dropped). The level overstates long-term debt, but the direction of leverage
is still measurable when both years compose the figure from the same tags, so
ΔLEVER now compares the composed figures on that basis and says so (O:
39.64% → 37.80%, a pass). Owner decision: the comparison is by tag set,
because the provenance does not carry a value for each class. When the tags
differ, the signal is withheld and both tag sets are named. NNN stays
withheld: its FY2025 figure carries a `LoansPayable` tag, at zero, that
FY2024's lacks. LVGI is unchanged: it adds long-term debt to current
liabilities, where current notes would count twice.

### Audit batch 4: freshness and the earnings window (October 26, 2026)

The independent audit of 2026-10-22 found reports that ended a quarter or two
before what the issuer had already filed, or that read its newest results
release wrongly. Decision: D-112.

**A release that states no period (B-26).** A results release whose period
could not be parsed ranked below every older release with a parsed period, so
the newest results could fall out of the four releases kept. It now goes
before the first dated release filed no later than it; dated releases keep
period order. For the four slots a results release outranks an operational
update (deliveries, production), so the kept set covers a year of results
when enough were read.

**A newer release's dollars (B-27).** In the earnings window a release
reports a quarter no statement row covers yet, so its "$" was never bound to
a currency: every dollar guide was withheld and the DCF lost its guidance
anchor. Such a release, or one that states no quarter end, now reports in the
statements' currency when every income row since before its period is
established in that one currency. A history in more than one currency, or an
unlabelled row at the release's own quarter, still withholds, and the note
says the currency is not established rather than claiming a mismatch.

**10-Qs that companyfacts has not caught up with (B-23).** SEC's
companyfacts API can run a quarter or two behind the filed 10-Qs. On
2026-10-22 it still ended at the first-quarter 10-Q for Visa, Duke Energy,
NextEra, Coca-Cola and Prologis, although each had filed its second-quarter
10-Q (NextEra its third-quarter one too), so statements, TTM and multiples
ended early with nothing saying so. The newer 10-Q's XBRL instance is already
fetched for segment revenue, so its facts are now read and merged into the
companyfacts payload before the statements are built. Only what companyfacts
itself publishes is read: numeric, non-nil facts in the us-gaap, srt, dei and
ifrs-full taxonomies, on contexts with no dimension (the consolidated
registrant; a combined filing's subsidiaries are left out), for the filer's
own CIK. A fact stated twice at the same precision with different values is
dropped. Each merged point carries the 10-Q's accession, form, filing date and
fiscal focus, exactly as companyfacts would, so every figure built from it
cites that filing. A filing companyfacts already carries, or one filed no
later than companyfacts' newest periodic report, is never merged, so nothing
is counted twice and a row never mixes the two bases. The merge runs after
the predecessor check, so a successor's merged quarter cannot hide missing
history. An info entry names each merged filing, its period and filing date.
Where a newer 10-Q, 10-K, 20-F or 40-F was filed before the build but its
facts could not be read (for instance a filing whose instance was not
fetched), the report shows a "Newer filing not reflected" banner and a warn
gap naming the filing and its date, as the newer-results notice does for a
release: "10-Q <accession> for the period ended 2026-06-30 was filed on
2026-07-29; statements, TTM and multiples here end 2026-03-31 and do not
include it." The same 45-day allowance as the newer-results notice keeps a
52/53-week calendar from raising it. In the audit panel the merged TTM
revenue and net income match the oracle's for all five issuers (Duke $32.57B
and $5.25B to 2026-06-30; NextEra to 2026-09-30), and P/E moves to the
oracle's (Duke 18.1×, Coca-Cola 27.9×, NextEra 14.1×, Prologis 28.4×).

**A scenario fan that does not bracket its base.** Bull and bear re-run the
DCF with growth shifted ±σ. Where faster growth needs reinvestment that earns
less than it costs, and slower growth releases no capital (reinvestment is
floored at zero), the DCF's value peaks at the base path and both runs land
below it. A "bear – bull" range then excludes the fair value it is meant to
bracket. Such a fan is now withheld with both values named. It is judged on
the two-decimal per-share values the report shows, so a run that shows as
the base touches it rather than falling outside. Duke Energy's
merged second quarter reached this (bull $37.23, base $43.09, bear $33.24);
no issuer in the main-branch panel did.

**Multiple labels name their period and formula (B-9, B-20).** When no four
contiguous quarters cover the trailing twelve months, P/E and EV/EBITDA fall
back to the latest fiscal year, but they were still labelled "TTM". Each
multiple now records the period its earnings cover ("TTM to 2026-06-30" or
"FY2025"), and the label follows it in the multiples table, Key data and the
exports ("P/E (FY2025)", "EV/EBITDA (FY2025)"). In the AI payload a
fiscal-year multiple names its year in the label the model reads ("P/E
(current, FY2025)", "evToEbitda (current, FY2025)"), and its record carries
that period; a TTM record keeps its label ("peTtm (current)") and period.
TTM labels are unchanged. With no income-statement D&A, EBITDA adds the
cash-flow statement's D&A only when it covers the same period as the
operating income: the cash-flow slice on the same date and basis, or, beside
a fiscal-year operating income, the annual cash-flow row on that year's date
even when the cash-flow slice is TTM. On another period, or with either date
unknown, EV/EBITDA is withheld with a gap naming both, rather than adding two
periods' figures under one label. The P/E basis used to read "price / epsDiluted
(TTM); fallback marketCap / common income" whichever ran; it now names only
the formula that produced the figure, and when it is market cap over common
income it says why diluted EPS was not used (diluted EPS missing for a
quarter of the window or for the fiscal year, a sum that is not positive, an
ADR's unverified depositary ratio, or share classes with different economic
weights). Key data notes "market cap / common income, not price / diluted
EPS" beside such a P/E. The figure itself is unchanged: because a
fourth-quarter diluted EPS is never derived, most trailing windows that
contain a fiscal fourth quarter already ran on market cap over common income,
and the label now says so.

**EPS from continuing operations (FCX-4).** A filer with no discontinued
operations may tag only its EPS from continuing operations: Freeport-McMoRan
has tagged no net-income EPS since FY2022, so its annual EPS was empty from
2022 and the EPS CAGR window ended at 2021. Net EPS is continuing EPS plus
discontinued EPS (ASC 260-10-45-3), so when no net-income EPS is tagged and
no discontinued result is filed for the period, in dollars or per share, the
reported continuing figure stands in, with its own provenance and a
substitution disclosure. A discontinued result filed under any of the
elements filers use (net of tax, before tax, attributable to the reporting
entity or to noncontrolling interests or including both, during a phase-out
period, a gain on disposal, or per basic, diluted or combined share) keeps
EPS empty, even when it is withheld from the row for its currency or period.
Each element is read on its own, so a zero filed under one does not hide a
result filed under another; these working figures never stay on the row,
mark it derived or appear in its notes.
Freeport's EPS CAGR now runs 2020 to 2025 (1.52 in FY2025, 1.30 in FY2024).

**TTM across a reorganisation (B-36).** A trailing twelve months that joins
a predecessor's quarters to a successor's own was refused as two issuers, so
ExxonMobil Holdings, successor to Exxon Mobil Corp since 2026-07-01, had no
P/E. When the successor's own filing re-presents at least one predecessor
net income and at least one per-share figure, and every such net-income and
per-share comparative agrees, the two are one reporting entity on one share basis: the predecessor rows name
the successor as their economic issuer, the TTM may span the reorganisation,
and the predecessor disclosure names the periods that matched. EPS is
compared by role, basic and diluted, so a combined basic-and-diluted tag on one
side meets separate tags on the other; matching net income alone does not show
one share basis. Exxon's first
10-Q re-presents Q2 2025 at 7,082M and $1.64 a share, so its P/E is now
22.4× on market cap over TTM net income of 32,757M. Without that evidence the
TTM is still refused. The no-annual-report gaps now name a resolved
predecessor rather than calling it unlinked. Reading the predecessor's 10-K
for Item 1A, MD&A and notes is not done: it needs live SEC requests and an
identity design for the 10-K parsers, which bind their evidence to the
registrant's own CIK.

### AMZN report #51: the noncurrent-only lease line (October 29, 2026)

Report #51 ran on provider (FMP) statements and lost its WACC, DCF, fair value
and scenario targets, and three grades fell. Decision: D-133.

**A lease line that holds only the noncurrent lease liabilities.** The
provider's `capitalLeaseObligations` for Amazon at June 30, 2026 was $94.3B:
the 10-Q's noncurrent operating lease liabilities ($82.6B) plus its noncurrent
finance lease liabilities ($11.8B), with no current portion. The SEC
enrichment wrote the filing's lease totals beside it ($96.3B operating, $13.5B
finance), and the lease guard rightly refused a row whose operating slice
exceeds its lease line. Every balance was refused, so the WACC had no debt
weight. The vendor's total, $223.2B, also left out $3.7B of current debt and
$15.4B of current lease liabilities: the filing composes $242.3B.

The balance admission now completes such a row from one filing, when every
part of it is filed there for the same date:

- the trigger: the vendor's lease line equals that filing's
  `OperatingLeaseLiabilityNoncurrent` plus `FinanceLeaseLiabilityNoncurrent`
  (within the lease guard's tolerance), the vendor states no current lease
  portion, and the line has no SEC provenance of its own. A filing that tags
  no finance lease completes from the operating part alone. "No finance lease"
  is read only after every recognised finance-lease synonym is absent at that
  instant: the synonym entry's totals (`FinanceLeaseLiability` and the older
  ASC 840 `CapitalLeaseObligations`) with each one's current and noncurrent
  forms. A filing that tags any of them without
  `FinanceLeaseLiabilityNoncurrent`, while the line equals the operating
  noncurrent part, is refused with the tag and amount named; no legacy
  noncurrent figure is composed.
- the lease liabilities become the filing's totals (the tagged total, else
  current plus noncurrent, cross-checked against each other);
- a zero or absent vendor short-term debt becomes the filing's
  `LongTermDebtCurrent` plus `ShortTermBorrowings` and `CommercialPaper` where
  tagged, cross-checked against `DebtCurrent`. When the filing tags both
  `ShortTermBorrowings` and `CommercialPaper`, the commercial paper is left out
  as a component of the borrowings, the SEC statements builder's rule (one
  shared helper), and the text says so. A nonzero vendor short-term debt
  is kept, never added to. When the filing tags a current debt
  (`LongTermDebtCurrent`, with `ShortTermBorrowings` and `CommercialPaper`
  where tagged; else `DebtCurrent`; else `ShortTermBorrowings` plus
  `CommercialPaper`, a 0 included; in either sum the commercial paper is left
  out beside the borrowings), the vendor figure must agree with it, and
  the refusal or the kept figure names those tags and amounts. When the only
  current-debt evidence is `LongTermDebtAndCapitalLeaseObligationsCurrent`,
  which holds the current finance leases the completed lease total adds again,
  the vendor figure must equal it less the filing's
  `FinanceLeaseLiabilityCurrent` (the statements builder's case 4b), or the
  figure itself when no finance lease is filed; when finance leases are filed
  without `FinanceLeaseLiabilityCurrent` the row is refused, since the
  embedded portion cannot be established. When the combined tag is filed
  without `LongTermDebtCurrent` beside `DebtCurrent`, `ShortTermBorrowings` or
  `CommercialPaper`, it holds current maturities no checked tag names, so the
  row is refused with those tags and amounts, whatever the vendor's short-term
  debt; the maturities are not composed. Beside `LongTermDebtCurrent` the
  combined tag is set aside, as in the builder's case 4a. When the filing tags none of these
  five, the vendor figure must not equal a current lease amount the completed
  line already holds;
- total debt is short-term debt plus the vendor's long-term debt (which must
  agree with the filing's `LongTermDebtNoncurrent`) plus the completed leases,
  and net debt is recomputed from it;
- the completion is refused when that filing's `LongTermDebtNoncurrent`
  equals its `LongTermDebtAndCapitalLeaseObligations` while it tags noncurrent
  finance leases: the noncurrent debt then may already hold them (Duke
  Energy's 2019 to 2021 10-Ks are filed this way), and adding the
  finance-lease total could count them twice. The guard also refuses
  Alphabet's 2023-12-31, 2024-12-31 and 2025-03-31 filings, which carry the
  finance leases outside noncurrent debt (the FY2023 10-K tagged
  `LongTermDebtAndCapitalLeaseObligations` 13,253M = 11,870M + 1,383M), so it
  can withhold a correct completion. It is fail-closed; for Alphabet, as
  filed, it reaches only past balances and the withheld row is a warning. A
  filer whose latest filing had this shape would lose its latest balance, and
  with it the WACC.

The filings that carry the date are tried newest first, so a comparative that
only a later 10-Q tags still completes. The completed fields carry the filing
as provenance (total debt is marked `noncurrent-lease-line-completed`), and
the vendor's own total stays in the raw row. One info entry in the manifest
covers every completed date: it lists each date's completed total, the
vendor's total and the filing, and gives the latest date's arithmetic. On
report #51 the per-date entries were 51 entries and about 25,000 characters in
every model pass; the two merged entries are about 3,500. Where a rule fails, the row is refused with the exact cause ("the current
debt cannot be established: the filing tags no LongTermDebtCurrent ...",
"the vendor short-term debt ... does not reconcile with the filed current
debt", and so on), and the refusal claims only what the check established:
a current debt the filing does not establish, a vendor short-term debt that
may be the current leases (counted twice if kept), or otherwise that the row
is not completed from that filing. The lease guard itself is unchanged, and its refusal now names the
values it compared and each operand's scope, for example "operating-lease
liability 96,320M (current + noncurrent) exceeds the vendor lease line 94,338M
(noncurrent only)". The WACC's refusal says "average total debt withheld:"
with that reason; "cannot distinguish debt-free from unknown leverage" is
kept for a total debt that is absent.

**A vendor short-term debt of 0 beside filed current debt.** A provider row
whose short-term debt is 0 while the same-period filing tags a positive
`DebtCurrent`, `LongTermDebtCurrent`, `ShortTermBorrowings` or
`CommercialPaper` is not complete: its total debt and net debt are withheld
with a reason naming the filed tags. The row is kept when the provider folded
the current maturities into its long-term debt: that long-term debt equals the
same filing's `LongTermDebtNoncurrent` plus `LongTermDebtCurrent` (within the
larger of 1 and one part in a million), and the filing tags no other current
debt (`ShortTermBorrowings` and `CommercialPaper` absent or 0, `DebtCurrent`
absent or equal to `LongTermDebtCurrent` within that tolerance). A
`DebtCurrent` of 0 beside positive current maturities contradicts the filing,
and one above them may hold borrowings or current finance leases the check
cannot place; either still withholds the row. A short-term debt the SEC statements
built is not checked this way. On Amazon's provider rows this withholds the
2017 year end, whose 10-K tags $100M of current long-term debt beside
$24,743M of noncurrent debt; the provider's long-term debt is the noncurrent
figure alone, so the current maturities are left out. No figure of report #51
uses that year.

**The tagged-total backstop keeps counting finance leases.** The audit
proposed comparing a debt-only aggregate (`LongTermDebt`,
`LongTermDebtNoncurrent`, `LongTermNotesAndLoans`,
`DebtLongtermAndShorttermCombinedAmount`) with the financing debt alone. It is
not applied: Alphabet files its finance leases inside `LongTermDebt` (at
2019-12-31, $4.69B against $3.96B of noncurrent debt plus $0.71B of finance
leases), so the comparison refused Alphabet's 2019 to 2022 and 2025 debt and
moved its DCF, composite and latest ROIC on no defect. The current-debt check above catches the
Amazon case instead.

**The current-capital bridge and the provider EV.** "Total debt including
leases" is withheld, with the refusal, when the lease guard or the admission
refused the row; it was printed as the vendor's partial $223.2B. A total
composed from a filing is said to be composed, with the filing and its tags,
and what the vendor's own total left out. A provider enterprise value is the
vendor's market cap plus its own total debt less cash; it is withheld at a
date whose debt was refused, or whose debt operand differs from the total the
filing composes, and the key data says so. The report's market EV is separate
and nothing replaces the withheld one.

**Replayed.** On report #51's frozen inputs, with no provider or model call,
the WACC is 10.47%, the DCF and fair value $116.12 a share (scenarios $100.33,
$116.12 and $136.37) and the composite 56.11 (C), the same figures as the
audit's counterfactual with the composition and the stakes. On the 45 census
snapshots (all built from SEC statements) no figure moves; only refusal
wording does. On NVIDIA's provider runs #48 to #50 the July and October 2022
quarters complete (no finance lease filed) and add two EV own-history
observations; the May 2022 quarter stays refused because its vendor
short-term debt does not reconcile with the 10-Q's only current-debt tag,
`CommercialPaper` 0, and equals its current operating lease liability.
