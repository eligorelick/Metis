import { describe, expect, it } from "vitest";
import { retainedCommonClassAmbiguity } from "@/pipeline/stageB/commonClassScope";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { applyMultiples } from "@/pipeline/stageC/passes";
import { buildDataCompleteness } from "@/report/completeness";
import { ReportSchema } from "@/report/schema";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const annualDates = "December 31, 2025 and 2024";
const currentDates = "March 31, 2026 and December 31, 2025";
const event = 'On May 15, 2025, all authorized shares of the Company’s Class D common stock were eliminated and the Company’s Class C common stock was renamed to “common stock,” pursuant to the terms of the Company’s amended and restated certificate of incorporation.';
const alias = 'Unless otherwise noted, all references herein to the Company’s common stock refer to the Class C common stock prior to the effectiveness of the certificate.';
const annualRow = `Common stock; $0.001 par value per share; 900 Class C shares authorized; 125 and 115 shares issued as of ${annualDates}, respectively; 120 and 110 shares outstanding as of ${annualDates}, respectively; zero and 80 Class D shares authorized as of ${annualDates}, respectively, zero shares issued and outstanding as of each of ${annualDates} (1) 1 1`;
const currentRow = `Common stock; $0.001 par value per share; 900 shares authorized; 135 and 125 shares issued as of ${currentDates}, respectively; 130 and 120 shares outstanding as of ${currentDates}, respectively 1 1`;
const statement = (row: string, dates: string, footnote = "") => `EXAMPLE INC. CONSOLIDATED BALANCE SHEETS (in thousands, except per share data) ${dates} Assets Cash 25 20 Total assets 200 180 Stockholders’ equity: ${row} Treasury stock 1 1 Additional paid-in capital 100 90 Total stockholders’ equity 150 140 (1) ${footnote} See accompanying notes. CONSOLIDATED STATEMENTS OF OPERATIONS Revenue 50 40`;

function fixture() {
  const b = completeCurrencyBundle({ debt: 300 });
  b.edgar.registrant = { cik10: "0000000042", name: "Example Inc.", tickers: [b.symbol], exchanges: ["NYSE"], sic: "3571", sicDescription: null, fiscalYearEnd: "1231", stateOfIncorporation: null, forms: ["10-K", "10-Q"] };
  if (!b.profile.ok || !b.quote.ok) throw Error("fixture");
  Object.assign(b.profile.value.data.rows[0]!, { cik: "0000000042", symbol: b.symbol });
  b.quote.value.data.rows[0]!.timestamp = Date.parse("2026-07-02T16:00:00Z") / 1000;
  const section = (kind: "tenKNotes" | "tenQNotes", text: string) => {
    const annual = kind === "tenKNotes", accession = annual ? "0000000042-26-000001" : "0000000042-26-000002";
    const documentUrl = `https://www.sec.gov/Archives/edgar/data/42/${accession.replaceAll("-", "")}/example.htm`;
    return { ok: true as const, value: { source: "edgar" as const, endpoint: `${documentUrl} (notes)`, fetchedAt: b.builtAt, asOf: annual ? "2025-12-31" : "2026-03-31", data: {
      form: annual ? "10-K" : "10-Q", accession, documentUrl, filingDate: annual ? "2026-02-06" : "2026-05-06", reportDate: annual ? "2025-12-31" : "2026-03-31",
      sectionName: kind, method: "header-regex" as const, chars: 5, text: "Notes", statementsText: text,
    } } };
  };
  b.edgar.tenKNotes = section("tenKNotes", statement(annualRow, "December 31, 2025 December 31, 2024", `${event} ${alias}`));
  b.edgar.tenQNotes = section("tenQNotes", statement(currentRow, "March 31, 2026 December 31, 2025"));
  return b;
}

