import { admitRevenue, admitRevenueGrossProfit, operatingRevenuePolicy, replayIncomeObservations, providerIncomeValue, retainedIncomeRows, type OperatingRevenuePolicy } from "./revenueAdmission";
import { GROSS_PROFIT_REVENUE_TAGS, REVENUE_COMPONENT_TAGS, PRETAX_EXCLUDING_EQUITY_METHOD_TAG, tagsFor } from "@/edgar/tagSynonyms";
import { CORE_FACT_FORMS, conceptFactsSchema, parseFactPoints, type CompanyFacts } from "@/edgar/xbrl";
import { factsForFilings, parsedConceptPoints } from "@/edgar/filedPresentation";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { memoize } from "@/edgar/computationContext";
import { sameIncomeScope } from "./revenuePresentation";
import { vendorAgreesWithDerived, vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import type { FiledIncomeLine, FmpIncomeStatementRow, FmpPayload, StatementFieldConflict, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";
import { admitFiledStatementFlows } from "@/edgar/financialEnrichment";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const same = vendorAgreesWithFiled;
/** D-200: the observed minor cluster ends at 0.907%; the next disagreement is 1.544%. */
const INCOMPLETE_EARNINGS_MINOR_DIFFERENCE = 0.01;

/** A filed line stands for a statement row only on the row's currency and exact period. */
const coversRowPeriod = (row: FmpIncomeStatementRow, proof: StatementFieldProvenance): boolean =>
  proof.unit === row.reportedCurrency && proof.periodEnd === row.date && proof.periodStart !== null &&
  (row.periodStart == null || row.periodStart === proof.periodStart) && proof.filings.length > 0;
/** The filed line's newest filing is the filing the statement row itself came from. */
const filedWithRow = (row: FmpIncomeStatementRow, proof: StatementFieldProvenance): boolean =>
  row.filingDate == null || [...proof.filings].sort((a, b) => b.filed.localeCompare(a.filed))[0]?.filed === row.filingDate;

/** Provider subtotals built on a revenue gross of interest expense: they mean nothing beside a filed net revenue. */
const GROSS_REVENUE_SUBTOTALS = ["costOfRevenue", "grossProfit", "operatingIncome", "operatingExpenses"] as const;
const BANK_TOTAL_TAGS = tagsFor("bankRevenueTotal").map(tag => `us-gaap/${tag}`);
const BANK_COMPONENT_TAGS = tagsFor("bankRevenueComponents");
const isBankTotal = (proof: StatementFieldProvenance | undefined): proof is StatementFieldProvenance =>
  proof !== undefined && proof.tags.length === 1 && BANK_TOTAL_TAGS.includes(proof.tags[0]!);
/** D-257: the row's revenue is refused against a filed bank total (the refusal's own evidence, never its wording). */
export const refusedAgainstBankRevenue = (row: FmpIncomeStatementRow): boolean => {
  const conflict = row.fieldConflicts?.revenue;
  return conflict?.usable === false && finite(conflict.vendorValue) && isBankTotal(conflict.secEvidence);
};
/** D-257: the row's revenue is the filed bank total the rule below adopted. */
export const onFiledBankRevenue = (row: FmpIncomeStatementRow): boolean => {
  const conflict = row.fieldConflicts?.revenue;
  return conflict?.usable === true && conflict.resolution === "filed-family" && isBankTotal(row.fieldProvenance?.revenue);
};

/**
 * D-257 (P7, P8, P1): a bank's total net revenue as its own filing proves it.
 * The filed total (`Revenues` or `RevenuesNetOfInterestExpense`) stands for the
 * statement row's exact period, and the filing's net interest income and
 * noninterest income, for the same period from the same filing or filings and
 * by the same quarter derivation, add up to it exactly. The comparison is exact:
 * a floating-point check is not a materiality allowance. No provider figure
 * takes part.
 */
export interface BankRevenueProof { value: number; proof: StatementFieldProvenance; components: FiledIncomeLine[] }
export function provenBankRevenue(row: FmpIncomeStatementRow, sec: FmpIncomeStatementRow | undefined): BankRevenueProof | null {
  const proof = sec?.fieldProvenance?.revenue;
  if (!sec || !finite(sec.revenue) || !isBankTotal(proof) || !coversRowPeriod(row, proof)) return null;
  const components = BANK_COMPONENT_TAGS.flatMap(tag => { const line = sec.filedIncomeLines?.[tag]; return line ? [line] : []; });
  if (components.length !== BANK_COMPONENT_TAGS.length ||
      !components.every(line => sameIncomeScope(proof, line.proof) && line.proof.derivation === proof.derivation)) return null;
  return components.reduce((sum, line) => sum + line.value, 0) === sec.revenue ? { value: sec.revenue, proof, components } : null;
}

/**
 * D-257 (P13): which rows of one bank statement move to the filed total net
 * revenue. Nothing moves unless the provider's revenue is already established
 * as a different figure from the filed total: a row the classification refuses
 * (or would refuse) against the total in the row's own filing, or a row this
 * rule moved before. In such a statement every row whose filed total is proven
 * takes it, the newest filing's figure included (P2); a row that still holds a
 * provider figure which is neither proven nor the filed total is withheld, so
 * no series mixes the provider's basis with the filed one.
 */
interface BankRevenueBasis {
  /** Rows an earlier pass already moved to the filed total. */
  moved: Set<FmpIncomeStatementRow>;
  adopt: Map<FmpIncomeStatementRow, BankRevenueProof & { vendor: number }>;
  unproven: Map<FmpIncomeStatementRow, { filed: number | null; proof: StatementFieldProvenance | null }>;
}
function bankRevenueBasis(rows: readonly FmpIncomeStatementRow[], filed: readonly FmpIncomeStatementRow[], cik: number): BankRevenueBasis | null {
  const read = rows.map(row => {
    const own = !!row.date && /^[A-Z]{3}$/.test(row.reportedCurrency ?? "") && (row.cik == null || row.cik.replace(/^0+/, "") === String(cik).replace(/^0+/, ""));
    const sec = own ? filed.find(candidate => candidate.date === row.date) : undefined;
    const proof = sec?.fieldProvenance?.revenue;
    const total = sec && finite(sec.revenue) && isBankTotal(proof) && coversRowPeriod(row, proof) ? { value: sec.revenue, proof } : null;
    const conflict = row.fieldConflicts?.revenue;
    const refused = conflict?.usable === false;
    const refusedAgainstTotal = refusedAgainstBankRevenue(row);
    const moved = onFiledBankRevenue(row);
    const disagrees = !refused && !moved && finite(row.revenue) && total !== null && !same(row.revenue, total.value);
    return { row, sec, total, conflict, refused, refusedAgainstTotal, moved, disagrees };
  });
  if (!read.some(r => r.refusedAgainstTotal || r.moved || r.disagrees && filedWithRow(r.row, r.total!.proof))) return null;
  const basis: BankRevenueBasis = { moved: new Set(), adopt: new Map(), unproven: new Map() };
  for (const r of read) {
    if (r.moved) { basis.moved.add(r.row); continue; }
    const proven = provenBankRevenue(r.row, r.sec);
    const vendor = finite(r.row.revenue) ? r.row.revenue : r.refusedAgainstTotal ? r.conflict!.vendorValue : null;
    // P11: a standing refusal clears only when it is the refusal against this very total, for this period and filing.
    const clears = !r.refused || r.refusedAgainstTotal && proven !== null && sameIncomeScope(r.conflict!.secEvidence, proven.proof) && r.conflict!.secValue === proven.value;
    if (proven && finite(vendor) && !same(vendor, proven.value) && clears) basis.adopt.set(r.row, { ...proven, vendor });
    else if (!r.refused && finite(r.row.revenue) && !(r.total !== null && same(r.row.revenue, r.total.value)))
      basis.unproven.set(r.row, { filed: r.total?.value ?? null, proof: r.total?.proof ?? null });
  }
  return basis;
}
const filingList = (proof: StatementFieldProvenance): string => proof.filings.map(f => `${f.form} ${f.accn}, filed ${f.filed}`).join(" + ");

/** An unreconciled ASC-606 amount need not cover the face revenue line. It
 * can omit derivative or lease transactions and can be rounded in a note.
 * Keep the refusal, but never call this evidence a proved consolidated total. */
export function contractRevenueScopeRefusal(proof: StatementFieldProvenance | null | undefined, vendor: number, filed: number): string | null {
  if (!proof || proof.tags.length !== 1 || !/^us-gaap\/RevenueFromContractWithCustomer(?:Including|Excluding)AssessedTax$/.test(proof.tags[0]!)) return null;
  return `Revenue scope unresolved: vendor revenue ${vendor} ${proof.unit} differs from contract-revenue fact ${filed} for ${proof.periodStart} through ${proof.periodEnd} (${proof.filings.map(f => `${f.form} ${f.accn}`).join(" + ")}). ` +
    "The contract-revenue amount is not established as consolidated operating revenue; derivative or lease transactions may be outside it, and a note may be rounded. A reconciled full income statement for the same registrant is required; a subsidiary registrant cannot substitute. Revenue and dependent margins remain withheld; source observations retained.";
}

/**
 * D-237 (P13): the pre-tax income an effective tax rate divides by, read by every
 * such rate (the DCF's year-one and historical rates, ROIC's NOPAT rate and the
 * WACC's statement rate). It is the filed pre-tax line before equity-method
 * results where the earnings admission below recorded one, because the provision
 * relates to that line; otherwise the row's own pre-tax income. A row whose
 * pre-tax income is withheld has no base either.
 */
export function effectiveTaxPretaxIncome(row: Pick<FmpIncomeStatementRow, "incomeBeforeTax" | "pretaxIncomeBeforeEquityMethod"> | null | undefined): number | null {
  if (!row || !finite(row.incomeBeforeTax)) return null;
  return finite(row.pretaxIncomeBeforeEquityMethod?.value) ? row.pretaxIncomeBeforeEquityMethod.value : row.incomeBeforeTax;
}

/** Reuse canonical filed statement resolution; never infer expense placement from EBIT. */
export function enrichIncomeClassification(income: FetchResult<FmpPayload<FmpIncomeStatementRow>>, facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string,
  opts: { bankRevenue?: boolean; securitiesRevenue?: boolean; earningsOnly?: boolean; filedRows?: FmpIncomeStatementRow[]; revenuePolicy?: OperatingRevenuePolicy } = {}):
  { income: typeof income; gaps: ManifestEntry[];
    /** D-257 (P11): refusals this pass cleared, so a caller holding their stored manifest entries can retire them. */
    cleared?: { field: string; reason: string }[] } {
  if (!income.ok || income.value.data.rows.length === 0) return { income, gaps: [] };
  if (!opts.bankRevenue && !opts.securitiesRevenue && income.value.source === "fmp")
    income = {...income,value:{...income.value,data:replayIncomeObservations(income.value.data,facts.cik,facts,observedAt.slice(0,10))}};
  const built = opts.filedRows ? null : buildStatementsFromCompanyFacts(facts, { symbol: "", cik: String(facts.cik), asOf: observedAt.slice(0, 10), factsObservedAt: observedAt,
    bankRevenue: opts.bankRevenue || opts.securitiesRevenue, annualPeriods: Math.max(12, income.value.data.rows.length + 2), quarterlyPeriods: Math.max(12, income.value.data.rows.length + 4),
    vendorSplits: { status: "unavailable", source: "income-classification", reason: "Income classification does not resolve per-share values" } });
  const filed = opts.filedRows ?? (scope === "annual" ? built!.incomeAnnual.rows : built!.incomeQuarterly.rows);
  const revenuePolicy = opts.revenuePolicy ?? operatingRevenuePolicy(filed);
  // D-257: the bank rule sits beside the securities-firm rule and never runs with it.
  const bankBasis = opts.bankRevenue === true && !opts.securitiesRevenue ? bankRevenueBasis(income.value.data.rows, filed, facts.cik) : null;
  const cleared: { field: string; reason: string }[] = [];
  const originalFilings = new Map<string, FmpIncomeStatementRow[]>();
  const gaps: ManifestEntry[] = [];
  const allowed: Record<string, string[]> = {
    revenue: [...GROSS_PROFIT_REVENUE_TAGS, ...REVENUE_COMPONENT_TAGS].map(tag => `us-gaap/${tag}`),
    costOfRevenue: ["us-gaap/CostOfRevenue", "us-gaap/CostOfGoodsAndServicesSold"],
    grossProfit: ["us-gaap/GrossProfit"], operatingExpenses: ["us-gaap/OperatingExpenses"],
  };
  const industrialRevenue = [...allowed.revenue!];
  if (opts.bankRevenue === true) allowed.revenue!.push(...[...tagsFor("bankRevenueTotal"), ...tagsFor("bankRevenueComponents")].map(tag => `us-gaap/${tag}`));
  const originalRow = (row: FmpIncomeStatementRow): FmpIncomeStatementRow | undefined => {
    if (!row.filingDate) return undefined;
    if (!originalFilings.has(row.filingDate)) {
      // The scan depends only on the facts and this (period end, filed day); computed once per run step (P13).
      const filingDate = row.filingDate;
      const accessions = new Set(memoize("incomeClassification.accessionsFor", facts, { end: row.date, filed: filingDate }, () =>
        [...new Set(Object.values(facts.facts).flatMap(ns => Object.values(ns).flatMap(raw => {
          const parsed = parsedConceptPoints(raw);
          return parsed !== null ? Object.values(parsed.points).flatMap(ps => ps.filter(p =>
            p.end === row.date && p.filed === filingDate && CORE_FACT_FORMS.has(p.form)).map(p => p.accn)) : [];
        })))]));
      const original = accessions.size === 1 ? buildStatementsFromCompanyFacts(factsForFilings(facts, [...accessions]), {
        symbol: "", cik: String(facts.cik), asOf: observedAt.slice(0,10), factsObservedAt: observedAt, annualPeriods: 40, quarterlyPeriods: 80,
        bankRevenue: opts.bankRevenue || opts.securitiesRevenue,
        vendorSplits: { status: "unavailable", source: "income-presentation", reason: "Monetary observations only" } }) : null;
      originalFilings.set(row.filingDate, original ? scope === "annual" ? original.incomeAnnual.rows : original.incomeQuarterly.rows : []);
    }
    return originalFilings.get(row.filingDate)!.find(r => r.date === row.date);
  };
  const rows = income.value.data.rows.map(original => {
    const flows = admitFiledStatementFlows(original, facts, "income", scope, observedAt, opts.bankRevenue === true || opts.securitiesRevenue === true);
    gaps.push(...flows.gaps);
    const row = flows.row;
    if (!row.date || !/^[A-Z]{3}$/.test(row.reportedCurrency ?? "") || (row.cik != null && row.cik.replace(/^0+/, "") !== String(facts.cik).replace(/^0+/, ""))) return row;
    const sec = filed.find(candidate => candidate.date === row.date);
    if (!sec) return row;
    const raw = retainedIncomeRows(income.value.data, row, facts.cik);
    const observedRevenue = providerIncomeValue(row, raw, "revenue");
    const needsOriginal = row.filingDate && !sec.fieldProvenance?.revenue?.filings.some(f => f.filed === row.filingDate) || observedRevenue !== null && (!finite(sec.revenue) || !same(observedRevenue, sec.revenue));
    const operatingFilings = sec.fieldProvenance?.operatingIncome?.tags.includes("us-gaap/OperatingIncomeLoss") &&
      !sameIncomeScope(sec.fieldProvenance.revenue,sec.fieldProvenance.operatingIncome) ? sec.fieldProvenance.operatingIncome.filings.map(f=>f.filed) : [];
    const presentations = opts.bankRevenue || opts.securitiesRevenue ? [] :
      [ ...(needsOriginal ? [row.filingDate] : []), ...operatingFilings ]
        .filter((date): date is string => !!date).flatMap(filingDate=>{const r=originalRow({...row,filingDate});return r?[r]:[];});
    const revenueAdmission = opts.bankRevenue || opts.securitiesRevenue ? null :
      admitRevenue(row, sec, presentations, income.value.data, facts, scope, revenuePolicy);
    const revenueSec = revenueAdmission?.evidence ?? sec;
    gaps.push(...(revenueAdmission?.gaps ?? []));
    const evidenceFor = (field: string): StatementFieldProvenance | null => {
      const proof = (field === "revenue" ? revenueSec : sec).fieldProvenance?.[field];
      if (field === "grossProfit" && proof === undefined && revenueSec === sec) {
        const revenue = evidenceFor("revenue"), cost = evidenceFor("costOfRevenue");
        if (revenue && cost && revenue.tags.some(tag => industrialRevenue.includes(tag)) && cost.tags.some(tag => allowed.costOfRevenue!.includes(tag)) &&
          revenue.periodStart === cost.periodStart && revenue.periodEnd === cost.periodEnd && revenue.unit === cost.unit &&
          JSON.stringify(revenue.filings) === JSON.stringify(cost.filings) && finite(sec.revenue) && finite(sec.costOfRevenue)) {
          return { ...revenue, tags: [...revenue.tags, ...cost.tags], calculation: "revenue-minus-cost" };
        }
      }
      return proof && coversRowPeriod(row, proof) &&
        (filedWithRow(row, proof) ||
          field === "revenue" && finite(observedRevenue) && finite(revenueSec.revenue) && same(observedRevenue, revenueSec.revenue) &&
          revenueAdmission?.handled === true) ? proof : null;
    };
    let out = revenueAdmission?.row ?? row;
    const refuse = (field: string, value: number | null, proof: StatementFieldProvenance | null, reason: string) => {
      const fieldConflicts = { ...out.fieldConflicts };
      if (fieldConflicts[field]?.usable !== false) fieldConflicts[field] = { usable: false, vendorValue: finite(row[field]) ? row[field] : null, secValue: value, reason, ...(proof ? { secEvidence: proof } : {}) };
      out = { ...out, [field]: null, fieldConflicts };
      gaps.push({ field: `statements.income.${row.date}.${field}`, reason, severity: "warn", attemptedSources: ["fmp:income-statement", "edgar:companyfacts"] });
    };
    const earnings = ["incomeBeforeTax", "incomeTaxExpense", "netIncome"] as const;
    const sameScope = sameIncomeScope;
    const revenueProof = evidenceFor("revenue");
    if (revenueAdmission?.handled && out.fieldConflicts?.revenue?.usable !== false &&
        (revenueAdmission.changed || row.fieldConflicts?.grossProfit?.usable !== false)) {
      out = admitRevenueGrossProfit(out, revenueSec, raw, presentations);
    }
    const gross = out.fieldConflicts?.grossProfit;
    // A row on the filed bank total discloses its withheld subtotals once, in the statement's own entry (D-257).
    if (gross?.usable === false && !bankBasis?.moved.has(original) && !bankBasis?.adopt.has(original)) gaps.push({field:`statements.income.${row.date}.grossProfit`,severity:"info",reason:gross.reason});
    if (revenueAdmission?.handled && out.fieldConflicts?.revenue?.usable === false) {
      refuse("revenue", out.fieldConflicts.revenue.secValue, out.fieldConflicts.revenue.secEvidence ?? null, out.fieldConflicts.revenue.reason);
      refuse("grossProfit", null, out.fieldConflicts.revenue.secEvidence ?? null, "Gross profit withheld beside unresolved operating revenue.");
    }
    let earningsSec = sec;
    const earningsProof = (field: string) => {
      const proof = earningsSec.fieldProvenance?.[field];
      return proof && proof.unit === row.reportedCurrency && proof.periodStart && proof.periodEnd === row.date &&
        (row.periodStart == null || row.periodStart === proof.periodStart) && proof.filings.length > 0 &&
        (row.filingDate == null || proof.filings.map(f => f.filed).sort().at(-1) === row.filingDate ||
          row.fieldProvenance?.[field]?.source === "edgar" && sameScope(row.fieldProvenance[field]!, proof)) ? proof : null;
    };
    const vendorFor = (field: string): number | null => finite(row[field]) ? row[field] :
      row.fieldConflicts?.[field]?.vendorValue ?? null;
    const conflicts = () => earnings.filter(field => {
      const proof = earningsProof(field), vendor = vendorFor(field), value = earningsSec[field];
      if (!proof || !finite(vendor) || !finite(value) || same(vendor, value)) return false;
      if (field === "incomeBeforeTax" && proof.tags.includes(`us-gaap/${PRETAX_EXCLUDING_EQUITY_METHOD_TAG}`)) {
        const equity = earningsProof("equityMethodIncomeLoss");
        if (equity && sameScope(proof, equity) && finite(earningsSec.equityMethodIncomeLoss) &&
            same(vendor, value + earningsSec.equityMethodIncomeLoss)) return false;
      }
      if (field !== "netIncome") return true;
      return !["netIncomeConsolidated", "netIncomeAvailableToCommon"].some(alternative => {
        const other = earningsProof(alternative);
        return other && sameScope(proof, other) && finite(earningsSec[alternative]) && same(vendor, earningsSec[alternative]);
      });
    });
    type Operand = { value: number; proof: StatementFieldProvenance };
    const operand = (field: string): Operand | null => {
      const proof = earningsProof(field), value = earningsSec[field];
      return proof && finite(value) && earningsSec.fieldConflicts?.[field]?.usable !== false ? { value, proof } : null;
    };
    const familyFor = () => {
      let pretax = operand("incomeBeforeTax");
      const tax = operand("incomeTaxExpense"), equity = operand("equityMethodIncomeLoss");
      if (!pretax || !tax || !sameScope(pretax.proof, tax.proof)) return null;
      if (pretax.proof.tags.includes(`us-gaap/${PRETAX_EXCLUDING_EQUITY_METHOD_TAG}`) && equity && sameScope(pretax.proof, equity.proof)) {
        pretax = { value: pretax.value + equity.value, proof: { ...pretax.proof,
          tags: [...new Set([...pretax.proof.tags, ...equity.proof.tags])], calculation: "pretax-plus-equity-method" } };
      }
      const consolidated = operand("netIncomeConsolidated"), parent = operand("netIncome"), nci = operand("netIncomeAttributableToNoncontrollingInterest");
      const discontinued = operand("netIncomeFromDiscontinuedOperations");
      // Continuing pretax/tax cannot be called a complete total-earnings
      // family beside a separately filed nonzero discontinued result.
      if (discontinued && discontinued.value !== 0) return null;
      const candidates: { net: Operand; basis: "parent" | "consolidated" }[] = [];
      if (consolidated) candidates.push({ net: consolidated, basis: "consolidated" });
      const parentBasis = parent && (parent.proof.tags.includes("us-gaap/NetIncomeLoss") ||
        parent.proof.tags.includes("us-gaap/ProfitLoss") && parent.proof.tags.includes("us-gaap/NetIncomeLossAttributableToNoncontrollingInterest"));
      if (parent && parentBasis && nci && sameScope(parent.proof, nci.proof)) candidates.push({ basis: "consolidated", net: {
        value: parent.value + nci.value, proof: { ...parent.proof, tags: [...new Set([...parent.proof.tags, ...nci.proof.tags])], calculation: "parent-plus-nci" } } });
      if (parent && parentBasis) candidates.push({ net: parent, basis: "parent" });
      const selected = candidates.find(c => sameScope(pretax!.proof, c.net.proof) &&
        vendorAgreesWithDerived(c.net.value, pretax!.value - tax.value, [pretax!.value, tax.value]));
      return selected ? { pretax, tax, ...selected } : null;
    };
    let family = familyFor();
    // Resolve the source candidate before deciding whether a dispute exists:
    // every latest comparative can have a different filing date from the row.
    if (!family && row.filingDate) {
      const original = originalRow(row);
      if (original) { earningsSec = original; family = familyFor(); }
    }
    const audit = (field: string, value: number | null, proof: StatementFieldProvenance | null, reason: string, resolution: "filed-family" | "minor-retained") => {
      out = { ...out, [field]: value, fieldConflicts: { ...out.fieldConflicts, [field]: { vendorValue: vendorFor(field), secValue: resolution === "minor-retained" && finite(earningsSec[field]) ? earningsSec[field] : value,
        usable: value !== null, resolution, reason, ...(proof ? { secEvidence: proof } : {}) } },
        ...(proof && resolution === "filed-family" && value !== null ? { fieldProvenance: { ...out.fieldProvenance, [field]: proof } } : {}) };
      if (resolution === "minor-retained" && out.fieldProvenance?.[field]) {
        const fieldProvenance = { ...out.fieldProvenance }; delete fieldProvenance[field];
        out = { ...out, fieldProvenance };
      }
    };
    const disputed = conflicts();
    if (disputed.length) {
      const differences = disputed.map(field => `${field}: vendor ${vendorFor(field)}, filed ${earningsSec[field]}`).join("; ");
      if (disputed.length && family) {
        const common = operand("netIncomeAvailableToCommon");
        const reason = `Filed earnings family adopted (${family.basis} basis), ${family.pretax.proof.periodStart} through ${row.date} ${family.pretax.proof.unit}; ${differences}; filed pretax ${family.pretax.value} - tax ${family.tax.value} = net income ${family.net.value}${common && sameScope(family.pretax.proof, common.proof) ? `; filed income available to common ${common.value}` : ""}; vendor observations retained`;
        const adopted: Record<string, Operand | null> = { incomeBeforeTax: family.pretax, incomeTaxExpense: family.tax, netIncome: family.net,
          netIncomeConsolidated: family.basis === "consolidated" ? family.net : operand("netIncomeConsolidated"),
          netIncomeAvailableToCommon: operand("netIncomeAvailableToCommon"), netIncomeAttributableToNoncontrollingInterest: operand("netIncomeAttributableToNoncontrollingInterest"),
          netIncomeFromContinuingOperations: operand("netIncomeFromContinuingOperations"), netIncomeFromDiscontinuedOperations: operand("netIncomeFromDiscontinuedOperations") };
        // The reconciled continuing pretax/tax and total-profit observations
        // establish these aliases by identity, rather than treating missing
        // discontinued data as zero without a complete earnings bridge.
        if (family.pretax.proof.tags.some(tag => tag.includes("IncomeLossFromContinuingOperationsBeforeIncomeTaxes"))) {
          const identityProof = { ...family.net.proof, tags: [...new Set([...family.pretax.proof.tags, ...family.tax.proof.tags, ...family.net.proof.tags])], calculation: "earnings-identity" as const };
          adopted.netIncomeFromContinuingOperations ??= { value: family.net.value, proof: identityProof };
          adopted.netIncomeFromDiscontinuedOperations ??= { value: 0, proof: identityProof };
        }
        adopted.bottomLineNetIncome = adopted.netIncomeAvailableToCommon ?? operand("netIncome") ?? family.net;
        for (const [field, item] of Object.entries(adopted)) {
          const compatible = item && sameScope(family.pretax.proof, item.proof) ? item : null;
          if (compatible || finite(row[field]) || row.fieldConflicts?.[field]) audit(field, compatible?.value ?? null, compatible?.proof ?? null, reason, "filed-family");
        }
        out = { ...out, netIncomeOwnershipBasis: family.basis, periodStart: family.pretax.proof.periodStart,
          netIncomeRatio: finite(out.revenue) && out.revenue !== 0 ? family.net.value / out.revenue : null,
          incomeBeforeTaxRatio: finite(out.revenue) && out.revenue !== 0 ? family.pretax.value / out.revenue : null,
          effectiveTaxRate: family.pretax.value !== 0 ? family.tax.value / family.pretax.value : null, netProfitMargin: null };
        // The adoption invalidates provider aggregates that depended on the
        // old pretax base. Recover compatible filed operands, never invent a plug.
        const oldPretax = vendorFor("incomeBeforeTax");
        const brokenOperating = finite(row.operatingIncome) && finite(row.totalOtherIncomeExpensesNet) && finite(oldPretax) &&
          same(row.operatingIncome + row.totalOtherIncomeExpensesNet, oldPretax) && !same(row.operatingIncome + row.totalOtherIncomeExpensesNet, family.pretax.value);
        if (brokenOperating) {
          const op = operand("operatingIncome"), rev = operand("revenue"), other = operand("totalOtherIncomeExpensesNet");
          if (op && rev && sameScope(family.pretax.proof, op.proof) && sameScope(op.proof, rev.proof) && finite(out.revenue) && same(out.revenue, rev.value)) audit("operatingIncome", op.value, op.proof, reason, "filed-family");
          if (other && sameScope(family.pretax.proof, other.proof) && finite(out.operatingIncome) && same(out.operatingIncome + other.value, family.pretax.value)) audit("totalOtherIncomeExpensesNet", other.value, other.proof, reason, "filed-family");
          else refuse("totalOtherIncomeExpensesNet", null, family.pretax.proof, `${reason}; old nonoperating aggregate no longer reconciles to pretax`);
        }
        const oldEbit = row.ebit;
        if (finite(oldEbit) && finite(oldPretax) && finite(row.interestExpense) && same(oldEbit, oldPretax + row.interestExpense) && !same(oldEbit, family.pretax.value + row.interestExpense)) {
          const op = operand("operatingIncome");
          if (op && sameScope(family.pretax.proof, op.proof)) audit("ebit", op.value, { ...op.proof, calculation: "operating-income-as-ebit" }, reason, "filed-family");
          else refuse("ebit", null, family.pretax.proof, `${reason}; old pretax-derived EBIT has no compatible filed operating basis`);
          if (finite(row.ebitda) && finite(row.depreciationAndAmortization) && same(row.ebitda, oldEbit + row.depreciationAndAmortization)) {
            const da = operand("depreciationAndAmortization");
            if (op && da && sameScope(op.proof, da.proof)) audit("ebitda", op.value + da.value, { ...op.proof, tags: [...new Set([...op.proof.tags, ...da.proof.tags])], calculation: "operating-income-plus-da" }, reason, "filed-family");
            else refuse("ebitda", null, family.pretax.proof, `${reason}; old EBIT-derived EBITDA has no compatible filed operands`);
          }
        }
        if (finite(row.costAndExpenses) && finite(row.revenue) && finite(oldPretax) && same(row.revenue - row.costAndExpenses, oldPretax) && !same(row.revenue - row.costAndExpenses, family.pretax.value)) refuse("costAndExpenses", null, family.pretax.proof, `${reason}; old cost aggregate no longer reconciles to pretax`);
        gaps.push({ field: `statements.income.${row.date}.earningsFamily`, reason, severity: "info", expected: true });
      } else if (disputed.length) {
        const sign = disputed.some(field => { const vendor = vendorFor(field), value = earningsSec[field]; return finite(vendor) && finite(value) && vendor * value < 0; });
        const minor = !sign && disputed.every(field => Math.abs(vendorFor(field)! - (earningsSec[field] as number)) / Math.max(Math.abs(vendorFor(field)!), Math.abs(earningsSec[field] as number), 1) <= INCOMPLETE_EARNINGS_MINOR_DIFFERENCE);
        const reason = `Filed earnings family incomplete or unreconciled for ${row.date}; ${differences}; ${minor ? "same-sign difference within the 1% minor-restatement allowance; vendor family retained with both observations" : sign ? "sign conflict; earnings family withheld" : "material difference above 1%; earnings family withheld"}`;
        if (minor) for (const field of disputed) audit(field, vendorFor(field), earningsProof(field), reason, "minor-retained");
        else {
          for (const field of [...earnings, "bottomLineNetIncome", "netIncomeConsolidated", "netIncomeAvailableToCommon", "netIncomeFromContinuingOperations", "netIncomeFromDiscontinuedOperations"]) refuse(field, finite(earningsSec[field]) ? earningsSec[field] : null, earningsProof(field) ?? earningsProof(disputed[0]!)!, reason);
          out = { ...out, netIncomeRatio: null, netProfitMargin: null, incomeBeforeTaxRatio: null, effectiveTaxRate: null };
        }
        gaps.push({ field: `statements.income.${row.date}.earningsFamily`, reason, severity: minor ? "info" : "warn", ...(minor ? { expected: true } : {}) });
      }
    }
    // D-237 (P13, P8): a filer whose pre-tax line excludes equity-method results
    // presents them after its provision, so the provision relates to that line.
    // The row's pre-tax income (the provider's, or the adopted family's) is the
    // earnings-identity figure and may include the after-tax equity-method result.
    // Record the filed line itself beside it, from the same reconciled family, so
    // an effective tax rate divides by the provision's own base
    // (`effectiveTaxPretaxIncome`). No tolerance is added: the row's pair must
    // already be the same observation as the filed family under the P8 allowance.
    // A base recorded by an earlier pass is re-established here or dropped.
    if (out.pretaxIncomeBeforeEquityMethod !== undefined) out = { ...out, pretaxIncomeBeforeEquityMethod: undefined };
    if (family && family.pretax.proof.calculation === "pretax-plus-equity-method") {
      const line = operand("incomeBeforeTax");
      if (line && finite(out.incomeBeforeTax) && finite(out.incomeTaxExpense) &&
          out.fieldConflicts?.incomeBeforeTax?.usable !== false && out.fieldConflicts?.incomeTaxExpense?.usable !== false &&
          (same(out.incomeBeforeTax, family.pretax.value) || same(out.incomeBeforeTax, line.value)) && same(out.incomeTaxExpense, family.tax.value)) {
        out = { ...out, pretaxIncomeBeforeEquityMethod: { value: line.value, proof: line.proof } };
      }
    }
    // Ownership scope is useful even when the provider's parent earnings agree.
    // Admit the signed bridge only from the same reconciled filing family;
    // matching a number alone does not establish an ownership basis.
    if (family && disputed.length === 0 && out.fieldConflicts?.netIncome?.usable !== false) {
      const parent = operand("netIncome"), nci = operand("netIncomeAttributableToNoncontrollingInterest");
      const consolidated = family.basis === "consolidated" ? family.net : operand("netIncomeConsolidated");
      const parentScope = parent?.proof.tags.includes("us-gaap/NetIncomeLoss") ||
        parent?.proof.tags.includes("us-gaap/ProfitLoss") && parent.proof.tags.includes("us-gaap/NetIncomeLossAttributableToNoncontrollingInterest");
      const compatible = parent && parentScope && nci && consolidated &&
        [parent, nci, consolidated].every(item => sameScope(family.pretax.proof, item.proof)) &&
        vendorAgreesWithDerived(parent.value, consolidated.value - nci.value, [consolidated.value, nci.value]);
      const basis = compatible && finite(out.netIncome)
        ? same(out.netIncome, parent.value) ? "parent" : same(out.netIncome, consolidated.value) ? "consolidated" : null : null;
      if (basis && compatible) {
        const reason = `Filed ownership bridge, ${family.pretax.proof.periodStart} through ${row.date} ${family.pretax.proof.unit}: consolidated profit ${consolidated.value} minus signed noncontrolling income ${nci.value} = parent profit ${parent.value}; provider net income retained on its ${basis} basis`;
        for (const [field, item] of [["netIncomeConsolidated", consolidated], ["netIncomeAttributableToNoncontrollingInterest", nci]] as const) {
          if (out.fieldConflicts?.[field]?.usable === false || finite(out[field]) && !same(out[field], item.value)) continue;
          if (finite(out[field]) && out.fieldProvenance?.[field] && sameScope(out.fieldProvenance[field], item.proof)) continue;
          audit(field, item.value, item.proof, reason, "filed-family");
        }
        out = { ...out, netIncomeOwnershipBasis: basis, fieldProvenance: { ...out.fieldProvenance,
          netIncome: basis === "parent" ? parent.proof : consolidated.proof } };
      }
    }
    // A frozen row can already contain the adopted earnings family while its
    // operating aggregate still belongs to the old provider pretax base: the
    // previously missing revenue prevented the first pass from recovering it.
    // Repeat that dependent check after total admission, even without a new
    // earnings dispute. An unrelated operating refusal remains protected.
    const priorPretax = row.fieldConflicts?.incomeBeforeTax;
    const priorOther = row.fieldConflicts?.totalOtherIncomeExpensesNet?.vendorValue ?? row.totalOtherIncomeExpensesNet;
    if (family && priorPretax?.usable === true && priorPretax.resolution === "filed-family" && finite(priorPretax.vendorValue) &&
        out.fieldConflicts?.revenue?.usable === true && out.fieldConflicts.revenue.resolution === "filed-family" &&
        row.fieldConflicts?.operatingIncome?.usable !== false && finite(row.operatingIncome) && finite(priorOther) &&
        same(row.operatingIncome + priorOther, priorPretax.vendorValue) && !same(row.operatingIncome + priorOther, family.pretax.value)) {
      const op = operand("operatingIncome"), revenue = out.fieldProvenance?.revenue;
      if (op && revenue && sameScope(family.pretax.proof, op.proof) && sameScope(revenue, op.proof)) {
        audit("operatingIncome", op.value, op.proof, "Previously adopted filed earnings family: dependent operating numerator recovered on the independently admitted total-revenue filing scope; old provider aggregate retained as an observation", "filed-family");
      }
    }
    // Share admission may run after monetary adoption on fresh acquisition.
    // Recheck direct EPS independently when the complete family already agrees.
    if (family) {
      // Do not derive EPS from profit. A previously admitted count can prove
      // that direct filed EPS uses this row's unchanged ordinary-share unit.
      // Split-adjusted, ADR-converted and million-scaled counts cannot pass
      // the raw filed-count tie-out below.
      for (const [eps, shares] of [["eps", "weightedAverageShsOut"], ["epsDiluted", "weightedAverageShsOutDil"]] as const) {
        const shareProof = row.fieldProvenance?.[shares], count = row[shares];
        if (!finite(row[eps]) || !finite(count) || !shareProof || shareProof.unit !== "shares" || shareProof.shareUnitConversion ||
            row.fieldConflicts?.[shares]?.usable === false || row.fieldConflicts?.[eps]?.usable === false || !sameScope({ ...shareProof, unit: family.pretax.proof.unit }, family.pretax.proof)) continue;
        const matchingPoints = (tag: string, unit: string) => {
          const concept = conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
          return concept.success ? parseFactPoints(concept.data.units[unit] ?? []).filter(p =>
            p.start === shareProof.periodStart && p.end === shareProof.periodEnd && shareProof.filings.some(f =>
              f.accn === p.accn && f.filed === p.filed && f.form === p.form)) : [];
        };
        const countMatches = tagsFor(shares).some(tag => matchingPoints(tag, "shares").some(p =>
          Math.abs(p.val - count) <= Math.max(1, Math.abs(p.val) * 0.0001)));
        if (!countMatches) continue;
        const points = tagsFor(eps).flatMap(tag => matchingPoints(tag, `${row.reportedCurrency}/shares`).map(point => ({ tag, point })));
        if (new Set(points.map(p => p.point.val)).size !== 1) continue;
        const value = points[0]!.point.val;
        if (Math.abs(value - row[eps]!) <= 0.005 + 1e-9) continue;
        audit(eps, value, { ...shareProof, unit: `${row.reportedCurrency}/shares`, tags: [...new Set(points.map(p => `us-gaap/${p.tag}`))] }, `Filed ${eps} adopted on the independently admitted unchanged share unit, ${shareProof.periodStart} through ${row.date}; vendor ${row[eps]}, filed ${value} ${row.reportedCurrency}/shares; vendor observation retained`, "filed-family");
      }
    }
    const netRevenue = evidenceFor("revenue");
    if (opts.securitiesRevenue && netRevenue?.tags.includes("us-gaap/RevenuesNetOfInterestExpense") &&
        finite(sec.revenue) && finite(row.revenue) && !same(row.revenue, sec.revenue) && row.fieldConflicts?.revenue?.usable !== false) {
      const reason = `Securities-firm revenue reconciled from vendor ${row.revenue} gross of interest expense to directly filed net revenue ${sec.revenue} ${netRevenue.unit}, ${netRevenue.periodStart} through ${row.date}; incompatible gross-revenue costs, profit subtotals and margins withheld`;
      out = { ...out, revenue: sec.revenue, fieldProvenance: { ...out.fieldProvenance, revenue: netRevenue } };
      for (const field of GROSS_REVENUE_SUBTOTALS) {
        if (finite(row[field])) refuse(field, null, netRevenue, reason);
      }
      out = { ...out, grossProfitRatio: null, grossProfitMargin: null, operatingIncomeRatio: null, netIncomeRatio: null };
      gaps.push({ field: `statements.income.${row.date}.revenue`, reason, severity: "info", expected: true, attemptedSources: ["edgar:companyfacts/us-gaap/RevenuesNetOfInterestExpense", "fmp:income-statement"] });
    }
    // D-257 (P8): the bank rule, beside the securities one. The filed total net
    // revenue, proven by its two components (`provenBankRevenue`), replaces the
    // provider's figure; the provider subtotals built on that figure are withheld
    // with it. The refusals are typed on the row; one manifest entry per
    // statement discloses them (after the loop), so a ten-year history does not
    // become forty entries.
    const bankRevenue = bankBasis?.adopt.get(original);
    if (bankRevenue) {
      const [netInterest, noninterest] = bankRevenue.components;
      const reason = `Bank revenue: filed total net revenue ${bankRevenue.value} ${bankRevenue.proof.unit} adopted for ${bankRevenue.proof.periodStart} through ${row.date} ` +
        `(${filingList(bankRevenue.proof)}${bankRevenue.proof.derivation ? `; quarter derived, ${bankRevenue.proof.derivation}` : ""}): ` +
        `net interest income ${netInterest!.value} plus noninterest income ${noninterest!.value} for the same period, from the same ${bankRevenue.proof.filings.length === 1 ? "filing" : "filings"}, add up to it exactly. ` +
        `The provider's revenue ${bankRevenue.vendor} is a different figure and is kept as an observation; the provider's cost of revenue, gross profit, operating income and operating expenses, built on it, are withheld`;
      const prior = row.fieldConflicts?.revenue;
      if (prior?.usable === false) cleared.push({ field: `statements.income.${row.date}.revenue`, reason: prior.reason });
      const fieldConflicts: Record<string, StatementFieldConflict> = { ...out.fieldConflicts, revenue: { usable: true, resolution: "filed-family", vendorValue: bankRevenue.vendor,
        secValue: bankRevenue.value, reason, secEvidence: bankRevenue.proof } };
      const withheld: Record<string, null> = {};
      for (const field of GROSS_REVENUE_SUBTOTALS) {
        if (!finite(row[field])) continue;
        withheld[field] = null;
        if (fieldConflicts[field]?.usable !== false) fieldConflicts[field] = { usable: false, vendorValue: row[field] ?? null, secValue: null, reason, secEvidence: bankRevenue.proof };
      }
      out = { ...out, ...withheld, revenue: bankRevenue.value, grossProfitRatio: null, grossProfitMargin: null, operatingIncomeRatio: null, netIncomeRatio: null,
        fieldProvenance: { ...out.fieldProvenance, revenue: bankRevenue.proof }, fieldConflicts };
    }
    if (opts.earningsOnly) return out;
    const canonicalCostEvidence = evidenceFor("costOfRevenue");
    // A canonical unknown cannot establish a refusal outside this row's source scope.
    if (sec.fieldConflicts?.grossProfit?.usable === false && canonicalCostEvidence && evidenceFor("revenue")) {
      refuse("grossProfit", null, canonicalCostEvidence, sec.fieldConflicts.grossProfit.reason);
    }
    // D-262 (P8): a complete filed operating family on already admitted revenue
    // settles conflicting cost/expense subtotals. An isolated expense or a
    // revenue residual still cannot establish placement.
    const operatingFields = ["revenue", "costOfRevenue", "grossProfit", "operatingExpenses", "operatingIncome"];
    const operatingProof = evidenceFor("revenue");
    const completeOperating = !opts.bankRevenue && !opts.securitiesRevenue && operatingProof &&
      operatingFields.every(field => finite(sec[field]) && evidenceFor(field) && sameScope(operatingProof, evidenceFor(field)!)) &&
      finite(out.revenue) && same(out.revenue, sec.revenue as number) &&
      same((sec.revenue as number) - (sec.costOfRevenue as number), sec.grossProfit as number) &&
      same((sec.grossProfit as number) - (sec.operatingExpenses as number), sec.operatingIncome as number);
    for (const [field, tags] of Object.entries(allowed)) {
      if (field === "grossProfit" && out.fieldConflicts?.grossProfit?.usable === true &&
          revenueProof && out.fieldProvenance?.grossProfit && sameScope(revenueProof, out.fieldProvenance.grossProfit)) continue;
      if (field === "revenue" && revenueAdmission?.handled) continue;
      if (field === "revenue" && out !== row && out.fieldProvenance?.revenue === netRevenue && out.revenue === sec.revenue && opts.securitiesRevenue) continue;
      if (field === "revenue" && bankRevenue) continue;
      if (row.fieldConflicts?.[field]?.usable === false) { out = { ...out, [field]: null }; continue; }
      const proof = evidenceFor(field);
      if (!proof || (!proof.tags.some(tag => tags.includes(tag)) && !(field === "grossProfit" && proof.calculation === "revenue-minus-cost")) || !finite(sec[field]) || !finite(row[field])) continue;
      if (same(row[field], sec[field])) out = { ...out, fieldProvenance: { ...out.fieldProvenance, [field]: proof } };
      else if (field !== "revenue" && completeOperating) {
        const reason = `Filed operating family for ${row.date} replaces conflicting ${field}: vendor ${row[field]}, filed ${sec[field]} ${proof.unit}, ${proof.periodStart} through ${row.date}; revenue less cost equals gross profit, less operating expenses equals operating income on one filing scope. Vendor observation retained.`;
        audit(field, sec[field], proof, reason, "filed-family");
        gaps.push({ field: `statements.income.${row.date}.${field}`, reason, severity: "info", expected: true });
      }
      else refuse(field, sec[field], proof, (field === "revenue" ? contractRevenueScopeRefusal(proof, row[field], sec[field]) : null) ??
        `Income classification conflict for ${field}: vendor ${row[field]}, filed ${sec[field]} ${proof.unit}, ${proof.periodStart} through ${row.date}; a reconciled EBIT does not establish expense placement`);
    }
    if (completeOperating && out.fieldConflicts?.grossProfit?.resolution === "filed-family" && finite(out.grossProfit) && finite(out.revenue) && out.revenue !== 0)
      out = { ...out, grossProfitRatio: out.grossProfit / out.revenue, grossProfitMargin: out.grossProfit / out.revenue };
    const unsupportedOperand = (["revenue", "costOfRevenue"] as const).map(field => ({ field, proof: evidenceFor(field) }))
      .find(({ field, proof }) => proof && !proof.tags.some(tag => (field === "revenue" ? industrialRevenue : allowed[field]!).includes(tag)));
    if (finite(out.grossProfit) && !out.fieldProvenance?.grossProfit && unsupportedOperand) {
      refuse("grossProfit", null, unsupportedOperand.proof, `Gross-profit classification unavailable: filed ${unsupportedOperand.field} definition is not independently compatible with industrial gross-profit arithmetic; no comparable filed subtotal established`);
    }
    // A cost classification refusal also invalidates an unsupported vendor GP;
    // a separately matching directly filed GP remains usable on its own basis.
    if (out.fieldConflicts?.costOfRevenue?.usable === false && !out.fieldProvenance?.grossProfit && finite(out.grossProfit)) {
      refuse("grossProfit", null, evidenceFor("costOfRevenue"), "Gross profit classification unavailable: refused cost placement and no independently matching filed gross profit");
    }
    if (out.fieldConflicts?.grossProfit?.usable === false) out = { ...out, grossProfitRatio: null, grossProfitMargin: null };
    if (finite(out.operatingExpenses) && !evidenceFor("operatingExpenses")) {
      const component = ["sellingGeneralAndAdministrativeExpenses", "researchAndDevelopmentExpenses"].find(field => finite(sec[field]) && same(out.operatingExpenses as number, sec[field]) && evidenceFor(field));
      if (component) refuse("operatingExpenses", null, evidenceFor(component), "Operating expenses unavailable: a partial expense component does not establish a complete operating-expense total");
    }
    return out;
  });
  if (bankBasis === null || bankBasis.adopt.size + bankBasis.moved.size === 0) return { income: { ...income, value: { ...income.value, data: { ...income.value.data, rows } } }, gaps };
  // D-257 (P13): one basis per statement. A provider figure that is neither the
  // filed total nor replaced by a proven one cannot share a growth series, a
  // margin series or a trailing window with the rows moved above; it is withheld.
  const settled = rows.map((out, index): FmpIncomeStatementRow => {
    const row = income.value.data.rows[index]!, unproven = bankBasis.unproven.get(row);
    if (!unproven) return out;
    const reason = `Bank revenue for ${row.date ?? "an undated period"} withheld: other periods of this statement use the filed total net revenue, and for this period ` +
      (unproven.filed === null ? "no filed total for the row's own period is available" :
        `the filed total ${unproven.filed} ${unproven.proof!.unit} (${filingList(unproven.proof!)}) is not proven by net interest income plus noninterest income for the same period in the same filing`) +
      `. The provider's revenue ${row.revenue} is on another basis and cannot share a series with them; it is kept as an observation`;
    gaps.push({ field: `statements.income.${row.date}.revenue`, reason, severity: "warn", attemptedSources: ["fmp:income-statement", "edgar:companyfacts"] });
    const field: string = "revenue";
    return { ...out, [field]: null, fieldConflicts: { ...out.fieldConflicts, revenue: { usable: false, vendorValue: row.revenue ?? null, secValue: unproven.filed, reason,
      ...(unproven.proof ? { secEvidence: unproven.proof } : {}) } } };
  });
  if (bankBasis.adopt.size > 0) {
    const adopted = [...bankBasis.adopt].map(([row, proven]) => ({ date: String(row.date), ...proven })).sort((a, b) => b.date.localeCompare(a.date));
    gaps.push({ field: `statements.${scope === "annual" ? "incomeAnnual" : "incomeQuarterly"}.revenue.bankNetRevenue`, severity: "info", expected: true,
      attemptedSources: [...new Set(adopted.map(a => `edgar:companyfacts/${a.proof.tags[0]!}`)), "fmp:income-statement"],
      reason: `Bank revenue: the filed total net revenue replaces the provider's revenue for ${adopted.length} ${scope === "annual" ? "fiscal year" : "quarter"}${adopted.length === 1 ? "" : "s"}. ` +
        "Each total is proven by the same filing: its net interest income plus its noninterest income for the same period add up to it exactly. " +
        "The provider's revenue is a different figure and is kept as an observation; the provider's cost of revenue, gross profit, operating income and operating expenses, built on it, are withheld for the same periods. " +
        adopted.map(a => `${a.date} ${a.value} ${a.proof.unit} (${a.proof.filings.map(f => `${f.form} ${f.accn}`).join(" + ")}${a.proof.derivation ? `, ${a.proof.derivation}` : ""})`).join("; ") + "." });
  }
  return { income: { ...income, value: { ...income.value, data: { ...income.value.data, rows: settled } } }, gaps, ...(cleared.length > 0 ? { cleared } : {}) };
}
