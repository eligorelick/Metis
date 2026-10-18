import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import type { DataBundle, ExtractedSection } from "@/pipeline/types";
import type { FilingDisclosures, FilingRef } from "@/report/schema";

type Row = NonNullable<FilingDisclosures["filingFacts"]>[number];
type Point = { val: number; start: string | null; tag: string };
type CompositionSource = Pick<ExtractedSection, "reportDate" | "filingDate" | "form" | "accession" | "documentUrl" | "statementsText"> & { metadataOnly?: boolean; text?: string };
const SBC_NOTE = "Recognized expense and capitalized SBC are not additive as comprehensive current-service cost: amortization of previously capitalized SBC is unestablished, so comprehensive current-service cost is unestablished. No extra FCF deduction is made from this composition.";
const CASH_NOTE = "Cash including restrictions is not all available liquidity. These are same-date, same-currency balances from one filing; restricted cash is not deducted again from directly tagged unrestricted cash. Restricted components are current and noncurrent; the reported combined aggregate and its components are not additive. Missing components remain unknown, not zero.";
const WC_NOTE = "Signed cash-flow contributions for identified standard components only; other working-capital components remain unresolved. This is not total working capital or normalized FCF.";
const MERCHANT_WC_NOTE = "Merchant payables and deferred merchant bookings remain unresolved; this is not merchant float or a cash-float sensitivity.";
const TAX_NOTE = "Income-tax balances shown gross, not an occupancy-tax pair; legal netting and jurisdiction matching are unestablished. The receivable tag alone does not establish maturity. No net liquidity amount is inferred.";

