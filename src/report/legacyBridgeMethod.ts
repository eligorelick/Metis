import { millions } from "@/pipeline/stageB/netDebt";
import { financeLeaseOnlyEvClause, financeLeaseOnlyTotal } from "@/pipeline/stageB/valuation";
import { specVersionBefore } from "@/report/legacyPayloadRecordSafety";
import type { Report } from "@/report/schema";

/**
 * Display-time marking of a stored report valued before this batch's report spec
 * (audit 2026-10-27 B4a: FIN-103, FIN-119, FIN-303, FIN-305, FIN-404, FIN-108,
 * FIN-311, FIN-109; D-67). The DCF, excess-return and REIT figures it shows are as
 * stored; the notes below say which bridge rules changed since. No figure is
 * rewritten. Each clause fires only where a stored byte shows the old method
 * touched that report, and where no stored byte can show it the clause is worded
 * as a condition. The claims, E-7 and lease clauses are for the FCFF DCF route
 * only: the excess-return route values common book equity, has no E-7 bridge and
 * no sales-to-capital, and only the divisor reaches it.
 *
 * FIN-109: a stored EV basis that says a total lease liability "is disclosed but
 * its operating slice is not" is shown with the corrected finance-lease sentence
 * when the stored lease amounts show the total is wholly a finance lease (the
 * same rule as Stage B's `financeLeaseOnlyTotal`), and the stored "the FMP route
 * publishes no split" entry is hidden.
 *
 * The since-version is frozen: it never compares against `REPORT_SPEC_VERSION`
 * itself, because later batches move that constant. Every note is a fixed string
 * plus amounts read from stored numbers: no provider, filing or model text reaches
 * it. Each clause compares the report's spec with its own part's cutoff, so there
 * is no module-wide early return for a later part's clauses to hide behind.
 */
export const BRIDGE_METHOD_SINCE_SPEC_VERSION = "1.50.0";

const SINCE = BRIDGE_METHOD_SINCE_SPEC_VERSION;
const NOTE_PREFIX = "Valued under the equity-bridge method before report spec ";
const REIT_NOTE_PREFIX = "Priced under the REIT method before report spec ";
const REIT_NOTE = `${REIT_NOTE_PREFIX}${SINCE}: P/FFO, P/AFFO and the implied cap rate used price × weighted diluted shares and the block's own enterprise value, so they can differ from the multiples table.`;

const CLAIMS_CLAUSE =
  "the bridge did not read temporary-equity (redeemable) claims, pension and OPEB deficits, loss-contingency accruals or contingent consideration, so any the issuer filed were not deducted";
const E7_CLAUSE =
  "it deducted the filed retirement and environmental obligations shown in its bridge at their full amount, before the tax relief a settlement earns";
const DIVISOR_CONDITIONAL = "if the divisor period was a loss quarter, its divisor carried no award dilution";
const DIVISOR_DETECTED = "the divisor period was a loss quarter, so its divisor carried no award dilution";

const AMOUNT = "([\\d,]+(?:\\.\\d+)?)";
const OLD_FINANCE_ONLY = new RegExp(`a total lease liability of ${AMOUNT} is disclosed but its operating slice is not, so no lease adjustment was made and EV is reported as-is`);
const LEASE_LEFT_OUT = new RegExp(`, less (?:an OPERATING lease liability|a disclosed operating-lease portion) of ${AMOUNT}`);
const NO_SPLIT_ENTRY = new RegExp(`^lease liabilities of ${AMOUNT} are disclosed only as a combined operating \\+ finance figure \\(the FMP route publishes no split\\)`);

const amountOf = (text: string): number | null => {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
};

/** The two stored fields that carry the EV basis sentence. */
const evBases = (report: Report): string[] =>
  [report.valuation.multiplesBasis, report.valuation.marketValueScope?.enterpriseValueBasis].filter((text): text is string => typeof text === "string");

/** The operating lease the stored EV basis removed from net debt under the D-25 default, or null. */
function storedLeaseLeftOut(report: Report): number | null {
  for (const basis of evBases(report)) {
    if (!basis.includes("EXCLUDES the OPERATING-lease liability")) continue;
    const match = LEASE_LEFT_OUT.exec(basis);
    const amount = match === null ? null : amountOf(match[1]!);
    if (amount !== null && amount > 0) return amount;
  }
  return null;
}

/** A stored sales-to-capital basis exists, and it does not say the operating lease was removed, kept by switch or refused. */
function storedSalesToCapitalIgnoresLease(report: Report): boolean {
  const row = report.valuation.dcf.assumptions.find((a) => a.name.startsWith("sales-to-capital"));
  return row !== undefined && !/operating[- ]lease[^.]*(?:removed|kept in invested capital)/i.test(row.basis);
}

