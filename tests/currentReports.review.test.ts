import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEarningsReleaseRecord, collectCurrentReports, CURRENT_REPORTS_VERSION, type CurrentReports, type EarningsReleaseRecord } from "@/providers/currentReports";
import type { EdgarClient, EdgarFiling } from "@/providers/edgar";
import { buildFilingDisclosures, nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
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
  it("inspects a linked Item 9.01 amendment whose exhibit corrects the earnings release", async () => {
    const { client, requested } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [{ type: "EX-99.1", filename: "fixed.htm", text: release.replace("21,341", "22,341") }] });
    const result = await collectCurrentReports(client, "1", [original, { ...amended, items: "9.01" }], "2026-08-28", "submissions");
    expect(result.ok && result.value.data.releases.map((r) => r.accession)).toEqual(["amended"]);
    expect(requested).toContain("index:amended");
    if (!result.ok) return;
    expect(result.value.data.releases[0]!.freeCashFlow.find((f) => f.periodEnd === "2026-07-26" && f.months === 3)).toMatchObject({ value: 22_341e6, source: { form: "8-K/A", accession: "amended" } });
  });

  it("leaves the original intact when a linked Item 9.01 amendment is clearly unrelated to earnings", async () => {
    const { client } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [{ type: "8-K/A", filename: "amended.htm", text: "Item 9.01 Financial Statements and Exhibits. This amendment adds the supplier agreement exhibit only." }, { type: "EX-99.1", filename: "other.htm", text: "NVIDIA announces a supplier agreement and product exhibition." }] });
    const result = await collectCurrentReports(client, "1", [original, { ...amended, items: "9.01" }], "2026-08-28", "submissions");
    expect(result.ok && result.value.data.releases.map((r) => r.accession)).toEqual(["original"]);
  });

  it("does not read negated or historical earnings references as an affirmative correction", async () => {
    for (const text of [
      "This amendment adds only a supplier agreement and does not amend the previously reported financial results or earnings release.",
      "This amendment adds only a supplier agreement. The previously furnished Item 2.02 earnings release remains unchanged.",
    ]) {
      const { client } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [{ type: "8-K/A", filename: "amended.htm", text: `Item 9.01 Financial Statements and Exhibits. ${text}` }, { type: "EX-99.1", filename: "other.htm", text: "NVIDIA supplier agreement and product exhibition." }] });
      const result = await collectCurrentReports(client, "1", [original, { ...amended, items: "9.01" }], "2026-08-28", "submissions");
      expect(result.ok && result.value.data.releases.map((r) => r.accession)).toEqual(["original"]);
    }
  });

  it("accepts affirmative earnings correction scope with parsed facts, and withholds an unparseable correction", async () => {
    const primary = { type: "8-K/A", filename: "amended.htm", text: "Item 9.01 Financial Statements and Exhibits. This amendment corrects the previously furnished earnings release." };
    const corrected = release.replace("21,341", "22,341").replaceAll(/financial results|earnings|CFO commentary/gi, "issuer data");
    const { client } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [primary, { type: "EX-99.1", filename: "fixed.htm", text: corrected }] });
    const result = await collectCurrentReports(client, "1", [original, { ...amended, items: "9.01" }], "2026-08-28", "submissions");
    expect(result.ok && result.value.data.releases.map((r) => r.accession)).toEqual(["amended"]);
    const purpose = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [{ ...primary, text: "This amendment is filed solely to correct the previously reported financial results." }, { type: "EX-99.1", filename: "fixed.htm", text: corrected }] });
    const purposeResult = await collectCurrentReports(purpose.client, "1", [original, { ...amended, items: "9.01" }], "2026-08-28", "submissions");
    expect(purposeResult.ok && purposeResult.value.data.releases.map((r) => r.accession)).toEqual(["amended"]);
    const empty = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [primary, { type: "EX-99.1", filename: "empty.htm", text: "The attached document contains no readable results." }] });
    const unknown = await collectCurrentReports(empty.client, "1", [original, { ...amended, items: "9.01" }], "2026-08-28", "submissions");
    expect(unknown.ok).toBe(false);
    expect(empty.requested).not.toContain("index:original");
  });

  it("withholds an original when its linked Item 9.01 amendment cannot establish whether earnings were corrected", async () => {
    const { client, requested } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }] });
    const result = await collectCurrentReports(client, "1", [original, { ...amended, items: "9.01" }], "2026-08-28", "submissions");
    expect(result.ok).toBe(false);
    expect(requested).toContain("index:amended");
    expect(requested).not.toContain("index:original");
  });

  it("does not inspect unrelated-event, undated or ordinary Item 9.01 filings as earnings amendments", async () => {
    for (const candidate of [{ ...amended, reportDate: "2026-08-27", items: "9.01" }, { ...amended, reportDate: "", items: "9.01" }, { ...amended, form: "8-K", items: "9.01" }]) {
      const { client, requested } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], amended: [{ type: "EX-99.1", filename: "other.htm", text: release.replace("21,341", "22,341") }] });
      const result = await collectCurrentReports(client, "1", [original, candidate], "2026-08-28", "submissions");
      expect(result.ok && result.value.data.releases.map((r) => r.accession)).toEqual(["original"]);
      expect(requested).not.toContain("index:amended");
    }
  });

  it("keeps the latest reported quarter current when a later filing amends an older quarter", async () => {
    const q1 = readFileSync("fixtures/edgar/nvda-current-reports/q1fy27-ex99-1.txt", "utf8");
    const older: EdgarFiling = { ...original, accessionNumber: "older", filingDate: "2026-05-20", reportDate: "2026-05-20" };
    const late = { ...amended, filingDate: "2026-09-01", reportDate: older.reportDate };
    const { client } = clientFor({ original: [{ type: "EX-99.1", filename: "pr.htm", text: release }], older: [{ type: "EX-99.1", filename: "q1.htm", text: q1 }], amended: [{ type: "EX-99.1", filename: "q1fixed.htm", text: q1 }] });
    const result = await collectCurrentReports(client, "1", [original, older, late], "2026-09-01", "submissions");
    expect(result.ok && result.value.data.releases.map((r) => [r.accession, r.reported.periodEnd])).toEqual([["original", "2026-07-26"], ["amended", "2026-04-26"]]);
    if (!result.ok) return;
    expect(result.value.data.releases[0]!.releaseNarrative).toContain("Second Quarter Fiscal 2027");
    expect(result.value.data.releases[1]!.releaseNarrative).toBeNull();
    const bundle = withRelease(result.value.data.releases[0]!);
    const reports = bundle.edgar.currentReports;
    if (!reports?.ok) throw new Error("missing fixture reports");
    reports.value.data = result.value.data;
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({ periodLabel: "Q3 FY2027", mid: 108e9, accession: "original" });
    expect(buildFilingDisclosures(bundle)!.freeCashFlow[0]!.source.accession).toBe("original");
    // Legacy saved arrays can still be filing-date ordered. Selection must
    // not revive the older quarter's already-reported Q2 outlook.
    reports.value.data.releases.reverse();
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({ periodLabel: "Q3 FY2027", mid: 108e9 });
    reports.value.data.releases.find((r) => r.accession === "original")!.guidance = null;
    expect(nextPeriodRevenueGuidance(bundle)).toBeNull();
    expect(buildFilingDisclosures(bundle)!.guidance?.rows.some((r) => r.period === "Q2 FY2027")).not.toBe(true);
  });

  it("does not surface a completed fiscal year's old annual outlook as current guidance", () => {
    const old = buildEarningsReleaseRecord({ filing: original, releaseUrl: "https://www.sec.gov/release", commentaryUrl: null, releaseText: release, commentaryText: null, includeNarrative: false });
    for (const quarter of [4, null] as const) {
      const completed = { ...old, accession: "completed", filingDate: "2027-02-25", reported: { fiscal: { label: "FY2027", fiscalYear: 2027, fiscalQuarter: quarter }, periodEnd: "2027-01-25" }, guidance: null };
      const bundle = withRelease(completed);
      const reports = bundle.edgar.currentReports;
      if (!reports?.ok) throw new Error("missing fixture reports");
      reports.value.data.releases.push(old);
      expect(buildFilingDisclosures(bundle)!.guidance).toBeNull();
    }
    // While that fiscal year remains incomplete, its annual tax outlook is
    // still relevant and retains the quarter release that supplied it.
    expect(buildFilingDisclosures(withRelease(old))!.guidance!.rows.some((r) => r.period === "FY2027")).toBe(true);
  });

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
    expect(result.ok && result.value.data.releases.map((r) => r.accession)).toEqual(["original", "amended"]);
    const blankDates = await collectCurrentReports(client, "1", [{ ...original, reportDate: "" }, { ...amended, reportDate: "" }], "2026-08-28", "submissions");
    expect(blankDates.ok && blankDates.value.data.releases.map((r) => r.accession)).toEqual(["original", "amended"]);
    const future = await collectCurrentReports(client, "1", [original, { ...amended, filingDate: "2026-08-29" }], "2026-08-28", "submissions");
    expect(future.ok && future.value.data.releases.map((r) => r.accession)).toEqual(["original"]);
  });
});
