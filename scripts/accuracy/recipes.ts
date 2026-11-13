/**
 * How each headline figure's filed value is built from SEC XBRL facts. The
 * defaults follow the plain filed line; companies.json overrides a figure for
 * one issuer when its statements use another concept (each override says why).
 *
 * The resolver (`resolveReference`) is pure: it takes companyfacts JSON, the
 * figure's period as the report states it and the report's cutoff, and returns
 * the filed value with every operand's filing reference. It never reads
 * Metis's values, so the reference stays independent of Metis's extraction.
 *
 * Four rules hold for every recipe, each in one place:
 * - A total is never added to its own parts. A concept list holds alternative
 *   elements for ONE line, broadest first; a total and its components are
 *   alternatives (`first`); total current debt is reconciled with its parts
 *   (`currentDebt`).
 * - A composed value stands on one filing (P7): a balance is resolved filing by
 *   filing, newest first (`acrossFilings`); flows in one sum or ratio must come
 *   from the same filings.
 * - A part the filing does not tag is a zero only when its absence is
 *   established from the filings (P10, `establishAbsent`); a part-type element
 *   stands for a whole class only when the filing shows no other member of the
 *   class (`classCheck`).
 * - The newest filing on or before the cutoff wins (P2); a composition that
 *   would have to mix an older filing's parts with newer restated ones is not
 *   established.
 */
import {
  FISCAL_YEAR_DAYS,
  QUARTER_DAYS,
  addDays,
  buildTtm,
  dayNumber,
  factsFor,
  latestFiscalYearEnd,
  measureOfXbrlUnit,
  parsePeriod,
  partsAgreeWithTotal,
  selectDuration,
  selectInstant,
  splitConcept,
  STATEMENT_FORMS,
  type CompanyFacts,
  type FiledDerivation,
  type FiledPoint,
  type InstanceFact,
  type Measure,
  type Period,
  type ReferenceKind,
} from "./lib";

/** One signed term of a sum. `absent`: an untagged term counts as zero only when that evidence rule establishes its absence. */
export interface Term {
  role: string;
  sign: 1 | -1;
  recipe: Recipe;
  absent?: EvidenceRuleName;
}

export type Recipe =
  /** An additive flow (or a per-share or share figure for an exact fiscal year or quarter). Concepts: alternative elements for one line, broadest first. */
  | { op: "flow"; concepts: string[]; unit?: string }
  /**
   * A balance at the figure's instant. Concepts: alternative elements for one line, broadest first. With `absence`, a
   * balance no filing tags is a filed zero only when that absence is established (see EVIDENCE_RULES). With `complete`,
   * the element is one member of a class (debt securities among current investments) and stands for the whole class
   * only when the filing shows no other member.
   */
  | { op: "instant"; concepts: string[]; unit?: string; absence?: EvidenceRuleName; complete?: EvidenceRuleName }
  /**
   * Signed terms from one filing (instants) or the same filings (flows). Every term must resolve, except one marked
   * `absent`, which counts as zero when its absence is established. With `complete`, the terms are members of a class
   * and the sum stands for the class only when the filing shows no other member.
   */
  | { op: "sum"; terms: Term[]; complete?: EvidenceRuleName }
  /**
   * Alternative representations of one figure (e.g. a filed total line, or its filed components): the alternative from
   * the newest filing wins (P2); the order only breaks a tie on the filing date (see `newestAlternative`).
   */
  | { op: "first"; alternatives: Recipe[] }
  /** Numerator over denominator, times `scale`. */
  | { op: "ratio"; numerator: Recipe; denominator: Recipe; scale: number }
  /** Weighted-average shares for the latest period ending at the date: the fiscal quarter if tagged, else the fiscal year. */
  | { op: "latestShares"; concepts: string[]; unit?: string }
  /** Debt due within a year, excluding finance leases: the filed total reconciled with its parts (see `currentDebtAt`). */
  | { op: "currentDebt" }
  /** A named building block defined once in this file (NAMED_RECIPES), so an override never restates it. */
  | { op: "use"; name: NamedRecipe }
  /** No filed value: say why. */
  | { op: "none"; note: string };

export interface CompanyConfig {
  ticker: string;
  case: string;
  cik: number;
  /** Currency of the filed statements. */
  currency: string;
  /** Per-figure overrides, each with a reason. */
  overrides?: Record<string, { recipe: Recipe; why: string }>;
  /**
   * Filings whose own XBRL instance documents are read as well: ones SEC companyfacts has not ingested, and ones
   * whose line is a filer extension element (read as "ext:Name"), which companyfacts never carries (each with the reason).
   */
  instanceFilings?: { accn: string; why: string }[];
  /** Filed amounts are multiplied by this before comparison (e.g. ordinary-share EPS × ADS ratio), per figure. */
  scale?: Record<string, { factor: number; why: string }>;
}

