/**
 * How each headline figure's filed value is built from SEC XBRL facts. The
 * defaults follow the plain filed line; companies.json overrides a figure for
 * one issuer when its statements use another concept (each override says why).
 *
 * The resolver (`resolveReference`) is pure: it takes companyfacts JSON, the
 * figure's period as the report states it and the report's cutoff, and returns
 * the filed value with every operand's filing reference. It never reads
 * Metis's values, so the reference stays independent of Metis's extraction.
 */
import {
  FISCAL_YEAR_DAYS,
  QUARTER_DAYS,
  addDays,
  buildTtm,
  dayNumber,
  latestFiscalYearEnd,
  measureOfXbrlUnit,
  selectDuration,
  selectInstant,
  STATEMENT_FORMS,
  type CompanyFacts,
  type FiledDerivation,
  type FiledPoint,
  type InstanceFact,
  type Measure,
  type ReferenceKind,
} from "./lib";

export type Recipe =
  /** An additive flow (or a per-share or share figure for an exact fiscal year or quarter). */
  | { op: "flow"; concepts: string[]; unit?: string }
  /** A balance at the figure's instant. */
  /**
   * A balance at the figure's instant. With `absence`, a balance the filing does not present is a filed zero only
   * when that absence is established from the filing itself (see ABSENCE_RULES); otherwise it is unresolved.
   */
  | { op: "instant"; concepts: string[]; unit?: string; absence?: AbsenceRuleName }
  /** Signed terms from one filing (instants) or one period (flows); an optional term may be absent. */
  | { op: "sum"; terms: { role: string; sign: 1 | -1; recipe: Recipe; optional?: boolean }[] }
  /** The first alternative that resolves (e.g. a filed total line, else its filed components). */
  | { op: "first"; alternatives: Recipe[] }
  /** Numerator over denominator, times `scale`. */
  | { op: "ratio"; numerator: Recipe; denominator: Recipe; scale: number }
  /** Weighted-average shares for the latest period ending at the date: the fiscal quarter if tagged, else the fiscal year. */
  | { op: "latestShares"; concepts: string[]; unit?: string }
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
  /** Filings SEC companyfacts has not ingested: their own XBRL instance documents are read instead (each with the reason). */
  instanceFilings?: { accn: string; why: string }[];
  /** Filed amounts are multiplied by this before comparison (e.g. ordinary-share EPS × ADS ratio), per figure. */
  scale?: Record<string, { factor: number; why: string }>;
}

const US = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss"],
  eps: ["EarningsPerShareDiluted"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  ocf: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  shortTermInvestments: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "DebtSecuritiesCurrent"],
  incomeTax: ["IncomeTaxExpenseBenefit"],
  pretax: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
} as const;

const flow = (concepts: readonly string[], unit?: string): Recipe => ({ op: "flow", concepts: [...concepts], ...(unit ? { unit } : {}) });
const instant = (concepts: readonly string[], absence?: AbsenceRuleName): Recipe => ({ op: "instant", concepts: [...concepts], ...(absence ? { absence } : {}) });

export type AbsenceRuleName = "noncontrolling-interest" | "preferred-stock";

/**
 * What must be missing from a filing before a balance it does not present may be recorded as a filed zero (P7, P10:
 * a vendor or tool zero is not a filed zero, and absence of one tag does not prove a zero). Every check is on the one
 * filing that carries the balance sheet at the instant, filed on or before the cutoff, including its own XBRL
 * instance (companyfacts drops dimensional facts):
 * - the selection concepts (the recipe's own) are not tagged, or they would be the value;
 * - `name`: any other undimensioned element at the instant whose name matches, nonzero, in a currency or as an issued
 *   or outstanding share count (extension elements included), blocks the zero;
 * - `member`: any dimensional fact at the instant on a member that matches, nonzero, blocks it (e.g. NCI disclosed only
 *   on StatementEquityComponentsAxis = NoncontrollingInterestMember, as src/edgar/equityStatementNci.ts reads it);
 * - `equityGap`: total equity including NCI that differs from parent equity at the instant blocks it.
 */
