/** Filed statement field chains and composition policy; no invented operands (P7, P10; D-100, D-134). */
import { type TagStandIn, tagsFor, standInsFor, floorsFor, tagFloorsFor, BROAD_REVENUE_TOTAL_TAGS, REVENUE_COMPONENT_TAGS, REVENUE_TAGS, DEPRECIATION_COMPONENT_TAGS, INCOME_BEFORE_TAX_TAGS, INCOME_BEFORE_TAX_COMPONENT_TAGS, EBIT_INTEREST_NOT_FILED_WITH_AGGREGATE, EBIT_NON_OPERATING_ADJUSTMENTS, EBIT_INTEREST_INSIDE_AGGREGATE, EBIT_AGGREGATE_MAY_HOLD_INTEREST, EBIT_OTHER_MAY_HOLD_INTEREST, COMBINED_CURRENT_DEBT_TAG } from "@/edgar/tagSynonyms";
import { type StatementFieldProvenance } from "@/providers/fmp";


// ---------------------------------------------------------------------------
// Concept chains
// ---------------------------------------------------------------------------

type UnitKind = "money" | "perShare" | "shares";

/**
 * A field's resolution recipe.
 *
 * `chain` is an addition to the four kinds named in the design brief: the bank
 * revenue chain and the SG&A chain interleave a `sum` step between `first`
 * steps, which the flat kinds cannot express. It resolves its steps in order
 * and the first step that produces a value wins.
 *
 * `sumAnyOf` is `sumAny` over SPECS rather than tags: the lease chain adds an
 * operating-lease subtotal (tagged total, else current + noncurrent) to a
 * finance-lease subtotal resolved the same way, which neither `sumAny` (flat
 * tags) nor `chain` (first-wins) can express. Its `label`s name the parts in
 * the absent-component note, exactly as tag names do for `sumAny`.
 */
export type ChainSpec =
  /* D-134: Filed operands must describe one presentation, and missing or incompatible operands are disclosed. */
  | { kind: "first"; tags: string[]; unit: UnitKind; sign?: -1; disclose?: string; unlessBelow?: readonly string[];
      /** FIN-510-V1: siblings without evidenced containment must agree to serve the field. */
      requireAgreement?: boolean;
      /** Extra floors for one synonym only (a component that contains that synonym but not the others). */
      unlessBelowTag?: Readonly<Record<string, readonly string[]>> }
  | { kind: "sum"; tags: string[]; unit: "money"; disclose?: string }
  | { kind: "sumAny"; tags: string[]; unit: "money" }
  | { kind: "sumAnyOf"; parts: { label: string; spec: ChainSpec }[]; unit: "money" }
  /**
   * Every part must resolve (a derivation such as pretax income + interest
   * expense). `minusAny` lists optional subtrahends resolved afterwards: each
   * one present is subtracted, one whose `componentOf` is itself present is
   * skipped (it is already inside that aggregate), and `discloseAdjusted`
   * words the disclosure from what was and was not subtracted.
   */
  | {
      kind: "sumAll";
      parts: {
        label: string;
        spec: ChainSpec;
        /* D-134: Skip a missing component only when the specified filed adjustment serves and disclose the omission. */
        optionalWhenAdjustment?: { adjustmentTag: string; disclose: string; discloseUnusable: (problem: string) => string };
      }[];
      unit: "money";
      disclose?: string;
      /* D-134: Refuse an incomplete derivation with a named missing operand. */
      refuseWhenIncomplete?: boolean;
      minusAny?: {
        label: string;
        tags: readonly string[];
        componentOf?: string;
        /**
         * Base tags whose own definition EXCLUDES this item: beside one of
         * them the adjustment would subtract money the base never held, so it
         * is skipped and named in the disclosure.
         */
        notWhenBaseTag?: readonly string[];
      }[];
      /* D-134: Do not add a part already contained in a served adjustment. */
      notAddedWhen?: readonly { partTag: string; adjustmentTag: string; disclose: string; partLabel?: string; discloseRefiled?: string }[];
      discloseAdjusted?: (ctx: {
        subtracted: string[];
        unavailable: string[];
        /* D-134: Filed for the period but not usable on this row (another currency or period), with why . */
        unusable: { label: string; problem: string }[];
        alreadyInside: string[];
        /** Skipped because the base tag that served excludes them by definition. */
        notInBase: string[];
        /** Each part's label with the tag(s) that actually served it. */
        parts: { label: string; tags: string[] }[];
        /** The `notAddedWhen` disclosures for parts left out of the sum. */
        notAdded: string[];
        /* D-134: Retain each served component and subtracted adjustment value by label. */
        amounts: Record<string, number>;
      }) => string;
    }
  | { kind: "diff"; plus: string; minus: string; unit: "money"; disclose?: string }
  | {
      kind: "chain";
      steps: ChainSpec[];
      unit: UnitKind;
      /* D-134: Filed operands must describe one presentation, and missing or incompatible operands are disclosed. */
      stopOnRefusal?: true;
      /** Revenue only: a later complete gross-profit presentation can supersede a discontinued total tag. */
      preferLaterRevenuePresentation?: true;
    };

/** One `first` step per stand-in so each tag carries its own disclosure wording. */
function standInSteps(standIns: readonly TagStandIn[], unit: UnitKind): ChainSpec[] {
  return standIns.map((s) => ({ kind: "first", tags: [s.tag], unit, disclose: s.disclose }));
}

/** Disclosure for debt composed from instrument-class tags when no long-term-debt aggregate is tagged. */
const LONG_TERM_DEBT_COMPONENT_DISCLOSURE =
  "no LongTermDebt aggregate is tagged for the period; financing debt is composed from the filer's instrument-class tags (notes, loans, secured, convertible, revolver or the combined debt amount), which include any current portion";
