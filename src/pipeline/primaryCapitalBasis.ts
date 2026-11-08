import type { DataBundle } from "./types";
import { validPrimaryCapitalIdentity, type PrimaryCapitalEvidence, type PrimaryCapitalProof } from "@/edgar/primaryCapital";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { filterToCoreForms, tagPoints, type CompanyFacts } from "@/edgar/xbrl";
import { shareBasisFactor } from "@/edgar/splits";
import type { FmpCashFlowRow, StatementFieldProvenance } from "@/providers/fmp";
import type { ManifestEntry } from "@/types/core";
import type { PrimaryCapitalAudit } from "@/report/schema";
import { repurchaseExecutionsFromFacts, REPURCHASE_EXECUTION_TAG_PAIRS, type RepurchaseExecution } from "./stageB/repurchaseExecutions";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const day = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const equal = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
const annual = (start: string, end: string): boolean => day(start) && day(end) && (Date.parse(end) - Date.parse(start)) / 86_400_000 >= 350 && (Date.parse(end) - Date.parse(start)) / 86_400_000 <= 380;

function validProof(proof: PrimaryCapitalProof): boolean {
  const spans = [proof.statement, proof.row, proof.units, ...proof.period];
  return proof.coordinateSystem === "original-html-characters" && proof.period.length > 0 && proof.period.length <= 2 && spans.every(s =>
    Number.isSafeInteger(s.start) && Number.isSafeInteger(s.end) && s.start >= 0 && s.end > s.start && typeof s.text === "string" && s.text.length > 0 && s.text.length <= 600);
}

/** The newest retained presentation wins, including a newer refused pair.
 * Never filter bad records first and then resurrect an older convenient value. */
type EvidenceSelection = { status: "absent" } | { status: "refused"; reason: string } | { status: "selected"; evidence: PrimaryCapitalEvidence };
function selectedEvidence(bundle: DataBundle, end: string, facts: CompanyFacts, kind: "cash" | "execution"): EvidenceSelection {
  const candidates = [bundle.edgar.tenKNotes, bundle.edgar.tenQNotes].flatMap(section => {
    if (!section?.ok || !section.value.data.primaryCapitalEvidence) return [];
    const evidence = section.value.data.primaryCapitalEvidence;
    const records = kind === "cash" ? evidence.cash : evidence.executions;
    return records.some(r => r.periodEnd === end) || evidence.refusedPeriods?.some(r => r.periodEnd === end && r.kind === kind) ? [{ section, evidence }] : [];
  }).sort((a, b) => b.section.value.data.filingDate.localeCompare(a.section.value.data.filingDate));
  if (candidates.length === 0) return { status: "absent" };
  const newest = candidates[0]!, tied = candidates.filter(c => c.section.value.data.filingDate === newest.section.value.data.filingDate);
  if (tied.some(c => JSON.stringify(c.evidence) !== JSON.stringify(newest.evidence))) return { status: "refused", reason: "same-date primary presentations disagree" };
  const { section, evidence } = newest, s = evidence.source, data = section.value.data;
  if (evidence.version !== 1 || !validPrimaryCapitalIdentity(s) || Number(s.cik) !== Number(facts.cik) || section.value.source !== "edgar" ||
      s.accession !== data.accession || s.form !== data.form || s.filingDate !== data.filingDate || s.reportDate !== data.reportDate || s.documentUrl !== data.documentUrl ||
      s.observedAt !== section.value.fetchedAt || Date.parse(s.observedAt) > Date.parse(bundle.builtAt) || !Number.isFinite(Date.parse(bundle.builtAt)) ||
      evidence.cash.length > 4 || evidence.executions.length > 4) return { status: "absent" };
  return { status: "selected", evidence };
}

function compatibleRow(row: FmpCashFlowRow, start: string, end: string, currency: string, evidence: PrimaryCapitalEvidence, proof: PrimaryCapitalProof): boolean {
  return annual(start, end) && end <= evidence.source.reportDate && row.date === end && row.reportedCurrency === currency &&
    (row.period === undefined || row.period === "FY") && (row.periodStart === undefined || row.periodStart === start) &&
    (row.cik == null || Number(row.cik) === Number(evidence.source.cik)) &&
    (row.filingDate === undefined || row.filingDate.slice(0, 10) <= evidence.source.filingDate) && validProof(proof);
}

