import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEarningsReleaseRecord, collectCurrentReports, CURRENT_REPORTS_VERSION, type CurrentReports, type EarningsReleaseRecord } from "@/providers/currentReports";
import type { EdgarClient, EdgarFiling } from "@/providers/edgar";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { FilingDisclosuresSchema } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const read = (exhibit: 1 | 2) => readFileSync(`fixtures/edgar/nvda-current-reports/q2fy27-ex99-${exhibit}.txt`, "utf8");
const release = read(1);
const commentary = read(2);
const original: EdgarFiling = { accessionNumber: "original", filingDate: "2026-08-26", reportDate: "2026-08-26", form: "8-K", primaryDocument: "original.htm", items: "2.02,9.01" };
const amended: EdgarFiling = { ...original, accessionNumber: "amended", filingDate: "2026-08-28", form: "8-K/A", primaryDocument: "amended.htm" };
const ok = <T,>(data: T, endpoint: string) => ({ ok: true as const, value: { data, endpoint, asOf: "2026-08-28", fetchedAt: "2026-08-28T17:00:00Z", source: "edgar" as const } });
const withRelease = (record: EarningsReleaseRecord) => {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
  // Currency evidence must describe the quarter the saved exhibit reports.
  if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-07-26", reportedCurrency: "USD", revenue: 96_221e6 });
  bundle.edgar.currentReports = ok<CurrentReports>({ version: CURRENT_REPORTS_VERSION, releases: [record], events: [], notes: [] }, "fixture");
  return bundle;
};
const withoutSource = <T extends { source?: unknown }>(fact: T): T => {
  const legacy = { ...fact };
  delete legacy.source;
  return legacy;
};
function clientFor(documents: Record<string, Array<{ type: string; filename: string; text: string }>>) {
  const requested: string[] = [];
  const client = {
    filingIndexHeaders: async (_cik: string, accession: string) => {
      requested.push(`index:${accession}`);
      return ok({ documents: (documents[accession] ?? []).map((d, i) => ({ type: d.type, filename: d.filename, sequence: String(i + 1) })), typeByFilename: {} }, `index/${accession}`);
    },
    fetchFilingDocument: async (_cik: string, filing: EdgarFiling) => {
      requested.push(`doc:${filing.accessionNumber}/${filing.primaryDocument}`);
      const doc = documents[filing.accessionNumber]?.find((d) => d.filename === filing.primaryDocument);
      return doc ? ok(doc.text, `https://www.sec.gov/${filing.accessionNumber}/${filing.primaryDocument}`) : { ok: false as const, gap: { field: "fixture", reason: "missing", severity: "warn" as const } };
    },
  } as unknown as EdgarClient;
  return { client, requested };
}