function day(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const date = value.slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

/** Optional disclosure only: never supplies a valuation operand or a score. */
export function financialCompositionFacts(bundle: DataBundle, currency: string | null): Row[] {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const cutoff = day(bundle.builtAt);
  if (facts === null || currency === null || cutoff === null) return [];
  const out: Row[] = [];
  const sources: CompositionSource[] = [];
  for (const result of [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes]) {
    if (result?.ok && result.value.source === "edgar") sources.push(result.value.data);
  }
  // Exact SEC submissions metadata can identify the primary filing even
  // when its notes heading cannot be extracted. This admits matched XBRL
  // amounts without claiming that a notes-text extraction succeeded.
  for (const [result, form] of [[bundle.edgar.latestTenQ, "10-Q"], [bundle.edgar.latestTenK, "10-K"]] as const) {
    if (!result?.ok || result.value.source !== "edgar") continue;
    const filing = result.value.data;
    const submissions = `https://data.sec.gov/submissions/CIK${String(facts.cik).padStart(10, "0")}.json`;
    if (result.value.endpoint !== submissions || !new RegExp(`^${form}(?:/A)?$`).test(filing.form) || !/^[a-zA-Z0-9_.-]+\.(?:htm|html)$/i.test(filing.primaryDocument)) continue;
    sources.push({ form: filing.form, accession: filing.accessionNumber, filingDate: filing.filingDate, reportDate: filing.reportDate,
      documentUrl: `https://www.sec.gov/Archives/edgar/data/${Number(facts.cik)}/${filing.accessionNumber.replaceAll("-", "")}/${filing.primaryDocument}`, metadataOnly: true });
  }
  const admitted = new Set<string>();
  for (const section of sources) {
    const end = day(section.reportDate);
    const filed = day(section.filingDate);
    if (end === null || filed === null || end > filed || filed > cutoff || !/^10-[QK](?:\/A)?$/.test(section.form) || !/^\d{10}-\d{2}-\d{6}$/.test(section.accession)) continue;
    // A retained periodic section gives the companyfacts operands an actual
    // primary-document URL, rather than a guessed accession or host.
    try {
      const url = new URL(section.documentUrl);
      const path = `/Archives/edgar/data/${Number(facts.cik)}/${section.accession.replaceAll("-", "")}/`;
      if (url.protocol !== "https:" || url.hostname !== "www.sec.gov" || !url.pathname.startsWith(path) || !/\.(?:htm|html)$/i.test(url.pathname.slice(path.length))) continue;
    } catch { continue; }
    if (admitted.has(section.accession)) continue;
    admitted.add(section.accession);
    const source: FilingRef = { form: section.form, accession: section.accession, filingDate: filed, exhibit: null, url: section.documentUrl };
    const points = (tag: string, duration: boolean): Point[] => {
      const concept = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown> } | undefined;
      const raw = concept?.units?.[currency];
      const groups = new Map<string, Set<number>>();
      for (const item of Array.isArray(raw) ? raw : []) {
        if (item === null || typeof item !== "object") continue;
        const p = item as Record<string, unknown>;
        const start = day(p.start);
        if (day(p.end) !== end || day(p.filed) !== filed || p.accn !== section.accession || p.form !== section.form || typeof p.val !== "number" || !Number.isFinite(p.val)) continue;
        if (duration ? start === null || start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 370 : p.start != null) continue;
        const key = start ?? "instant";
        const values = groups.get(key) ?? new Set<number>();
        values.add(p.val); groups.set(key, values);
      }
      return [...groups].filter(([, values]) => values.size === 1).map(([start, values]) => ({ val: [...values][0]!, start: start === "instant" ? null : start, tag }));
    };
    const add = (key: string, label: string, p: Point, note: string, computed: string | null = null): void => {
      out.push({ key: `composition-${key}`, label, value: p.val, unit: "currency", asOf: end,
        period: p.start === null ? null : `${p.start} to ${end}`, qualifier: null, computed,
        sourceTag: `edgar:xbrl us-gaap/${p.tag}`, source,
        text: `${note} us-gaap/${p.tag}; ${currency}; ${p.start === null ? `at ${end}` : `${p.start} to ${end}`}; ${section.form} ${section.accession}, filed ${filed}.${section.metadataOnly ? " Matched SEC submissions metadata and XBRL; a successful notes-text extraction is not asserted." : ""}` });
    };

    // The capitalized tag specifically describes SBC awards. General
    // internal-use software capex/amortization cannot establish that amount.
    const expense = new Map<string | null, Point>();
    for (const tag of ["AllocatedShareBasedCompensationExpense", "ShareBasedCompensation"]) {
      for (const p of points(tag, true)) if (!expense.has(p.start)) expense.set(p.start, p);
    }
    for (const p of expense.values()) add("sbc-recognized", "SBC recognized expense / amortization (as tagged)", p, SBC_NOTE);
    for (const p of points("EmployeeServiceShareBasedCompensationAllocationOfRecognizedPeriodCostsCapitalizedAmount", true)) add("sbc-capitalized", "SBC costs capitalized (separately reported)", p, SBC_NOTE);

    const narrow = points("CashAndCashEquivalentsAtCarryingValue", false)[0];
    // Despite its name, AtCarryingValue is the US-GAAP CURRENT restricted
    // cash concept, not aggregate restricted cash. Never infer a missing
    // noncurrent component is zero, or add the reported aggregate twice.
    const restricted = points("RestrictedCashAndCashEquivalentsAtCarryingValue", false)[0];
    const noncurrent = points("RestrictedCashAndCashEquivalentsNoncurrent", false)[0];
    const combined = points("CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", false)[0];
    const reconciled = narrow !== undefined && restricted !== undefined && noncurrent !== undefined && combined !== undefined &&
      narrow.val >= 0 && restricted.val >= 0 && noncurrent.val >= 0 && combined.val >= 0 && Math.abs(narrow.val + restricted.val + noncurrent.val - combined.val) < 0.01;
    const cashNote = `${CASH_NOTE} ${reconciled ? "Narrow cash plus current and noncurrent restricted cash reconciles to the reported combined balance." : "A complete nonnegative cash reconciliation is unestablished; no available-cash total is inferred."}`;
    if (narrow) add("cash-unrestricted", "Cash and cash equivalents (excluding restrictions)", narrow, cashNote);
    if (restricted) add("cash-restricted", "Restricted cash and cash equivalents, current", restricted, cashNote);
    if (noncurrent) add("cash-restricted-noncurrent", "Restricted cash and cash equivalents, noncurrent", noncurrent, cashNote);
    if (combined) add("cash-combined", "Combined cash including restrictions (reported)", combined, cashNote,
      reconciled ? `${narrow.val} + ${restricted.val} + ${noncurrent.val} = ${combined.val} ${currency}; narrow cash plus current and noncurrent restricted cash` : null);

    for (const [tag, key, label] of [["IncomeTaxesReceivable", "receivable", "Income taxes receivable (as tagged)"], ["AccruedIncomeTaxesCurrent", "payable", "Current income taxes payable"]] as const) {
      const p = points(tag, false)[0];
      if (p) add(`tax-${key}`, label, p, TAX_NOTE);
    }
    const components = [
      ["IncreaseDecreaseInAccountsReceivable", "receivables", "Accounts receivable cash-flow contribution", -1],
      ["IncreaseDecreaseInOtherOperatingAssets", "other-assets", "Other operating assets cash-flow contribution", -1],
      ["IncreaseDecreaseInOtherAccountsPayableAndAccruedLiabilities", "other-liabilities", "Other accounts payable and accrued liabilities cash-flow contribution", 1],
      ["IncreaseDecreaseInIncomeTaxes", "income-taxes", "Income taxes cash-flow contribution", 1],
    ] as const;
    // Merchant-specific caveats require evidence in this admitted filing;
    // standard XBRL working-capital tags alone do not establish that model.
    const wcNote = `${WC_NOTE}${/\b(?:merchant payables|deferred merchant bookings)\b/i.test(`${section.text ?? ""} ${section.statementsText ?? ""}`) ? ` ${MERCHANT_WC_NOTE}` : ""}`;
    const windows = new Map<string, Point[]>();
    for (const [tag, key, label, sign] of components) for (const p of points(tag, true)) {
      const signed = { ...p, val: p.val * sign };
      add(`working-capital-${key}`, label, signed, wcNote, `${p.val} ${currency} tagged change x ${sign} = ${signed.val} ${currency} cash-flow contribution`);
      const matches = windows.get(p.start!) ?? []; matches.push(signed); windows.set(p.start!, matches);
    }
    for (const [start, matches] of windows) if (matches.length === components.length) {
      const subtotal = matches.reduce((sum, p) => sum + p.val, 0);
      add("working-capital-subtotal", "Identified four-component working-capital partial subtotal", { val: subtotal, start, tag: matches.map(p => p.tag).join(" + us-gaap/") }, wcNote,
        `${matches.map(p => p.val).join(" + ")} = ${subtotal} ${currency}; partial subtotal of four identified signed contributions`);
    }
  }
  return out;
}
