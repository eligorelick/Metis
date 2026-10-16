/**
 * NVDA report #34 audit, work package 3: 8-K releases, 8-K events and XBRL
 * quarterly segments, read from saved NVIDIA filings (fixtures/edgar/
 * nvda-current-reports: the plain text `parseDocument` makes of each 8-K
 * document, and the 10-Q/10-K XBRL instances trimmed to their revenue facts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  hasMaterialEventItem,
  parseCapitalReturn,
  parseCommitmentTables,
  parseGuidance,
  parseIssuerFreeCashFlow,
  parseReconciliation,
  parseReportedPeriod,
  summarizeItem,
} from "@/edgar/currentReports";
import { buildQuarterlySegments, fallbackMemberLabel, parseInstanceRevenue, parseMemberLabels } from "@/edgar/segmentFacts";
import { dcfGuidance, runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures, nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import { selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { assembleContextPayload, PAYLOAD_BUDGETS, riskFactorBudget, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import {
  buildEarningsReleaseRecord,
  buildMaterialEventFiling,
  collectCurrentReports,
  collectQuarterlySegments,
  CURRENT_REPORTS_VERSION,
} from "@/providers/currentReports";
import type { EdgarClient, EdgarFiling } from "@/providers/edgar";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { FilingDisclosuresSchema, type Leadership, type SourcedClaim } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const DIR = path.join(process.cwd(), "fixtures", "edgar", "nvda-current-reports");
const read = (name: string): string => readFileSync(path.join(DIR, name), "utf8");

const Q2_RELEASE = read("q2fy27-ex99-1.txt");
const Q1_RELEASE = read("q1fy27-ex99-1.txt");

const filing = (accessionNumber: string, filingDate: string, items?: string) =>
  ({ accessionNumber, filingDate, form: "8-K", items, acceptanceDateTime: undefined });

describe("8-K earnings release (EX-99.1)", () => {
  it("reads the Q3 FY2027 outlook, issuer FCF and capital return from the Q2 FY2027 release", () => {
    expect(parseReportedPeriod(Q2_RELEASE)).toEqual({
      fiscal: { label: "Q2 FY2027", fiscalYear: 2027, fiscalQuarter: 2 },
      periodEnd: "2026-07-26",
    });
    const guidance = parseGuidance(Q2_RELEASE)!;
    expect(guidance.period?.label).toBe("Q3 FY2027");
    const pick = (metric: string, basis: string) => guidance.items.find((i) => i.metric === metric && i.basis === basis);
    expect(pick("revenue", "unspecified")).toMatchObject({ low: 105.84e9, mid: 108e9, high: 110.16e9, form: "plus-minus", symbol: "$" });
    expect(pick("gross-margin", "gaap")).toMatchObject({ low: 73.5, mid: 74, high: 74.5 });
    expect(pick("gross-margin", "non-gaap")).toMatchObject({ mid: 74 });
    expect(pick("operating-expenses", "gaap")).toMatchObject({ mid: 9.2e9, form: "approximate" });
    expect(pick("operating-expenses", "non-gaap")).toMatchObject({ mid: 9.0e9 });
    // The tax-rate range is a full-year outlook, not the quarter's.
    expect(pick("tax-rate", "gaap")).toMatchObject({ period: { label: "FY2027", fiscalQuarter: null }, low: 16, high: 18, form: "range" });
    expect(guidance.qualifiers.join(" ")).toMatch(/not assuming any Data Center compute revenue from China/);

    // Issuer-defined FCF: the audit's "not in the filings" claim was wrong.
    const fcf = parseIssuerFreeCashFlow(Q2_RELEASE);
    expect(fcf.find((f) => f.periodEnd === "2026-07-26" && f.months === 3)?.value).toBe(21_341e6);
    expect(fcf.find((f) => f.periodEnd === "2026-07-26" && f.months === 6)?.value).toBe(69_895e6);
    expect(fcf[0]!.definition).toMatch(/^Free cash flow is calculated as GAAP net cash provided by operating activities less/);

    expect(parseCapitalReturn(Q2_RELEASE)).toMatchObject({
      returned: { value: 26e9, periodText: "the second quarter of fiscal 2027" },
      authorizationRemaining: { value: 99e9 },
      dividendPerShare: { value: 0.25, payDate: "2026-10-01", recordDate: "2026-09-10" },
    });
  });

  it("pairs 'respectively' values with their bases and ignores 'inclusive of' asides (Q1 FY2027 release)", () => {
    const guidance = parseGuidance(Q1_RELEASE)!;
    const gm = guidance.items.filter((i) => i.metric === "gross-margin");
    expect(gm.map((i) => [i.basis, i.mid, i.low, i.high])).toEqual([["gaap", 74.9, 74.4, 75.4], ["non-gaap", 75, 74.5, 75.5]]);
    expect(guidance.items.find((i) => i.metric === "revenue")).toMatchObject({ period: { label: "Q2 FY2027" }, mid: 91e9 });
    expect(parseCapitalReturn(Q1_RELEASE)).toMatchObject({
      dividendChange: { from: 0.01, to: 0.25 },
      authorizationAdded: { value: 80e9 },
      authorizationRemaining: { value: 38.5e9 },
    });
  });
});

describe("material-event 8-K items", () => {
  it("dates each event and keeps its amounts", () => {
    const rvg = buildMaterialEventFiling(filing("0001045810-26-000069", "2026-08-17", "1.01,2.03,7.01"), read("8k-20260817-items-1.01-2.03.txt"), "https://www.sec.gov/x");
    expect(rvg.eventDate).toBe("2026-08-17");
    expect(rvg.sections.map((s) => [s.item, s.incorporates])).toEqual([["1.01", null], ["2.03", "1.01"]]);
    expect(rvg.sections[0]!.summary).toMatch(/capped at \$105 billion/);

    const officer = buildMaterialEventFiling(filing("0001045810-26-000060", "2026-07-02", "5.02"), read("8k-20260628-item-5.02.txt"), "https://www.sec.gov/y");
    expect(officer.eventDate).toBe("2026-06-28");
    expect(officer.sections[0]!.summary).toMatch(/Ajay K\. Puri.*intention to retire.*Nicholas Parker/);

    const deal = buildMaterialEventFiling(filing("0001045810-26-000078", "2026-09-03", "8.01"), read("8k-20260902-item-8.01.txt"), "https://www.sec.gov/z");
    expect(deal.sections[0]!.summary).toMatch(/definitive agreement to acquire Hugging Face.*\$11\.9 billion/);
  });
});

function segmentFilings() {
  const instance = (name: string, accession: string, form: string, filingDate: string) => {
    const parsed = parseInstanceRevenue(read(name));
    return { accession, form, filingDate, facts: parsed.facts, concept: parsed.concept };
  };
  return [
    instance("nvda-20260726_htm.xml", "0001045810-26-000075", "10-Q", "2026-08-26"),
    instance("nvda-20260125_htm.xml", "0001045810-26-000021", "10-K", "2026-02-25"),
    instance("nvda-20251026_htm.xml", "0001045810-25-000230", "10-Q", "2025-11-19"),
  ];
}

describe("XBRL segment revenue by quarter", () => {
  it("lays the latest presentation over eight quarters with recast and derived quarters", () => {
    const series = buildQuarterlySegments(segmentFilings(), parseMemberLabels(read("nvda-20260726_lab.xml")))!;
    expect(series.quarters.map((q) => q.end)).toEqual([
      "2026-07-26", "2026-04-26", "2026-01-25", "2025-10-26", "2025-07-27", "2025-04-27", "2025-01-26", "2024-10-27",
    ]);
    // Q4 FY2026 is the 10-K's year less the Q3 10-Q's nine months.
    expect(series.total[2]).toBe(68_127e6);
    const platform = series.axes.find((a) => a.axis === "srt:ProductOrServiceAxis")!;
    const row = (label: string) => platform.rows.find((r) => r.label === label)!;
    // Q1 on the recast basis: the Q2 10-Q's six months less its Q2. The CFO
    // commentary prints 43,050; differencing two facts rounded to millions gives 43,051.
    expect(row("Hyperscale").values.slice(0, 2)).toEqual([48_710e6, 43_051e6]);
    expect(row("AI Clouds, Industrial, & Enterprise").values[0]).toBe(40_313e6);
    expect(row("Edge Computing").values[0]).toBe(7_198e6);
    expect(row("Hyperscale").childOf).toBe("nvda:DataCenterMember");
    expect(row("Data Center").childOf).toBeNull();
    expect(platform.priorPresentation).toContain("Gaming");
    // The old filing never establishes the new Edge presentation for Q4.
    // Today's exhaustive rows cannot relabel yesterday's other businesses.
    expect(row("Edge Computing").values[2]).toBeNull();
    expect(row("Edge Computing").residualAt ?? []).not.toContain(2);
    // The Q3 FY2026 10-Q tagged "Other" geography under a member the later
    // filings renamed; without an explicit mapping, the old cell stays missing.
    const geography = series.axes.find((a) => a.axis === "srt:StatementGeographicalAxis")!;
    expect(geography.rows.find((r) => r.label === "Other")!.values[3]).toBeNull();
    geography.total.forEach((total, i) => {
      if (geography.rows.every((r) => r.values[i] !== null))
        expect(geography.rows.reduce((sum, r) => sum + r.values[i]!, 0)).toBeCloseTo(total!, -6);
    });
  });
});

describe("XBRL edge cases", () => {
  it("keeps segment-note contexts, skips typed, nil and per-share facts, and falls back to totals", () => {
    const ctx = (id: string, members = "") =>
      `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>${members === "" ? "" : `<xbrli:segment>${members}</xbrli:segment>`}</xbrli:entity>` +
      `<xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>`;
    const member = (dimension: string, value: string) => `<xbrldi:explicitMember dimension="${dimension}">${value}</xbrldi:explicitMember>`;
    const units = `<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>` +
      `<xbrli:unit id="ps"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>`;
    const contract = "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax";
    const xml = [
      ctx("total"),
      ctx("widgets", member("us-gaap:StatementBusinessSegmentsAxis", "acme:WidgetsSegmentMember") + member("srt:ConsolidationItemsAxis", "us-gaap:OperatingSegmentsMember")),
      ctx("us", member("srt:StatementGeographicalAxis", "country:US")),
      ctx("typed", `<xbrldi:typedMember dimension="acme:Axis"><acme:x>1</acme:x></xbrldi:typedMember>`),
      units,
      `<us-gaap:Revenues contextRef="total" unitRef="usd" decimals="-6">100</us-gaap:Revenues>`,
      `<${contract} contextRef="widgets" unitRef="usd">60</${contract}>`,
      `<${contract} contextRef="us" unitRef="usd">70</${contract}>`,
      `<${contract} contextRef="us" unitRef="ps">1.5</${contract}>`,
      `<${contract} contextRef="typed" unitRef="usd">5</${contract}>`,
      `<us-gaap:Revenues contextRef="widgets" unitRef="usd" xsi:nil="true"></us-gaap:Revenues>`,
    ].join("\n");
    const parsed = parseInstanceRevenue(xml);
    // The segment facts are on contract revenue; the total comes from Revenues.
    expect(parsed.concept).toBe(contract);
    expect(parsed.facts.map((f) => [f.member, f.value])).toEqual([["acme:WidgetsSegmentMember", 60], ["country:US", 70], [null, 100]]);
    expect(parseInstanceRevenue([ctx("total"), units, `<us-gaap:Revenues contextRef="total" unitRef="usd">100</us-gaap:Revenues>`].join("\n")))
      .toMatchObject({ concept: "us-gaap:Revenues", facts: [{ member: null, value: 100 }] });
    expect([fallbackMemberLabel("acme:WidgetsSegmentMember"), fallbackMemberLabel("country:US"), fallbackMemberLabel("country:ZZ")]).toEqual(["Widgets", "United States", "ZZ"]);
    expect(buildQuarterlySegments([], {})).toBeNull();
  });
});

describe("bounded EDGAR collection", () => {
  it("reads releases, events and segment instances through the client, and discloses what it cannot read", async () => {
    const html = (text: string) => `<html><body><p>${text}</p></body></html>`;
    const docs: Record<string, string> = {
      "0001045810-26-000073/q2fy27pr.htm": html(Q2_RELEASE),
      "0001045810-26-000060/nvda-20260628.htm": html(read("8k-20260628-item-5.02.txt")),
      "0001045810-26-000075/nvda-20260726_htm.xml": read("nvda-20260726_htm.xml"),
      "0001045810-26-000075/nvda-20260726_lab.xml": read("nvda-20260726_lab.xml"),
      "0001045810-26-000021/nvda-20260125_htm.xml": read("nvda-20260125_htm.xml"),
      // An earnings 8-K whose release prints no outlook; its CFO commentary does.
      "0001045810-26-000051/pr.htm": html("NVIDIA reports results. Revenue was $81.6 billion."),
      "0001045810-26-000051/cfo.htm": html(Q1_RELEASE),
      "0001045810-26-000040/pr.htm": html("NVIDIA reports results. Revenue was $1.0 billion."),
      "0001045810-26-000065/nvda-20260801.htm": html("A cover page with no item headings."),
    };
    const indexes: Record<string, { type: string; filename: string }[]> = {
      "0001045810-26-000073": [{ type: "8-K", filename: "nvda-20260826.htm" }, { type: "EX-99.1", filename: "q2fy27pr.htm" }, { type: "EX-99.2", filename: "missing.htm" }],
      "0001045810-26-000075": [{ type: "10-Q", filename: "nvda-20260726.htm" }, { type: "EX-101.LAB", filename: "nvda-20260726_lab.xml" }, { type: "XML", filename: "nvda-20260726_htm.xml" }],
      "0001045810-26-000021": [{ type: "10-K", filename: "nvda-20260125.htm" }, { type: "XML", filename: "nvda-20260125_htm.xml" }],
      "0001045810-26-000051": [{ type: "EX-99.1", filename: "pr.htm" }, { type: "EX-99.2", filename: "cfo.htm" }],
      "0001045810-26-000040": [{ type: "EX-99.1", filename: "pr.htm" }],
      "0001045810-26-000030": [{ type: "8-K", filename: "nvda-20260301.htm" }],
      "0001045810-26-000052": [{ type: "10-Q", filename: "nvda-20260426.htm" }],
      "0001045810-25-000230": [{ type: "XML", filename: "nvda-20251026_htm.xml" }],
    };
    const ok = <T,>(data: T, endpoint: string) => ({ ok: true as const, value: { data, asOf: "2026-10-15", source: "edgar" as const, endpoint, fetchedAt: "2026-10-15T00:00:00.000Z" } });
    const gap = (reason: string) => ({ ok: false as const, gap: { field: "edgar.test", reason, severity: "warn" as const } });
    const requested: string[] = [];
    const client = {
      filingProblem: (_cik: string, f: EdgarFiling) => (f.primaryDocument.includes("/") ? "unsafe primary document" : null),
      filingIndexHeaders: async (_cik: string, accession: string) => {
        requested.push(`index:${accession}`);
        const documents = indexes[accession];
        return documents ? ok({ documents: documents.map((d, i) => ({ ...d, sequence: String(i + 1) })), typeByFilename: {} }, `index/${accession}`) : gap("index HTTP 404");
      },
      fetchFilingDocument: async (_cik: string, f: EdgarFiling) => {
        const key = `${f.accessionNumber}/${f.primaryDocument}`;
        requested.push(`doc:${key}`);
        return docs[key] !== undefined ? ok(docs[key], `https://www.sec.gov/Archives/${key}`) : gap("document HTTP 404");
      },
    } as unknown as EdgarClient;
    const row = (accessionNumber: string, form: string, filingDate: string, primaryDocument: string, items?: string): EdgarFiling =>
      ({ accessionNumber, form, filingDate, reportDate: filingDate, primaryDocument, items });
    const filings = [
      row("0001045810-26-000078", "8-K", "2026-09-03", "../escape.htm", "8.01"),
      row("0001045810-26-000073", "8-K", "2026-08-26", "nvda-20260826.htm", "2.02,9.01"),
      row("0001045810-26-000075", "10-Q", "2026-08-26", "nvda-20260726.htm"),
      row("0001045810-26-000060", "8-K", "2026-07-02", "nvda-20260628.htm", "5.02"),
      row("0001045810-26-000065", "8-K", "2026-08-01", "nvda-20260801.htm", "8.01"),
      row("0001045810-26-000051", "8-K", "2026-05-20", "nvda-20260520.htm", "2.02,9.01"),
      row("0001045810-26-000052", "10-Q", "2026-05-20", "nvda-20260426.htm"),
      row("0001045810-26-000040", "8-K", "2026-04-01", "nvda-20260401.htm", "2.02"),
      row("0001045810-26-000030", "8-K", "2026-03-01", "nvda-20260301.htm", "2.02"),
      row("0001045810-26-000021", "10-K", "2026-02-25", "nvda-20260125.htm"),
      row("0001045810-25-000230", "10-Q", "2025-11-19", "nvda-20251026.htm"),
      row("0001045810-24-000001", "8-K", "2024-02-01", "old.htm", "8.01"),
    ];

    const reports = await collectCurrentReports(client, "1045810", filings, "2026-10-15", "https://data.sec.gov/submissions/CIK0001045810.json");
    expect(reports.ok).toBe(true);
    if (!reports.ok) return;
    expect(reports.value.asOf).toBe("2026-08-26");
    expect(reports.value.data.releases.map((r) => [r.accession, r.guidance?.period?.label ?? null, r.guidanceExhibit])).toEqual([
      ["0001045810-26-000073", "Q3 FY2027", "EX-99.1"],
      // Release silent on the outlook: guidance, the reported quarter and issuer FCF come from the commentary.
      ["0001045810-26-000051", "Q2 FY2027", "EX-99.2"],
      ["0001045810-26-000040", null, null],
    ]);
    const commentaryOnly = reports.value.data.releases[1]!;
    expect(commentaryOnly.reported.fiscal?.label).toBe("Q1 FY2027");
    expect(commentaryOnly.freeCashFlow.find((f) => f.months === 3)?.value).toBe(48_554e6);
    expect(commentaryOnly.commentaryNarrative).toBeNull();
    expect(reports.value.data.releases[0]!.releaseNarrative).toMatch(/^NVIDIA Announces Financial Results for Second Quarter Fiscal 2027/);
    expect(reports.value.data.events.map((e) => [e.accession, e.eventDate, e.sections.map((s) => s.item)])).toEqual([
      ["0001045810-26-000065", null, []],
      ["0001045810-26-000060", "2026-06-28", ["5.02"]],
    ]);
    const notes = reports.value.data.notes.join("\n");
    expect(notes).toMatch(/0001045810-26-000073 EX-99\.2 \(missing\.htm\) unreadable/);
    expect(notes).toMatch(/0001045810-26-000030 \(2026-03-01\): Item 2\.02 filing furnishes no EX-99 exhibit/);
    expect(notes).toMatch(/0001045810-26-000040 \(2026-04-01\): no outlook section was found/);
    expect(notes).toMatch(/0001045810-26-000065 \(2026-08-01\) lists Items 8\.01 but no item heading could be read/);
    expect(notes).toMatch(/0001045810-26-000078 \(2026-09-03\) not read: unsafe primary document/);
    // Nothing is requested for the unsafe row or for 8-Ks outside the one-year window.
    expect(requested.some((r) => r.includes("26-000078") || r.includes("24-000001"))).toBe(false);

    const segments = await collectQuarterlySegments(client, "1045810", filings, "2026-10-15");
    expect(segments.ok).toBe(true);
    if (!segments.ok) return;
    expect(segments.value.asOf).toBe("2026-07-26");
    expect(segments.value.data.axes.find((a) => a.axis === "srt:ProductOrServiceAxis")?.rows[0]?.label).toBe("Data Center");
    expect(segments.value.data.notes).toEqual([
      "10-Q 0001045810-26-000052: no XBRL instance in the filing index",
      "10-Q 0001045810-25-000230: instance unreadable (document HTTP 404)",
    ]);
    expect(await collectQuarterlySegments(client, "1045810", filings.filter((f) => f.form === "8-K"), "2026-10-15")).toMatchObject({ ok: false, gap: { field: "edgar.quarterlySegments", severity: "info" } });
  });
});

describe("other issuers' phrasing and unreadable filings", () => {
  it("reads explicit ranges and full-year outlooks, and turns unreadable 8-Ks and instances into disclosed gaps", async () => {
    const release = "Acme Corp. Reports Fourth Quarter and Full Year 2026 Results. Revenue for the fourth quarter ended December 31, 2026 was $1.1 billion. " +
      "Business Outlook For the first quarter of 2027, Acme expects revenue to be in the range of $1.20 billion to $1.25 billion. " +
      "Diluted earnings per share is expected to be between $0.45 and $0.50. Non-GAAP operating margin is expected to be approximately 30%. " +
      "For full year 2027, capital expenditures are expected to be about $400 million. Revenue growth is expected to accelerate. About Acme Corp. Acme makes things.";
    expect(parseReportedPeriod(release)).toEqual({ fiscal: { label: "Q4 FY2026", fiscalYear: 2026, fiscalQuarter: 4 }, periodEnd: "2026-12-31" });
    const items = parseGuidance(release)!.items.map((i) => [i.period.label, i.metric, i.basis, i.form, i.low, i.high]);
    expect(items).toEqual([
      ["Q1 FY2027", "revenue", "unspecified", "range", 1.2e9, 1.25e9],
      ["Q1 FY2027", "eps", "unspecified", "range", 0.45, 0.5],
      ["Q1 FY2027", "operating-margin", "non-gaap", "approximate", 30, 30],
      ["FY2027", "capital-expenditures", "unspecified", "approximate", 400e6, 400e6],
    ]);
    expect(parseGuidance("Revenue was $1.1 billion. No outlook is given.")).toBeNull();
    expect(parseIssuerFreeCashFlow(release)).toEqual([]);

    const throwing = {
      filingIndexHeaders: async () => { throw new Error("socket hang up"); },
      fetchFilingDocument: async () => { throw new Error("socket hang up"); },
    } as unknown as EdgarClient;
    const rows: EdgarFiling[] = [
      { accessionNumber: "0000000001-26-000002", form: "8-K", filingDate: "2026-09-01", reportDate: "2026-09-01", primaryDocument: "a.htm", items: "2.02" },
      { accessionNumber: "0000000001-26-000001", form: "8-K", filingDate: "2026-08-01", reportDate: "2026-08-01", primaryDocument: "b.htm", items: "1.01" },
      { accessionNumber: "0000000001-26-000003", form: "10-Q", filingDate: "2026-08-10", reportDate: "2026-06-30", primaryDocument: "q.htm" },
    ];
    expect(await collectCurrentReports(throwing, "1", rows, "2026-10-15", "submissions")).toMatchObject({
      ok: false, gap: { field: "edgar.currentReports", severity: "warn", reason: expect.stringMatching(/exhibit index unreadable \(socket hang up\)/) },
    });
    expect(await collectQuarterlySegments(throwing, "1", rows, "2026-10-15")).toMatchObject({
      ok: false, gap: { reason: expect.stringMatching(/10-Q 0000000001-26-000003: index unreadable \(socket hang up\)/) },
    });
    const quiet = await collectCurrentReports(throwing, "1", [], "2026-10-15", "submissions");
    expect(quiet.ok && quiet.value.data.notes).toEqual(["no Item 2.02 (results) 8-K among the filings of the last 400 days"]);
  });
});

describe("filing disclosures through the payload and the report tables", () => {
  function bundleWithFilings(): DataBundle {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    const q2 = buildEarningsReleaseRecord({ filing: filing("0001045810-26-000073", "2026-08-26"), releaseUrl: "https://www.sec.gov/q2", commentaryUrl: null, releaseText: Q2_RELEASE, commentaryText: null, includeNarrative: true });
    const q1 = buildEarningsReleaseRecord({ filing: filing("0001045810-26-000051", "2026-05-20"), releaseUrl: "https://www.sec.gov/q1", commentaryUrl: null, releaseText: Q1_RELEASE, commentaryText: null, includeNarrative: false });
    const rvg = buildMaterialEventFiling(filing("0001045810-26-000069", "2026-08-17", "1.01,2.03,7.01"), read("8k-20260817-items-1.01-2.03.txt"), "https://www.sec.gov/rvg");
    const series = buildQuarterlySegments(segmentFilings(), parseMemberLabels(read("nvda-20260726_lab.xml")))!;
    const sourced = <T,>(data: T, asOf: string) => ({ ok: true as const, value: { data, asOf, source: "edgar" as const, endpoint: "fixture", fetchedAt: "2026-10-15T00:00:00.000Z" } });
    bundle.edgar.currentReports = sourced({ version: CURRENT_REPORTS_VERSION, releases: [q2, q1], events: [rvg], notes: [] }, "2026-08-26");
    bundle.edgar.quarterlySegments = sourced(series, "2026-07-26");
    return bundle;
  }

  it("scores each quarter's actual against the outlook the preceding release gave for it", () => {
    const bundle = bundleWithFilings();
    // The Q2 FY2027 statement row (10-Q, quarter ended 2026-07-26).
    const income = bundle.statements.incomeQuarterly;
    if (!income.ok) throw new Error("fixture income statement missing");
    income.value.data.rows.unshift({ date: "2026-07-26", period: "Q2", fiscalYear: "2027", reportedCurrency: "USD", revenue: 96_221e6, grossProfit: 72_142e6, operatingIncome: 63_734e6, operatingExpenses: 8_408e6 });
    const checks = buildFilingDisclosures(bundle)!.guidanceChecks;
    // Q1 FY2027 release guided Q2 revenue to $91.0B ± 2%; Q2 printed $96.221B.
    expect(checks.find((c) => c.metric === "revenue")).toMatchObject({ period: "Q2 FY2027", periodEnd: "2026-07-26", guidedMid: 91e9, actual: 96_221e6, position: "above", difference: 5.74 });
    expect(checks.find((c) => c.metric === "gross-margin")).toMatchObject({ basis: "gaap", guidedMid: 74.9, actual: 74.98, position: "within" });
    const table = filingDisclosureTables(buildFilingDisclosures(bundle), "outlook").find((t) => t.heading === "Results against prior guidance")!;
    expect(table.rows[0]).toEqual(expect.arrayContaining(["Q2 FY2027 (ended 2026-07-26)", "+5.7%", "above range"]));
  });

  it("registers guidance and issuer FCF as citable USD records and renders the four tables", () => {
    const bundle = bundleWithFilings();
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({
      periodLabel: "Q3 FY2027", mid: 108e9, low: 105.84e9, high: 110.16e9, currency: "USD", basePeriodEnd: "2026-07-26",
      // NVIDIA's Q3 FY2027 ends 2026-10-25 (13 weeks); 74.0% GM less 9.2B opex over 108.0B revenue.
      periodEnd: "2026-10-25", periodEndBasis: "13-week-quarter", impliedOperatingMarginPct: 65.48,
    });

    // The DCF receives the same outlook as its D-58 guidance anchor, only in the model currency.
    // Re-pinned for D-60: the range low end, the guided gross-margin low end and the FY2027 tax guidance travel too.
    expect(dcfGuidance(bundle, "USD")).toEqual({
      revenue: 108e9, periodEnd: "2026-10-25", asOf: "2026-08-26",
      source: "sec:8-K EX-99.1 0001045810-26-000073", operatingMarginPct: 65.48,
      revenueLow: 105.84e9, grossMarginLowPct: 73.5, taxRatePct: 17, taxRatePeriod: "FY2027",
    });
    expect(dcfGuidance(bundle, "EUR")).toBeNull();

    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    const record = (id: string) => payload.provenanceRegistry!.find((r) => r.id === id);
    expect(record("payload.issuer-filings.q3-fy2027-revenue-guidance-midpoint")).toMatchObject({ value: 108e9, currency: "USD", period: "Q3 FY2027", asOf: "2026-08-26", kind: "provider" });
    expect(record("payload.issuer-filings.issuer-defined-free-cash-flow-three-months-ended-2026-07-26")).toMatchObject({ value: 21_341e6, currency: "USD" });
    expect(record("payload.segment-revenue.product-market-platform-hyperscale-revenue-quarter-ended-2026-07-26")).toMatchObject({
      value: 48_710e6, currency: "USD", periodContext: { kind: "duration", start: "2026-04-27", end: "2026-07-26" },
    });
    const event = payload.filings.find((e) => e.source === "edgar:8-K 0001045810-26-000069");
    expect(event).toMatchObject({ asOf: "2026-08-17" });
    expect(event!.text).toMatch(/\$105 billion/);
    expect(serializePayloadForPrompt(payload)).toContain("Issuer guidance, free cash flow & capital return");

    const disclosures = FilingDisclosuresSchema.parse(buildFilingDisclosures(bundle));
    expect(disclosures.capitalReturn).toMatchObject({ returned: 26e9, authorizationRemaining: 99e9, dividendPerShare: 0.25 });
    expect(disclosures.notes.join(" ")).toMatch(/dividend raised from 0\.01 to 0\.25 USD per share.*authorization increased by 80\.0 billion USD/);
    // Stored at 4 dp so the 1-dp display does not double-round (96,221 / 46,743 − 1 = 105.85…%).
    expect(disclosures.quarterlyTrend.length).toBeGreaterThan(0);
    const headings = (["outlook", "business", "fundamentals", "catalystsRisks"] as const).flatMap((s) => filingDisclosureTables(disclosures, s).map((t) => t.heading));
    expect(headings).toEqual(expect.arrayContaining([
      "Management guidance (issued with Q2 FY2027 results)",
      "Segment revenue by quarter — Product / market platform",
      "Quarterly trend (last eight quarters)",
      "Issuer-reported free cash flow and capital return",
      "Material SEC current reports (Form 8-K, last 12 months)",
    ]));
  });
});

/**
 * D-63 (NVDA report #34 audit P1-8, P1-14, P0-11, P1-10 and the 2026-10-15
 * integration-rerun findings): the business description, the 10-Q notes, the
 * CFO commentary's reconciliation and commitments tables, the 8-K operative
 * paragraph and the company's guidance track record, read from saved NVIDIA
 * filings (fixtures/edgar/nvda-periodic-sections: the text extractSection
 * makes of 10-K Item 1 and of the 10-Q Part I Item 1 notes; q2fy27-ex99-2.txt:
 * the text parseDocument makes of the Q2 FY2027 CFO commentary).
 */
