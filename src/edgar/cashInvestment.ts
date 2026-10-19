import { createHash } from "node:crypto";
import { decodeEntities, htmlToText } from "@/edgar/extract";
import type { FmpStatementRow, StatementFieldProvenance } from "@/providers/fmp";
import type { ManifestEntry } from "@/types/core";

export interface CashInvestmentPeriod {
  start: string; end: string; currency: string; status: string; capex: number | null;
  reason: string; tags: string[]; components: { qname: string; value: number }[];
  operatingCashFlow?: number | null;
}
export interface FilingCashInvestment {
  issuerId: string;
  source: { form: string; accession: string; filingDate: string; documentUrl: string; hash: string; reportDate?: string };
  periods: CashInvestmentPeriod[];
  reason?: string;
}
interface Identity { issuerId: string; form: string; accession: string; filingDate: string; documentUrl: string; primaryDocument: string; reportDate?: string }
const attr = (s: string, name: string): string => decodeEntities(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(s)?.[1] ?? "");
const day = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const PPE = "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment";
const HARDWARE = "iren:PaymentsRelatedToComputerHardware";
const CFO = "us-gaap:NetCashProvidedByUsedInOperatingActivities";
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Narrow reviewed issuer extension. No tag-name or business-keyword inference.
 * IREN FY26 F-10 / March FY26 cash flows explicitly exclude hardware from PPE.
 * https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm
 * The result covers ONLY gross cash PPE + hardware, excluding other investing flows.
 */