// Each list names alternative elements for ONE line, broadest first: the newest filing wins, and within one filing
// the first listed element that is tagged. A list never holds a total beside a line the total is added to.
const US = {
  // Total revenues first; a filer with one revenue line tags it as revenue from contracts with customers.
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
  operatingIncome: ["OperatingIncomeLoss"],
  // Attributable to the parent (P5); ProfitLoss, which includes non-controlling interests, is never an alias.
  netIncome: ["NetIncomeLoss"],
  // Consolidated profit, including non-controlling interests: the line a cash-flow statement starts from. The
  // free-cash-flow series and the current-capital window hold this line by definition (D-212, D-238: consolidated
  // cash flow is divided by consolidated profit, never the parent's). A filer with one profit line tags only
  // NetIncomeLoss, and that line is then its consolidated profit.
  consolidatedProfit: ["ProfitLoss", "NetIncomeLoss"],
  eps: ["EarningsPerShareDiluted"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  // The cash-flow statement's purchase line, a positive outflow; filers use one element or the other for it.
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  ocf: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  incomeTax: ["IncomeTaxExpenseBenefit"],
  pretax: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
} as const;

const flow = (concepts: readonly string[], unit?: string): Recipe => ({ op: "flow", concepts: [...concepts], ...(unit ? { unit } : {}) });
const instant = (concepts: readonly string[], options: { absence?: EvidenceRuleName; complete?: EvidenceRuleName } = {}): Recipe => ({ op: "instant", concepts: [...concepts], ...options });

export type EvidenceRuleName =
  | "noncontrolling-interest"
  | "preferred-stock"
  | "operating-leases"
  | "finance-leases"
  | "current-investments"
  | "long-term-investments"
  | "short-term-borrowings"
  | "current-maturities";

/** Kept for readers of the first review round: an absence rule is an evidence rule. */
export type AbsenceRuleName = EvidenceRuleName;

interface EvidenceRule {
  label: string;
  /** Element names that show a balance of this kind in the filing (extension elements included). */
  name: RegExp;
  /** Names the pattern would catch that say nothing about the balance. */
  except?: RegExp;
  /**
   * Whether a fact under such a name counts when it sits on a dimension member too. True for leases and debt, which
   * filers tag on a related-party, balance-sheet-location or instrument member; false where a member only breaks a
   * line down (the securities of a trust fund are not a short-term investment line). Facts of another registrant
   * (LegalEntityAxis) never count: they are not the consolidated entity's (P5).
   */
  dimensional: boolean;
  /** Dimension members that disclose the balance whatever the element (NCI on the equity statement's component axis). */
  member?: RegExp;
  /** Total equity including NCI that differs from parent equity discloses NCI. */
  equityGap?: boolean;
}

/**
 * What shows that a balance exists in a filing, per kind of balance. Used two ways (P7, P10: a vendor or tool zero is
 * not a filed zero, and the absence of one tag does not prove a zero):
 * - `establishAbsent`: a balance the filing does not tag is a filed zero only when nothing here shows it;
 * - `classCheck`: an element that is one member of the class stands for the whole class only when nothing here shows
 *   another member.
 * Every check is on the one filing that carries the balance sheet at the instant, filed on or before the cutoff, read
 * from its own XBRL instance (companyfacts drops dimensional facts and extension elements). Only nonzero amounts in a
 * currency count (for preferred stock, issued or outstanding share counts too); elements the recipe itself uses are
 * left out.
 */
export const EVIDENCE_RULES: Record<EvidenceRuleName, EvidenceRule> = {
  "noncontrolling-interest": {
    label: "non-controlling interest",
    name: /Noncontrolling|MinorityInterest/i,
    // Totals that include NCI are checked by the equity gap instead; they are never NCI themselves.
    except: /IncludingPortionAttributableToNoncontrolling|ExcludingPortionAttributableToNoncontrolling|AttributableToParent/i,
    dimensional: false,
    member: /Noncontrolling|MinorityInterest/i,
    equityGap: true,
  },
  "preferred-stock": {
    label: "preferred stock",
    name: /Preferred|TemporaryEquityCarryingAmount/i,
    // Authorized-but-unissued counts and per-share terms say nothing about an outstanding claim.
    except: /Authorized|PerShare|ParOrStatedValue/i,
    dimensional: false,
    member: /Preferred/i,
  },
  "operating-leases": {
    label: "operating lease liabilities",
    // The liability, its right-of-use asset, its payment schedule or its deferred tax all show operating leases exist.
    name: /OperatingLease|LeaseLiabilit/i,
    except: /FinanceLease|^Lessor|ToBeReceived|Receivable/i,
    dimensional: true,
  },
  "finance-leases": {
    label: "finance lease liabilities",
    name: /FinanceLease|CapitalLease|LeaseLiabilit/i,
    except: /OperatingLease|^Lessor|ToBeReceived|Receivable|NetInvestmentIn/i,
    dimensional: true,
  },
  "current-investments": {
    label: "short-term investments",
    // Classified current investment lines, and the two unclassified elements filers also use for a current line.
    name: /ShortTermInvestments|^MarketableSecurities$|^EquitySecuritiesFvNi$|(Securities|Investments)\w*Current$|^TimeDeposits|^CertificatesOfDeposit/i,
    except: /Noncurrent|Restricted|AmortizedCost|Unrealized|GainLoss|CashCashEquivalents/i,
    dimensional: false,
  },
  "long-term-investments": {
    label: "long-term investments",
    name: /LongTermInvestments|^EquityMethodInvestments$|^EquitySecuritiesWithoutReadilyDeterminableFairValueAmount$|(Securities|Investments)\w*Noncurrent$|NonMarketable|^OtherInvestments$|^Investments$/i,
    except: /CurrentAndNoncurrent|Restricted|AmortizedCost|Unrealized|GainLoss/i,
    dimensional: false,
  },
  "short-term-borrowings": {
    label: "short-term borrowings",
    name: /^(ShortTermBorrowings|OtherShortTermBorrowings|CommercialPaper|BankOverdrafts|LinesOfCreditCurrent)$|^ShortTerm(Debt|BankLoans|NonBankLoans)|(NotesPayable|LoansPayable|NotesAndLoansPayable|Borrowings)\w*Current$/i,
    except: /Receivable|FairValue|Capacity/i,
    dimensional: true,
  },
  "current-maturities": {
    label: "current maturities of long-term debt",
    name: /^DebtCurrent$|(LongTermDebt|LongTermDebtAndCapitalLeaseObligations|SeniorNotes|ConvertibleNotesPayable|ConvertibleDebt|SecuredDebt|UnsecuredDebt|SubordinatedDebt|LongTermNotesPayable|LongTermLoansPayable)Current$|Current(Portion|Maturities)Of/i,
    except: /Receivable|FairValue/i,
    dimensional: true,
  },
};

const NCI_CONCEPTS = ["MinorityInterest", "NonredeemableNoncontrollingInterest"] as const;
// Carrying value first (par or stated value last), as the statement's preferred claim (src/edgar/tagSynonyms.ts).
const PREFERRED_CONCEPTS = ["PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount", "PreferredStockIncludingAdditionalPaidInCapital", "PreferredStockValue"] as const;

/**
 * A lease liability: the filed total, or its current and noncurrent parts together. One part alone is not the
 * liability (the other part can sit untagged inside another balance-sheet line), so both parts are required.
 */
function leases(kind: "Operating" | "Finance"): Recipe {
  const label = kind.toLowerCase();
  return {
    op: "first",
    alternatives: [
      instant([`${kind}LeaseLiability`]),
      {
        op: "sum",
        terms: [
          { role: `${label} lease liability, current`, sign: 1, recipe: instant([`${kind}LeaseLiabilityCurrent`]) },
          { role: `${label} lease liability, noncurrent`, sign: 1, recipe: instant([`${kind}LeaseLiabilityNoncurrent`]) },
        ],
      },
    ],
  };
}
export const OPERATING_LEASES: Recipe = leases("Operating");
export const FINANCE_LEASES: Recipe = leases("Finance");

/**
 * Current investments: the filed classified total (short-term investments, else current marketable securities), or the
 * current debt securities line, which is the whole only when the filing shows no other current investment (equity
 * securities, time deposits). ShortTermInvestments is the broader element, so it is listed first.
 */
export const SHORT_TERM_INVESTMENTS: Recipe = {
  op: "first",
  alternatives: [
    instant(["ShortTermInvestments", "MarketableSecuritiesCurrent"]),
    instant(["DebtSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"], { complete: "current-investments" }),
  ],
};

/** Cash and cash equivalents (excluding restricted cash) plus current investments: the filed total, or the two lines. */
export const CASH_AND_STI: Recipe = {
  op: "first",
  alternatives: [
    instant(["CashCashEquivalentsAndShortTermInvestments"]),
    {
      op: "sum",
      terms: [
        { role: "cash and cash equivalents", sign: 1, recipe: instant(US.cash) },
        { role: "short-term investments / marketable securities, current", sign: 1, recipe: SHORT_TERM_INVESTMENTS, absent: "current-investments" },
      ],
    },
  ],
};

/**
 * Investments held beyond a year: the filed total, or the noncurrent investment lines the filing tags (noncurrent
 * marketable securities, non-marketable equity securities, equity-method investments), which are the whole only when
 * the filing shows no other long-term investment line.
 */
export const LONG_TERM_INVESTMENTS: Recipe = {
  op: "first",
  alternatives: [
    instant(["LongTermInvestments"]),
    {
      op: "sum",
      complete: "long-term-investments",
      terms: [
        { role: "marketable securities, noncurrent", sign: 1, recipe: instant(["MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent"]), absent: "long-term-investments" },
        { role: "non-marketable equity securities", sign: 1, recipe: instant(["EquitySecuritiesWithoutReadilyDeterminableFairValueAmount"]), absent: "long-term-investments" },
        { role: "equity-method investments", sign: 1, recipe: instant(["EquityMethodInvestments"]), absent: "long-term-investments" },
      ],
    },
  ],
};

/**
 * Borrowings on a classified balance sheet, excluding leases: debt due within a year (`currentDebt`) and noncurrent
 * long-term debt. LongTermDebt, the taxonomy's total including current maturities, is never an alias of either: an
 * issuer that tags its debt that way has an override saying which line it is.
 */
export const BORROWINGS_TERMS: Term[] = [
  { role: "debt, current", sign: 1, recipe: { op: "currentDebt" } },
  { role: "debt, noncurrent", sign: 1, recipe: instant(["LongTermDebtNoncurrent"]) },
];
export const TOTAL_DEBT_INCLUDING_LEASES: Recipe = {
  op: "sum",
  terms: [
    ...BORROWINGS_TERMS,
    { role: "operating lease liabilities", sign: 1, recipe: OPERATING_LEASES, absent: "operating-leases" },
    { role: "finance lease liabilities", sign: 1, recipe: FINANCE_LEASES, absent: "finance-leases" },
  ],
};

/** Building blocks an override may name instead of restating (one definition, read everywhere). */
export const NAMED_RECIPES = {
  operatingLeases: OPERATING_LEASES,
  financeLeases: FINANCE_LEASES,
  shortTermInvestments: SHORT_TERM_INVESTMENTS,
  cashAndShortTermInvestments: CASH_AND_STI,
  longTermInvestments: LONG_TERM_INVESTMENTS,
} as const;
export type NamedRecipe = keyof typeof NAMED_RECIPES;

const FCF: Recipe = { op: "sum", terms: [{ role: "operating cash flow", sign: 1, recipe: flow(US.ocf) }, { role: "capital spending", sign: -1, recipe: flow(US.capex) }] };

export const DEFAULT_RECIPES: Record<string, Recipe> = {
  "revenue.fy": flow(US.revenue),
  "operatingIncome.fy": flow(US.operatingIncome),
  "netIncome.fy": flow(US.consolidatedProfit),
  "epsDiluted.fy": flow(US.eps, "{currency}/shares"),
  "dilutedShares.fy": flow(US.dilutedShares, "shares"),
  "capex.fy": flow(US.capex),
  "fcf.fy": FCF,
  "operatingIncome.ttm": flow(US.operatingIncome),
  "netIncome.ttm": flow(US.consolidatedProfit),
  "operatingCashFlow.ttm": flow(US.ocf),
  "capex.ttm": flow(US.capex),
  "fcf.ttm": FCF,
  "cashAndShortTermInvestments.latest": CASH_AND_STI,
  "totalDebtIncludingLeases.latest": TOTAL_DEBT_INCLUDING_LEASES,
  "operatingLeases.latest": OPERATING_LEASES,
  "financeLeases.latest": FINANCE_LEASES,
  "fv.startRevenue": flow(US.revenue),
  "fv.taxRate": { op: "ratio", numerator: flow(US.incomeTax), denominator: flow(US.pretax), scale: 100 },
  "fv.dilutedShares": { op: "latestShares", concepts: [...US.dilutedShares], unit: "shares" },
  "fv.netDebt": {
    op: "sum",
    terms: [
      ...BORROWINGS_TERMS,
      { role: "finance lease liabilities", sign: 1, recipe: FINANCE_LEASES, absent: "finance-leases" },
      { role: "cash and short-term investments", sign: -1, recipe: CASH_AND_STI },
    ],
  },
  "fv.minorityInterest": instant(NCI_CONCEPTS, { absence: "noncontrolling-interest" }),
  "fv.preferred": instant(PREFERRED_CONCEPTS, { absence: "preferred-stock" }),
  "fv.nonOperatingInvestments": LONG_TERM_INVESTMENTS,
  "fv.openingBookValue": instant(["StockholdersEquity"]),
  "fv.incomeAvailableToCommon": flow(["NetIncomeLossAvailableToCommonStockholdersBasic"]),
  "fv.payoutRatio": { op: "none", note: "a house average (common dividends plus net buybacks over income to common, up to three fiscal years); its filed operands are not composed by this check" },
  "fv.ffo.netIncome": flow(US.netIncome),
  // The taxonomy's aggregate first: depreciation, depletion and amortization holds depreciation and amortization.
  "fv.ffo.depreciationAmortization": flow(["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"]),
  "fv.ffo.realEstateDepreciationAmortization": flow(["DepreciationAndAmortizationRealEstate", "RealEstateDepreciation", "RealEstateInvestmentPropertyAccumulatedDepreciationPeriodIncreaseDecrease"]),
  "fv.ffo.gainsOnSale": flow(["GainLossOnSaleOfProperties", "GainsLossesOnSalesOfInvestmentRealEstate"]),
  "fv.ffo.impairments": flow(["ImpairmentOfRealEstate"]),
  "fv.ffo.shares": flow(US.dilutedShares, "shares"),
  "runway.liquidAssets": CASH_AND_STI,
  "fv.suppressed": { op: "none", note: "the fair value is withheld, so there are no fair-value inputs to compare" },
};

export interface ResolvedReference {
  value: number;
  kind: ReferenceKind;
  /** What the value measures, from the filed units (P3, P4). */
  measure: Measure;
  /** The period the filed value covers, in the figure's period syntax. */
  period: string;
  formula: string;
  points: (FiledPoint & { role: string; sign: 1 | -1 })[];
  /** Operand values whose rounding a derived value inherits. */
  operands: number[];
  notes: string[];
}

export interface Unresolved {
  reason: string;
  /** Filings whose own XBRL instance must be read before the reference can be decided (absence and completeness proofs). */
  needsInstance?: string[];
}

/** A filing's own XBRL instance facts, read by accuracy:fetch, keyed by accession. */
export type InstanceEvidence = Readonly<Record<string, readonly InstanceFact[]>>;

/**
 * "Within a year" for this file, one band used twice: a TTM's fiscal year ends at most this many days before the
 * window's end, and a balance tagged this recently still shows the issuer has it (a quarterly report's notes are
 * condensed; the annual report before it is not).
 */
const WITHIN_A_YEAR_DAYS = 370;

interface Context {
  facts: CompanyFacts;
  currency: string;
  cutoff: string;
  instances: InstanceEvidence;
}

type Filing = { accn: string; form: string; filed: string };

function measureOf(unit: string): Measure | Unresolved {
  return measureOfXbrlUnit(unit) ?? { reason: `unit ${unit} is not a currency amount, a per-share amount or a share count` };
}

function unitOf(recipe: { unit?: string }, ctx: Context): string {
  return (recipe.unit ?? ctx.currency).replace("{currency}", ctx.currency);
}

/** The local element name of a concept ("ext:Name" or "ifrs-full:Name" → "Name"). */
const localName = (concept: string): string => splitConcept(concept).name;

/** Every balance concept a recipe can read, with its unit (for finding the filings that tag any of them). */
function balanceConcepts(recipe: Recipe, ctx: Context): { concept: string; unit: string }[] {
  switch (recipe.op) {
    case "instant":
      return recipe.concepts.map((concept) => ({ concept, unit: unitOf(recipe, ctx) }));
    case "sum":
      return recipe.terms.flatMap((term) => balanceConcepts(term.recipe, ctx));
    case "first":
      return recipe.alternatives.flatMap((alternative) => balanceConcepts(alternative, ctx));
    case "ratio":
      return [...balanceConcepts(recipe.numerator, ctx), ...balanceConcepts(recipe.denominator, ctx)];
    case "currentDebt":
      return Object.values(CURRENT_DEBT).map((concept) => ({ concept, unit: ctx.currency }));
    case "use":
      return balanceConcepts(NAMED_RECIPES[recipe.name], ctx);
    default:
      return [];
  }
}

/** One recipe for one period. A composed balance stands on one filing (P7): `accn` pins it. */
function resolve(recipe: Recipe, period: Period, ctx: Context, accn?: string): ResolvedReference | Unresolved {
  switch (recipe.op) {
    case "none":
      return { reason: recipe.note };
    case "use": {
      const named = NAMED_RECIPES[recipe.name];
      if (!named) return { reason: `no building block named ${String(recipe.name)}` };
      return resolve(named, period, ctx, accn);
    }
    case "flow": {
      const unit = unitOf(recipe, ctx);
      if (period.kind === "FY") {
        const point = selectDuration(ctx.facts, recipe.concepts, unit, { end: period.end, durationDays: FISCAL_YEAR_DAYS }, ctx.cutoff);
        if (!point) return { reason: `no ${recipe.concepts.join(" / ")} (${unit}) fact for the fiscal year ending ${period.end} filed on or before the cutoff` };
        return single(point, `FY:${period.end}`, "filed");
      }
      if (period.kind === "Q") {
        const point = selectDuration(ctx.facts, recipe.concepts, unit, { start: period.start, end: period.end }, ctx.cutoff);
        if (!point) return { reason: `no ${recipe.concepts.join(" / ")} fact for ${period.start} to ${period.end}` };
        return single(point, `Q:${period.start}..${period.end}`, "filed");
      }
      if (period.kind === "TTM") {
        if (unit.includes("/")) return { reason: "per-share values are not additive (P1); a TTM per-share figure is not rebuilt" };
        // Concept by concept: the latest fiscal year on or before the window's end, within a year of it. Across
        // aliases the latest fiscal year, then the newest filing, wins (P2); concept order only breaks a tie.
        let ttm: FiledDerivation | null = null;
        let ttmFyEnd = "";
        const tried: string[] = [];
        for (const concept of recipe.concepts) {
          const fyEnd = latestFiscalYearEnd(ctx.facts, [concept], unit, addDays(period.end, 1), ctx.cutoff);
          if (!fyEnd || dayNumber(period.end) - dayNumber(fyEnd) > WITHIN_A_YEAR_DAYS) continue;
          tried.push(`${concept} (fiscal year to ${fyEnd})`);
          const candidate = buildTtm(ctx.facts, [concept], unit, fyEnd, period.end, ctx.cutoff);
          if (candidate && (ttm === null || fyEnd > ttmFyEnd || (fyEnd === ttmFyEnd && newestFiled(candidate) > newestFiled(ttm)))) {
            ttm = candidate;
            ttmFyEnd = fyEnd;
          }
        }
        if (!ttm) {
          return { reason: tried.length === 0
            ? `no fiscal-year ${recipe.concepts.join(" / ")} fact within a year before ${period.end} filed on or before the cutoff`
            : `the TTM to ${period.end} cannot be built from filed periods for ${tried.join(", ")}: the fiscal year plus the year to date to ${period.end} less the prior-year year to date, both year-to-date operands from one filing and all three on one basis (no operand restated by a filing the others predate), are not all tagged in XBRL on or before the cutoff` };
        }
        const first = ttm.operands[0]!.point;
        const start = ttm.operands.length === 1 ? first.start! : addDays(ttm.operands[2]!.point.end, 1);
        const measure = measureOf(unit);
        if ("reason" in measure) return measure;
        return {
          value: ttm.value,
          kind: ttm.operands.length === 1 ? "filed" : "derived",
          measure,
          period: period.start === undefined ? `TTM-TO:${period.end}` : `TTM:${start}..${period.end}`,
          formula: ttm.formula,
          points: ttm.operands.map((operand) => ({ ...operand.point, role: operand.role, sign: operand.sign })),
          operands: ttm.operands.map((operand) => operand.point.val),
          notes: period.start === undefined ? [`the report states the window's end only; the filed twelve months are ${start} to ${period.end}`] : [],
        };
      }
      return { reason: `a flow cannot be read at an instant (${period.kind})` };
    }
    case "latestShares": {
      const unit = unitOf(recipe, ctx);
      if (period.kind !== "LATEST") return { reason: "latestShares needs a LATEST-PERIOD period" };
      const quarter = selectDuration(ctx.facts, recipe.concepts, unit, { end: period.end, durationDays: QUARTER_DAYS }, ctx.cutoff);
      const withNote = (resolved: ResolvedReference | Unresolved, note: string) => ("reason" in resolved ? resolved : { ...resolved, notes: [note] });
      if (quarter) return withNote(single(quarter, `LATEST-PERIOD:${period.end}`, "filed"), `fiscal quarter ${quarter.start} to ${quarter.end}`);
      const year = selectDuration(ctx.facts, recipe.concepts, unit, { end: period.end, durationDays: FISCAL_YEAR_DAYS }, ctx.cutoff);
      if (year) return withNote(single(year, `LATEST-PERIOD:${period.end}`, "filed"), `no quarter fact is tagged for the period ending ${period.end}; the fiscal year ${year.start} to ${year.end} is the latest filed period`);
      return { reason: `no ${recipe.concepts.join(" / ")} fact for a quarter or fiscal year ending ${period.end}` };
    }
    case "instant": {
      const unit = unitOf(recipe, ctx);
      if (period.kind !== "INSTANT") return { reason: `a balance needs an instant, not ${period.kind}` };
      const point = selectInstant(ctx.facts, recipe.concepts, unit, period.end, ctx.cutoff, accn);
      if (point) {
        if (recipe.complete) {
          const other = classCheck(recipe.complete, point, period.end, new Set(recipe.concepts.map(localName)), ctx);
          if (other) return other;
        }
        return single(point, `@${period.end}`, "filed");
      }
      if (recipe.absence) return establishAbsent({ concepts: recipe.concepts, rule: recipe.absence, unit, end: period.end, accn, consumed: new Set() }, ctx);
      return { reason: `no ${recipe.concepts.join(" / ")} (${unit}) fact at ${period.end}${accn ? ` in filing ${accn}` : ""} filed on or before the cutoff` };
    }
    case "currentDebt": {
      if (period.kind !== "INSTANT") return { reason: `a balance needs an instant, not ${period.kind}` };
      const end = period.end;
      return accn === undefined ? acrossFilings(recipe, end, ctx, (filing) => currentDebtAt(end, ctx, filing)) : currentDebtAt(end, ctx, accn);
    }
    case "sum": {
      if (period.kind === "INSTANT" && accn === undefined) return acrossFilings(recipe, period.end, ctx, (filing) => sumOnce(recipe, period, ctx, filing));
      return sumOnce(recipe, period, ctx, accn);
    }
    case "first": {
      const reasons: string[] = [];
      const undecided: { position: number; accns: string[] }[] = [];
      const resolved: ResolvedReference[] = [];
      const positions: number[] = [];
      recipe.alternatives.forEach((alternative, position) => {
        const result = resolve(alternative, period, ctx, accn);
        if ("reason" in result) {
          reasons.push(result.reason);
          if (result.needsInstance) undecided.push({ position, accns: result.needsInstance });
        } else {
          resolved.push(result);
          positions.push(position);
        }
      });
      const winner = newestIndex(resolved);
      const best = newestAlternative(resolved);
      // An alternative still waiting on a filing's own instance could be the newest: decide only once it is read. It
      // cannot win when it stands on the filing of an alternative that already resolved and is listed before it (a tie
      // on the filing date goes to the earlier alternative).
      const winnerAccns = new Set(winner < 0 ? [] : resolved[winner]!.points.map((point) => point.accn));
      const open = undecided.filter((waiting) => !(winner >= 0 && waiting.position > positions[winner]! && waiting.accns.every((needed) => winnerAccns.has(needed))));
      if (open.length > 0) return { reason: reasons.join("; or "), needsInstance: [...new Set(open.flatMap((waiting) => waiting.accns))] };
      return best ?? { reason: reasons.join("; or ") };
    }
    case "ratio": {
      const numerator = resolve(recipe.numerator, period, ctx, accn);
      if ("reason" in numerator) return { ...numerator, reason: `numerator: ${numerator.reason}` };
      const denominator = resolve(recipe.denominator, period, ctx, accn);
      if ("reason" in denominator) return { ...denominator, reason: `denominator: ${denominator.reason}` };
      if (denominator.value === 0) return { reason: "denominator is zero" };
      // Only a ratio of two like measures, times 100, is a percent; anything else has no stated unit here.
      if (numerator.measure.unit !== denominator.measure.unit || numerator.measure.currency !== denominator.measure.currency || recipe.scale !== 100) {
        return { reason: `a ratio of ${numerator.measure.unit} ${numerator.measure.currency ?? ""} over ${denominator.measure.unit} ${denominator.measure.currency ?? ""} × ${recipe.scale} is not a percent of like measures (P3)` };
      }
      const split = differentFilings([numerator, denominator]);
      if (split) return { reason: `numerator and denominator ${split}` };
      return {
        value: (numerator.value / denominator.value) * recipe.scale,
        kind: "ratio",
        measure: { unit: "%", currency: null },
        period: numerator.period,
        formula: `(${numerator.formula}) / (${denominator.formula}) × ${recipe.scale}`,
        points: [...numerator.points.map((point) => ({ ...point, role: `numerator: ${point.role}` })), ...denominator.points.map((point) => ({ ...point, role: `denominator: ${point.role}` }))],
        operands: [],
        notes: [...numerator.notes, ...denominator.notes],
      };
    }
  }
}

/**
 * The parts of one composed value must stand on the same filings (P7): one filing for a fiscal year or a quarter, the
 * same fiscal-year filing and the same year-to-date filing for a TTM. Returns the disagreement, or null.
 */
function differentFilings(parts: readonly ResolvedReference[]): string | null {
  const signatures = new Set(parts.filter((part) => part.points.length > 0).map((part) => part.points.map((point) => point.accn).join(" + ")));
  return signatures.size > 1 ? `come from different filings (${[...signatures].join("; ")}): a composed value stands on one filing (P7)` : null;
}

/** A sum resolved once: in the pinned filing for a balance, across the same filings for flows. */
function sumOnce(recipe: Extract<Recipe, { op: "sum" }>, period: Period, ctx: Context, accn: string | undefined): ResolvedReference | Unresolved {
  const parts: ResolvedReference[] = [];
  const notes: string[] = [];
  const untagged: Term[] = [];
  const consumed = new Set<string>();
  // A term still waiting on a filing's instance is reported only if no other term fails outright: a filing that
  // lacks a required part fails whatever the instance says.
  let undecided: Unresolved | null = null;
  for (const term of recipe.terms) {
    const resolved = resolve(term.recipe, period, ctx, accn);
    if ("reason" in resolved) {
      if (resolved.needsInstance) {
        undecided ??= { reason: `${term.role}: ${resolved.reason}`, needsInstance: resolved.needsInstance };
        continue;
      }
      // A term the filing does not tag at all may be absent; one it tags in part is unresolved.
      if (term.absent && period.kind === "INSTANT" && !tagsAny(term.recipe, period.end, ctx, accn)) {
        untagged.push(term);
        continue;
      }
      return { reason: `${term.role}: ${resolved.reason}` };
    }
    for (const { concept } of balanceConcepts(term.recipe, ctx)) consumed.add(localName(concept));
    parts.push({ ...resolved, points: resolved.points.map((point) => ({ ...point, role: term.role, sign: (point.sign * term.sign) as 1 | -1 })), value: resolved.value * term.sign });
    notes.push(...resolved.notes);
  }
  if (undecided) return undecided;
  if (parts.length === 0) return { reason: "no term is tagged" };
  const periods = new Set(parts.map((part) => part.period));
  if (periods.size > 1) return { reason: `terms cover different periods: ${[...periods].join(", ")}` };
  const measures = new Set(parts.map((part) => `${part.measure.unit} ${part.measure.currency ?? ""}`.trim()));
  if (measures.size > 1) return { reason: `terms are stated in different units or currencies: ${[...measures].join(", ")} (P3, P4)` };
  if (period.kind !== "INSTANT") {
    const split = differentFilings(parts);
    if (split) return { reason: `terms ${split}` };
  } else {
    const filing = accn ?? parts.flatMap((part) => part.points)[0]?.accn;
    for (const term of untagged) {
      const proof = establishAbsent({ concepts: balanceConcepts(term.recipe, ctx).map(({ concept }) => concept), rule: term.absent!, unit: ctx.currency, end: period.end, accn: filing, consumed }, ctx);
      if ("reason" in proof) return { reason: `${term.role}: ${proof.reason}`, ...(proof.needsInstance ? { needsInstance: proof.needsInstance } : {}) };
      notes.push(`${term.role}: ${proof.notes.join(" ")}`);
    }
    if (recipe.complete) {
      const anchor = parts.flatMap((part) => part.points)[0];
      if (!anchor) return { reason: "no term is tagged" };
      const other = classCheck(recipe.complete, anchor, period.end, consumed, ctx);
      if (other) return other;
    }
  }
  return {
    value: parts.reduce((sum, part) => sum + part.value, 0),
    kind: "derived",
    measure: parts[0]!.measure,
    period: parts[0]!.period,
    formula: recipe.terms.map((term) => `${term.sign < 0 ? "− " : "+ "}${term.role}`).join(" "),
    points: parts.flatMap((part) => part.points),
    operands: parts.flatMap((part) => part.operands),
    notes,
  };
}

/** Whether the filing (or, unpinned, any admitted filing) tags any of the recipe's balance concepts at the instant. */
function tagsAny(recipe: Recipe, end: string, ctx: Context, accn: string | undefined): boolean {
  return balanceConcepts(recipe, ctx).some(({ concept, unit }) => selectInstant(ctx.facts, [concept], unit, end, ctx.cutoff, accn) !== null);
}

/** Periodic reports on or before the cutoff that tag any of the concepts at the instant, newest first. */
function filingsTagging(concepts: readonly { concept: string; unit: string }[], end: string, ctx: Context): Filing[] {
  const filings = new Map<string, Filing>();
  for (const { concept, unit } of concepts) {
    for (const fact of factsFor(ctx.facts, concept, unit)) {
      if (fact.start === undefined && fact.end === end && fact.filed <= ctx.cutoff && STATEMENT_FORMS.has(fact.form)) filings.set(fact.accn, { accn: fact.accn, form: fact.form, filed: fact.filed });
    }
  }
  return [...filings.values()].sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn));
}

