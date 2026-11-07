import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload, type ContextPayload } from "@/pipeline/stageC/payload";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const PERIOD = "2025-12-31";
const ACCESSION = "0000000001-26-000001";
const RELEASE_URL = "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/earnings.htm";

function fixture() {
  const bundle = completeCurrencyBundle({ symbol: "SYNTH" });
  if (!bundle.profile.ok || !bundle.statements.incomeQuarterly.ok) throw Error("fixture");
  bundle.profile.value.data.rows[0]!.isAdr = false;
  bundle.edgar.cik = { ok: true, value: { data: { cik: 1, cik10: "0000000001", ticker: "SYNTH", title: "Synthetic" },
    source: "edgar", endpoint: "fixture", asOf: "2026-01-01", fetchedAt: bundle.builtAt } };
  bundle.edgar.registrant = { cik10: "0000000001", name: "Synthetic", tickers: ["SYNTH"], exchanges: [], forms: ["8-K"],
    sic: null, sicDescription: null, fiscalYearEnd: "1231", stateOfIncorporation: null };
  const basisDay = bundle.builtAt.slice(0, 10);
  bundle.edgar.shareBasis = { basisDay, splits: { asOf: basisDay, vendor: { status: "retrieved", source: "fixture" },
    coverage: [{ from: "2020-01-01", to: basisDay }], events: [], unresolved: [], notes: [] } };
  const point = { start: "2025-10-01", end: PERIOD, val: -30e6, filed: "2026-02-01", form: "10-Q", fp: "Q4", fy: 2025, accn: "0000000001-26-000002" };
  bundle.edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "fixture", asOf: "2026-02-01", fetchedAt: bundle.builtAt,
    data: { cik: 1, entityName: "Synthetic", facts: { "us-gaap": {
      NetIncomeLoss: { units: { USD: [point] } }, Revenues: { units: { USD: [{ ...point, val: 100e6 }] } },
    } } } } };
  bundle.statements.incomeQuarterly.value.data.rows = [{ cik: "1", date: PERIOD, period: "Q4", reportedCurrency: "USD",
    netIncome: -30e6, eps: -2.8, epsDiluted: -2.7, weightedAverageShsOut: 11e6, weightedAverageShsOutDil: 12e6 }];
  const release = buildEarningsReleaseRecord({ filing: { accessionNumber: ACCESSION, filingDate: "2026-02-01" },
    releaseUrl: RELEASE_URL, commentaryUrl: null, commentaryText: null, includeNarrative: false,
    releaseText: `Synthetic Incorporated CONSOLIDATED STATEMENTS OF OPERATIONS (In millions, except per share data) (Unaudited)
      Three Months Ended Twelve Months Ended December 31, 2025 December 31, 2024 December 31, 2025 December 31, 2024
      Revenues $ 100 $ 90 $ 400 $ 360 Net income $ (30) $ 20 $ 80 $ 60
      Basic earnings (loss) per share $ (3.00) $ 2.00 $ 8.00 $ 6.00
      Diluted earnings (loss) per share $ (3.00) $ 1.82 $ 7.27 $ 5.45
      Shares used in per share calculations: Basic 10 10 10 10 Diluted 10 11 11 11
      CONSOLIDATED STATEMENTS OF CASH FLOWS` });
  bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [release], events: [], notes: [] },
    source: "edgar", endpoint: "fixture", asOf: "2026-02-01", fetchedAt: bundle.builtAt } };
  return bundle;
}

function cell(payload: ContextPayload, label: string) {
  return payload.statements.find(block => block.title === "Income statement — quarterly")!
    .lineItems.find(line => line.lineItem === label)!.byPeriod.find(value => value.period === PERIOD)!;
}

describe("release quarterly earnings across calculation, disclosure and analyst payload", () => {
  it("carries the admitted values and SEC lineage into statement cells and the verifier registry without mutating inputs", () => {
    const bundle = fixture(), before = structuredClone(bundle);
    const computed = runStageB(bundle);
    const disclosure = buildFilingDisclosures(bundle);
    const payload = assembleContextPayload(bundle, computed, validateBundle(bundle));
    expect(disclosure?.quarterlyTrend.find(row => row.periodEnd === PERIOD)?.epsDiluted).toBe(-3);
    expect(computed.gaps).toContainEqual(expect.objectContaining({
      field: `statements.income.${PERIOD}.epsDiluted.releaseReconciliation`,
      reason: expect.stringContaining("vendor -2.7, filed -3"),
    }));
    for (const [label, value, unit] of [["diluted EPS", -3, "currency-per-share"], ["diluted shares", 10e6, "shares"]] as const) {
      const figure = cell(payload, label);
      expect(figure).toMatchObject({ value, source: "edgar:income-statement(quarter)", currency: "USD",
        periodContext: { kind: "duration", basis: "fiscal-quarter", start: "2025-10-01", end: PERIOD } });
      expect(payload.provenanceRegistry?.find(record => record.id === figure.provenanceId)).toMatchObject({
        value, unit, origin: "edgar:income-statement(quarter)", period: PERIOD,
        periodContext: { kind: "duration", start: "2025-10-01", end: PERIOD },
      });
    }
    const reconciliation = payload.missingData.find(gap => gap.field === `statements.income.${PERIOD}.epsDiluted.releaseReconciliation`);
    expect(reconciliation?.reason).toContain(`8-K ${ACCESSION} EX-99.1`);
    expect(reconciliation?.reason).toContain(RELEASE_URL);
    expect(reconciliation?.reason).toContain("vendor -2.7, filed -3");
    expect(bundle).toEqual(before);
  });

  it.each(["unbound source", "missing monetary proof", "independent refusal"] as const)("preserves %s instead of attributing a repair to SEC", failure => {
    const bundle = fixture();
    if (!bundle.edgar.currentReports?.ok || !bundle.statements.incomeQuarterly.ok) throw Error("fixture");
    if (failure === "unbound source") bundle.edgar.currentReports.value.data.releases[0]!.quarterlyEarnings![0]!.source!.url = "https://example.com/earnings.htm";
    if (failure === "missing monetary proof") bundle.edgar.companyFacts = { ok: false, gap: { field: "fixture", reason: "missing", severity: "info" } };
    if (failure === "independent refusal") bundle.statements.incomeQuarterly.value.data.rows[0]!.fieldConflicts = {
      epsDiluted: { usable: false, vendorValue: -2.7, secValue: null, reason: "Unresolved independent share basis" },
    };
    const before = structuredClone(bundle);
    const payload = assembleContextPayload(bundle, runStageB(bundle), validateBundle(bundle));
    expect(cell(payload, "diluted EPS").value).toBe(failure === "independent refusal" ? null : -2.7);
    expect(cell(payload, "diluted EPS").source).toBeUndefined();
    expect(cell(payload, "diluted shares").value).toBe(12e6);
    expect(payload.missingData.some(gap => gap.field.endsWith("releaseReconciliation"))).toBe(false);
    expect(bundle).toEqual(before);
  });
});
