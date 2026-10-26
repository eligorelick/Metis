/**
 * US-GAAP tag synonyms per statement line item.
 *
 * Every concept chain in src/edgar/statements.ts reads its tag list from this
 * table, so a taxonomy review has one place to look and one stamp to update.
 * Order matters: within a line item the first tag present for the period wins.
 *
 * Review stamp: the element names below were reviewed against the US-GAAP
 * 2025 taxonomy element list on 2026-09-02 (an offline review of names; no
 * live taxonomy fetch — the same names resolved at live issuers during the
 * 21-issuer keyless sweep of 2026-09-02). The preferred-stock carrying-value
 * elements and the intangible-asset parts were added on 2026-10-13 and
 * checked against JPM's live companyfacts (D-42). `InterestExpense` was deprecated by
 * the 2024 taxonomy in favour of `InterestExpenseNonoperating` and
 * `InterestExpenseOperating`; it stays in the chain because filers on older
 * taxonomy versions still tag it.
 *
 * Stand-ins (`standIns`) are tried only after every tag in `tags` misses, one
 * at a time, each with its own disclosure text: the cash-flow supplement's
 * `InterestPaidNet` is net of capitalized interest, `InterestPaid` is gross,
 * and the two figures differ by exactly the interest a filer capitalizes into
 * assets, so one shared sentence would misdescribe one of them.
 *
 * The module is pure data.
 */

export const TAG_SYNONYMS_TAXONOMY = "us-gaap-2025";
export const TAG_SYNONYMS_REVIEWED_ON = "2026-10-13";

export interface TagStandIn {
  tag: string;
  /** Wording recorded as a `Substitution` and in the manifest when this stand-in serves. */
  disclose: string;
}

export interface TagSynonymEntry {
  /** Tried in order; the first present for the period wins. */
  tags: readonly string[];
  /** Tried only after every `tags` entry misses, in order, each disclosed separately. */
  standIns?: readonly TagStandIn[];
}

const entry = (tags: readonly string[], standIns?: readonly TagStandIn[]): TagSynonymEntry =>
  standIns === undefined ? { tags } : { tags, standIns };

/**
 * `Revenues` first: it is the taxonomy's total-revenue element, and the
 * ASC-606 elements are the performance-obligation subset of it. A filer that
 * tags both for one period reports the total on the face of its income
 * statement, and that is what the vendor's `revenue` carries. Resolution is
 * period-scoped, so a filer whose `Revenues` stops in an old year still
 * resolves the ASC-606 tag for every later period (see xbrl.ts).
 */
export const REVENUE_TAGS: readonly string[] = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "RevenuesNetOfInterestExpense",
];

/** Full industrial operands; financial net revenue and component costs are not substitutes. */
export const GROSS_PROFIT_REVENUE_TAGS = REVENUE_TAGS.filter(tag => tag !== "RevenuesNetOfInterestExpense");
export const GROSS_PROFIT_COST_TAGS: readonly string[] = ["CostOfRevenue", "CostOfGoodsAndServicesSold"];

/**
 * The pretax element that, by taxonomy definition, is measured BEFORE
 * equity-method results — its name lists what it excludes. When it serves as
 * the base of the derived EBIT, subtracting equity-method income removes money
 * that was never in the base, so the adjustment is gated on it.
 */
export const PRETAX_EXCLUDING_EQUITY_METHOD_TAG =
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments";

export const INCOME_BEFORE_TAX_TAGS: readonly string[] = [
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
  PRETAX_EXCLUDING_EQUITY_METHOD_TAG,
];

/**
 * The two children of the pretax total in the taxonomy's calculation
 * (domestic + foreign). Some filers tag only these in the tax note; Oracle's
 * FY2026 10-K is one (audit 2026-10-22 B-32).
 */
export const INCOME_BEFORE_TAX_COMPONENT_TAGS: readonly string[] = [
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic",
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign",
];