/**
 * A composed balance, filing by filing (P2, P7): the newest filing on or before the cutoff in which the whole
 * composition resolves wins, and every part comes from that one filing. A proof still waiting on a filing's own
 * instance is decided before any older filing is tried. An older filing stands only while no newer filing restates
 * one of the parts it uses, under the same element or under another element the recipe lists for that line: then the
 * newest value (P2) and one filing (P7) cannot both hold, and nothing is established.
 */
function acrossFilings(recipe: Recipe, end: string, ctx: Context, attempt: (accn: string | undefined) => ResolvedReference | Unresolved): ResolvedReference | Unresolved {
  const candidates = filingsTagging(balanceConcepts(recipe, ctx), end, ctx);
  if (candidates.length === 0) return attempt(undefined);
  let newestFailure: Unresolved | null = null;
  for (const filing of candidates) {
    const result = attempt(filing.accn);
    if (!("reason" in result)) return restatedSince(result, recipe, end, ctx) ?? result;
    if (result.needsInstance) return result;
    newestFailure ??= result;
  }
  return newestFailure!;
}

/**
 * The alternative elements of the line each balance concept belongs to: every concept of an `instant` list maps to
 * that list, in the recipe's order. A concept no list holds (the parts of current debt) is a line of its own.
 */
function lineAlternatives(recipe: Recipe, into: Map<string, readonly string[]> = new Map()): Map<string, readonly string[]> {
  switch (recipe.op) {
    case "instant":
      for (const concept of recipe.concepts) if (!into.has(concept)) into.set(concept, recipe.concepts);
      break;
    case "sum":
      for (const term of recipe.terms) lineAlternatives(term.recipe, into);
      break;
    case "first":
      for (const alternative of recipe.alternatives) lineAlternatives(alternative, into);
      break;
    case "ratio":
      lineAlternatives(recipe.numerator, into);
      lineAlternatives(recipe.denominator, into);
      break;
    case "use":
      lineAlternatives(NAMED_RECIPES[recipe.name], into);
      break;
    default:
      break;
  }
  return into;
}