function provenance(evidence: PrimaryCapitalEvidence, record: PrimaryCapitalEvidence["cash"][number]): StatementFieldProvenance {
  const s = evidence.source;
  return { source: "edgar", unit: record.currency, periodStart: record.periodStart, periodEnd: record.periodEnd, observedAt: s.observedAt, tags: [],
    filings: [{ accn: s.accession, filed: s.filingDate, form: s.form }], documents: [{ accession: s.accession, filed: s.filingDate, form: s.form, url: s.documentUrl }],
    primaryCapital: { definition: "cash-outflow", source: s, proof: record.proof } };
}

function costScopeBridge(row: FmpCashFlowRow, evidence: PrimaryCapitalEvidence, record: PrimaryCapitalEvidence["cash"][number]): boolean {
  const conflict = row.fieldConflicts?.commonStockRepurchased, bulk = conflict?.secEvidence;
  if (!conflict || !finite(conflict.secValue) || !bulk || bulk.unit !== record.currency || bulk.periodStart !== record.periodStart || bulk.periodEnd !== record.periodEnd ||
      bulk.tags.length !== 1 || bulk.filings.length !== 1 || bulk.filings[0]!.accn !== evidence.source.accession || bulk.filings[0]!.filed !== evidence.source.filingDate || bulk.filings[0]!.form !== evidence.source.form) return false;
  const matches = evidence.costDisclosures?.filter(d => d.periodStart === record.periodStart && d.periodEnd === record.periodEnd && d.currency === record.currency &&
    d.definition === "total-cost-including-commissions-and-excise-taxes" && (d.tag === bulk.tags[0] || `us-gaap/${d.tag}` === bulk.tags[0]) && equal(d.amount, Math.abs(conflict.secValue!))) ?? [];
  return matches.length === 1;
}

/** An immutable calculation view; stored provider observations remain intact. */
export function withPrimaryCapitalBasis(bundle: DataBundle): DataBundle {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  if (!facts) return bundle;
  const input = bundle.statements.cashflowAnnual;
  if (!input.ok) return bundle;
  const superseded = new Map<string, string>();
  const newGaps: ManifestEntry[] = [];
  const rows = input.value.data.rows.map(row => {
    const selection = selectedEvidence(bundle, row.date ?? "", facts, "cash");
    if (selection.status === "absent") return row;
    const refuseCash = (detail: string): FmpCashFlowRow => {
      const previous = row.fieldConflicts?.commonStockRepurchased;
      if (previous?.usable === false && row.commonStockRepurchased == null) return row;
      const reason = `Primary common-share cash repurchases for ${row.date} withheld: ${detail}. Original observations remain retained.`;
      newGaps.push({ field: `statements.cashflow.${row.date}.commonStockRepurchased`, reason, severity: "warn" });
      const fieldProvenance = { ...row.fieldProvenance };
      delete fieldProvenance.commonStockRepurchased;
      return { ...row, commonStockRepurchased: null, fieldProvenance, fieldConflicts: { ...row.fieldConflicts, commonStockRepurchased: {
        vendorValue: previous?.vendorValue ?? row.commonStockRepurchased ?? null, secValue: previous?.secValue ?? null,
        ...(previous?.secEvidence ? { secEvidence: previous.secEvidence } : {}), usable: false, reason,
      } } };
    };
    if (selection.status === "refused") return refuseCash(selection.reason);
    const { evidence } = selection;
    const candidates = evidence.cash.filter(r => r.periodEnd === row.date);
    if (candidates.length !== 1 || evidence.refusedPeriods?.some(r => r.periodEnd === row.date && r.kind === "cash")) return refuseCash(`ambiguous or unproved primary cash rows; source ${evidence.source.documentUrl}`);
    const record = candidates[0]!;
    if (!finite(record.amount) || record.amount <= 0 || !compatibleRow(row, record.periodStart, record.periodEnd, record.currency, evidence, record.proof)) return row;
    const conflict = row.fieldConflicts?.commonStockRepurchased, amount = -record.amount;
    const vendor = conflict?.usable === false ? conflict.vendorValue : row.commonStockRepurchased;
    if (finite(vendor) && !equal(vendor, amount)) {
      if (conflict?.usable === false) return row;
      const reason = `Vendor common-share cash repurchases disagree with the directly labeled primary cash-flow row for ${record.periodEnd}; neither amount is admitted without a filed scope bridge. Source: ${evidence.source.documentUrl}`;
      newGaps.push({ field: `statements.cashflow.${record.periodEnd}.commonStockRepurchased`, reason, severity: "warn" });
      return { ...row, commonStockRepurchased: null, fieldConflicts: { ...row.fieldConflicts, commonStockRepurchased: {
        usable: false, vendorValue: vendor, secValue: amount, secEvidence: provenance(evidence, record), reason,
      } } };
    }
    if (conflict?.usable === false && (!finite(vendor) || !costScopeBridge(row, evidence, record))) return row;
    // A later bulk observation cannot be reconciled using an older disclosure.
    const bulk = tagPoints(facts, "PaymentsForRepurchaseOfCommonStock", record.currency);
    if (bulk?.points.some(p => p.end === record.periodEnd && p.start === record.periodStart && p.filed > evidence.source.filingDate && p.filed <= bundle.builtAt.slice(0, 10))) return row;
    if (row.fieldProvenance?.commonStockRepurchased?.primaryCapital && conflict?.usable !== false) return row;
    const reason = `Primary cash-flow statement explicitly reports common-share cash repurchases for ${record.periodStart} to ${record.periodEnd}; the separate total-cost disclosure includes commissions and excise taxes. Original vendor and bulk observations remain retained. Source: ${evidence.source.documentUrl}`;
    if (conflict?.usable === false) superseded.set(`statements.cashflow.${record.periodEnd}.commonStockRepurchased`, conflict.reason);
    return { ...row, commonStockRepurchased: amount, fieldProvenance: { ...row.fieldProvenance, commonStockRepurchased: provenance(evidence, record) },
      ...(conflict?.usable === false ? { fieldConflicts: { ...row.fieldConflicts, commonStockRepurchased: { ...conflict, usable: true, resolution: "primary-cash-line" as const, reason } } } : {}) };
  });
  if (rows.every((r, i) => r === input.value.data.rows[i])) return bundle;
  return { ...bundle, statements: { ...bundle.statements, cashflowAnnual: { ...input, value: { ...input.value, data: { ...input.value.data, rows } } } },
    gaps: [...bundle.gaps.filter(g => superseded.get(g.field) !== g.reason), ...newGaps] };
}