export const ABSENCE_RULES: Record<AbsenceRuleName, { label: string; name: RegExp; except?: RegExp; member: RegExp; equityGap: boolean }> = {
  "noncontrolling-interest": {
    label: "non-controlling interest",
    name: /Noncontrolling|MinorityInterest/i,
    // Totals that include NCI are checked by the equity gap instead; they are never NCI themselves.
    except: /IncludingPortionAttributableToNoncontrolling|ExcludingPortionAttributableToNoncontrolling|AttributableToParent/i,
    member: /Noncontrolling|MinorityInterest/i,
    equityGap: true,
  },
  "preferred-stock": {
    label: "preferred stock",
    name: /Preferred|TemporaryEquityCarryingAmount/i,
    // Authorized-but-unissued counts and per-share terms say nothing about an outstanding claim.
    except: /Authorized|PerShare|ParOrStatedValue/i,
    member: /Preferred/i,
    equityGap: false,
  },
};

const NCI_CONCEPTS = ["MinorityInterest", "NonredeemableNoncontrollingInterest"] as const;
// Carrying value first (par or stated value last), as the statement's preferred claim (src/edgar/tagSynonyms.ts).
const PREFERRED_CONCEPTS = ["PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount", "PreferredStockIncludingAdditionalPaidInCapital", "PreferredStockValue"] as const;

export const OPERATING_LEASES: Recipe = {
  op: "first",
  alternatives: [
    instant(["OperatingLeaseLiability"]),
    {
      op: "sum",
      terms: [
        { role: "operating lease liability, current", sign: 1, recipe: instant(["OperatingLeaseLiabilityCurrent"]), optional: true },
        { role: "operating lease liability, noncurrent", sign: 1, recipe: instant(["OperatingLeaseLiabilityNoncurrent"]), optional: true },
      ],
    },
  ],
};
export const FINANCE_LEASES: Recipe = {
  op: "first",
  alternatives: [
    instant(["FinanceLeaseLiability"]),
    {
      op: "sum",
      terms: [
        { role: "finance lease liability, current", sign: 1, recipe: instant(["FinanceLeaseLiabilityCurrent"]), optional: true },
        { role: "finance lease liability, noncurrent", sign: 1, recipe: instant(["FinanceLeaseLiabilityNoncurrent"]), optional: true },
      ],
    },
  ],
};
export const CASH_AND_STI: Recipe = {
  op: "first",
  alternatives: [
    instant(["CashCashEquivalentsAndShortTermInvestments"]),
    {
      op: "sum",
      terms: [
        { role: "cash and cash equivalents", sign: 1, recipe: instant(US.cash) },
        { role: "short-term investments / marketable securities, current", sign: 1, recipe: instant(US.shortTermInvestments), optional: true },
      ],
    },
  ],
};
/** Borrowings on the balance sheet: current and noncurrent debt and short-term borrowings. */
export const BORROWINGS_TERMS = [
  { role: "debt, current", sign: 1 as const, recipe: instant(["LongTermDebtCurrent", "DebtCurrent"]), optional: true },
  { role: "short-term borrowings / commercial paper", sign: 1 as const, recipe: instant(["ShortTermBorrowings", "CommercialPaper"]), optional: true },
  { role: "debt, noncurrent", sign: 1 as const, recipe: instant(["LongTermDebtNoncurrent"]) },
];
export const TOTAL_DEBT_INCLUDING_LEASES: Recipe = {
  op: "sum",
  terms: [
    ...BORROWINGS_TERMS,
    { role: "operating lease liabilities", sign: 1, recipe: OPERATING_LEASES, optional: true },
    { role: "finance lease liabilities", sign: 1, recipe: FINANCE_LEASES, optional: true },
  ],
};