/**
 * The reason a composition cannot stand on its filing: a newer filing states another value for one of its parts. The
 * newer statement is looked for under the part's own element, and then as a direct selection would find the line
 * (`selectInstant`): across every alternative element the recipe lists for it, newest filing first, the list's order
 * breaking a tie within one filing. A newer filing that states the line under another of those elements supersedes
 * the older part just as one that restates the same element does.
 */
function restatedSince(result: ResolvedReference, recipe: Recipe, end: string, ctx: Context): Unresolved | null {
  const alternatives = lineAlternatives(recipe);
  for (const point of result.points) {
    // The part's own element first (a newer value under it is a restatement whatever else that filing tags), then the line.
    const newest = [[point.concept], alternatives.get(point.concept) ?? []]
      .map((concepts) => selectInstant(ctx.facts, concepts, point.unit, end, ctx.cutoff))
      .find((found) => found !== null && found.accn !== point.accn && found.filed > point.filed && found.val !== point.val);
    if (newest) {
      const restatement = newest.concept === point.concept ? `restates it as ${newest.val}` : `states that line as ${newest.val} under ${newest.concept}, an alternative element for it,`;
      return { reason: `${point.concept} at ${end} is ${point.val} in ${point.form} ${point.accn} (filed ${point.filed}), the newest filing that composes the whole balance, but ${newest.form} ${newest.accn} (filed ${newest.filed}) ${restatement} without the other parts: the newest value (P2) and one filing (P7) cannot both hold` };
    }
  }
  return null;
}