/**
 * Depreciation and intangibles amortization as separate lines, for filers
 * that tag no combined D&A (Microsoft, Alphabet, Oracle, Intel, Tesla; audit
 * 2026-10-22 B-7). Depreciation comes first: it stands alone when no
 * amortization is tagged for the period.
 */
export const DEPRECIATION_COMPONENT_TAGS: readonly string[] = ["Depreciation", "AmortizationOfIntangibleAssets"];

/** Consolidated earnings concepts, before the parent-only NetIncomeLoss fallback. */
export const CONSOLIDATED_NET_INCOME_TAGS: readonly string[] = [
  "ProfitLoss",
  "NetIncomeLossIncludingPortionAttributableToNonredeemableNoncontrollingInterest",
];

/**
 * `InterestExpenseOperating` is LAST among the income-statement tags: for a
 * bank it is the whole interest expense, but for a non-bank that tags both,
 * the non-operating figure is the borrowing cost the WACC wants.
 */
export const INTEREST_EXPENSE_TAGS: readonly string[] = [
  "InterestExpense",
  "InterestExpenseNonoperating",
  "InterestExpenseDebt",
  "InterestAndDebtExpense",
  "InterestExpenseOperating",
];

const INTEREST_STAND_IN_PREAMBLE =
  "stands in for interest expense: the filer tags its income-statement interest line only by extension; the cash figure omits accrued but unpaid interest";

export const INTEREST_EXPENSE_STAND_INS: readonly TagStandIn[] = [
  {
    tag: "InterestPaidNet",
    disclose:
      "cash interest paid net of capitalized interest (cash-flow supplement, InterestPaidNet) " +
      `${INTEREST_STAND_IN_PREAMBLE} and EXCLUDES the interest capitalized into assets, so it can run below the expense line`,
  },
  {
    tag: "InterestPaid",
    disclose:
      "cash interest paid, gross (cash-flow supplement, InterestPaid) " +
      `${INTEREST_STAND_IN_PREAMBLE} and INCLUDES the interest capitalized into assets, so it can run above the expense line`,
  },
];

/**
 * Non-operating items subtracted from the derived EBIT (pretax income +
 * interest expense) when the filer tags them.
 *
 * `componentOf` names another adjustment that already contains this one in the
 * taxonomy's income-statement calculation: `InvestmentIncomeInterest` is a
 * child of `NonoperatingIncomeExpense`, so it is subtracted on its own only
 * when the aggregate is absent.
 *
 * `notWhenBaseTag` names base tags whose OWN DEFINITION excludes this item, so
 * subtracting it would remove money the base never held. Equity-method results
 * are the case: they sit beside the aggregate at the pretax level under
 * `IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest`,
 * but the second pretax element in `INCOME_BEFORE_TAX_TAGS` is measured before
 * them. Ungated, a filer with pretax-before-equity 5,000, equity income 300 and
 * interest 200 published EBIT 4,900 instead of 5,200 — 5.8% low, into the DCF
 * and every EBIT multiple.
 */
export interface EbitNonOperatingAdjustment {
  label: string;
  tags: readonly string[];
  componentOf?: string;
  notWhenBaseTag?: readonly string[];
}

export const EBIT_NON_OPERATING_ADJUSTMENTS: readonly EbitNonOperatingAdjustment[] = [
  { label: "NonoperatingIncomeExpense", tags: ["NonoperatingIncomeExpense"] },
  { label: "InvestmentIncomeInterest", tags: ["InvestmentIncomeInterest"], componentOf: "NonoperatingIncomeExpense" },
  {
    label: "IncomeLossFromEquityMethodInvestments",
    tags: ["IncomeLossFromEquityMethodInvestments"],
    notWhenBaseTag: [PRETAX_EXCLUDING_EQUITY_METHOD_TAG],
  },
];

/**
 * The interest-expense element the taxonomy makes a CHILD of
 * `NonoperatingIncomeExpense`. When a filer tags both, "pretax + interest −
 * aggregate" would add back an interest expense the aggregate already removed,
 * so the interest is not added: pretax less the aggregate is the EBIT (see
 * `EBIT_INTEREST_INSIDE_AGGREGATE`; audit 2026-10-22 B-39, it was withheld).
 */