export function parsePrimaryCashInvestment(html: string, identity: Identity, cutoff: string): FilingCashInvestment {
  const out: FilingCashInvestment = { issuerId: identity.issuerId, source: { form: identity.form, accession: identity.accession, filingDate: identity.filingDate, documentUrl: identity.documentUrl,
    ...(identity.reportDate && day(identity.reportDate) && identity.reportDate <= identity.filingDate ? { reportDate: identity.reportDate } : {}),
    hash: createHash("sha256").update(html).digest("hex") }, periods: [] };
  const refuse = (reason: string): FilingCashInvestment => ({ ...out, reason });
  if (!/^(?:10-K|10-Q)(?:\/A)?$/.test(identity.form) || !day(identity.filingDate) || !day(cutoff) || identity.filingDate > cutoff || Number(identity.issuerId) !== 1878848) return refuse("No reviewed cash-component mapping for this issuer/form/date");
  try {
    const url = new URL(identity.documentUrl);
    if (url.origin !== "https://www.sec.gov" || url.search || url.hash || url.username || url.password ||
      !/^\d{10}-\d{2}-\d{6}$/.test(identity.accession) || !/^[\w.-]+\.html?$/.test(identity.primaryDocument) ||
      url.pathname !== `/Archives/edgar/data/${Number(identity.issuerId)}/${identity.accession.replaceAll("-", "")}/${identity.primaryDocument}`) return refuse("Cash source identity is not bound to the SEC issuer/accession/document");
  } catch { return refuse("Invalid cash source URL"); }
  // Reject namespace shadows anywhere in the document, including nested facts.
  const namespace = (prefix: string, valid: (uri: string) => boolean): boolean => {
    const uris = [...html.matchAll(new RegExp(`\\bxmlns:${prefix}\\s*=\\s*["']([^"']+)["']`, "g"))].map(m => m[1]!);
    return uris.length > 0 && new Set(uris).size === 1 && valid(uris[0]!);
  };
  if (!namespace("ix", u => u === "http://www.xbrl.org/2013/inlineXBRL") ||
      !namespace("xbrli", u => u === "http://www.xbrl.org/2003/instance") ||
      !namespace("iso4217", u => u === "http://www.xbrl.org/2003/iso4217") ||
      !namespace("us-gaap", u => /^http:\/\/fasb.org\/us-gaap\/20\d{2}$/.test(u)) ||
      !namespace("iren", u => /^http:\/\/www\.iren\.com\/2026(?:0331|0630)$/.test(u))) return refuse("Unreviewed or ambiguous cash-component namespace");
  const contexts = new Map<string, { start: string; end: string }>();
  const duplicateContexts = new Set<string>();
  const seen = new Set<string>();
  for (const m of html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/g)) {
    const id = attr(m[1]!, "id");
    if (seen.has(id)) { duplicateContexts.add(id); continue; } seen.add(id);
    const body = m[2]!;
    const issuer = /<xbrli:identifier\b([^>]*)>(\d+)<\/xbrli:identifier>/.exec(body);
    const start = /<xbrli:startDate>\s*([^<]+)\s*<\/xbrli:startDate>/.exec(body)?.[1] ?? "";
    const end = /<xbrli:endDate>\s*([^<]+)\s*<\/xbrli:endDate>/.exec(body)?.[1] ?? "";
    if (issuer && attr(issuer[1]!, "scheme") === "http://www.sec.gov/CIK" && Number(issuer[2]) === Number(identity.issuerId) &&
      !/<(?:xbrli:segment|xbrli:scenario|xbrldi:(?:explicitMember|typedMember))\b/.test(body) && day(start) && day(end) && start < end && end <= identity.filingDate) contexts.set(id, { start, end });
  }
  for (const id of duplicateContexts) contexts.delete(id);
  const units = new Map<string, string>();
  const seenUnits = new Set<string>();
  for (const m of html.matchAll(/<xbrli:unit\b([^>]*)>([\s\S]*?)<\/xbrli:unit>/g)) {
    const id = attr(m[1]!, "id");
    if (seenUnits.has(id)) { units.delete(id); continue; } seenUnits.add(id);
    if (/^\s*<xbrli:measure>\s*iso4217:USD\s*<\/xbrli:measure>\s*$/.test(m[2]!)) units.set(id, "USD");
  }
  const observed = new Map<string, { ppe: number[]; hardware: number[]; cfo: number[]; exclusion: boolean; invalid: boolean }>();
  for (const row of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const text = htmlToText(row[0]);
    for (const f of row[0].matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/g)) {
      const qname = attr(f[1]!, "name");
      if (qname !== PPE && qname !== HARDWARE && qname !== CFO) continue;
      const contextId = attr(f[1]!, "contextRef"), period = contexts.get(contextId);
      if (!period) continue;
      const key = `${period.start}|${period.end}`;
      const record = observed.get(key) ?? { ppe: [], hardware: [], cfo: [], exclusion: false, invalid: false };
      const scale = attr(f[1]!, "scale"), decimals = attr(f[1]!, "decimals");
      const raw = htmlToText(f[2]!).trim();
      const value = Number(raw.replaceAll(",", "")) * 10 ** Number(scale || "0");
      const valid = units.get(attr(f[1]!, "unitRef")) === "USD" && /^(?:0|3|6)?$/.test(scale) && /^-?\d+$/.test(decimals) &&
        Number(decimals) === -Number(scale || "0") && /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(raw) &&
        finite(value) && value >= 0 && (!attr(f[1]!, "sign") || (qname === CFO && attr(f[1]!, "sign") === "-")) && /^(?:ixt:num-dot-decimal)?$/.test(attr(f[1]!, "format"));
      if (!valid) record.invalid = true;
      else if (qname === PPE) { record.ppe.push(value); record.exclusion ||= /payments for property,? plant and equipment,? (?:net of|excluding) computer hardware/i.test(text); }
      else if (qname === HARDWARE) { record.hardware.push(value); if (!/payments for computer hardware/i.test(text)) record.invalid = true; }
      else record.cfo.push(attr(f[1]!, "sign") === "-" ? -value : value);
      observed.set(key, record);
    }
  }
  for (const [key, record] of observed) {
    const [start, end] = key.split("|") as [string, string];
    const ppe = [...new Set(record.ppe)], hardware = [...new Set(record.hardware)];
    const established = !record.invalid && record.exclusion && ppe.length === 1 && hardware.length === 1;
    out.periods.push({ start, end, currency: "USD", status: established ? "established" : "withheld", capex: established ? -(ppe[0]! + hardware[0]!) : null,
      operatingCashFlow: new Set(record.cfo).size === 1 ? record.cfo[0]! : null,
      reason: established ? "gross cash PPE plus separately disclosed computer hardware; PPE explicitly excludes hardware; other investing flows excluded" : "incomplete cash investment scope: explicit disjoint PPE/hardware definition, amounts or compatible contexts/units not established",
      tags: ["us-gaap/PaymentsToAcquirePropertyPlantAndEquipment", "iren/PaymentsRelatedToComputerHardware"],
      components: [...ppe.map(value => ({ qname: PPE, value })), ...hardware.map(value => ({ qname: HARDWARE, value }))] });
  }
  return out.periods.length > 0 ? out : refuse("No eligible source-bound cash PPE and hardware scope observations");
}