/** Inclusive instrument-class totals: each includes its own current portion. */
const INCLUSIVE_DEBT_COMPONENT_TAGS: ReadonlySet<string> = new Set(["DebtLongtermAndShorttermCombinedAmount", "NotesPayable", "SeniorNotes", "LoansPayable", "SecuredDebt", "ConvertibleNotesPayable"]);
/* D-100: The inclusive long-term debt and finance-lease tag already holds its current maturities. */
const INCLUSIVE_LONG_TERM_TAG = "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities";
/* D-100: Compose debt from compatible filed components without counting an inclusive amount twice. */
const NOTES_AND_LOANS_CURRENT_TAGS: readonly string[] = tagsFor("longTermNotesAndLoansCurrent");
/**
 * Whether a long-term-debt figure was composed from tags that hold current debt
 * (an inclusive class total or a class's current variant). Its total is right,
 * but it is not noncurrent debt, so consumers that read long-term debt on its
 * own (the forensic leverage tests) must not use it.
 */
/** True when long-term debt came from a tag that already includes finance-lease obligations (overlap case 1). */
export function longTermDebtHoldsFinanceLeases(tags: readonly string[] | undefined): boolean {
  return (tags ?? []).some((tag) => tag === "us-gaap/LongTermDebtAndCapitalLeaseObligations" || tag === `us-gaap/${INCLUSIVE_LONG_TERM_TAG}`);
}