describe("historical class names in current scope", () => {
  it.each([false, true])("recognizes an effective elimination and rename with dated zero and current positive rows (renamed labels: %s)", alternate => {
    const b = fixture();
    if (alternate) for (const m of [b.edgar.tenKNotes, b.edgar.tenQNotes]) if (m?.ok) m.value.data.statementsText = m.value.data.statementsText!.replaceAll("Class C", "Class X").replaceAll("Class D", "Class Z").replaceAll("120", "740").replaceAll("130", "760");
    const original = JSON.stringify(b);
    expect(retainedCommonClassAmbiguity(b)).toBeNull();
    expect(JSON.stringify(b)).toBe(original);
  });

  it.each([
    "newer omission only", "newer omits the capital row", "current second class", "only comparative zero", "zero authorization only", "issued zero only",
    "future elimination", "conditional elimination", "conditional tail", "conversion possibility", "missing effective date", "invalid effective date", "ambiguous report date", "report/header mismatch", "current row dates mismatch",
    "wrong issuer", "wrong symbol", "wrong document issuer", "wrong accession", "wrong provider", "future filing", "event after report", "quote before event",
    "renamed class with another live class", "current cover contradiction", "unnamed cover ambiguity", "current positive elsewhere", "unproved source on latest report",
    "different table issuer", "contradictory outstanding tail", "later positive outside capital", "duplicate effective date", "unknown later report date",
  ])("retains refusal for %s", condition => {
    const b = fixture();
    if (!b.edgar.tenKNotes?.ok || !b.edgar.tenQNotes?.ok || !b.profile.ok || !b.quote.ok) throw Error("fixture");
    const annual = b.edgar.tenKNotes.value.data, current = b.edgar.tenQNotes.value.data;
    const replace = (from: string, to: string) => { annual.statementsText = annual.statementsText!.replace(from, to); };
    if (condition === "newer omission only") replace(event, "The charter permits conversion of Class D common stock into Class C common stock.");
    if (condition === "newer omits the capital row") current.statementsText = "Consolidated Balance Sheets Assets Cash 25 20";
    if (condition === "current second class") current.statementsText = statement(`${currentRow} Class D common stock; 9 shares outstanding as of March 31, 2026.`, "March 31, 2026 December 31, 2025");
    if (condition === "only comparative zero") replace(`zero shares issued and outstanding as of each of ${annualDates}`, "zero and 9 shares issued and outstanding as of December 31, 2024 and 2025, respectively");
    if (condition === "zero authorization only") replace(`, zero shares issued and outstanding as of each of ${annualDates}`, "");
    if (condition === "issued zero only") replace(`zero shares issued and outstanding as of each`, "zero shares issued as of each");
    if (condition === "future elimination") replace("On May 15, 2025", "On May 15, 2027");
    if (condition === "conditional elimination") replace("On May 15, 2025, all", "If approved on May 15, 2025, all");
    if (condition === "conditional tail") replace("certificate of incorporation.", "certificate of incorporation, subject to stockholder approval.");
    if (condition === "conversion possibility") replace("were eliminated", "may be converted");
    if (condition === "missing effective date") replace("On May 15, 2025, ", "");
    if (condition === "invalid effective date") replace("May 15, 2025", "February 30, 2025");
    if (condition === "ambiguous report date") annual.reportDate = "2025-12";
    if (condition === "report/header mismatch") annual.reportDate = "2025-11-30";
    if (condition === "current row dates mismatch") current.statementsText = current.statementsText!.replaceAll(currentDates, "March 31, 2025 and December 31, 2024");
    if (condition === "wrong issuer") b.profile.value.data.rows[0]!.cik = "0000000043";
    if (condition === "wrong symbol") b.profile.value.data.rows[0]!.symbol = "OTHER";
    if (condition === "wrong document issuer") annual.documentUrl = annual.documentUrl.replace("/42/", "/43/");
    if (condition === "wrong accession") annual.accession = "0000000042-26-000099";
    if (condition === "wrong provider") b.edgar.tenKNotes.value.source = "fmp";
    if (condition === "future filing") { current.statementsText = annual.statementsText; annual.filingDate = "2027-02-06"; }
    if (condition === "event after report") replace("May 15, 2025", "January 15, 2026");
    if (condition === "quote before event") b.quote.value.data.rows[0]!.timestamp = Date.parse("2025-04-01T16:00:00Z") / 1000;
    if (condition === "renamed class with another live class") replace("Treasury stock", "Class E common stock; 7 shares outstanding as of December 31, 2025. Treasury stock");
    if (condition === "current cover contradiction") b.edgar.economicShareInventory = [{ source: { ...current, hash: "synthetic" }, classes: [], evidence: null, reason: "unresolved", passages: { inventory: "", rights: null }, observations: [{ classId: "us-gaap:CommonClassDMember", shares: 9, asOf: "2026-04-30", contextId: "d", sourceId: "cover#d" }] }];
    if (condition === "unnamed cover ambiguity") b.gaps.push({ field: "keyless.sharesOutstanding.classes", severity: "info", reason: "unnamed classes", attemptedSources: ["cover"] });
    if (condition === "current positive elsewhere") annual.statementsText += " Class D common stock has 8 shares outstanding as of December 31, 2025.";
    if (condition === "unproved source on latest report") current.documentUrl = current.documentUrl.replace("/42/", "/43/");
    if (condition === "different table issuer") replace("EXAMPLE INC.", "SUBSIDIARY INC.");
    if (condition === "contradictory outstanding tail") replace(`${annualDates} (1) 1 1`, `${annualDates}, but 9 shares are now outstanding (1) 1 1`);
    if (condition === "later positive outside capital") current.statementsText += " Class D common stock has 8 shares outstanding as of March 31, 2026.";
    if (condition === "duplicate effective date") annual.statementsText += ` ${event.replace("May 15", "May 16")}`;
    if (condition === "unknown later report date") current.reportDate = "unknown";
    expect(retainedCommonClassAmbiguity(b)).not.toBeNull();
  });

  it("preserves independent currency and ADR per-share prerequisites after clearing historical labels", () => {
    const currency = fixture();
    if (!currency.profile.ok) throw Error("fixture");
    currency.profile.value.data.rows[0]!.currency = "EUR";
    expect(retainedCommonClassAmbiguity(currency)).toBeNull();
    const c = runStageB(currency);
    expect(c.returns.wacc.waccPct).toBeNull();
    expect(c.gaps.some(g => /currency/.test(g.field))).toBe(true);
    const adr = fixture();
    if (!adr.profile.ok) throw Error("fixture");
    adr.profile.value.data.rows[0]!.isAdr = true;
    expect(retainedCommonClassAmbiguity(adr)).toBeNull();
    const result = runStageB(adr);
    expect(result.valuation.multiples!.enterpriseValue.value).toBeNull();
    expect(result.fairValue.status).toBe("suppressed");
  });

  it("carries only the supported scope change through WACC, completeness, payload and exports", () => {
    const b = fixture(), original = JSON.stringify(b), c = runStageB(b);
    expect(c.returns.wacc.waccPct).not.toBeNull();
    expect(c.gaps.some(g => g.field === "returns.wacc.weights")).toBe(false);
    expect(buildDataCompleteness(c.gaps).state).toBe("degraded");
    expect(c.valuation.multiples!.enterpriseValue.equityScope!.status).toBe("unverified-vendor-scope");
    const payload = assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] });
    expect(serializePayloadForPrompt(payload)).not.toContain("may cover one share class only");
    const report = loadTask28Fixture();
    report.valuation = applyMultiples(report.valuation, c.valuation);
    const stored = ReportSchema.parse(report);
    for (const surface of [reportToMarkdown(stored), reportToPrintHtml(stored, { autoPrint: false }), reportToAuditMarkdown(stored)]) {
      expect(surface).toContain("all-class economic coverage is not independently established");
      expect(surface).not.toContain("capital statement identifies multiple common classes");
    }
    expect(JSON.stringify(b)).toBe(original);
    if (!b.edgar.tenKNotes?.ok) throw Error("fixture");
    b.edgar.tenKNotes.value.data.statementsText = b.edgar.tenKNotes.value.data.statementsText!.replace(event, "Class C common stock and Class D common stock have unresolved current status.");
    const refused = runStageB(b);
    expect(refused.returns.wacc.waccPct).toBeNull();
    expect(buildDataCompleteness(refused.gaps).state).toBe("blocked");
    expect(serializePayloadForPrompt(assembleContextPayload(b, refused, { checks: [], flags: [], gaps: [] }))).toContain("may cover one share class only");
  });
});
