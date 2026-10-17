import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectCurrentReports } from "@/providers/currentReports";
import type { EdgarClient, EdgarFiling } from "@/providers/edgar";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const release = readFileSync("fixtures/edgar/nvda-current-reports/q2fy27-ex99-1.txt", "utf8");
const ok = <T,>(data: T, endpoint: string) => ({ ok: true as const, value: { data, endpoint, asOf: "2026-10-13", fetchedAt: "2026-10-13T12:00:00Z", source: "edgar" as const } });
const gap = { ok: false as const, gap: { field: "fixture", reason: "unavailable", severity: "info" as const } };
const filing = (accessionNumber: string, filingDate: string, items: string, form = "8-K"): EdgarFiling => ({ accessionNumber, filingDate, reportDate: filingDate, form, primaryDocument: "primary.htm", items });

describe("primary filing evidence alternatives", () => {
  it.each(["index unavailable", "no exhibits", "exhibit unavailable"])("reads guidance in a primary earnings document when %s", async (mode) => {
    const current = filing("earnings", "2026-08-26", "2.02");
    const client = {
      filingIndexHeaders: async () => mode === "index unavailable" ? gap : ok({ documents: mode === "exhibit unavailable" ? [{ type: "EX-99.1", filename: "missing.htm", sequence: "2" }] : [], typeByFilename: {} }, "index"),
      fetchFilingDocument: async (_cik: string, f: EdgarFiling) => f.primaryDocument === "primary.htm" ? ok(`<html><body>${release}</body></html>`, "https://www.sec.gov/earnings/primary.htm") : gap,
    } as unknown as EdgarClient;
    const result = await collectCurrentReports(client, "1", [current], "2026-10-13", "submissions");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data.releases[0]).toMatchObject({ releaseUrl: "https://www.sec.gov/earnings/primary.htm", releaseExhibit: null, guidance: { period: { label: "Q3 FY2027" } } });
    expect(result.value.data.releases[0]?.freeCashFlow[0]?.source).toMatchObject({ exhibit: null, url: "https://www.sec.gov/earnings/primary.htm" });
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-07-26", reportedCurrency: "USD", revenue: 96_221e6 });
    bundle.edgar.currentReports = result;
    expect(buildFilingDisclosures(bundle)?.guidance?.source).toMatchObject({ exhibit: null, url: "https://www.sec.gov/earnings/primary.htm" });
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.filings.some((f) => /primary document/i.test(f.title) && /NVIDIA Announces Financial Results/.test(f.text))).toBe(true);
    for (const figure of payload.issuerFilings?.figures.filter((f) => /guidance|dividend|repurchase/i.test(f.label)) ?? []) {
      expect(figure.source).not.toMatch(/EX-99/);
      expect(figure.source).toContain("earnings");
    }
    expect(result.value.data.notes.join(" ")).toMatch(/primary document.*alternative/i);
  });

  it("does not turn a readable cover referring to unavailable exhibits into guidance", async () => {
    const client = { filingIndexHeaders: async () => gap, fetchFilingDocument: async () => ok("<p>Item 2.02 Results of Operations and Financial Condition. See the earnings release attached as Exhibit 99.1.</p>", "https://www.sec.gov/primary.htm") } as unknown as EdgarClient;
    const result = await collectCurrentReports(client, "1", [filing("cover", "2026-08-26", "2.02")], "2026-10-13", "submissions");
    expect(result.ok).toBe(false);
  });

  it("withholds original earnings when a linked amendment's exhibit index is unavailable", async () => {
    const original = filing("original", "2026-08-26", "2.02");
    const amendment = { ...filing("amendment", "2026-08-28", "9.01", "8-K/A"), reportDate: original.reportDate };
    const client = {
      filingIndexHeaders: async (_cik: string, accession: string) => accession === "amendment" ? gap : ok({ documents: [{ type: "EX-99.1", filename: "release.htm", sequence: "2" }], typeByFilename: {} }, "index"),
      fetchFilingDocument: async (_cik: string, f: EdgarFiling) => ok(f.accessionNumber === "amendment" ? "<p>This amendment corrects a signature.</p>" : `<p>${release}</p>`, `https://www.sec.gov/${f.accessionNumber}/${f.primaryDocument}`),
    } as unknown as EdgarClient;
    const result = await collectCurrentReports(client, "1", [original, amendment], "2026-10-13", "submissions");
    expect(result.ok).toBe(false);
  });
});

describe("annual-baseline material event coverage", () => {
  it("retains acquisition and officer events after an annual filing older than 365 days", async () => {
    const client = { fetchFilingDocument: async (_cik: string, f: EdgarFiling) => ok(`<p>Item ${f.items} ${f.items === "2.01" ? "Completion of Acquisition or Disposition of Assets" : "Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers"}. The Company disclosed a material event.</p>`, `https://www.sec.gov/${f.accessionNumber}/primary.htm`) } as unknown as EdgarClient;
    const result = await collectCurrentReports(client, "1", [filing("annual", "2025-10-01", "", "10-K"), filing("acquisition", "2025-10-03", "2.01"), filing("officer", "2026-06-05", "5.02"), filing("before-annual", "2025-09-30", "5.02"), filing("future", "2026-10-14", "5.02")], "2026-10-13", "submissions");
    expect(result.ok && result.value.data.events.map((e) => e.accession)).toEqual(["officer", "acquisition"]);
  });

  it("discloses omitted accession dates and items when the bounded event read budget is exhausted", async () => {
    let requests = 0;
    const client = { fetchFilingDocument: async (_cik: string, f: EdgarFiling) => { requests++; return ok("<p>Item 8.01 Other Events. The Company disclosed a material event.</p>", `https://www.sec.gov/${f.accessionNumber}/primary.htm`); } } as unknown as EdgarClient;
    const rows = Array.from({ length: 11 }, (_, i) => filing(`event-${i}`, `2026-09-${String(i + 1).padStart(2, "0")}`, "8.01"));
    const result = await collectCurrentReports(client, "1", [filing("annual", "2026-02-01", "", "10-K"), ...rows], "2026-10-13", "submissions");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requests).toBe(10);
    expect(result.value.data.notes.join(" ")).toMatch(/omitted.*event-0.*2026-09-01.*8\.01/i);
  });
});