/** Remove only the exact superseded refusal, including copies from validation
 * or a report stub. Other warnings on the same field remain active. */
export function primaryCapitalManifest(bundle: DataBundle, entries: readonly ManifestEntry[]): ManifestEntry[] {
  const view = withPrimaryCapitalBasis(bundle);
  if (view === bundle || !bundle.statements.cashflowAnnual.ok || !view.statements.cashflowAnnual.ok) return [...entries];
  const resolved = new Set<string>();
  for (const row of bundle.statements.cashflowAnnual.value.data.rows) {
    const old = row.fieldConflicts?.commonStockRepurchased;
    const admitted = view.statements.cashflowAnnual.value.data.rows.find(r => r.date === row.date)?.fieldConflicts?.commonStockRepurchased;
    if (old?.usable === false && admitted?.usable === true && admitted.resolution === "primary-cash-line") resolved.add(`statements.cashflow.${row.date}.commonStockRepurchased|${old.reason}`);
  }
  return entries.filter(g => !resolved.has(`${g.field}|${g.reason}`));
}

/** The same bounded, admitted proofs accompany analyst inputs and saved reports. */
export function primaryCapitalAudit(bundle: DataBundle, executions: readonly RepurchaseExecution[] = []): PrimaryCapitalAudit | undefined {
  const view = withPrimaryCapitalBasis(bundle), facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const cash: PrimaryCapitalAudit["cash"] = [];
  if (facts && view.statements.cashflowAnnual.ok) for (const row of view.statements.cashflowAnnual.value.data.rows) {
    if (!row.fieldProvenance?.commonStockRepurchased?.primaryCapital || row.fieldConflicts?.commonStockRepurchased?.usable === false) continue;
    const selected = selectedEvidence(view, row.date ?? "", facts, "cash");
    if (selected.status !== "selected") continue;
    const record = selected.evidence.cash.find(r => r.periodEnd === row.date);
    if (!record || !finite(row.commonStockRepurchased) || !equal(-row.commonStockRepurchased, record.amount)) continue;
    const conflict = row.fieldConflicts?.commonStockRepurchased;
    cash.push({ ...record, source: selected.evidence.source, ...(conflict?.resolution === "primary-cash-line" ? {
      observations: { vendorValue: conflict.vendorValue, secValue: conflict.secValue, resolution: conflict.reason },
    } : {}) });
  }
  const pairs: PrimaryCapitalAudit["executions"] = executions.flatMap(execution => {
    const primary = execution.primaryEvidence;
    if (!primary || !bundle.edgar.shareBasis) return [];
    return [{ ...primary.record, source: primary.source, filedShares: primary.record.shares, shares: execution.shares,
      basisFactor: execution.basisFactor, basisDay: bundle.edgar.shareBasis.basisDay }];
  });
  if (!cash.length && !pairs.length) return undefined;
  return { cash: cash.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)).slice(0, 4), executions: pairs.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)).slice(0, 4) };
}