describe("earnings exhibit provenance review", () => {
  it("keeps commentary-only FCF and reconciliation provenance through the report and payload", () => {
    const record = buildEarningsReleaseRecord({ filing: original, releaseUrl: "https://www.sec.gov/release", commentaryUrl: "https://www.sec.gov/commentary", releaseText: "NVIDIA Announces Financial Results for Second Quarter Fiscal 2027. Quarter ended July 26, 2026.", commentaryText: commentary, includeNarrative: true });
    expect(record.freeCashFlow.length).toBeGreaterThan(0);
    const disclosures = FilingDisclosuresSchema.parse(buildFilingDisclosures(withRelease(record)));
    for (const fact of [...disclosures.freeCashFlow, ...disclosures.reconciliation!]) {
      expect(fact.source).toMatchObject({ accession: "original", exhibit: "EX-99.2", url: "https://www.sec.gov/commentary", form: "8-K" });
    }
    const bundle = withRelease(record);
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    for (const fact of payload.issuerFilings!.figures.filter((f) => /issuer-defined free cash flow|issuer reconciliation|income tax impact of non-GAAP adjustments/i.test(f.label))) {
      expect(fact.source).toContain("EX-99.2");
      expect(fact.source).toContain("original");
    }
  });

  it("preserves separate exhibit sources when reconciliation rows are merged", () => {
    const record = buildEarningsReleaseRecord({ filing: original, releaseUrl: "https://www.sec.gov/release", commentaryUrl: "https://www.sec.gov/commentary", releaseText: release.replaceAll("Income tax impact of non-GAAP adjustments", "Tax adjustment omitted"), commentaryText: commentary, includeNarrative: true });
    const disclosures = buildFilingDisclosures(withRelease(record))!;
    expect(disclosures.reconciliation!.find((f) => f.metric === "non-gaap-tax-impact")!.source).toMatchObject({ exhibit: "EX-99.2", url: "https://www.sec.gov/commentary" });
    expect(disclosures.reconciliation!.find((f) => f.metric === "operating-cash-flow")!.source).toMatchObject({ exhibit: "EX-99.1", url: "https://www.sec.gov/release" });
    const legacy = { ...record, freeCashFlow: record.freeCashFlow.map(withoutSource), reconciliation: record.reconciliation!.map(withoutSource), releaseNarrative: null, commentaryNarrative: null };
    const old = FilingDisclosuresSchema.parse(buildFilingDisclosures(withRelease(legacy)));
    expect(old.freeCashFlow[0]!.source).toMatchObject({ accession: "original", exhibit: null, url: null });
    expect(old.reconciliation![0]!.source).toMatchObject({ accession: "original", exhibit: null, url: null });
  });

  it("recognizes zero-padded exhibit numbers even when commentary appears first, retaining original exhibit spelling", async () => {
    const { client } = clientFor({ original: [{ type: "EX-99.02", filename: "cfo.htm", text: commentary }, { type: "EX-99.01", filename: "pr.htm", text: release }] });
    const result = await collectCurrentReports(client, "1", [original], "2026-08-28", "submissions");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.value.data.releases[0]!;
    expect(record.releaseUrl).toBe("https://www.sec.gov/original/pr.htm");
    expect(record.commentaryUrl).toBe("https://www.sec.gov/original/cfo.htm");
    const disclosure = buildFilingDisclosures(withRelease(record))!;
    expect(disclosure.freeCashFlow[0]!.source.exhibit).toBe("EX-99.01");
    expect(disclosure.guidance!.source.exhibit).toBe("EX-99.01");
  });

  it("does not relabel a sole commentary exhibit as a release", async () => {
    const { client } = clientFor({ original: [{ type: "EX-99.02", filename: "cfo.htm", text: commentary }] });
    const result = await collectCurrentReports(client, "1", [original], "2026-08-28", "submissions");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.value.data.releases[0]!;
    expect(record.releaseUrl).toBeNull();
    expect(record.commentaryUrl).toBe("https://www.sec.gov/original/cfo.htm");
    expect(record.reported.fiscal?.label).toBe("Q2 FY2027");
    expect(buildFilingDisclosures(withRelease(record))!.freeCashFlow[0]!.source).toMatchObject({ exhibit: "EX-99.02", url: record.commentaryUrl });
  });

  it("uses a corresponding earnings amendment once, preserving its form and fact sources", async () => {
    const corrected = release.replace("21,341", "22,341");
    const { client } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [{ type: "EX-99.1", filename: "fixed.htm", text: corrected }] });
    const result = await collectCurrentReports(client, "1", [original, amended], "2026-08-28", "submissions");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data.releases.map((r) => r.accession)).toEqual(["amended"]);
    const disclosures = buildFilingDisclosures(withRelease(result.value.data.releases[0]!))!;
    expect(disclosures.freeCashFlow.find((f) => f.months === 3 && f.periodEnd === "2026-07-26")).toMatchObject({ value: 22_341e6, source: { form: "8-K/A", accession: "amended", exhibit: "EX-99.1", url: "https://www.sec.gov/amended/fixed.htm" } });
    expect(result.value.data.notes.join(" ")).toContain("superseded");
  });

  it("does not fall back to an original when its explicitly corresponding amendment cannot be read", async () => {
    const { client, requested } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }] });
    const result = await collectCurrentReports(client, "1", [original, amended], "2026-08-28", "submissions");
    expect(result.ok).toBe(false);
    expect(requested).not.toContain("index:original");
  });

  it("orders same-day amendments by acceptance and retains unrelated earlier fact sources", async () => {
    const earlier = { ...original, accessionNumber: "prior-quarter", filingDate: "2026-05-20", reportDate: "2026-05-20" };
    const sameDay = { ...amended, filingDate: original.filingDate, acceptanceDateTime: "2026-08-26T18:00:00Z" };
    const { client } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [{ type: "EX-99.1", filename: "fixed.htm", text: release }], "prior-quarter": [{ type: "EX-99.1", filename: "earlier.htm", text: release }] });
    const result = await collectCurrentReports(client, "1", [{ ...original, acceptanceDateTime: "2026-08-26T17:00:00Z" }, earlier, sameDay], "2026-08-28", "submissions");
    expect(result.ok && result.value.data.releases.map((r) => r.accession)).toEqual(["amended", "prior-quarter"]);
    if (!result.ok) return;
    expect(result.value.data.releases[1]!.freeCashFlow[0]!.source).toMatchObject({ form: "8-K", accession: "prior-quarter", filingDate: "2026-05-20", url: "https://www.sec.gov/prior-quarter/earlier.htm" });
  });

  it("does not pair unrelated amendments by filing proximity or an empty report date", async () => {
    const unrelated = { ...amended, reportDate: "2026-08-27" };
    const { client } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [{ type: "EX-99.1", filename: "other.htm", text: release.replaceAll("Second Quarter Fiscal 2027", "First Quarter Fiscal 2027").replaceAll("July 26, 2026", "April 26, 2026") }] });
    const result = await collectCurrentReports(client, "1", [original, unrelated], "2026-08-28", "submissions");
    expect(result.ok && result.value.data.releases.map((r) => r.accession)).toEqual(["amended", "original"]);
    const blankDates = await collectCurrentReports(client, "1", [{ ...original, reportDate: "" }, { ...amended, reportDate: "" }], "2026-08-28", "submissions");
    expect(blankDates.ok && blankDates.value.data.releases.map((r) => r.accession)).toEqual(["amended", "original"]);
    const future = await collectCurrentReports(client, "1", [original, { ...amended, filingDate: "2026-08-29" }], "2026-08-28", "submissions");
    expect(future.ok && future.value.data.releases.map((r) => r.accession)).toEqual(["original"]);
  });
});