/** The us-gaap elements of debt due within a year. */
const CURRENT_DEBT = {
  /** Total current debt: by definition debt and finance lease obligations due within a year. */
  total: "DebtCurrent",
  maturities: "LongTermDebtCurrent",
  /** All borrowings with an initial term under a year; commercial paper is one of them. */
  borrowings: "ShortTermBorrowings",
  paper: "CommercialPaper",
} as const;
const FINANCE_LEASE_CURRENT = "FinanceLeaseLiabilityCurrent";
const FINANCE_LEASE_CONCEPTS = ["FinanceLeaseLiability", "FinanceLeaseLiabilityCurrent", "FinanceLeaseLiabilityNoncurrent"] as const;

/**
 * Debt due within a year, excluding finance leases, from one filing. DebtCurrent is the TOTAL of current debt (and, by
 * its definition, of current finance lease obligations), so it is an alternative to its parts, never added to them:
 * - parts: current maturities of long-term debt (LongTermDebtCurrent) plus short-term borrowings (ShortTermBorrowings,
 *   or CommercialPaper when the filing tags no ShortTermBorrowings, of which commercial paper is a component);
 * - a filing that tags the total and parts that account for it (the total equals the parts, or the parts plus the
 *   current finance lease liability, or the parts with commercial paper presented outside short-term borrowings):
 *   the value is the parts, and the total proves no other current debt exists;
 * - a total that exceeds its tagged parts, or has none, holds current debt no part names and stands in their place,
 *   but only when the filing has no finance leases the total could also hold (a total equal to the current finance
 *   lease liability is all leases: no other current debt). Beside a current finance lease liability it cannot be
 *   split, and a total below its parts contradicts them: neither establishes anything;
 * - with no total, a part the filing does not tag is a zero only when its absence is established (EVIDENCE_RULES).
 */