export function longTermDebtHoldsCurrent(tags: readonly string[] | undefined): boolean {
  return (tags ?? []).some((tag) => {
    const name = tag.replace(/^us-gaap\//, "");
    return INCLUSIVE_DEBT_COMPONENT_TAGS.has(name) || CURRENT_DEBT_COMPONENT_TAGS.has(name) ||
      name === INCLUSIVE_LONG_TERM_TAG || NOTES_AND_LOANS_CURRENT_TAGS.includes(name);
  });
}
/** Each instrument class with the tag family of its current portion, which its noncurrent variants exclude. */
const DEBT_COMPONENT_CLASSES = [
  ["longTermDebtNotes", "longTermDebtNotesCurrent"],
  ["longTermDebtLoans", "longTermDebtLoansCurrent"],
  ["longTermDebtSecured", "longTermDebtSecuredCurrent"],
  ["longTermDebtConvertible", "longTermDebtConvertibleCurrent"],
  ["longTermDebtRevolver", "longTermDebtRevolverCurrent"],
] as const;
const CURRENT_DEBT_COMPONENT_TAGS: ReadonlySet<string> = new Set(DEBT_COMPONENT_CLASSES.flatMap(([, current]) => tagsFor(current)));
/**
 * Two instrument classes within this share of each other are taken to be one
 * obligation tagged twice: secured debt is a collateral class that can hold the
 * same notes or loans. Across SEC filers' FY2025 facts, every multi-class pair
 * this close was a duplicate (Sun Communities, UMH, American Assets, Babcock &
 * Wilcox), while REIT mortgages beside unsecured notes sit far apart.
 */
const DUPLICATE_DEBT_CLASS_SHARE = 0.02;

/** A line item's own tags first, then its stand-ins one at a time. */
function lineItemChain(item: Parameters<typeof tagsFor>[0], unit: UnitKind): ChainSpec {
  const standIns = standInsFor(item);
  const floors = floorsFor(item);
  const tagFloors = tagFloorsFor(item);
  const own: ChainSpec = { kind: "first", tags: tagsFor(item), unit, ...(floors.length === 0 ? {} : { unlessBelow: floors }),
    ...(item === "deferredRevenue" ? { requireAgreement: true } : {}),
    ...(Object.keys(tagFloors).length === 0 ? {} : { unlessBelowTag: tagFloors }) };
  return standIns.length === 0 ? own : { kind: "chain", unit, steps: [own, ...standInSteps(standIns, unit)] };
}

/**
 * `disclose` marks a fallback step whose figure is a stand-in for the concept,
 * not the concept's own tag. When such a step resolves, its wording is recorded
 * as a `Substitution` on the statement (the keyless layer files it in the
 * manifest) and appended to the progress notes.
 */

const REVENUE_SPEC: ChainSpec = { kind: "chain", unit: "money", preferLaterRevenuePresentation: true, steps: [
  { kind: "first", tags: [...BROAD_REVENUE_TOTAL_TAGS], unit: "money" },
  { kind: "sum", tags: [...REVENUE_COMPONENT_TAGS], unit: "money" },
  { kind: "first", tags: REVENUE_TAGS.filter(tag => !BROAD_REVENUE_TOTAL_TAGS.some(total => total === tag)), unit: "money" },
] };

/* D-108: Prefer parent-attributable net income; reconstruct it from consolidated income and filed NCI only when scope is proved. */
const NET_INCOME_SPEC: ChainSpec = {
  kind: "chain",
  unit: "money",
  steps: [
    { kind: "first", tags: tagsFor("netIncome").slice(0, 1), unit: "money" },
    ...tagsFor("netIncomeAttributableToNoncontrollingInterest").map((tag): ChainSpec => ({
      kind: "diff",
      plus: "ProfitLoss",
      minus: tag,
      unit: "money",
      disclose:
        "no NetIncomeLoss element is filed for the period; net income attributable to the parent is derived as consolidated profit (ProfitLoss) less net income attributable to noncontrolling interests",
    })),
    { kind: "first", tags: tagsFor("netIncome").slice(1), unit: "money" },
  ],
};

/* D-134: Read interest-expense components only when their operating and non-operating scopes are established. */
const INTEREST_EXPENSE_SPEC: ChainSpec = lineItemChain("interestExpense", "money");

/**
 * FMP's `commonDividendsPaid` is the common dividend alone, and its
 * `netDividendsPaid` the total including preferred. Copying the total into the
 * common field (the old alias) overstated common dividends at every
 * preferred-issuing filer — banks, utilities, REITs — by the preferred coupon.
 * The common element is tried first; then the total net of the preferred
 * element; the final total fallback is rejected during row assembly when
 * preferred stock is outstanding and the preferred cash payment is unknown.
 */
const COMMON_DIVIDENDS_SPEC: ChainSpec = {
  kind: "chain",
  unit: "money",
  steps: [
    { kind: "first", tags: tagsFor("commonDividendsPaid"), unit: "money", sign: -1 },
    {
      kind: "diff",
      plus: tagsFor("preferredDividendsPaid")[0] as string,
      minus: tagsFor("netDividendsPaid")[0] as string,
      unit: "money",
      disclose:
        "common dividends derived as total dividends paid (PaymentsOfDividends) less the preferred dividends paid the filer tagged separately (no PaymentsOfDividendsCommonStock element filed)",
    },
    // A filer with no preferred stock tags no preferred element, and for it
    // the total IS the common dividend — the vendor publishes the same figure
    // in both columns. Undisclosed on purpose: a note on every ordinary filer
    // would bury the one that matters (a preferred issuer that tags only the
    // total), which this chain cannot tell apart from the ordinary case.
    { kind: "first", tags: tagsFor("netDividendsPaid"), unit: "money", sign: -1 },
  ],
};

/**
 * Banks tag total net revenue under Revenues / RevenuesNetOfInterestExpense, or
 * not at all (then NII + noninterest income is the verified identity). The
 * ASC-606 tags stay as a trailing fallback but must never win at a bank: a
 * bank that tags its fee revenue under RevenueFromContractWithCustomer* would
 * otherwise resolve to that FEE-ONLY figure and drop the whole net-interest-
 * income line (docs/RESEARCH.md §2.6). Which is why the chain is selected by
 * the issuer's INDUSTRY as well as by its tagging: `looksLikeBankTagging`
 * requires the ASC-606 tags to be absent, so it cannot see that bank.
 */
const BANK_REVENUE_SPEC: ChainSpec = {
  kind: "chain",
  unit: "money",
  steps: [
    { kind: "first", tags: tagsFor("bankRevenueTotal"), unit: "money" },
    { kind: "sum", tags: tagsFor("bankRevenueComponents"), unit: "money" },
    { kind: "first", tags: [...REVENUE_TAGS], unit: "money" },
  ],
};

/* D-134: A bank interest-income total represents its operating revenue. */
const BANK_INTEREST_INCOME_SPEC: ChainSpec = lineItemChain("bankInterestIncome", "money");

/* D-134: A bank operating income must be filed; pretax income plus interest expense is not bank EBIT. */
const BANK_OPERATING_INCOME_SPEC: ChainSpec = { kind: "first", tags: tagsFor("operatingIncome"), unit: "money" };

/* D-103: Disclose composed depreciation and amortization as a lower bound when the combined line is unproven. */
const DEPRECIATION_SPEC: ChainSpec = {
  kind: "chain",
  unit: "money",
  steps: [
    // A combined tag below the same period's Depreciation or amortization is a subset line (FIN-510).
    { kind: "first", tags: tagsFor("depreciationAndAmortization"), unit: "money", unlessBelow: [...DEPRECIATION_COMPONENT_TAGS], unlessBelowTag: tagFloorsFor("depreciationAndAmortization") },
    {
      kind: "sum",
      tags: [...DEPRECIATION_COMPONENT_TAGS],
      unit: "money",
      disclose:
        "no combined depreciation-and-amortization tag is filed for the period; D&A is composed as the filer's Depreciation + AmortizationOfIntangibleAssets, a lower bound that omits any other amortization a combined line would include",
    },
    {
      kind: "first",
      tags: [DEPRECIATION_COMPONENT_TAGS[0]!],
      unit: "money",
      disclose:
        "no combined depreciation-and-amortization tag and no AmortizationOfIntangibleAssets are filed for the period; D&A is the filer's Depreciation alone, a lower bound that omits any amortization",
    },
  ],
};

/* D-103: Disclose composed depreciation and amortization as a lower bound when the combined line is unproven. */
export function lowerBoundDAndACaveat(rows: readonly { date?: unknown; fieldProvenance?: Record<string, StatementFieldProvenance> }[]): string | null {
  const components = new Set(DEPRECIATION_COMPONENT_TAGS.map((tag) => `us-gaap/${tag}`));
  const composed = rows.flatMap((row) => {
    const tags = row.fieldProvenance?.depreciationAndAmortization?.tags ?? [];
    return typeof row.date === "string" && tags.length > 0 && tags.every((tag) => components.has(tag)) ? [{ date: row.date, tags }] : [];
  });
  if (composed.length === 0) return null;
  const withAmortization = composed.some((row) => row.tags.length > 1);
  const parts = withAmortization
    ? composed.every((row) => row.tags.length > 1) ? "Depreciation + AmortizationOfIntangibleAssets" : "Depreciation + AmortizationOfIntangibleAssets, or Depreciation alone"
    : "Depreciation alone";
  return `D&A is a lower bound for ${composed.map((row) => row.date).join(", ")} (no combined depreciation-and-amortization tag is filed; it is the filer's ${parts}), so EBITDA omits any other amortization and EV/EBITDA may read high`;
}

/** Working fields for the continuing-operations EPS stand-in; never left on a row. */
const CONTINUING_EPS_FIELDS = {
  eps: "epsContinuingOperations",
  epsDiluted: "epsDilutedContinuingOperations",
} as const;
/**
 * One working field per discontinued-operations element, read on its own: on
 * a first-hit chain a zero under an earlier element would hide a result filed
 * under a later one.
 */
const DISCONTINUED_ELEMENT_FIELDS: readonly { field: string; spec: ChainSpec }[] = [
  ...tagsFor("epsDiscontinuedOperations").map((tag) => ({ tag, unit: "perShare" as const })),
  ...tagsFor("discontinuedOperationsIncome").map((tag) => ({ tag, unit: "money" as const })),
].map(({ tag, unit }) => ({ field: `discontinued:${tag}`, spec: { kind: "first", tags: [tag], unit } }));
/**
 * The discontinued-operations elements a re-filing carries for a period it re-presents (ASC 205-20-45-3,
 * 45-3A): their presence, new or moved, is the one label companyfacts can show (decision C-9, `representationLabelled`).
 */
export const DISCONTINUED_LABEL_TAGS: readonly string[] = [
  ...tagsFor("netIncomeFromDiscontinuedOperations"),
  ...tagsFor("discontinuedOperationsIncome"),
  ...tagsFor("epsDiscontinuedOperations"),
];
const CONTINUING_EPS_WORKING_FIELDS: ReadonlySet<string> = new Set([...Object.values(CONTINUING_EPS_FIELDS), ...DISCONTINUED_ELEMENT_FIELDS.map((element) => element.field)]);

/* D-134: Prefer the filed pretax total before a complete compatible derivation. */
const INCOME_BEFORE_TAX_SPEC: ChainSpec = {
  kind: "chain",
  unit: "money",
  steps: [
    { kind: "first", tags: [...INCOME_BEFORE_TAX_TAGS], unit: "money" },
    {
      kind: "sum",
      tags: [...INCOME_BEFORE_TAX_COMPONENT_TAGS],
      unit: "money",
      disclose:
        "no pretax-income total is tagged for the period; pretax income is composed as the filer's domestic + foreign pretax income (the total's two children in the taxonomy calculation)",
    },
  ],
};

const INCOME_CHAINS: Record<string, ChainSpec> = {
  revenue: REVENUE_SPEC,
  costOfRevenue: lineItemChain("costOfRevenue", "money"),
  grossProfit: lineItemChain("grossProfit", "money"),
  researchAndDevelopmentExpenses: lineItemChain("researchAndDevelopmentExpenses", "money"),
  sellingGeneralAndAdministrativeExpenses: {
    kind: "chain",
    unit: "money",
    steps: [
      lineItemChain("sellingGeneralAndAdministrativeExpenses", "money"),
      { kind: "sum", tags: [...tagsFor("sellingAndMarketingExpenses"), ...tagsFor("generalAndAdministrativeExpenses")], unit: "money" },
    ],
  },
  /** The two SG&A components FMP also publishes on their own; Stage B's forensics read both. */
  sellingAndMarketingExpenses: lineItemChain("sellingAndMarketingExpenses", "money"),
  generalAndAdministrativeExpenses: lineItemChain("generalAndAdministrativeExpenses", "money"),
  operatingExpenses: lineItemChain("operatingExpenses", "money"),
  /* D-134: Derive operating income from filed operating and non-operating totals without double-counting nested adjustments. */
  operatingIncome: {
    kind: "chain",
    unit: "money",
    stopOnRefusal: true,
    steps: [
      { kind: "first", tags: tagsFor("operatingIncome"), unit: "money" },
      {
        kind: "sumAll",
        unit: "money",
        parts: [
          { label: "pretax income", spec: INCOME_BEFORE_TAX_SPEC },
          { label: "interest expense", spec: INTEREST_EXPENSE_SPEC, optionalWhenAdjustment: EBIT_INTEREST_NOT_FILED_WITH_AGGREGATE },
        ],
        minusAny: EBIT_NON_OPERATING_ADJUSTMENTS.map((a) => ({
          label: a.label,
          tags: a.tags,
          ...(a.componentOf === undefined ? {} : { componentOf: a.componentOf }),
          ...(a.notWhenBaseTag === undefined ? {} : { notWhenBaseTag: a.notWhenBaseTag }),
        })),
        notAddedWhen: [EBIT_INTEREST_INSIDE_AGGREGATE],
        refuseWhenIncomplete: true,
        discloseAdjusted: describeDerivedEbit,
      },
    ],
  },
  interestExpense: INTEREST_EXPENSE_SPEC,
  interestIncome: lineItemChain("interestIncome", "money"),
  netInterestIncome: lineItemChain("netInterestIncome", "money"),
  /* D-103: Reconstruct pretax income from its domestic and foreign components when no total is filed. */
  incomeBeforeTax: INCOME_BEFORE_TAX_SPEC,
  incomeTaxExpense: lineItemChain("incomeTaxExpense", "money"),
  equityMethodIncomeLoss: lineItemChain("equityMethodIncomeLoss", "money"),
  totalOtherIncomeExpensesNet: lineItemChain("totalOtherIncomeExpensesNet", "money"),
  netIncome: NET_INCOME_SPEC,
  netIncomeConsolidated: lineItemChain("netIncomeConsolidated", "money"),
  netIncomeAttributableToNoncontrollingInterest: lineItemChain("netIncomeAttributableToNoncontrollingInterest", "money"),
  netIncomeAvailableToCommon: lineItemChain("netIncomeAvailableToCommon", "money"),
  netIncomeFromContinuingOperations: lineItemChain("netIncomeFromContinuingOperations", "money"),
  netIncomeFromDiscontinuedOperations: lineItemChain("netIncomeFromDiscontinuedOperations", "money"),
  depreciationAndAmortization: DEPRECIATION_SPEC,
  eps: lineItemChain("eps", "perShare"),
  epsDiluted: lineItemChain("epsDiluted", "perShare"),
  weightedAverageShsOut: lineItemChain("weightedAverageShsOut", "shares"),
  weightedAverageShsOutDil: lineItemChain("weightedAverageShsOutDil", "shares"),
  // Read only by standInEpsFromContinuingOperations, which removes them from
  /* D-112: Disclose when continuing-operations EPS stands in for the missing net-income EPS line. */
  [CONTINUING_EPS_FIELDS.eps]: lineItemChain(CONTINUING_EPS_FIELDS.eps, "perShare"),
  [CONTINUING_EPS_FIELDS.epsDiluted]: lineItemChain(CONTINUING_EPS_FIELDS.epsDiluted, "perShare"),
  ...Object.fromEntries(DISCONTINUED_ELEMENT_FIELDS.map((element) => [element.field, element.spec])),
};

/** P1: only monetary flows are additive; EPS and weighted share counts are not. */
export const ADDITIVE_INCOME_FIELDS = Object.entries(INCOME_CHAINS).filter(([, spec]) => spec.unit === "money").map(([field]) => field);

/**
 * The derived-EBIT disclosure, worded from what the subtraction pass could and
 * could not remove. An adjustment the filer did not tag is an error band on the
 * figure, so it is named rather than passed over in silence.
 */
function describeDerivedEbit(ctx: {
  subtracted: string[];
  unavailable: string[];
  unusable: { label: string; problem: string }[];
  alreadyInside: string[];
  notInBase: string[];
  parts: { label: string; tags: string[] }[];
  notAdded: string[];
  amounts: Record<string, number>;
}): string {
  // WHICH pretax element served decides whether the equity-method subtraction
  // is right, so the derivation names it rather than saying "pretax income".
  const named = ctx.parts.map((p) => `${p.label} (${p.tags.join(" + ")})`).join(" + ");
  const head = `EBIT derived as ${named}: the filer reports no OperatingIncomeLoss line`;
  const parts: string[] = [];
  const withAmount = (label: string): string => (ctx.amounts[label] === undefined ? label : `${label} (${ctx.amounts[label]})`);
  // Components of the aggregate the filer tags stand in for it when it is not filed, or is filed on another basis
  /* D-134: Explain each missing or unusable component of a derived EBIT figure. */
  const aggregate = "NonoperatingIncomeExpense";
  const aggregateProblem = ctx.unusable.find((u) => u.label === aggregate)?.problem;
  const standInComponents = ctx.unavailable.includes(aggregate) || aggregateProblem !== undefined
    ? ctx.subtracted.filter((label) => EBIT_NON_OPERATING_ADJUSTMENTS.some((a) => a.label === label && a.componentOf === aggregate))
    : [];
  if (ctx.subtracted.length > 0) {
    parts.push(`non-operating items subtracted from the derivation: ${ctx.subtracted.map(withAmount).join(", ")}`);
  }
  if (standInComponents.length > 0) {
    parts.push(
      `the ${aggregate} aggregate ${aggregateProblem === undefined ? "is not filed" : `${aggregateProblem}, so it is not used`}; its components the filer tags were subtracted instead (${standInComponents.map(withAmount).join(", ")}); any untagged non-operating item stays inside the figure`,
    );
  }
  if (ctx.alreadyInside.length > 0) {
    parts.push(
      `not subtracted separately because the aggregate already contains them: ${ctx.alreadyInside.join(", ")}`,
    );
  }
  if (ctx.notInBase.length > 0) {
    parts.push(
      `NOT subtracted because the pretax element that served is measured before them: ${ctx.notInBase.join(", ")}`,
    );
  }
  parts.push(...ctx.notAdded);
  const pretax = ctx.parts.find((p) => p.label === "pretax income");
  if (pretax !== undefined && INCOME_BEFORE_TAX_COMPONENT_TAGS.every((tag) => pretax.tags.some((t) => t === tag || t.endsWith(`/${tag}`)))) {
    parts.push(
      "the domestic + foreign composition is taken as the full pretax total, so equity-method results are subtracted as for that total",
    );
  }
  if (ctx.subtracted.includes("NonoperatingIncomeExpense") && ctx.notAdded.length === 0) {
    parts.push(EBIT_AGGREGATE_MAY_HOLD_INTEREST);
  }
  const errorBand = standInComponents.length > 0
    ? ctx.unavailable.filter((label) => label !== aggregate)
    : ctx.unavailable;
  if (ctx.subtracted.includes("OtherNonoperatingIncomeExpense") && ctx.amounts["interest expense"] !== undefined) {
    // Net interest added back: the interest expense less the investment income subtracted beside it.
    parts.push(EBIT_OTHER_MAY_HOLD_INTEREST(ctx.amounts["interest expense"] - (ctx.amounts["InvestmentIncomeInterest"] ?? 0)));
  }
  if (errorBand.length > 0) {
    parts.push(
      `error band — the filer tags none of ${errorBand.join(", ")} for this period, so any such item stays inside the figure`,
    );
  }
  // A filed item that cannot be used on this row is named with why: it is not subtracted, so it stays inside (M-3).
  const unusableBand = standInComponents.length > 0 ? ctx.unusable.filter((u) => u.label !== aggregate) : ctx.unusable;
  for (const u of unusableBand) parts.push(`error band — ${u.label} ${u.problem}, so it is not subtracted and stays inside the figure`);
  if (errorBand.length === 0 && unusableBand.length === 0 && ctx.subtracted.length === 0) {
    parts.push("no non-operating tag was filed for this period, so any such item stays inside the figure");
  }
  return `${head}; ${parts.join("; ")}`;
}

/* D-19: Operating and finance lease liabilities, each as "tagged total, else the current + noncurrent split". FMP's `capitalLeaseObligations` carries BOTH (Apple FY2025: operating ~12.5B + finance ~1.2B = 13.72B) and its `totalDebt` includes the pair, so both belong here or net debt, ROIC's invested capital and the historical cost-of-debt denominator all drift off the house numbers. The two parts stay individually addressable (`Resolved.parts`): `computeBalance` publishes the operating slice as its own field, because that is the only slice the enterprise-value bridge may remove . */
const OPERATING_LEASE_PORTION_DISCLOSURE =
  "only one maturity of the operating-lease liability is tagged for the period; the other portion is unverified, so lease-inclusive debt is unavailable and only the lease-excluded basis can use this row";

const LEASE_LIABILITY_SPEC: ChainSpec = {
  kind: "sumAnyOf",
  unit: "money",
  parts: [
    {
      label: "operatingLeaseLiability",
      spec: {
        kind: "chain",
        unit: "money",
        steps: [
          { kind: "first", tags: tagsFor("operatingLeaseLiability"), unit: "money" },
          { kind: "sum", tags: tagsFor("operatingLeaseLiabilityParts"), unit: "money" },
          /* D-97: Remove operating leases only when filed evidence establishes their inclusion and scope. */
          { kind: "first", tags: [...tagsFor("operatingLeaseLiabilityParts")].reverse(), unit: "money", disclose: OPERATING_LEASE_PORTION_DISCLOSURE },
        ],
      },
    },
    {
      label: "financeLeaseLiability",
      spec: {
        kind: "chain",
        unit: "money",
        steps: [
          { kind: "first", tags: tagsFor("financeLeaseLiability"), unit: "money" },
          { kind: "sum", tags: tagsFor("financeLeaseLiabilityParts"), unit: "money" },
        ],
      },
    },
  ],
};

/**
 * The current portion of long-term debt AND finance leases, as Home Depot and
 * other retailers tag their current installments. `resolveDebtOverlaps` keeps
 * its finance-lease slice from being counted twice.
 */
const COMBINED_CURRENT_TAG = COMBINED_CURRENT_DEBT_TAG;

/**
 * Borrowings with an initial term under a year. A DIFFERENT INSTRUMENT from the
 * current maturities of long-term debt below, which is why the two are separate
 * components of one sum rather than alternatives in a first-wins chain.
 */
const SHORT_TERM_BORROWING_TAGS = [...tagsFor("shortTermBorrowings"), ...tagsFor("commercialPaper")];

/** The balance-sheet lines that carry the current maturities of long-term debt. */
const CURRENT_MATURITY_BALANCE_TAGS = [...tagsFor("currentMaturitiesOfLongTermDebt")];

/** The tags that specifically carry the CURRENT MATURITIES of long-term debt. */
const CURRENT_MATURITY_TAGS: readonly string[] = [...tagsFor("debtCurrent"), ...tagsFor("currentMaturitiesOfLongTermDebt")];

const MATURITIES_STAND_IN_SPEC = standInSteps(standInsFor("currentMaturitiesOfLongTermDebt"), "money");

const RESTRICTED_CASH_CURRENT_TAGS = tagsFor("restrictedCashCurrent");
const RESTRICTED_CASH_NONCURRENT_TAGS = tagsFor("restrictedCashNoncurrent");

const BALANCE_CHAINS: Record<string, ChainSpec> = {
  /* D-105: Prefer current cash evidence and disclose cash or restricted-cash stand-ins. */
  cashAndCashEquivalents: {
    kind: "chain", unit: "money", steps: [
      lineItemChain("cashAndCashEquivalents", "money"),
      { kind: "sumAll", unit: "money", parts: [
        { label: "combined cash", spec: lineItemChain("cashAndCashEquivalentsIncludingRestricted", "money") },
        { label: "current restrictions", spec: { kind: "first", tags: ["RestrictedCashAndCashEquivalentsAtCarryingValue", ...RESTRICTED_CASH_CURRENT_TAGS], unit: "money", sign: -1 } },
        { label: "noncurrent restrictions", spec: { kind: "first", tags: [...tagsFor("restrictedCashAndCashEquivalentsNoncurrent"), ...RESTRICTED_CASH_NONCURRENT_TAGS], unit: "money", sign: -1 } },
      ], disclose: "unrestricted cash derived as combined cash minus separately tagged current AND noncurrent restrictions; neither an absent component nor an ambiguous restricted-cash aggregate is treated as zero" },
    ],
  },
  cashAndCashEquivalentsIncludingRestricted: lineItemChain("cashAndCashEquivalentsIncludingRestricted", "money"),
  restrictedCashAndCashEquivalents: lineItemChain("restrictedCashAndCashEquivalents", "money"),
  restrictedCashAndCashEquivalentsNoncurrent: lineItemChain("restrictedCashAndCashEquivalentsNoncurrent", "money"),
  shortTermInvestments: lineItemChain("shortTermInvestments", "money"),
  cashAndShortTermInvestments: lineItemChain("cashAndShortTermInvestments", "money"),
  netReceivables: lineItemChain("netReceivables", "money"),
  inventory: lineItemChain("inventory", "money"),
  totalCurrentAssets: lineItemChain("totalCurrentAssets", "money"),
  propertyPlantEquipmentNet: lineItemChain("propertyPlantEquipmentNet", "money"),
  goodwill: lineItemChain("goodwill", "money"),
  /* D-100: Use a filed intangible-assets total or compatible finite- and indefinite-lived components. */
  intangibleAssets: {
    kind: "chain",
    unit: "money",
    steps: [
      { kind: "first", tags: tagsFor("intangibleAssets"), unit: "money" },
      { kind: "sumAny", tags: tagsFor("intangibleAssetsParts"), unit: "money" },
    ],
  },
  /* D-104: Preserve the filed scope of long-term investments and its disclosed components. */
  longTermInvestments: {
    kind: "chain",
    unit: "money",
    steps: [
      lineItemChain("longTermInvestments", "money"),
      {
        kind: "sumAnyOf",
        unit: "money",
        parts: [
          { label: "non-current debt securities", spec: lineItemChain("noncurrentDebtSecurities", "money") },
          {
            label: "other long-term investments",
            spec: {
              kind: "chain",
              unit: "money",
              steps: [
                lineItemChain("otherLongTermInvestments", "money"),
                {
                  kind: "sumAnyOf",
                  unit: "money",
                  parts: [
                    { label: "non-marketable equity securities", spec: lineItemChain("nonMarketableEquitySecurities", "money") },
                    { label: "equity-method investments", spec: lineItemChain("equityMethodInvestments", "money") },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  },
  totalAssets: lineItemChain("totalAssets", "money"),
  /**
   * D-13 order: the filed total (`DebtCurrent`) first; then the sum of the
   * balance-sheet current-debt lines the filer did tag.
   *
   * That sum has TWO components, because short-term borrowings and the current
   * maturities of long-term debt are different instruments and a filer can tag
   * one without the other. The maturity schedule's next-twelve-months principal
   * is the stand-in for the CURRENT-MATURITIES COMPONENT ALONE — a note
   * disclosure rather than a balance-sheet line, disclosed as a stand-in on
   * every row it serves. Making it a step of the whole chain (as this did
   * before) meant a filer that tagged `ShortTermBorrowings` while tagging its
   * current maturities only by extension lost the current maturities entirely:
   * Caterpillar FY2024 published short-term debt 5,514 against a filed 12,634,
   * understating total debt by 7.12B. `resolveDebtOverlaps` case 5 still nets
   * the schedule figure out whenever a balance-sheet current-maturities tag
   * did resolve, so it is never counted twice.
   */
  shortTermDebt: {
    kind: "chain",
    unit: "money",
    steps: [
      { kind: "first", tags: tagsFor("debtCurrent"), unit: "money" },
      {
        kind: "sumAnyOf",
        unit: "money",
        parts: [
          {
            label: "short-term borrowings",
            spec: { kind: "sumAny", tags: SHORT_TERM_BORROWING_TAGS, unit: "money" },
          },
          {
            label: "current maturities of long-term debt",
            spec: {
              kind: "chain",
              unit: "money",
              steps: [
                { kind: "sumAny", tags: CURRENT_MATURITY_BALANCE_TAGS, unit: "money" },
                ...MATURITIES_STAND_IN_SPEC,
              ],
            },
          },
        ],
      },
    ],
  },
  longTermDebt: {
    kind: "chain",
    unit: "money",
    steps: [
      lineItemChain("longTermDebt", "money"),
      // Noncurrent notes and loans with their separately tagged current
      /* D-100: Compose debt from compatible filed components without counting an inclusive amount twice. */
      {
        kind: "chain",
        unit: "money",
        steps: [
          ...NOTES_AND_LOANS_CURRENT_TAGS.map((current): ChainSpec => ({ kind: "sum", tags: [...tagsFor("longTermNotesAndLoans"), current], unit: "money" })),
          { kind: "first", tags: tagsFor("longTermNotesAndLoans"), unit: "money" },
        ],
      },
      { kind: "first", tags: tagsFor("debtCombinedTotal"), unit: "money", disclose: LONG_TERM_DEBT_COMPONENT_DISCLOSURE },
      {
        kind: "sumAnyOf",
        unit: "money",
        // A class is its inclusive total, else its noncurrent and current
        // portions, which are tagged separately.
        parts: DEBT_COMPONENT_CLASSES.map(([item, current]) => ({
          label: item,
          spec: {
            kind: "chain",
            unit: "money",
            steps: [
              { kind: "first", tags: tagsFor(item).filter((tag) => INCLUSIVE_DEBT_COMPONENT_TAGS.has(tag)), unit: "money", disclose: LONG_TERM_DEBT_COMPONENT_DISCLOSURE },
              {
                kind: "sumAnyOf",
                unit: "money",
                parts: [
                  { label: `${item} noncurrent`, spec: { kind: "first", tags: tagsFor(item).filter((tag) => !INCLUSIVE_DEBT_COMPONENT_TAGS.has(tag)), unit: "money", disclose: LONG_TERM_DEBT_COMPONENT_DISCLOSURE } },
                  { label: `${item} current`, spec: { kind: "first", tags: tagsFor(current), unit: "money", disclose: LONG_TERM_DEBT_COMPONENT_DISCLOSURE } },
                ],
              },
            ],
          } satisfies ChainSpec,
        })),
      },
    ],
  },
  totalCurrentLiabilities: lineItemChain("totalCurrentLiabilities", "money"),
  totalLiabilities: lineItemChain("totalLiabilities", "money"),
  deferredRevenue: lineItemChain("deferredRevenue", "money"),
  taxPayables: lineItemChain("taxPayables", "money"),
  capitalLeaseObligations: LEASE_LIABILITY_SPEC,
  preferredStock: lineItemChain("preferredStock", "money"),
  commonStock: lineItemChain("commonStock", "money"),
  retainedEarnings: lineItemChain("retainedEarnings", "money"),
  accumulatedOtherComprehensiveIncomeLoss: lineItemChain("accumulatedOtherComprehensiveIncomeLoss", "money"),
  /**
   * Caterpillar tags no StockholdersEquity line — only the total including
   * noncontrolling interest — so invested capital, the DCF and the multiples
   * EV bridge were all suppressed. Parent equity is that total less the
   * noncontrolling interest when the filer tags one. Without either a parent
   * line or an NCI allocation, parent equity remains unavailable; consolidated
   * totalEquity can still support consolidated operating returns.
   */
  totalStockholdersEquity: {
    kind: "chain",
    unit: "money",
    steps: [
      { kind: "first", tags: tagsFor("totalStockholdersEquity"), unit: "money" },
      ...tagsFor("minorityInterest").map((minus): ChainSpec => ({
        kind: "diff",
        plus: tagsFor("totalEquity")[0] as string,
        minus,
        unit: "money",
        disclose:
          "stockholders' equity derived as total equity including noncontrolling interest minus the noncontrolling interest: the filer tags no StockholdersEquity line",
      })),
    ],
  },
  minorityInterest: lineItemChain("minorityInterest", "money"),
  totalEquity: lineItemChain("totalEquity", "money"),
  temporaryEquity: lineItemChain("temporaryEquity", "money"),
  temporaryEquityAttributableToParent: lineItemChain("temporaryEquityAttributableToParent", "money"),
  temporaryEquityAttributableToNoncontrollingInterest: lineItemChain("temporaryEquityAttributableToNoncontrollingInterest", "money"),
  /** Extra key (banks); legal via the FmpRawRow index signature. */
  deposits: lineItemChain("deposits", "money"),
};

const CASHFLOW_CHAINS: Record<string, ChainSpec> = {
  netIncome: lineItemChain("cashflowNetIncome", "money"),
  depreciationAndAmortization: DEPRECIATION_SPEC,
  stockBasedCompensation: lineItemChain("stockBasedCompensation", "money"),
  changeInWorkingCapital: { kind: "first", tags: tagsFor("changeInWorkingCapital"), unit: "money", sign: -1 },
  operatingCashFlow: lineItemChain("operatingCashFlow", "money"),
  capitalExpenditure: { kind: "first", tags: tagsFor("capitalExpenditure"), unit: "money", sign: -1 },
  acquisitionsNet: { kind: "first", tags: tagsFor("acquisitionsNet"), unit: "money", sign: -1 },
  netDebtIssuance: {
    kind: "diff",
    plus: tagsFor("debtIssuance")[0] as string,
    minus: tagsFor("debtRepayment")[0] as string,
    unit: "money",
  },
  // One-sided: a filer that tags repayments but no issuance still shows debt
  // leaving the balance sheet (the collapse check in Stage B reads it).
  debtRepayment: { kind: "first", tags: tagsFor("debtRepayment"), unit: "money", sign: -1 },
  netStockIssuance: {
    kind: "diff",
    plus: tagsFor("commonStockIssuance")[0] as string,
    minus: tagsFor("commonStockRepurchased")[0] as string,
    unit: "money",
  },
  commonStockIssuance: lineItemChain("commonStockIssuance", "money"),
  commonStockRepurchased: { kind: "first", tags: tagsFor("commonStockRepurchased"), unit: "money", sign: -1 },
  netDividendsPaid: { kind: "first", tags: tagsFor("netDividendsPaid"), unit: "money", sign: -1 },
  preferredDividendsPaid: { kind: "first", tags: tagsFor("preferredDividendsPaid"), unit: "money", sign: -1 },
  commonDividendsPaid: COMMON_DIVIDENDS_SPEC,
  incomeTaxesPaid: lineItemChain("incomeTaxesPaid", "money"),
  interestPaid: lineItemChain("interestPaid", "money"),
  /**
   * FMP's own names for the two remaining cash-flow subtotals. Stage B's
   * forensics accruals ratio reads `netCashProvidedByInvestingActivities`
   * literally, so emitting only the short `investingCashFlow` key left the
   * ratio unresolvable on the keyless path.
   */
  netCashProvidedByInvestingActivities: lineItemChain("netCashProvidedByInvestingActivities", "money"),
  netCashProvidedByFinancingActivities: lineItemChain("netCashProvidedByFinancingActivities", "money"),
};

/** Fields whose value is a verbatim copy of another resolved field. */
const CASHFLOW_ALIASES: Record<string, string> = {
  netCashProvidedByOperatingActivities: "operatingCashFlow",
  investmentsInPropertyPlantAndEquipment: "capitalExpenditure",
  /** Short forms kept for existing consumers; legal via the FmpRawRow index signature. */
  investingCashFlow: "netCashProvidedByInvestingActivities",
  financingCashFlow: "netCashProvidedByFinancingActivities",
};

/** Balance-sheet aliases: FMP publishes the same receivables figure under two names. */
const BALANCE_ALIASES: Record<string, string> = {
  accountsReceivables: "netReceivables",
};

/**
 * FMP columns this extractor deliberately does not source from XBRL. They are
 * emitted as explicit nulls so a consumer sees "undisclosed", not "absent key".
 */
const INCOME_UNSOURCED = ["bottomLineNetIncome"];
const BALANCE_UNSOURCED = ["treasuryStock", "totalInvestments"];

/** Anchor concepts that date a fiscal year. `Assets` supplies instants. */
const FY_ANCHOR_DURATION_TAGS = [...REVENUE_TAGS, ...tagsFor("cashflowNetIncome")];

const NCI_INFERRED_ZERO_DISCLOSURE =
  "noncontrolling interest inferred zero: the filer tags only equity including noncontrolling interest here, reports zero net income attributable to noncontrolling interest for the period ending here, and its latest earlier noncontrolling-interest balance was zero; parent equity is that total";
export { FY_ANCHOR_DURATION_TAGS, INCOME_CHAINS, BALANCE_CHAINS, CASHFLOW_CHAINS, BANK_REVENUE_SPEC, BANK_INTEREST_INCOME_SPEC, type UnitKind, NCI_INFERRED_ZERO_DISCLOSURE, DUPLICATE_DEBT_CLASS_SHARE, COMBINED_CURRENT_TAG, CURRENT_MATURITY_TAGS, NOTES_AND_LOANS_CURRENT_TAGS, INCLUSIVE_LONG_TERM_TAG, INCLUSIVE_DEBT_COMPONENT_TAGS, CURRENT_DEBT_COMPONENT_TAGS, RESTRICTED_CASH_CURRENT_TAGS, RESTRICTED_CASH_NONCURRENT_TAGS, CONTINUING_EPS_WORKING_FIELDS, BANK_OPERATING_INCOME_SPEC, INCOME_UNSOURCED, BALANCE_ALIASES, BALANCE_UNSOURCED, CASHFLOW_ALIASES, DISCONTINUED_ELEMENT_FIELDS, CONTINUING_EPS_FIELDS };