describe("D-63 filing evidence", () => {
  const SECTIONS = path.join(process.cwd(), "fixtures", "edgar", "nvda-periodic-sections");
  const ITEM1 = readFileSync(path.join(SECTIONS, "nvda-10k-fy2026-item1.txt"), "utf8");
  const NOTES = readFileSync(path.join(SECTIONS, "nvda-10q-q2fy27-notes.txt"), "utf8");
  const Q2_COMMENTARY = read("q2fy27-ex99-2.txt");
  const section = (sectionName: "item1" | "tenQNotes", text: string, form: string, reportDate: string) => ({
    ok: true as const,
    value: {
      data: { sectionName, text, method: "toc-anchor" as const, chars: text.length, accession: form === "10-K" ? "0001045810-26-000021" : "0001045810-26-000075",
        form, filingDate: form === "10-K" ? "2026-02-25" : "2026-08-26", reportDate, documentUrl: "https://www.sec.gov/x" },
      asOf: reportDate, source: "edgar" as const, endpoint: "fixture", fetchedAt: "2026-10-15T00:00:00.000Z",
    },
  });

  function nvdaBundle(): DataBundle {
    const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
    const q2 = buildEarningsReleaseRecord({ filing: filing("0001045810-26-000073", "2026-08-26"), releaseUrl: "https://www.sec.gov/q2", commentaryUrl: "https://www.sec.gov/q2cfo",
      releaseText: Q2_RELEASE, commentaryText: Q2_COMMENTARY, includeNarrative: true });
    const q1 = buildEarningsReleaseRecord({ filing: filing("0001045810-26-000051", "2026-05-20"), releaseUrl: "https://www.sec.gov/q1", commentaryUrl: null,
      releaseText: Q1_RELEASE, commentaryText: null, includeNarrative: false });
    const rvg = buildMaterialEventFiling(filing("0001045810-26-000069", "2026-08-17", "1.01,2.03,7.01"), read("8k-20260817-items-1.01-2.03.txt"), "https://www.sec.gov/rvg");
    const sourced = <T,>(data: T, asOf: string) => ({ ok: true as const, value: { data, asOf, source: "edgar" as const, endpoint: "fixture", fetchedAt: "2026-10-15T00:00:00.000Z" } });
    bundle.edgar.currentReports = sourced({ version: CURRENT_REPORTS_VERSION, releases: [q2, q1], events: [rvg], notes: [] }, "2026-08-26");
    bundle.edgar.business = section("item1", ITEM1, "10-K", "2026-01-25");
    bundle.edgar.tenQNotes = section("tenQNotes", NOTES, "10-Q", "2026-07-26");
    const income = bundle.statements.incomeQuarterly;
    if (!income.ok) throw new Error("fixture income statement missing");
    income.value.data.rows.unshift({ date: "2026-07-26", period: "Q2", fiscalYear: "2027", reportedCurrency: "USD", revenue: 96_221e6, grossProfit: 72_142e6, operatingIncome: 63_734e6, operatingExpenses: 8_408e6 });
    return bundle;
  }
  const payloadOf = (bundle: DataBundle) => assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });

  it("retains the business description's platform, roadmap, suppliers, competitors and officers, and the 10-Q notes' material passages", () => {
    const item1 = selectMaterialEvidence(ITEM1, 12_000, "business");
    expect(item1.text.length).toBeLessThanOrEqual(12_000);
    for (const needle of ["CUDA", "Taiwan Semiconductor Manufacturing Company Limited, or TSMC", "Rubin", "Our current competitors include",
      "Colette M. Kress joined NVIDIA in 2013", "export"]) expect(item1.text).toContain(needle);
    // The financial reading of the same text kept neither the foundry nor the officers.
    expect(selectMaterialEvidence(ITEM1, 12_000).text).not.toContain("TSMC");
    for (const span of item1.spans) expect(ITEM1.slice(span.start, span.end)).toBe(span.text);
    expect(item1.coverage.version).toBe("section-evidence-2/business");

    // D-66 reserves concentration passages and raises the bounded notes budget.
    const notes = selectMaterialEvidence(NOTES, 14_000, "notes");
    expect(notes.text.length).toBeLessThanOrEqual(14_000);
    for (const needle of ["lock-up restrictions", "three direct customers represented 16 %, 15 %, and 13 % of total revenue",
      "issued an aggregate of $ 25.0 billion of senior unsecured notes", "to $ 279 billion", "affiliate of OpenAI Group PBC (OpenAI)", "equity method"]) {
      expect(notes.text).toContain(needle);
    }
    // A long Item 1A keeps a fifth of itself, between the 14,000 floor and the 24,000 cap.
    expect([50_000, 114_916, 300_000].map(riskFactorBudget)).toEqual([14_000, 22_983, 24_000]);
  });

  it("keeps an 8-K's named tenant and counterparty, its dated leads and its amounts, and states a notes offering's total", () => {
    const payload = payloadOf(nvdaBundle());
    const rvg = payload.filings.find((e) => e.source === "edgar:8-K 0001045810-26-000069")!;
    expect(rvg.text).toContain("An affiliate of OpenAI Group PBC (such affiliate, “OpenAI”) will be the tenant.");
    expect(rvg.text).toContain("SB Energy Corp. (collectively with its affiliates, “SB Energy”)");
    expect(rvg.text).toContain("capped at $105 billion");
    expect(payload.filings.map((e) => e.source)).toEqual(expect.arrayContaining(["edgar:10-K item1", "edgar:10-Q notes"]));

    const deal = buildMaterialEventFiling(filing("0001045810-26-000078", "2026-09-03", "8.01"), read("8k-20260902-item-8.01.txt"), "x");
    const body = deal.sections.map((s) => `Item ${s.item} (${s.title}): ${s.text}`).join("\n\n");
    expect(selectMaterialEvidence(body, 1_200, "event").text).toContain("approximately $11.9 billion purchase price");
    expect(hasMaterialEventItem("5.07")).toBe(true);
    const series = ["4.25% Notes due 2028", "4.35% Notes due 2029", "4.50% Notes due 2031", "4.75% Notes due 2033", "4.95% Notes due 2036", "5.55% Notes due 2046", "5.625% Notes due 2056"];
    const amounts = ["3,500,000,000", "3,500,000,000", "4,000,000,000", "3,500,000,000", "4,000,000,000", "3,000,000,000", "3,500,000,000"];
    const offering = { item: "8.01", title: "Other Events", incorporates: null,
      text: `On June 18, 2026, NVIDIA Corporation completed its offering of ${series.map((name, i) => `$${amounts[i]} aggregate principal amount of its ${name}`).join(", ")}.` };
    const summary = summarizeItem(offering);
    expect(summary.length).toBeLessThanOrEqual(600);
    expect(summary).toMatch(/\[computed: 7 series, \$25\.0 billion aggregate principal amount in total\]$/);
    expect(summary).not.toMatch(/Notes due …/);
  });

  it("retains the credit-support option and reimbursement qualifiers in source-bound excerpts and deterministic event context", () => {
    const bundle = nvdaBundle();
    const payload = payloadOf(bundle);
    const event = bundle.edgar.currentReports;
    if (!event?.ok) throw new Error("fixture events missing");
    const raw = event.value.data.events[0]!;
    const body = raw.sections.map((s) => s.incorporates !== null ? `Item ${s.item} (${s.title}): incorporates Item ${s.incorporates} by reference.` : `Item ${s.item} (${s.title}): ${s.text}`).join("\n\n");
    const excerpt = payload.filings.find((e) => e.source === "edgar:8-K 0001045810-26-000069")!;
    const clauses = ["NVIDIA also can provide credit support to secure approximately an additional 3.8 gigawatts at the Portsmouth Site, exercisable in its sole discretion.", "OpenAI has agreed to reimburse and indemnify NVIDIA for any and all amounts actually paid by NVIDIA to the Lessor under the Agreements."];
    for (const clause of clauses) {
      expect(excerpt.text).toContain(clause);
      expect(serializePayloadForPrompt(payload)).toContain(clause);
      expect(buildFilingDisclosures(bundle)!.events[0]!.summary).toContain(clause);
    }
    for (const needle of ["An affiliate of OpenAI Group PBC", "SB Energy", "approximately 4.25 gigawatts", "cumulatively capped at $105 billion", "On August 17, 2026"]) expect(excerpt.text).toContain(needle);
    expect(excerpt.text.length).toBeLessThanOrEqual(PAYLOAD_BUDGETS.eightKCreditEventChars);
    for (const span of excerpt.spans!) expect(body.slice(span.start, span.end)).toBe(span.text);
    expect(excerpt.title).toContain("event date 2026-08-17");
    expect(excerpt.asOf).toBe("2026-08-17");
  });

  it("registers the commentary's reconciliation, commitments and guarantees, and the quarters' equity gains and non-GAAP EPS", () => {
    const tables = parseCommitmentTables(Q2_COMMENTARY);
    expect(tables.map((t) => [t.kind, t.total])).toEqual([["commitments", 366e9], ["commitments", 56e9], ["guarantees", 108.5e9]]);
    expect(tables[0]!.rows).toContainEqual({ label: "Supply and capacity", total: 279e9 });
    expect(tables[0]!.asOf).toBe("2026-07-26");
    // The later guarantees header explicitly includes agreements signed in
    // August; July's earlier commitments header cannot date that table.
    expect(tables.find((t) => t.kind === "guarantees")!.asOf).toBeNull();
    const legacyBundle = nvdaBundle();
    if (!legacyBundle.edgar.currentReports?.ok) throw new Error("fixture reports missing");
    legacyBundle.edgar.currentReports.value.data.releases[0]!.commitments!.find((t) => t.kind === "guarantees")!.asOf = "2026-07-26";
    expect(buildFilingDisclosures(legacyBundle)!.commitments!.find((r) => r.label === "SB Energy Corp. guarantees")!.asOf).toBeNull();
    expect(buildFilingDisclosures(legacyBundle)!.notes.join(" ")).toContain("including the SB Energy Corp. guarantees signed in August 2026");
    const recon = parseReconciliation(Q2_COMMENTARY);
    const at = (metric: string, periodEnd: string) => recon.find((f) => f.metric === metric && f.periodEnd === periodEnd && f.months === 3)?.value;
    expect([at("principal-payments-property-equipment", "2026-07-26"), at("equity-securities-gains", "2026-04-26"), at("non-gaap-diluted-eps", "2026-07-26")])
      .toEqual([59e6, 15_936e6, 2.22]);

    const bundle = nvdaBundle();
    expect(FilingDisclosuresSchema.parse(buildFilingDisclosures(bundle)).nonGaapBasisNote).toMatch(/no longer exclude stock-based compensation expense/);
    const payload = payloadOf(bundle);
    const record = (id: string) => payload.provenanceRegistry!.find((r) => r.id === id);
    expect(record("payload.issuer-filings.principal-payments-on-property-and-equipment-and-intangible-assets-three-months-ended-2026-07-26")).toMatchObject({ value: 59e6, currency: "USD" });
    expect(record("payload.issuer-filings.supply-and-capacity-future-commitments-as-of-2026-07-26")).toMatchObject({ value: 279e9, currency: "USD" });
    expect(payload.provenanceRegistry!.find((r) => r.label?.startsWith("SB Energy Corp. guarantees"))).toMatchObject({ value: 105e9, period: null });
    expect(record("computed.quarterly-trend.net-gains-from-equity-securities-quarter-ended-2026-07-26")).toMatchObject({ value: 7_771e6, currency: "USD" });
    expect(record("computed.quarterly-trend.non-gaap-diluted-eps-quarter-ended-2026-07-26")).toMatchObject({ value: 2.22, unit: "currency-per-share" });
  });

  it("dates guarantees only from their own table heading", () => {
    const text = "Future commitments by fiscal year as of July 26, 2026, were as follows: 2027 Total (In billions) Supply $ 1 1 Total $ 1 1. The following table summarizes maximum gross exposure related to our guarantees as of August 26, 2026 (in billions): Partner guarantees $ 105 Total $ 105";
    expect(parseCommitmentTables(text).find((t) => t.kind === "guarantees")).toMatchObject({ asOf: "2026-08-26", total: 105e9 });
  });

  it("validates a CFO guidance-track-record fact the gate then admits, and figures an 8-K or the commentary states in a sentence", async () => {
    const payload = payloadOf(nvdaBundle());
    const track = payload.provenanceRegistry!.find((r) => r.id === "computed.quarterly-trend.share-of-the-last-one-guided-quarter-with-revenue-above-the-prior-guided-range")!;
    expect(track).toMatchObject({ value: 100, unit: "percent", period: null, asOf: "2026-07-26" });
    const fact: SourcedClaim = { label: "FACT", text: "Colette M. Kress: the share of the last one guided quarter with revenue above the prior guided range was 100%.", source: track.id, asOf: track.asOf };
    const leadership: Leadership = {
      graded: { grade: "B", oneLineWhy: "Evidence is being checked.", reasoning: [], confidence: "low", keyNumbers: [] },
      executives: [{ name: "Colette M. Kress", title: "EVP and CFO", tenureYears: null, grade: "B", credibilityGrade: "A", reasoning: [], evidence: { guidanceVsActuals: [fact] } }],
      insiderSummary: [], governanceNotes: [],
    };
    // Six figures stated in a retained excerpt sentence were untraced on 2026-10-15; two of them.
    const keyNumbers = [
      { value: 105, unit: "USD billions: aggregate payment obligation", currency: "USD", period: "2026-08-17", source: "edgar:8-K 0001045810-26-000069", asOf: "2026-08-17", verified: null },
      { value: 31.6, unit: "USD billions: Inventory", currency: "USD", period: "2026-07-26", source: "edgar:8-K EX-99.2", asOf: "2026-08-26", verified: null },
    ];
    const result = await runVerifyPass({} as PassDeps, payload, { leadership, keyNumbers });
    expect(result.log.find((e) => e.path === "leadership.executives[0].evidence.guidanceVsActuals[0]")).toMatchObject({ validationStatus: "validated" });
    expect(result.verifiedReport.leadership.executives[0]).toMatchObject({ grade: "B", credibilityGrade: "A" });
    // A genuine track record stays eligible even if the model chooses another bucket.
    leadership.executives[0]!.evidence = { capitalAllocation: [fact] };
    const recategorized = await runVerifyPass({} as PassDeps, payload, { leadership });
    expect(recategorized.verifiedReport.leadership.executives[0]).toMatchObject({ grade: "B", credibilityGrade: "A" });
    expect(result.verifiedReport.keyNumbers.map((n) => n.verified)).toEqual([true, true]);
  });
});