/** Existing tagged pairs remain preferred, with primary statements as a checked
 * fallback. A material disagreement with either component closes that fallback. */
export function primaryRepurchaseExecutions(bundle: DataBundle, fiscalYearEnds: readonly string[]): { rows: RepurchaseExecution[]; notes: string[] } {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const annualRows = bundle.statements.cashflowAnnual.ok ? bundle.statements.cashflowAnnual.value.data.rows : [];
  const currency = annualRows[0]?.reportedCurrency ?? (bundle.statements.incomeAnnual.ok ? bundle.statements.incomeAnnual.value.data.rows[0]?.reportedCurrency : null) ?? null;
  const tagged = repurchaseExecutionsFromFacts({ companyFacts: facts, shareBasis: bundle.edgar.shareBasis, fiscalYearEnds, reportedCurrency: currency });
  if (!facts) return tagged;
  const rows: RepurchaseExecution[] = [], notes = [...tagged.notes];
  for (const end of fiscalYearEnds) {
    const preferred = tagged.rows.find(r => r.periodEnd === end), selection = selectedEvidence(bundle, end, facts, "execution");
    if (selection.status === "absent") { if (preferred) rows.push(preferred); continue; }
    const refuse = (reason: string) => notes.push(`Primary repurchase execution for ${end} withheld: ${reason}.`);
    if (selection.status === "refused") { refuse(selection.reason); continue; }
    const { evidence } = selection;
    const candidates = evidence.executions.filter(r => r.periodEnd === end), cashRow = annualRows.find(r => r.date === end), basis = bundle.edgar.shareBasis;
    if (candidates.length !== 1 || !cashRow || evidence.refusedPeriods?.some(r => r.periodEnd === end && r.kind === "execution")) { refuse("absent or ambiguous same-period pair"); continue; }
    const record = candidates[0]!;
    if (!Number.isSafeInteger(record.shares) || record.shares <= 0 || !finite(record.cost) || record.cost <= 0 ||
        !compatibleRow(cashRow, record.periodStart, end, record.currency, evidence, record.proof) || !basis || basis.basisDay > bundle.builtAt.slice(0, 10)) { refuse("issuer, annual period, currency or share basis is unestablished"); continue; }
    const factor = shareBasisFactor(basis.splits, evidence.source.filingDate, null, basis.basisDay);
    if ("withheld" in factor) { refuse(factor.withheld); continue; }
    const shares = record.shares * factor.factor;
    let conflict = preferred !== undefined && (!equal(preferred.shares, shares) || !equal(preferred.value, record.cost));
    for (const pair of REPURCHASE_EXECUTION_TAG_PAIRS) for (const kind of ["shares", "value"] as const) {
      // A lone concept from another family is not the same accounting operand
      // (for example a rounded treasury count beside an exact retirement row).
      const concept = record.tags?.[kind === "value" ? "cost" : "shares"];
      const counterpart = REPURCHASE_EXECUTION_TAG_PAIRS.find(p => kind === "shares" ? p.value === record.tags?.cost : p.shares === record.tags?.shares)?.[kind];
      if ((concept ?? counterpart) && pair[kind] !== (concept ?? counterpart)) continue;
      const expectedUnit = kind === "shares" ? "shares" : record.currency;
      const series = tagPoints(facts, pair[kind], expectedUnit);
      if (!series || series.unit !== expectedUnit) continue;
      const points = filterToCoreForms(series?.points ?? []).filter(p => p.start === record.periodStart && p.end === end && p.filed <= bundle.builtAt.slice(0, 10));
      const latest = points.map(p => p.filed).sort().at(-1);
      for (const p of points.filter(p => p.filed === latest)) {
        const f = kind === "shares" ? shareBasisFactor(basis.splits, p.filed, null, basis.basisDay) : { factor: 1 };
        if ("withheld" in f || !equal(p.val * f.factor, kind === "shares" ? shares : record.cost)) conflict = true;
      }
    }
    if (conflict) { refuse("primary statement and tagged execution evidence disagree"); continue; }
    if (preferred) { rows.push(preferred); continue; }
    rows.push({ periodEnd: end, shares, value: record.cost, filed: evidence.source.filingDate, accn: evidence.source.accession, basisFactor: factor.factor,
      primaryEvidence: { source: evidence.source, record } });
    notes.push(`Primary equity statement for ${end}: exact repurchased shares and equity cost, on the established share basis; cash-flow outlays are a separate definition. Source: ${evidence.source.documentUrl}`);
  }
  return { rows, notes };
}