export const INTEREST_INSIDE_NONOPERATING_TAG = "InterestExpenseNonoperating";

/**
 * The nested pair, with the disclosure the derived figure carries.
 */
export const EBIT_INTEREST_INSIDE_AGGREGATE = {
  partTag: INTEREST_INSIDE_NONOPERATING_TAG,
  adjustmentTag: "NonoperatingIncomeExpense",
  disclose:
    `interest expense (${INTEREST_INSIDE_NONOPERATING_TAG}) is not added back: the us-gaap calculation makes it a ` +
    "component of the NonoperatingIncomeExpense aggregate subtracted here, so pretax income less that aggregate " +
    "already excludes it; where the filer's aggregate leaves its interest out, the figure understates EBIT by that " +
    "interest",
} as const;

/**
 * The caveat every derived EBIT carries when the non-operating aggregate was
 * subtracted and an interest expense was added back from a tag the taxonomy
 * does NOT place inside it. Many filers present "total other income (expense),
 * net" as a line that already contains interest expense, and nothing in
 * companyfacts says which presentation a filer used.
 */
export const EBIT_AGGREGATE_MAY_HOLD_INTEREST =
  "caveat — the NonoperatingIncomeExpense aggregate subtracted here is frequently presented as \"total other income " +
  "(expense), net\" and may ALREADY contain the interest expense added back; companyfacts carries no presentation " +
  "linkbase, so this cannot be checked, and where it does the figure overstates EBIT by that interest";

/** The current portion of long-term debt AND finance leases, as retailers tag their current installments. */
export const COMBINED_CURRENT_DEBT_TAG = "LongTermDebtAndCapitalLeaseObligationsCurrent";

/** The debt-maturity schedule's first-year principal: a note disclosure, not a balance-sheet line. */
export const MATURITIES_NEXT_YEAR_TAG = "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths";

export const MATURITIES_STAND_IN: TagStandIn = {
  tag: MATURITIES_NEXT_YEAR_TAG,
  disclose:
    `current maturities of long-term debt from the debt maturity schedule (${MATURITIES_NEXT_YEAR_TAG}) stand in for the ` +
    "balance sheet's current portion of long-term debt: neither DebtCurrent nor LongTermDebtCurrent was filed for the period; " +
    "the figure is current maturities only (short-term borrowings and commercial paper are counted separately when tagged) and, " +
    "as a note disclosure, may be filed annually only, so quarterly rows can lack it",
};

/** The all-classes share count a per-class reporter files instead of the dei cover count. */
export const BALANCE_SHEET_SHARES_TAG = "CommonStockSharesOutstanding";