function currentDebtAt(end: string, ctx: Context, accn: string | undefined): ResolvedReference | Unresolved {
  const unit = ctx.currency;
  const measure = measureOf(unit);
  if ("reason" in measure) return measure;
  const at = (concept: string) => (accn === undefined ? null : selectInstant(ctx.facts, [concept], unit, end, ctx.cutoff, accn));
  const total = at(CURRENT_DEBT.total);
  const maturities = at(CURRENT_DEBT.maturities);
  const borrowings = at(CURRENT_DEBT.borrowings);
  const paper = at(CURRENT_DEBT.paper);
  const leaseCurrent = at(FINANCE_LEASE_CURRENT);
  const shortTerm = borrowings ?? paper;
  const where = accn ? ` in filing ${accn}` : "";
  const from = (rows: { role: string; point: FiledPoint }[], note: string[]): ResolvedReference => ({
    value: rows.reduce((sum, row) => sum + row.point.val, 0),
    kind: rows.length <= 1 ? "filed" : "derived",
    measure,
    period: `@${end}`,
    formula: rows.length === 0 ? "not presented" : rows.map((row) => row.role).join(" + "),
    points: rows.map((row) => ({ ...row.point, role: row.role, sign: 1 as const })),
    operands: rows.map((row) => row.point.val),
    notes: note,
  });
  const parts = [
    ...(maturities ? [{ role: "current maturities of long-term debt", point: maturities }] : []),
    ...(shortTerm ? [{ role: borrowings ? "short-term borrowings" : "commercial paper", point: shortTerm }] : []),
  ];
  const values = parts.map((part) => part.point.val);
  const sum = values.reduce((a, b) => a + b, 0);
  if (total) {
    if (parts.length > 0) {
      if (partsAgreeWithTotal(total.val, values)) return from(parts, [`total current debt ${CURRENT_DEBT.total} ${total.val} is these parts, not added to them`]);
      if (leaseCurrent && partsAgreeWithTotal(total.val, [...values, leaseCurrent.val])) {
        return from(parts, [`total current debt ${CURRENT_DEBT.total} ${total.val} is these parts plus the current finance lease liability ${leaseCurrent.val}, which the finance lease liability carries`]);
      }
      if (borrowings && paper && partsAgreeWithTotal(total.val, [...values, paper.val])) {
        return from([...parts, { role: "commercial paper", point: paper }], [`total current debt ${CURRENT_DEBT.total} ${total.val} is these parts: this filing presents commercial paper outside short-term borrowings`]);
      }
      if (total.val < sum) {
        return { reason: `total current debt ${CURRENT_DEBT.total} ${total.val} is less than its tagged parts (${parts.map((part) => `${part.point.concept} ${part.point.val}`).join(" + ")} = ${sum})${where}: current debt is not established` };
      }
      // Otherwise the total exceeds the tagged parts: it holds current debt they do not name, and stands in their place below.
    } else if (leaseCurrent && partsAgreeWithTotal(total.val, [leaseCurrent.val])) {
      return from([], [`total current debt ${CURRENT_DEBT.total} ${total.val} equals the current finance lease liability ${FINANCE_LEASE_CURRENT} ${leaseCurrent.val}${where}: all of it is finance leases, which the finance lease liability carries, and there is no other current debt`]);
    }
    const tagged = parts.length > 0 ? `its tagged parts (${parts.map((part) => `${part.point.concept} ${part.point.val}`).join(" + ")} = ${sum}) do not account for it` : "no part of it is tagged";
    if (leaseCurrent) {
      return { reason: `total current debt ${CURRENT_DEBT.total} ${total.val} stands beside a current finance lease liability ${leaseCurrent.val}, and ${tagged}${where}: how much of the total is debt and how much is finance leases is not established` };
    }
    // The total in place of its parts: it is all debt only if the filing has no finance lease obligation it could hold.
    const lease = FINANCE_LEASE_CONCEPTS.map(at).find((point) => point !== null && point.val !== 0);
    if (lease) {
      return { reason: `total current debt ${CURRENT_DEBT.total} ${total.val} stands beside a finance lease liability ${lease.concept} ${lease.val} whose current part is not tagged, and ${tagged}${where}: how much of the total is debt and how much is finance leases is not established` };
    }
    const noLeases = establishAbsent({ concepts: FINANCE_LEASE_CONCEPTS, rule: "finance-leases", unit, end, accn, consumed: new Set() }, ctx);
    if ("reason" in noLeases) return { reason: `total current debt ${CURRENT_DEBT.total} ${total.val} is debt and finance lease obligations due within a year, and ${tagged}; ${noLeases.reason}`, ...(noLeases.needsInstance ? { needsInstance: noLeases.needsInstance } : {}) };
    return from([{ role: "total current debt", point: total }], [`${CURRENT_DEBT.total} is the total of current debt: ${tagged}, and the filing has no finance leases it could hold`]);
  }
  // No total: each part the filing does not tag must be shown absent. Short-term borrowings, once tagged, hold commercial paper.
  const consumed = new Set<string>([...(maturities ? [CURRENT_DEBT.maturities] : []), ...(borrowings ? [CURRENT_DEBT.borrowings, CURRENT_DEBT.paper] : paper ? [CURRENT_DEBT.paper] : [])]);
  const notes: string[] = [];
  const need: { concepts: readonly string[]; rule: EvidenceRuleName }[] = [
    ...(maturities ? [] : [{ concepts: [CURRENT_DEBT.total, CURRENT_DEBT.maturities], rule: "current-maturities" as const }]),
    ...(borrowings ? [] : [{ concepts: paper ? [CURRENT_DEBT.borrowings] : [CURRENT_DEBT.borrowings, CURRENT_DEBT.paper], rule: "short-term-borrowings" as const }]),
  ];
  for (const { concepts, rule } of need) {
    const proof = establishAbsent({ concepts, rule, unit, end, accn, consumed }, ctx);
    if ("reason" in proof) return proof;
    notes.push(...proof.notes);
  }
  return from(parts, notes);
}