export const DEFAULT_RECIPES: Record<string, Recipe> = {
  "revenue.fy": flow(US.revenue),
  "operatingIncome.fy": flow(US.operatingIncome),
  "netIncome.fy": flow(US.netIncome),
  "epsDiluted.fy": flow(US.eps, "{currency}/shares"),
  "dilutedShares.fy": flow(US.dilutedShares, "shares"),
  "capex.fy": flow(US.capex),
  "fcf.fy": { op: "sum", terms: [{ role: "operating cash flow", sign: 1, recipe: flow(US.ocf) }, { role: "capital spending", sign: -1, recipe: flow(US.capex) }] },
  "operatingIncome.ttm": flow(US.operatingIncome),
  "netIncome.ttm": flow(US.netIncome),
  "operatingCashFlow.ttm": flow(US.ocf),
  "capex.ttm": flow(US.capex),
  "fcf.ttm": { op: "sum", terms: [{ role: "operating cash flow", sign: 1, recipe: flow(US.ocf) }, { role: "capital spending", sign: -1, recipe: flow(US.capex) }] },
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
      { role: "finance lease liabilities", sign: 1, recipe: FINANCE_LEASES, optional: true },
      { role: "cash and short-term investments", sign: -1, recipe: CASH_AND_STI },
    ],
  },
  "fv.minorityInterest": instant(NCI_CONCEPTS, "noncontrolling-interest"),
  "fv.preferred": instant(PREFERRED_CONCEPTS, "preferred-stock"),
  "fv.nonOperatingInvestments": instant(["LongTermInvestments"]),
  "fv.openingBookValue": instant(["StockholdersEquity"]),
  "fv.incomeAvailableToCommon": flow(["NetIncomeLossAvailableToCommonStockholdersBasic"]),
  "fv.payoutRatio": { op: "none", note: "a house average (common dividends plus net buybacks over income to common, up to three fiscal years); its filed operands are not composed by this check" },
  "fv.ffo.netIncome": flow(US.netIncome),
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
  /** Filings whose own XBRL instance must be read before the reference can be decided (absence proofs). */
  needsInstance?: string[];
}

/** A filing's own XBRL instance facts, read by accuracy:fetch, keyed by accession. */
export type InstanceEvidence = Readonly<Record<string, readonly InstanceFact[]>>;

type Period =
  | { kind: "FY"; end: string }
  | { kind: "TTM"; start: string; end: string }
  | { kind: "Q"; start: string; end: string }
  | { kind: "LATEST"; end: string }
  | { kind: "INSTANT"; end: string };

export function parsePeriod(period: string): Period | null {
  let match = /^FY:(\d{4}-\d{2}-\d{2})$/.exec(period);
  if (match) return { kind: "FY", end: match[1]! };
  match = /^TTM:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(period);
  if (match) return { kind: "TTM", start: match[1]!, end: match[2]! };
  match = /^Q:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(period);
  if (match) return { kind: "Q", start: match[1]!, end: match[2]! };
  match = /^LATEST-PERIOD:(\d{4}-\d{2}-\d{2})$/.exec(period);
  if (match) return { kind: "LATEST", end: match[1]! };
  match = /^@(\d{4}-\d{2}-\d{2})$/.exec(period);
  if (match) return { kind: "INSTANT", end: match[1]! };
  return null;
}

interface Context {
  facts: CompanyFacts;
  currency: string;
  cutoff: string;
  instances: InstanceEvidence;
}

function measureOf(unit: string): Measure | Unresolved {
  return measureOfXbrlUnit(unit) ?? { reason: `unit ${unit} is not a currency amount, a per-share amount or a share count` };
}

function unitOf(recipe: { unit?: string }, ctx: Context): string {
  return (recipe.unit ?? ctx.currency).replace("{currency}", ctx.currency);
}