/** Existing raw rows remain immutable. Every capex change invalidates stale FCF.
 * Quarter subtraction is deliberately withheld here until filing-lineage and
 * definition continuity are established; a matching direct quarter is admissible.
 */
export function admitCashInvestment<T extends FmpStatementRow>(row: T, documents: readonly FilingCashInvestment[], issuerId: number, scope: "annual" | "quarter", observedAt: string): { row: T; gaps: ManifestEntry[] } {
  if (issuerId !== 1878848) return { row, gaps: [] };
  const candidates = documents.filter(d => Number(d.issuerId) === issuerId && d.source.filingDate <= observedAt.slice(0, 10))
    .flatMap(d => {
      const exactEnd = d.periods.filter(p => p.end === row.date);
      // A known split cumulative definition cannot be treated as complete
      // generic PPE in an earlier covered quarter merely because its hardware
      // payment is not separately reconstructed. Keep directly reported
      // quarter observations eligible; otherwise refuse the covered scope.
      const periods = exactEnd.length > 0 ? exactEnd : scope === "quarter" && typeof row.date === "string"
        ? d.periods.filter(p => p.start <= row.date! && row.date! < p.end) : [];
      if (!periods.length && d.reason && d.source.reportDate === row.date) periods.push({ start: "", end: row.date!, currency: "USD", status: "withheld", capex: null, reason: d.reason, tags: [], components: [] });
      return periods.map(p => ({ p, source: d.source }));
    });
  if (!candidates.length) return { row, gaps: [] };
  // Filing priority applies within an actual interval, never across annual,
  // cumulative and directly reported quarter observations sharing an end date.
  // Status, currency and amount do not filter this pool: a newer refusal or
  // incompatible currency must not expose an older, favorable observation.
  const intervalCandidates = candidates.filter(({ p }) => {
    const days = (Date.parse(p.end) - Date.parse(p.start)) / 86_400_000;
    return p.end === row.date && (scope === "annual" ? days >= 350 && days <= 380 : days >= 70 && days <= 110)
      && (row.periodStart == null || row.periodStart === p.start);
  });
  const pool = intervalCandidates.length ? intervalCandidates : candidates;
  const signature = (p: CashInvestmentPeriod): string => JSON.stringify([
    p.start, p.end, p.currency, p.status, p.capex, p.operatingCashFlow ?? null,
    [...new Set(p.tags)].sort(), p.components.map(c => `${c.qname}:${c.value}`).sort(),
  ]);
  pool.sort((a, b) => b.source.filingDate.localeCompare(a.source.filingDate)
    || a.source.accession.localeCompare(b.source.accession) || signature(a.p).localeCompare(signature(b.p)));
  const { p, source } = pool[0]!;
  const latest = pool.filter(c => c.source.filingDate === source.filingDate);
  const intervalConflict = new Set(intervalCandidates.map(c => `${c.p.start}|${c.p.end}`)).size > 1;
  const observationConflict = intervalCandidates.length > 0 && new Set(latest.map(c => signature(c.p))).size > 1;
  const resolutionReason = intervalConflict ? "conflicting eligible cash investment intervals; explicit period start required"
    : observationConflict ? "conflicting latest cash investment observations for the same interval" : null;
  const days = (Date.parse(p.end) - Date.parse(p.start)) / 86_400_000;
  const exact = p.end === row.date && (scope === "annual" ? days >= 350 && days <= 380 : days >= 70 && days <= 110);
  const compatible = p.currency === row.reportedCurrency && (row.periodStart == null || row.periodStart === p.start);
  const admitted = resolutionReason === null && exact && compatible && p.status === "established" && finite(p.capex) && p.capex <= 0;
  const reason = `cash investment ${row.date}: ${resolutionReason ?? (admitted || p.status === "withheld" ? p.reason : !exact ? `complete ${scope} cash investment withheld: no compatible directly reported period; source cumulative interval ${p.start} through ${p.end} requires verified component lineage before reconstruction` : !compatible ? "cash investment currency or explicit period start conflict" : p.reason)}`;
  const amount = admitted ? p.capex : null;
  const provenance: StatementFieldProvenance = { source: "edgar", unit: p.currency, periodStart: p.start || null, periodEnd: p.end, observedAt, tags: p.tags,
    filings: [...new Map(latest.map(({ source: s }) => [s.accession, { accn: s.accession, filed: s.filingDate, form: s.form }])).values()], calculation: "cash-ppe-plus-hardware" };
  const fieldConflicts = { ...row.fieldConflicts }, fieldProvenance = { ...row.fieldProvenance };
  const out = { ...row, fieldConflicts, fieldProvenance } as T;
  for (const field of ["capitalExpenditure", "investmentsInPropertyPlantAndEquipment", "paymentsToAcquirePropertyPlantAndEquipment"]) {
    if (field !== "capitalExpenditure" && !(field in row)) continue;
    (out as Record<string, unknown>)[field] = amount;
    if (admitted) { delete fieldConflicts[field]; fieldProvenance[field] = provenance; }
    else { delete fieldProvenance[field]; fieldConflicts[field] = { vendorValue: finite(row[field]) ? row[field] : null, secValue: null, usable: false, reason, secEvidence: provenance }; }
  }
  const cfoFields = ["operatingCashFlow", "netCashProvidedByOperatingActivities"];
  const cfoValues = cfoFields.map(field => row[field]).filter(finite);
  const differs = (a: number, b: number): boolean => Math.abs(a - b) > Math.max(1, Math.abs(a) * 1e-10, Math.abs(b) * 1e-10);
  const aliasConflict = cfoValues.length > 1 && differs(cfoValues[0]!, cfoValues[1]!);
  const cfo = cfoFields.some(field => row.fieldConflicts?.[field]?.usable === false) ? null : cfoValues[0] ?? null;
  // A cumulative CFO is never compared with an unadmitted quarter. Within an
  // admitted exact period, every populated alias must agree with filed CFO.
  const filedCfo = admitted && finite(p.operatingCashFlow) ? p.operatingCashFlow : null;
  const cfoConflict = aliasConflict || (filedCfo !== null && cfoValues.some(value => differs(filedCfo, value)));
  const fcfReason = cfoConflict ? `${reason}; ${aliasConflict ? "operating cash flow aliases disagree" : "filed operating cash flow differs from the existing row"}; CFO aliases and dependent FCF withheld` : reason;
  if (cfoConflict) for (const field of ["operatingCashFlow", "netCashProvidedByOperatingActivities"]) {
    (out as Record<string, unknown>)[field] = null;
    delete fieldProvenance[field];
    fieldConflicts[field] = { vendorValue: finite(row[field]) ? row[field] : null, secValue: filedCfo, usable: false, reason: fcfReason,
      ...(filedCfo !== null ? { secEvidence: { ...provenance, tags: ["us-gaap/NetCashProvidedByUsedInOperatingActivities"], calculation: undefined } } : {}) };
  }
  const cfoProvenance = row.fieldProvenance?.operatingCashFlow ?? row.fieldProvenance?.netCashProvidedByOperatingActivities;
  const fcf = admitted && finite(cfo) && !cfoConflict ? cfo + amount! : null;
  for (const field of ["freeCashFlow", "fcf"]) {
    if (field !== "freeCashFlow" && !(field in row)) continue;
    (out as Record<string, unknown>)[field] = fcf;
    if (fcf !== null) { delete fieldConflicts[field]; fieldProvenance[field] = { ...provenance,
      tags: [...new Set([...provenance.tags, ...(finite(p.operatingCashFlow) ? ["us-gaap/NetCashProvidedByUsedInOperatingActivities"] : cfoProvenance?.tags ?? [])])],
      filings: [...new Map([...provenance.filings, ...(cfoProvenance?.filings ?? [])].map(f => [f.accn, f])).values()], calculation: "cfo-minus-cash-ppe-and-hardware" }; }
    else { delete fieldProvenance[field]; fieldConflicts[field] = { vendorValue: finite(row[field]) ? row[field] : null, secValue: null, usable: false, reason: fcfReason, secEvidence: provenance }; }
  }
  return { row: out, gaps: [{ field: `statements.cashflow.${row.date}.capitalExpenditure`, reason: fcfReason, severity: admitted && !cfoConflict ? "info" : "warn", ...(admitted && !cfoConflict ? { expected: true } : {}) }] };
}