function newestFiled(derivation: FiledDerivation): string {
  return latestFiled(derivation.operands.map((operand) => operand.point));
}

/** The filing date a resolved value stands on: its newest operand's (one filing for a composed balance, P7). */
function latestFiled(points: readonly { filed: string }[]): string {
  return points.reduce((latest, point) => (point.filed > latest ? point.filed : latest), "");
}

/** The index of the alternative from the newest filing, or -1; on an equal filing date the earlier alternative keeps its place. */
function newestIndex(candidates: readonly ResolvedReference[]): number {
  let best = -1;
  candidates.forEach((candidate, index) => {
    if (best < 0 || latestFiled(candidate.points) > latestFiled(candidates[best]!.points)) best = index;
  });
  return best;
}

/**
 * Alternative representations of one figure (a filed total line, or its filed components): every alternative that
 * resolves is a candidate, and the one from the newest filing on or before the cutoff wins (P2). The recipe's order
 * only breaks a tie on the filing date. A composed alternative stands on the one filing all its parts come from (a sum
 * at an instant pins it, P7), so parts are never mixed across filings to build a newer total. A superseded alternative
 * that states a different value is noted.
 */
function newestAlternative(candidates: readonly ResolvedReference[]): ResolvedReference | null {
  const best = candidates[newestIndex(candidates)] ?? null;
  if (best === null) return null;
  const superseded = candidates.filter((candidate) => candidate !== best && latestFiled(candidate.points) < latestFiled(best!.points) && candidate.value !== best!.value);
  if (superseded.length === 0) return best;
  const where = (ref: ResolvedReference) => [...new Set(ref.points.map((point) => `${point.form} ${point.accn} (filed ${point.filed})`))].join(", ");
  return { ...best, notes: [...best.notes, ...superseded.map((older) => `newer filing wins: ${older.formula} = ${older.value} in ${where(older)} is superseded`)] };
}

function single(point: FiledPoint, period: string, kind: ReferenceKind): ResolvedReference | Unresolved {
  const measure = measureOf(point.unit);
  if ("reason" in measure) return measure;
  return { value: point.val, kind, measure, period, formula: "filed line", points: [{ ...point, role: "filed line", sign: 1 }], operands: [point.val], notes: point.restated ? [`restated: ${point.restated.map((row) => `${row.val} in ${row.accn} (filed ${row.filed})`).join("; ")}`] : [] };
}

/** The newest periodic-report filing on or before the cutoff that carries any undimensioned balance at the instant. */
function newestFilingWithInstant(ctx: Context, end: string): Filing | undefined {
  const filings = new Map<string, Filing>();
  for (const taxonomy of Object.values(ctx.facts.facts)) {
    for (const concept of Object.values(taxonomy)) {
      for (const rows of Object.values(concept.units)) {
        for (const row of rows) {
          if (row.start === undefined && row.end === end && row.filed <= ctx.cutoff && STATEMENT_FORMS.has(row.form)) filings.set(row.accn, { accn: row.accn, form: row.form, filed: row.filed });
        }
      }
    }
  }
  return [...filings.values()].sort((a, b) => a.filed.localeCompare(b.filed) || a.accn.localeCompare(b.accn)).at(-1);
}

/** A share count that shows an outstanding claim (issued or outstanding, never authorized). */
const CLAIM_SHARES = /SharesIssued|SharesOutstanding/i;