/** A stored divisor note or assumption basis says the divisor period was a loss whose filed diluted count carries no award dilution. */
function storedDivisorIsLossPeriod(report: Report): boolean {
  const texts = [...report.valuation.dcf.assumptions.map((a) => a.basis), ...(report.valuation.dcf.sensitivityNotes ?? [])];
  return texts.some((text) => /is a loss, so its filed diluted count (?:equals its basic count|carries none)/.test(text));
}

function storedLeaseNumber(report: Report, kind: "finance" | "operating"): number | null {
  const pattern = kind === "finance" ? /(?:debtBridge\.financeLeases|current-capital\.finance-leases)$/ : /(?:debtBridge\.operatingLeases|current-capital\.operating-leases)$/;
  const found = report.balanceSheet.debtProfile.numbers.find((n) => pattern.test(n.sourceId ?? "") && typeof n.value === "number");
  return found === undefined ? null : found.value;
}

/** The finance-lease-only total the stored basis names, by Stage B's own rule applied to the stored amounts. */
function storedFinanceOnlyTotal(report: Report, basis: string): number | null {
  const match = OLD_FINANCE_ONLY.exec(basis);
  const total = match === null ? null : amountOf(match[1]!);
  return financeLeaseOnlyTotal(total, storedLeaseNumber(report, "operating"), storedLeaseNumber(report, "finance"), null);
}

function correctFinanceLeaseSentence(report: Report): Report {
  const correct = (basis: string): string => {
    const total = storedFinanceOnlyTotal(report, basis);
    return total === null ? basis : basis.replace(OLD_FINANCE_ONLY, financeLeaseOnlyEvClause(total));
  };
  let next = report;
  const multiplesBasis = report.valuation.multiplesBasis;
  const scope = report.valuation.marketValueScope;
  const correctedBasis = multiplesBasis === undefined ? undefined : correct(multiplesBasis);
  const correctedScope = scope === undefined ? undefined : correct(scope.enterpriseValueBasis);
  if ((correctedBasis !== undefined && correctedBasis !== multiplesBasis) || (correctedScope !== undefined && correctedScope !== scope!.enterpriseValueBasis)) {
    next = {
      ...next,
      valuation: {
        ...next.valuation,
        ...(correctedBasis === undefined ? {} : { multiplesBasis: correctedBasis }),
        ...(scope === undefined || correctedScope === undefined ? {} : { marketValueScope: { ...scope, enterpriseValueBasis: correctedScope } }),
      },
    };
  }
  // The stored "publishes no split" entry is hidden when its total is the finance-only total the basis names.
  const totals = evBases(report).map((basis) => storedFinanceOnlyTotal(report, basis)).filter((total): total is number => total !== null);
  if (totals.length > 0) {
    const kept = next.appendix.missingData.filter((entry) => {
      if (entry.field !== "valuation.multiples.enterpriseValue.leases") return true;
      const match = NO_SPLIT_ENTRY.exec(entry.reason);
      const amount = match === null ? null : amountOf(match[1]!);
      return !(amount !== null && totals.some((total) => total === amount));
    });
    if (kept.length !== next.appendix.missingData.length) next = { ...next, appendix: { ...next.appendix, missingData: kept } };
  }
  return next;
}

export function withLegacyBridgeMethod(report: Report): Report {
  // B4a's clauses: this part's cutoff. A later part's clauses (Task 15b) compare with their own, below this check.
  if (!specVersionBefore(report.meta.specVersion, SINCE)) return report;
  let next = report;

  const fairValue = next.fairValue;
  if (
    fairValue !== undefined &&
    fairValue.status === "available" &&
    (fairValue.method === "fcff-dcf" || fairValue.method === "excess-return") &&
    !fairValue.basis.some((line) => line.startsWith(NOTE_PREFIX))
  ) {
    const clauses: string[] = [];
    if (fairValue.method === "fcff-dcf") {
      clauses.push(CLAIMS_CLAUSE);
      if ((next.valuation.dcf.bridge?.nonOperatingComponents ?? []).some((c) => c.label.includes("(filed, before tax"))) clauses.push(E7_CLAUSE);
      const leased = storedLeaseLeftOut(next);
      if (leased !== null && storedSalesToCapitalIgnoresLease(next)) {
        clauses.push(`sales-to-capital kept the ${millions(leased)} operating lease the EV left out in invested capital`);
      }
    }
    clauses.push(storedDivisorIsLossPeriod(next) ? DIVISOR_DETECTED : DIVISOR_CONDITIONAL);
    next = { ...next, fairValue: { ...fairValue, basis: [...fairValue.basis, `${NOTE_PREFIX}${SINCE}: ${clauses.join("; ")}. Re-run the report for the current method.`] } };
  }

  const routeMetrics = next.routeMetrics;
  if (routeMetrics !== undefined && routeMetrics.route === "reit" && !routeMetrics.notes.some((line) => line.startsWith(REIT_NOTE_PREFIX))) {
    next = { ...next, routeMetrics: { ...routeMetrics, notes: [...routeMetrics.notes, REIT_NOTE] } };
  }

  return correctFinanceLeaseSentence(next);
}