/** One recipe for one period. Instants inside a sum share one filing (P7): `accn` pins it. */
function resolve(recipe: Recipe, period: Period, ctx: Context, accn?: string): ResolvedReference | Unresolved {
  switch (recipe.op) {
    case "none":
      return { reason: recipe.note };
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
          if (!fyEnd || dayNumber(period.end) - dayNumber(fyEnd) > 370) continue;
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
            : `the TTM to ${period.end} cannot be built from filed periods for ${tried.join(", ")}: the fiscal year plus the year to date to ${period.end} less the prior-year year to date, both year-to-date operands from one filing, are not all tagged in XBRL on or before the cutoff` };
        }
        const first = ttm.operands[0]!.point;
        const start = ttm.operands.length === 1 ? first.start! : addDays(ttm.operands[2]!.point.end, 1);
        const measure = measureOf(unit);
        if ("reason" in measure) return measure;
        return {
          value: ttm.value,
          kind: ttm.operands.length === 1 ? "filed" : "derived",
          measure,
          period: `TTM:${start}..${period.end}`,
          formula: ttm.formula,
          points: ttm.operands.map((operand) => ({ ...operand.point, role: operand.role, sign: operand.sign })),
          operands: ttm.operands.map((operand) => operand.point.val),
          notes: [],
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
      if (point) return single(point, `@${period.end}`, "filed");
      if (recipe.absence) return establishAbsence(recipe.concepts, recipe.absence, unit, period.end, ctx, accn);
      return { reason: `no ${recipe.concepts.join(" / ")} (${unit}) fact at ${period.end}${accn ? ` in filing ${accn}` : ""} filed on or before the cutoff` };
    }
    case "sum": {
      const parts: ResolvedReference[] = [];
      const notes: string[] = [];
      let pinned = accn;
      for (const term of recipe.terms) {
        const resolved = resolve(term.recipe, period, ctx, pinned);
        if ("reason" in resolved) {
          if (term.optional) {
            notes.push(`${term.role}: not tagged${pinned ? ` in filing ${pinned}` : ""}`);
            continue;
          }
          return { reason: `${term.role}: ${resolved.reason}`, ...(resolved.needsInstance ? { needsInstance: resolved.needsInstance } : {}) };
        }
        if (period.kind === "INSTANT" && pinned === undefined) pinned = resolved.points[0]?.accn;
        parts.push({ ...resolved, points: resolved.points.map((point) => ({ ...point, role: term.role, sign: (point.sign * term.sign) as 1 | -1 })), value: resolved.value * term.sign });
        notes.push(...resolved.notes);
      }
      if (parts.length === 0) return { reason: "no term is tagged" };
      const periods = new Set(parts.map((part) => part.period));
      if (periods.size > 1) return { reason: `terms cover different periods: ${[...periods].join(", ")}` };
      const measures = new Set(parts.map((part) => `${part.measure.unit} ${part.measure.currency ?? ""}`.trim()));
      if (measures.size > 1) return { reason: `terms are stated in different units or currencies: ${[...measures].join(", ")} (P3, P4)` };
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
    case "first": {
      const reasons: string[] = [];
      const needsInstance: string[] = [];
      for (const alternative of recipe.alternatives) {
        const resolved = resolve(alternative, period, ctx, accn);
        if (!("reason" in resolved)) return resolved;
        reasons.push(resolved.reason);
        needsInstance.push(...(resolved.needsInstance ?? []));
      }
      return { reason: reasons.join("; or "), ...(needsInstance.length > 0 ? { needsInstance: [...new Set(needsInstance)] } : {}) };
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

function newestFiled(derivation: FiledDerivation): string {
  return derivation.operands.reduce((latest, operand) => (operand.point.filed > latest ? operand.point.filed : latest), "");
}

function single(point: FiledPoint, period: string, kind: ReferenceKind): ResolvedReference | Unresolved {
  const measure = measureOf(point.unit);
  if ("reason" in measure) return measure;
  return { value: point.val, kind, measure, period, formula: "filed line", points: [{ ...point, role: "filed line", sign: 1 }], operands: [point.val], notes: point.restated ? [`restated: ${point.restated.map((row) => `${row.val} in ${row.accn} (filed ${row.filed})`).join("; ")}`] : [] };
}

/** The newest periodic-report filing on or before the cutoff that carries any undimensioned balance at the instant. */
function newestFilingWithInstant(ctx: Context, end: string): { accn: string; form: string; filed: string } | undefined {
  const filings = new Map<string, { accn: string; form: string; filed: string }>();
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
 * A filed zero for a balance the filing does not present, only when absence is established from that filing (P7,
 * P10): the filing carrying the balance sheet at the instant exists on or before the cutoff, none of the selection
 * concepts is tagged in it, and its own XBRL instance shows no other element, dimensional member or equity gap that
 * discloses the balance (ABSENCE_RULES). Anything less is unresolved, never a zero.
 */
function establishAbsence(concepts: readonly string[], ruleName: AbsenceRuleName, unit: string, end: string, ctx: Context, accn?: string): ResolvedReference | Unresolved {
  const rule = ABSENCE_RULES[ruleName];
  const measure = measureOf(unit);
  if ("reason" in measure) return measure;
  const tags = concepts.join(" / ");
  const newest = newestFilingWithInstant(ctx, end);
  // Inside a composed balance the filing is pinned (P7); it must still be one that carries the instant.
  const filing = accn === undefined ? newest : newest?.accn === accn ? newest : undefined;
  if (!filing) return { reason: `${tags} is not tagged at ${end}, and no periodic report filed on or before the cutoff${accn ? ` (filing ${accn})` : ""} is established as the newest carrying a balance at ${end}: absence of ${rule.label} is not established` };
  const instance = ctx.instances[filing.accn];
  if (!instance) {
    return { reason: `${tags} is not tagged at ${end} in ${filing.form} ${filing.accn}; its own XBRL instance (dimensional disclosures) was not read, so absence of ${rule.label} is not established`, needsInstance: [filing.accn] };
  }
  const atInstant = instance.filter((fact) => fact.start === undefined && fact.end === end && fact.val !== 0);
  if (!instance.some((fact) => fact.start === undefined && fact.end === end && fact.members.length === 0)) {
    return { reason: `${tags} is not tagged at ${end}, and the XBRL instance read for ${filing.form} ${filing.accn} carries no balance at ${end}: absence of ${rule.label} is not established` };
  }
  const claim = (fact: InstanceFact) => measureOfXbrlUnit(fact.unit)?.unit === "currency" || (fact.unit === "shares" && CLAIM_SHARES.test(fact.name));
  const named = atInstant.find((fact) => fact.members.length === 0 && rule.name.test(fact.name) && !(rule.except?.test(fact.name)) && claim(fact));
  if (named) return { reason: `${tags} is not tagged at ${end}, but ${filing.form} ${filing.accn} tags ${named.name} = ${named.val} ${named.unit}: absence of ${rule.label} is not established` };
  const dimensional = atInstant.find((fact) => fact.members.some((member) => rule.member.test(member)) && claim(fact));
  if (dimensional) return { reason: `${tags} is not tagged at ${end}, but ${filing.form} ${filing.accn} discloses ${dimensional.name} = ${dimensional.val} ${dimensional.unit} on ${dimensional.members.join(", ")}: absence of ${rule.label} is not established` };
  if (rule.equityGap) {
    const undimensioned = (name: string) => atInstant.find((fact) => fact.members.length === 0 && fact.name === name && fact.unit === unit)?.val;
    const total = undimensioned("StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest");
    const parent = undimensioned("StockholdersEquity");
    if (total !== undefined && parent !== undefined && total !== parent) {
      return { reason: `${tags} is not tagged at ${end}, but ${filing.form} ${filing.accn} states total equity including NCI ${total} against parent equity ${parent}: absence of ${rule.label} is not established` };
    }
  }
  return {
    value: 0,
    kind: "filed",
    measure,
    period: `@${end}`,
    formula: "not presented",
    points: [],
    operands: [],
    notes: [`${tags} is not tagged at ${end} in ${filing.form} ${filing.accn} filed ${filing.filed}, and that filing's own XBRL instance discloses no other ${rule.label} element${rule.equityGap ? ", dimensional member or equity gap" : " or dimensional member"} at that instant: recorded as none presented`],
  };
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