/**
 * What in a filing's own instance shows a balance of the rule's kind at the instant, other than the elements the
 * recipe itself uses: a named element, a dimension member, or an equity gap. Null when nothing does.
 */
function evidenceOf(rule: EvidenceRule, instance: readonly InstanceFact[], end: string, unit: string, consumed: ReadonlySet<string>): string | null {
  const atInstant = instance.filter((fact) => fact.start === undefined && fact.end === end && fact.val !== 0);
  const claim = (fact: InstanceFact) => measureOfXbrlUnit(fact.unit)?.unit === "currency" || (fact.unit === "shares" && CLAIM_SHARES.test(fact.name));
  const inScope = (fact: InstanceFact) => fact.members.length === 0 || (rule.dimensional && !fact.members.some((member) => member.startsWith("LegalEntityAxis=")));
  const named = atInstant.find((fact) => inScope(fact) && rule.name.test(fact.name) && !rule.except?.test(fact.name) && !consumed.has(fact.name) && claim(fact));
  if (named) return named.members.length === 0 ? `tags ${named.name} = ${named.val} ${named.unit}` : `discloses ${named.name} = ${named.val} ${named.unit} on ${named.members.join(", ")}`;
  const member = rule.member;
  const dimensional = member ? atInstant.find((fact) => fact.members.some((name) => member.test(name)) && claim(fact)) : undefined;
  if (dimensional) return `discloses ${dimensional.name} = ${dimensional.val} ${dimensional.unit} on ${dimensional.members.join(", ")}`;
  if (rule.equityGap) {
    const undimensioned = (name: string) => atInstant.find((fact) => fact.members.length === 0 && fact.name === name && fact.unit === unit)?.val;
    const total = undimensioned("StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest");
    const parent = undimensioned("StockholdersEquity");
    if (total !== undefined && parent !== undefined && total !== parent) return `states total equity including NCI ${total} against parent equity ${parent}`;
  }
  return null;
}

/**
 * A filed zero for a balance the filing does not tag, only when its absence is established (P7, P10):
 * - the filing is the newest periodic report on or before the cutoff that carries a balance sheet at the instant;
 * - no admitted filing tags the balance's own elements (nonzero) at the instant or in the year before it: an issuer
 *   whose annual report shows the balance has it, and a quarterly report that omits the note does not show it is nil;
 * - that filing's own XBRL instance shows no other element, dimension member or equity gap that discloses the balance
 *   (EVIDENCE_RULES), apart from the elements the composition itself uses.
 * Anything less is unresolved, never a zero.
 */
function establishAbsent(input: { concepts: readonly string[]; rule: EvidenceRuleName; unit: string; end: string; accn: string | undefined; consumed: ReadonlySet<string> }, ctx: Context): ResolvedReference | Unresolved {
  const { concepts, unit, end, accn } = input;
  const rule = EVIDENCE_RULES[input.rule];
  const measure = measureOf(unit);
  if ("reason" in measure) return measure;
  const tags = concepts.join(" / ");
  const newest = newestFilingWithInstant(ctx, end);
  // Inside a composed balance the filing is pinned (P7); it must still be the newest one that carries the instant.
  const filing = accn === undefined ? newest : newest?.accn === accn ? newest : undefined;
  if (!filing) return { reason: `${tags} is not tagged at ${end}, and no periodic report filed on or before the cutoff${accn ? ` (filing ${accn})` : ""} is established as the newest carrying a balance at ${end}: absence of ${rule.label} is not established` };
  const earliest = addDays(end, -WITHIN_A_YEAR_DAYS);
  for (const concept of concepts) {
    const recent = factsFor(ctx.facts, concept, unit)
      .filter((fact) => fact.start === undefined && fact.val !== 0 && fact.end > earliest && fact.end <= end && fact.filed <= ctx.cutoff && STATEMENT_FORMS.has(fact.form))
      .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0];
    if (recent) {
      return { reason: `${tags} is not tagged at ${end} in ${filing.form} ${filing.accn}, but ${recent.form} ${recent.accn} (filed ${recent.filed}) tags ${concept} = ${recent.val} at ${recent.end}: the issuer has ${rule.label}, so a filing that does not present them does not show they are nil; absence of ${rule.label} is not established` };
    }
  }
  const instance = ctx.instances[filing.accn];
  if (!instance) {
    return { reason: `${tags} is not tagged at ${end} in ${filing.form} ${filing.accn}; its own XBRL instance (dimensional disclosures) was not read, so absence of ${rule.label} is not established`, needsInstance: [filing.accn] };
  }
  if (!instance.some((fact) => fact.start === undefined && fact.end === end && fact.members.length === 0)) {
    return { reason: `${tags} is not tagged at ${end}, and the XBRL instance read for ${filing.form} ${filing.accn} carries no balance at ${end}: absence of ${rule.label} is not established` };
  }
  const evidence = evidenceOf(rule, instance, end, unit, input.consumed);
  if (evidence) return { reason: `${tags} is not tagged at ${end}, but ${filing.form} ${filing.accn} ${evidence}: absence of ${rule.label} is not established` };
  return {
    value: 0,
    kind: "filed",
    measure,
    period: `@${end}`,
    formula: "not presented",
    points: [],
    operands: [],
    notes: [`${tags} is not tagged at ${end} in ${filing.form} ${filing.accn} filed ${filing.filed}, and that filing's own XBRL instance discloses no other ${rule.label} element${rule.equityGap ? ", dimensional member or equity gap" : rule.member ? " or dimensional member" : ""} at that instant: recorded as none presented`],
  };
}

/**
 * Whether an element that is one member of a class may stand for the whole class: the filing that tags it must show
 * no other member of the class in its own XBRL instance (EVIDENCE_RULES). Returns why it may not, or null.
 */
function classCheck(ruleName: EvidenceRuleName, point: FiledPoint, end: string, consumed: ReadonlySet<string>, ctx: Context): Unresolved | null {
  const rule = EVIDENCE_RULES[ruleName];
  const instance = ctx.instances[point.accn];
  if (!instance) {
    return { reason: `${point.concept} is one kind of ${rule.label}; the XBRL instance of ${point.form} ${point.accn} was not read, so whether it is the whole is not established`, needsInstance: [point.accn] };
  }
  const evidence = evidenceOf(rule, instance, end, point.unit, consumed);
  return evidence ? { reason: `${point.concept} is one kind of ${rule.label}, and ${point.form} ${point.accn} also ${evidence}: the filed ${rule.label} are not established as these lines alone` } : null;
}

export function resolveReference(recipe: Recipe, period: string | null, facts: CompanyFacts, currency: string, cutoff: string, instances: InstanceEvidence = {}): ResolvedReference | Unresolved {
  if (period === null) return recipe.op === "none" ? { reason: recipe.note } : { reason: "the report states no period for this figure" };
  const parsed = parsePeriod(period);
  if (!parsed) return { reason: `unrecognised period ${period}` };
  return resolve(recipe, parsed, { facts, currency, cutoff, instances });
}

export function recipeFor(company: CompanyConfig, figure: string): { recipe: Recipe; why?: string } {
  const override = company.overrides?.[figure];
  if (override) return { recipe: override.recipe, why: override.why };
  const recipe = DEFAULT_RECIPES[figure];
  if (!recipe) return { recipe: { op: "none", note: `no recipe for ${figure}` } };
  return { recipe };
}