export const LINE_ITEM_TAGS = {
  // --- income statement -----------------------------------------------------
  revenue: entry(REVENUE_TAGS),
  bankRevenueTotal: entry(["Revenues", "RevenuesNetOfInterestExpense"]),
  bankRevenueComponents: entry(["InterestIncomeExpenseNet", "NoninterestIncome"]),
  costOfRevenue: entry(["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfServices"]),
  grossProfit: entry(["GrossProfit"]),
  researchAndDevelopmentExpenses: entry([
    "ResearchAndDevelopmentExpense",
    "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
  ]),
  sellingGeneralAndAdministrativeExpenses: entry(["SellingGeneralAndAdministrativeExpense"]),
  sellingAndMarketingExpenses: entry(["SellingAndMarketingExpense"]),
  generalAndAdministrativeExpenses: entry(["GeneralAndAdministrativeExpense"]),
  operatingExpenses: entry(["OperatingExpenses"]),
  operatingIncome: entry(["OperatingIncomeLoss"]),
  interestExpense: entry(INTEREST_EXPENSE_TAGS, INTEREST_EXPENSE_STAND_INS),
  interestIncome: entry([
    "InvestmentIncomeInterest",
    "InvestmentIncomeInterestAndDividend",
    "InterestAndDividendIncomeOperating",
    // The bank twin of the tag above: JPM's total interest income.
    "InterestIncomeOperating",
  ]),
  netInterestIncome: entry(["InterestIncomeExpenseNet"]),
  incomeBeforeTax: entry(INCOME_BEFORE_TAX_TAGS),
  incomeTaxExpense: entry(["IncomeTaxExpenseBenefit"]),
  // As filed: this standard element does not establish a universal tax basis.
  equityMethodIncomeLoss: entry(["IncomeLossFromEquityMethodInvestments"]),
  totalOtherIncomeExpensesNet: entry(["NonoperatingIncomeExpense"]),
  netIncome: entry(["NetIncomeLoss", ...CONSOLIDATED_NET_INCOME_TAGS, "NetIncomeLossAvailableToCommonStockholdersBasic"]),
  netIncomeConsolidated: entry(CONSOLIDATED_NET_INCOME_TAGS),
  netIncomeAttributableToNoncontrollingInterest: entry(["NetIncomeLossAttributableToNoncontrollingInterest"]),
  netIncomeAvailableToCommon: entry(["NetIncomeLossAvailableToCommonStockholdersBasic"]),
  netIncomeFromContinuingOperations: entry(["IncomeLossFromContinuingOperations"]),
  netIncomeFromDiscontinuedOperations: entry(["IncomeLossFromDiscontinuedOperationsNetOfTax"]),
  depreciationAndAmortization: entry([
    "DepreciationDepletionAndAmortization",
    "DepreciationAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
  ]),
  // A filer with no dilutive securities can tag one figure for both bases with
  // the combined elements; each is the basic and the diluted figure at once
  // (audit 2026-10-22 B-35).
  eps: entry(["EarningsPerShareBasic", "EarningsPerShareBasicAndDiluted"]),
  epsDiluted: entry(["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"]),
  weightedAverageShsOut: entry(["WeightedAverageNumberOfSharesOutstandingBasic", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"]),
  weightedAverageShsOutDil: entry(["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"]),

  // --- balance sheet --------------------------------------------------------
  cashAndCashEquivalents: entry([
    "CashAndCashEquivalentsAtCarryingValue",
    "CashAndDueFromBanks",
    "Cash",
  ]),
  cashAndCashEquivalentsIncludingRestricted: entry(["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]),
  restrictedCashAndCashEquivalents: entry(["RestrictedCashAndCashEquivalentsAtCarryingValue", "RestrictedCashAndCashEquivalents"]),
  restrictedCashAndCashEquivalentsNoncurrent: entry(["RestrictedCashAndCashEquivalentsNoncurrent"]),
  // Audit 2026-10-22 B-43: restrictions tagged as restricted cash only, read
  // as unrestricted cash's subtrahends after the cash-and-equivalents forms.
  restrictedCashCurrent: entry(["RestrictedCashCurrent"]),
  restrictedCashNoncurrent: entry(["RestrictedCashNoncurrent"]),
  shortTermInvestments: entry([
    "ShortTermInvestments",
    "MarketableSecuritiesCurrent",
    "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    "InterestBearingDepositsInBanks",
    // The taxonomy's current debt securities of every class (available for
    // sale, held to maturity, trading). NVIDIA's balance-sheet marketable
    // securities moved here from MarketableSecuritiesCurrent with its FY2026
    // 10-K (39.065B at 2026-01-25); last, so a period that tags an element
    // above keeps it.
    "DebtSecuritiesCurrent",
  ]),
  cashAndShortTermInvestments: entry(["CashCashEquivalentsAndShortTermInvestments"]),
  netReceivables: entry(["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"]),
  inventory: entry(["InventoryNet"]),
  totalCurrentAssets: entry(["AssetsCurrent"]),
  propertyPlantEquipmentNet: entry([
    "PropertyPlantAndEquipmentNet",
    "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization",
  ]),
  goodwill: entry(["Goodwill"]),
  /**
   * The tagged total of intangibles other than goodwill. A filer without it
   * (JPM) tags the finite-lived and indefinite-lived pieces separately; the
   * taxonomy defines the two as disjoint, so `intangibleAssetsParts` sums the
   * ones present. The parts step runs only when the total misses, so a piece
   * is never added to a total that already contains it. Taking the
   * finite-lived piece alone (as this did until 2026-10-13) dropped JPM's
   * indefinite-lived intangibles (1.3B FY2025, 1.2B FY2024) and overstated
   * its tangible common equity by that much. Mortgage servicing rights
   * (`ServicingAssetAtFairValueAmount`) are deliberately NOT a part: the
   * tangible-common-equity convention, JPM's own included, keeps them in TCE.
   * FMP's `intangibleAssets` does include them (JPM FY2025 11.73B = ~2.56B
   * other intangibles + 9.17B MSRs), so for a mortgage servicer the EDGAR and
   * FMP figures legitimately differ.
   */
  intangibleAssets: entry(["IntangibleAssetsNetExcludingGoodwill"]),
  intangibleAssetsParts: entry(["FiniteLivedIntangibleAssetsNet", "IndefiniteLivedIntangibleAssetsExcludingGoodwill"]),
  /**
   * Investments held beyond a year: the filed total first. A filer without one
   * (Amazon carries its Anthropic and OpenAI stakes in "Other assets") tags the
   * pieces, which `longTermInvestments` in statements.ts sums. Only elements
   * the taxonomy defines as non-current are pieces: the undivided
   * `AvailableForSaleSecuritiesDebtSecurities` total usually also holds
   * current and cash-equivalent securities, so it is never one.
   */
  longTermInvestments: entry(["LongTermInvestments"]),
  noncurrentDebtSecurities: entry(["MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent"]),
  /** A filed "other investments" line, which holds the two pieces after it when it is tagged. */
  otherLongTermInvestments: entry(["OtherLongTermInvestments"]),
  nonMarketableEquitySecurities: entry(["EquitySecuritiesWithoutReadilyDeterminableFairValueAmount"]),
  equityMethodInvestments: entry(["EquityMethodInvestments"]),
  totalAssets: entry(["Assets"]),
  /** The balance sheet's own total-current-debt line; a superset of every tag below. */
  debtCurrent: entry(["DebtCurrent"]),
  /** Borrowings with an initial term under a year — a different instrument from current maturities. */
  shortTermBorrowings: entry(["ShortTermBorrowings"]),
  commercialPaper: entry(["CommercialPaper"]),
  /** The current portion of long-term debt; the maturity-schedule figure stands in only when both miss. */
  currentMaturitiesOfLongTermDebt: entry(["LongTermDebtCurrent", COMBINED_CURRENT_DEBT_TAG], [MATURITIES_STAND_IN]),
  /**
   * Chevron's 10-Qs tag their long-term debt only as the last element, which
   * holds current maturities and finance leases (audit 2026-10-22 B-15);
   * `resolveDebtOverlaps` nets both overlaps out.
   */
  longTermDebt: entry(["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "LongTermDebt", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"]),
  /**
   * All noncurrent notes and loans, excluding their current portion: Oracle's
   * balance-sheet line (audit 2026-10-22 B-14). Its current portion is the
   * notes-and-loans current tag, else the notes one.
   */
  longTermNotesAndLoans: entry(["LongTermNotesAndLoans"]),
  longTermNotesAndLoansCurrent: entry(["NotesAndLoansPayableCurrent", "NotesPayableCurrent"]),
  /**
   * Financing debt for a filer that tags none of the `longTermDebt` aggregates
   * (audit 2026-10-19, O-1/SNOW-1). Realty Income and NNN tag their unsecured
   * notes and term loans as `NotesPayable`/`LoansPayable`, Snowflake its only
   * debt as `ConvertibleDebtNoncurrent`, Progressive its debt as
   * `DebtLongtermAndShorttermCombinedAmount`; without these the debt total was
   * leases and commercial paper alone. The combined amount is all debt; each
   * family below is one instrument class, inclusive total first, then its
   * noncurrent variant, so a class is never counted twice. Families are summed.
   * They resolve only when every aggregate above misses, and
   * `resolveDebtOverlaps` withholds the result where a family could overlap a
   * current-debt line or another family.
   */
  debtCombinedTotal: entry(["DebtLongtermAndShorttermCombinedAmount"]),
  longTermDebtNotes: entry(["NotesPayable", "LongTermNotesPayable", "SeniorNotes", "SeniorLongTermNotes"]),
  longTermDebtLoans: entry(["LoansPayable", "LongTermLoansPayable"]),
  longTermDebtSecured: entry(["SecuredDebt", "SecuredLongTermDebt"]),
  longTermDebtConvertible: entry(["ConvertibleNotesPayable", "ConvertibleDebtNoncurrent", "ConvertibleLongTermNotesPayable"]),
  longTermDebtRevolver: entry(["LongTermLineOfCredit"]),
  /**
   * The current portions that the noncurrent variants above exclude. Notes due
   * within a year move from `ConvertibleDebtNoncurrent` to
   * `ConvertibleDebtCurrent`, so composing the noncurrent tag alone would drop
   * them silently (audit review of O-1/SNOW-1).
   */
  longTermDebtNotesCurrent: entry(["NotesPayableCurrent", "SeniorNotesCurrent", "LongTermNotesPayableCurrent"]),
  longTermDebtLoansCurrent: entry(["LoansPayableCurrent", "LongTermLoansPayableCurrent"]),
  longTermDebtSecuredCurrent: entry(["SecuredDebtCurrent"]),
  longTermDebtConvertibleCurrent: entry(["ConvertibleDebtCurrent", "ConvertibleNotesPayableCurrent"]),
  longTermDebtRevolverCurrent: entry(["LinesOfCreditCurrent"]),
  /** Completeness evidence only: this aggregate can be gross principal, not carrying debt. */
  debtInstrumentAggregate: entry(["DebtInstrumentCarryingAmount"]),
  /** Noncurrent carrying subtype: completeness evidence, never an additive synonym. */
  convertibleNoncurrentCarrying: entry(["ConvertibleLongTermNotesPayable"]),
  /** Scope evidence for a fiscal maturity schedule; never a carrying-debt stand-in. */
  debtMaturitiesFiscalRemainder: entry(["LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear"]),
  totalCurrentLiabilities: entry(["LiabilitiesCurrent"]),
  totalLiabilities: entry(["Liabilities"]),
  deferredRevenue: entry(["ContractWithCustomerLiabilityCurrent", "DeferredRevenueCurrent"]),
  taxPayables: entry(["AccruedIncomeTaxesCurrent", "TaxesPayableCurrent"]),
  operatingLeaseLiability: entry(["OperatingLeaseLiability"]),
  operatingLeaseLiabilityParts: entry(["OperatingLeaseLiabilityCurrent", "OperatingLeaseLiabilityNoncurrent"]),
  financeLeaseLiability: entry(["FinanceLeaseLiability", "CapitalLeaseObligations"]),
  financeLeaseLiabilityParts: entry(["FinanceLeaseLiabilityCurrent", "FinanceLeaseLiabilityNoncurrent"]),
  /**
   * The carrying value first. `PreferredStockValue` is the par or stated
   * value; a filer that carries its preferred at par plus paid-in capital tags
   * an APIC-inclusive element instead. JPM has tagged only
   * `PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount` since 2009
   * (20,045M FY2025, 20,050M FY2024: the face-of-balance-sheet figure FMP also
   * reports), so until 2026-10-13 its preferred resolved to nothing and its
   * tangible common equity kept ~20B of preferred inside it (D-42).
   */
  preferredStock: entry([
    "PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount",
    "PreferredStockIncludingAdditionalPaidInCapital",
    "PreferredStockValue",
  ]),
  commonStock: entry(["CommonStockValue"]),
  retainedEarnings: entry(["RetainedEarningsAccumulatedDeficit"]),
  accumulatedOtherComprehensiveIncomeLoss: entry(["AccumulatedOtherComprehensiveIncomeLossNetOfTax"]),
  totalStockholdersEquity: entry(["StockholdersEquity"]),
  totalEquity: entry(["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]),
  minorityInterest: entry(["MinorityInterest", "NonredeemableNoncontrollingInterest"]),
  // Mezzanine carrying amounts, never permanent preferredStock, redemption
  // values, liquidation preferences, or share counts.
  temporaryEquity: entry(["TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests"]),
  temporaryEquityAttributableToParent: entry(["TemporaryEquityCarryingAmountAttributableToParent"]),
  temporaryEquityAttributableToNoncontrollingInterest: entry(["RedeemableNoncontrollingInterestEquityCarryingAmount"]),
  deposits: entry(["Deposits"]),
  sharesOutstandingBalanceSheet: entry([BALANCE_SHEET_SHARES_TAG]),

  // --- cash flow ------------------------------------------------------------
  cashflowNetIncome: entry([...CONSOLIDATED_NET_INCOME_TAGS, "NetIncomeLoss"]),
  stockBasedCompensation: entry(["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"]),
  changeInWorkingCapital: entry(["IncreaseDecreaseInOperatingCapital"]),
  operatingCashFlow: entry([
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ]),
  capitalExpenditure: entry(["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]),
  acquisitionsNet: entry(["PaymentsToAcquireBusinessesNetOfCashAcquired"]),
  debtIssuance: entry(["ProceedsFromIssuanceOfLongTermDebt"]),
  debtRepayment: entry(["RepaymentsOfLongTermDebt"]),
  commonStockIssuance: entry(["ProceedsFromIssuanceOfCommonStock"]),
  commonStockRepurchased: entry(["PaymentsForRepurchaseOfCommonStock"]),
  netDividendsPaid: entry(["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"]),
  /**
   * Common dividends have their own element; when only the total is tagged
   * the statements builder nets the preferred element out of it, and only
   * when no preferred element is filed either does the total stand in
   * (disclosed) — see COMMON_DIVIDENDS_SPEC in statements.ts.
   */
  commonDividendsPaid: entry(["PaymentsOfDividendsCommonStock"]),
  preferredDividendsPaid: entry(["PaymentsOfDividendsPreferredStockAndPreferenceStock"]),
  incomeTaxesPaid: entry(["IncomeTaxesPaidNet", "IncomeTaxesPaid"]),
  interestPaid: entry(["InterestPaidNet", "InterestPaid"]),
  netCashProvidedByInvestingActivities: entry(["NetCashProvidedByUsedInInvestingActivities"]),
  netCashProvidedByFinancingActivities: entry(["NetCashProvidedByUsedInFinancingActivities"]),

  // --- dei cover page (the `dei` namespace, not us-gaap) ---------------------
  /** Stated once per class of registered common stock; the classes are summed. */
  deiSharesOutstanding: entry(["EntityCommonStockSharesOutstanding"]),
  /** A DOLLAR amount as of the last business day of the most recent second fiscal quarter. */
  deiPublicFloat: entry(["EntityPublicFloat"]),
} as const satisfies Record<string, TagSynonymEntry>;

export type LineItem = keyof typeof LINE_ITEM_TAGS;

/** The ordered tag list of one line item (a fresh array; callers may not mutate the table). */
export function tagsFor(item: LineItem): string[] {
  return [...LINE_ITEM_TAGS[item].tags];
}

/** The stand-ins of one line item, in order; empty when it has none. */
export function standInsFor(item: LineItem): TagStandIn[] {
  return [...(LINE_ITEM_TAGS[item].standIns ?? [])];
}
