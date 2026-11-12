/**
 * accuracy:check logic (scripts/accuracy): filed-fact selection, TTM
 * construction, classification through the P8 owner, expectation diffing and
 * the CLI's pass/fail. Everything runs on small synthetic fixtures: the real
 * check needs the local golden run, which CI does not have.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateReferenceCutoff } from "../scripts/accuracy/check";
import { buildEntry } from "../scripts/accuracy/fetch";
import { extractFigures } from "../scripts/accuracy/figures";
import type { ReferenceFile } from "../scripts/accuracy/files";
import {
  buildTtm,
  classifyFigure,
  cutoffDate,
  diffExpectation,
  latestFiscalYearEnd,
  mergeFacts,
  parseXbrlInstance,
  scanXbrlInstance,
  selectDuration,
  selectInstant,
  updateExpectation,
  valueHash,
  type CompanyFacts,
  type ExpectationEntry,
  type InstanceFact,
  type SecFact,
} from "../scripts/accuracy/lib";
import { DEFAULT_RECIPES, resolveReference, type CompanyConfig, type Recipe } from "../scripts/accuracy/recipes";

const K = "0000000001-26-000001"; // 10-K
const Q = "0000000001-26-000002"; // 10-Q
const LATE = "0000000001-26-000003"; // filed after the cutoff

function facts(rows: Record<string, Record<string, SecFact[]>>): CompanyFacts {
  const out: CompanyFacts = { facts: { "us-gaap": {} } };
  for (const [concept, units] of Object.entries(rows)) out.facts["us-gaap"]![concept] = { units };
  return out;
}

const fact = (start: string | undefined, end: string, val: number, accn: string, form: string, filed: string): SecFact =>
  ({ ...(start ? { start } : {}), end, val, accn, form, filed });

const FLOWS = facts({
  OperatingIncomeLoss: {
    USD: [
      fact("2025-01-01", "2025-12-31", 80_000_000_000, K, "10-K", "2026-02-06"),
      fact("2026-01-01", "2026-06-30", 51_000_000_000, Q, "10-Q", "2026-07-31"),
      fact("2025-01-01", "2025-06-30", 37_000_000_000, Q, "10-Q", "2026-07-31"),
      fact("2026-01-01", "2026-09-30", 80_000_000_000, LATE, "10-Q", "2026-10-30"),
      fact("2025-01-01", "2025-09-30", 55_000_000_000, LATE, "10-Q", "2026-10-30"),
    ],
  },
  EarningsPerShareDiluted: { "USD/shares": [fact("2025-01-01", "2025-12-31", 7.17, K, "10-K", "2026-02-06")] },
  Cash: { USD: [fact(undefined, "2026-06-30", 70, Q, "10-Q", "2026-07-31")] },
});

describe("filed-fact selection", () => {
  it("builds a TTM as fiscal year + year to date − prior-year year to date from one 10-Q (P1)", () => {
    const ttm = buildTtm(FLOWS, ["OperatingIncomeLoss"], "USD", "2025-12-31", "2026-06-30", "2026-10-29");
    expect(ttm?.value).toBe(94_000_000_000);
    expect(ttm?.operands.map((operand) => operand.point.accn)).toEqual([K, Q, Q]);
    expect(ttm?.operands.map((operand) => operand.sign)).toEqual([1, 1, -1]);
  });

  it("refuses a TTM whose year-to-date operands are not in one filing", () => {
    const split = facts({ OperatingIncomeLoss: { USD: [
      fact("2025-01-01", "2025-12-31", 80, K, "10-K", "2026-02-06"),
      fact("2026-01-01", "2026-06-30", 51, Q, "10-Q", "2026-07-31"),
      fact("2025-01-01", "2025-06-30", 37, "0000000001-25-000009", "10-Q", "2025-08-01"),
    ] } });
    expect(buildTtm(split, ["OperatingIncomeLoss"], "USD", "2025-12-31", "2026-06-30", "2026-10-29")).toBeNull();
  });

  it("keeps a filing dated after the cutoff out (P2)", () => {
    expect(buildTtm(FLOWS, ["OperatingIncomeLoss"], "USD", "2025-12-31", "2026-09-30", "2026-10-29")).toBeNull();
    expect(buildTtm(FLOWS, ["OperatingIncomeLoss"], "USD", "2025-12-31", "2026-09-30", "2026-10-30")?.value).toBe(105_000_000_000);
  });

  it("takes the newest filing before the cutoff and records an earlier different value as a restatement", () => {
    const restated = facts({ Cash: { USD: [
      fact(undefined, "2025-12-31", 100, K, "10-K", "2026-02-06"),
      fact(undefined, "2025-12-31", 104, Q, "10-Q", "2026-07-31"),
      fact(undefined, "2025-12-31", 999, LATE, "10-Q", "2026-10-30"),
    ] } });
    const point = selectInstant(restated, ["Cash"], "USD", "2025-12-31", "2026-10-29");
    expect(point?.val).toBe(104);
    expect(point?.restated).toEqual([{ accn: K, filed: "2026-02-06", val: 100 }]);
  });

  it("reads the cutoff's UTC day as the last admissible filing date", () => {
    expect(cutoffDate("2026-10-21T23:21:07.278Z")).toBe("2026-10-21");
  });

  it("matches a fiscal year by duration class and a per-share unit exactly", () => {
    expect(selectDuration(FLOWS, ["EarningsPerShareDiluted"], "USD/shares", { end: "2025-12-31", durationDays: { min: 350, max: 380 } }, "2026-10-29")?.val).toBe(7.17);
  });
});

describe("filed reference recipes", () => {
  const ctx = (recipe: Recipe, period: string, cutoff = "2026-10-29") => resolveReference(recipe, period, FLOWS, "USD", cutoff);

  it("never rebuilds a per-share TTM (P1)", () => {
    const result = ctx({ op: "flow", concepts: ["EarningsPerShareDiluted"], unit: "USD/shares" }, "TTM:2025-07-01..2026-06-30");
    expect("reason" in result && result.reason).toMatch(/not additive/);
  });

  it("states the TTM window it actually built", () => {
    const result = ctx({ op: "flow", concepts: ["OperatingIncomeLoss"] }, "TTM:2025-07-01..2026-06-30");
    expect("reason" in result ? result.reason : result.period).toBe("TTM:2025-07-01..2026-06-30");
  });

  it("composes a balance from one filing and records an absent line as none presented", () => {
    const balance = facts({
      Debt: { USD: [fact(undefined, "2026-06-30", 10, Q, "10-Q", "2026-07-31"), fact(undefined, "2026-06-30", 11, LATE, "10-Q", "2026-07-01")] },
      Cash: { USD: [fact(undefined, "2026-06-30", 4, Q, "10-Q", "2026-07-31")] },
    });
    const recipe: Recipe = { op: "sum", terms: [
      { role: "debt", sign: 1, recipe: { op: "instant", concepts: ["Debt"] } },
      { role: "cash", sign: -1, recipe: { op: "instant", concepts: ["Cash"] } },
    ] };
    const result = resolveReference(recipe, "@2026-06-30", balance, "USD", "2026-10-29");
    expect("reason" in result ? result.reason : result.value).toBe(6);
    // An absent NCI line is a filed zero only once the filing's own instance shows no other NCI disclosure.
    const unread = resolveReference({ op: "instant", concepts: ["MinorityInterest"], absence: "noncontrolling-interest" }, "@2026-06-30", balance, "USD", "2026-10-29");
    expect(unread).toMatchObject({ needsInstance: [Q] });
    const clean = [{ name: "Cash", unit: "USD", end: "2026-06-30", val: 4, members: [] }];
    const none = resolveReference({ op: "instant", concepts: ["MinorityInterest"], absence: "noncontrolling-interest" }, "@2026-06-30", balance, "USD", "2026-10-29", { [Q]: clean });
    expect("reason" in none ? none.reason : none.value).toBe(0);
  });
});

describe("classification uses the P8 owner", () => {
  const usd = { unit: "currency" as const, currency: "USD" };
  it("treats a filer reporting unit as the same observation and a percent-scale gap as a mismatch", () => {
    const filed = { kind: "filed" as const, value: 5_749_377_000, ...usd };
    expect(classifyFigure({ metis: 5_749_400_000, metisPeriod: "FY:2025-12-31", metisMeasure: usd, reference: filed, referencePeriod: "FY:2025-12-31" }).status).toBe("match");
    expect(classifyFigure({ metis: 5_810_000_000, metisPeriod: "FY:2025-12-31", metisMeasure: usd, reference: filed, referencePeriod: "FY:2025-12-31" }).status).toBe("mismatch");
  });

  it("lets a derived value use its operands' rounding, capped at 1%", () => {
    const derived = { kind: "derived" as const, value: 302_970_000_000, operands: [215_938_000_000, 180_000_000_000, 92_968_000_000], ...usd };
    expect(classifyFigure({ metis: 302_969_000_000, metisPeriod: "TTM:a..b", metisMeasure: usd, reference: derived, referencePeriod: "TTM:a..b" }).status).toBe("match");
    const small = { kind: "derived" as const, value: 1_000_000, operands: [3_000_000, 2_000_000], ...usd };
    expect(classifyFigure({ metis: 2_000_000, metisPeriod: "p", metisMeasure: usd, reference: small, referencePeriod: "p" }).status).toBe("mismatch");
  });

  it("reports a withheld figure as a gap, an unproven reference as not established, and another period as a mismatch", () => {
    expect(classifyFigure({ metis: null, metisPeriod: "p", metisMeasure: usd, reference: null, referencePeriod: null }).status).toBe("gap");
    expect(classifyFigure({ metis: 1, metisPeriod: "p", metisMeasure: usd, reference: null, referencePeriod: null }).status).toBe("not-established");
    const result = classifyFigure({ metis: 223.35, metisPeriod: "FY:2024-12-31", metisMeasure: usd, reference: { kind: "filed", value: 223.35, ...usd }, referencePeriod: "FY:2025-12-31" });
    expect(result).toMatchObject({ status: "mismatch" });
    expect(result.detail).toMatch(/period/);
  });
});

describe("expectation diffing", () => {
  const entry = (figure: string, status: ExpectationEntry["status"], value: number | null): ExpectationEntry =>
    ({ case: "c", figure, status, valueSha256: status === "match" ? null : valueHash(value) });
  const expected = [entry("a", "match", 1), entry("b", "mismatch", 5), entry("c", "gap", null), entry("d", "mismatch", 7)];

  it("passes an unchanged run and a match whose value moved but is still proven", () => {
    expect(diffExpectation(expected, [
      { case: "c", figure: "a", status: "match", metis: 2 },
      { case: "c", figure: "b", status: "mismatch", metis: 5 },
      { case: "c", figure: "c", status: "gap", metis: null },
      { case: "c", figure: "d", status: "mismatch", metis: 7 },
    ])).toEqual([]);
  });

  it("names worse, better, changed, new and missing figures", () => {
    const differences = diffExpectation(expected, [
      { case: "c", figure: "a", status: "mismatch", metis: 3 },
      { case: "c", figure: "b", status: "match", metis: 4 },
      { case: "c", figure: "c", status: "gap", metis: null },
      { case: "c", figure: "e", status: "gap", metis: null },
    ]);
    expect(differences.map((d) => `${d.figure}:${d.kind}`)).toEqual(["a:worse", "b:better", "e:new figure", "d:missing figure"]);
    const changed = diffExpectation(expected, [{ case: "c", figure: "d", status: "mismatch", metis: 8 }]);
    expect(changed[0]).toMatchObject({ figure: "d", kind: "changed value" });
  });

  it("ranks a gap above a mismatch: withholding a wrong value is better", () => {
    expect(diffExpectation([entry("b", "mismatch", 5)], [{ case: "c", figure: "b", status: "gap", metis: null }])[0]?.kind).toBe("better");
    expect(diffExpectation([entry("c", "gap", null)], [{ case: "c", figure: "c", status: "mismatch", metis: 9 }])[0]?.kind).toBe("worse");
  });

  it("needs a reason to update, and stamps it only on changed entries", () => {
    expect(() => updateExpectation(expected, [], " ")).toThrow(/reason/);
    const updated = updateExpectation(expected, [
      { case: "c", figure: "a", status: "match", metis: 1 },
      { case: "c", figure: "b", status: "match", metis: 4 },
    ], "fixed in the owner");
    expect(updated).toEqual([
      { case: "c", figure: "a", status: "match", valueSha256: null },
      { case: "c", figure: "b", status: "match", valueSha256: null, changeReason: "fixed in the owner" },
    ]);
  });

  it("hashes values, never stores them", () => {
    expect(valueHash(283_604_000)).toMatch(/^[0-9a-f]{16}$/);
    expect(valueHash(283_604_000)).not.toContain("283604000");
  });
});

describe("XBRL instance fallback", () => {
  const xml = `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:xbrldi="http://xbrl.org/2006/xbrldi">
    <xbrli:context id="d"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-09-30</xbrli:endDate></xbrli:period></xbrli:context>
    <xbrli:context id="i"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2026-09-30</xbrli:instant></xbrli:period></xbrli:context>
    <xbrli:context id="seg"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="dei:LegalEntityAxis">sub</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>2026-09-30</xbrli:instant></xbrli:period></xbrli:context>
    <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
    <xbrli:unit id="ps"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>
    <us-gaap:NetIncomeLoss contextRef="d" unitRef="usd" decimals="-6">1500000000</us-gaap:NetIncomeLoss>
    <us-gaap:EarningsPerShareDiluted contextRef="d" unitRef="ps" decimals="2">1.95</us-gaap:EarningsPerShareDiluted>
    <us-gaap:LongTermDebtNoncurrent contextRef="i" unitRef="usd" decimals="-6">84332000000</us-gaap:LongTermDebtNoncurrent>
    <us-gaap:LongTermDebtNoncurrent contextRef="seg" unitRef="usd" decimals="-6">1000000</us-gaap:LongTermDebtNoncurrent>
    <us-gaap:MinorityInterest contextRef="i" unitRef="usd" xsi:nil="true"></us-gaap:MinorityInterest>
  </xbrli:xbrl>`;

  it("keeps non-dimensional facts in companyfacts shape and drops segments and nils", () => {
    const parsed = parseXbrlInstance(xml, { accn: Q, form: "10-Q", filed: "2026-11-05" });
    expect(parsed.facts["us-gaap"]?.NetIncomeLoss?.units.USD).toEqual([{ start: "2026-01-01", end: "2026-09-30", val: 1_500_000_000, accn: Q, form: "10-Q", filed: "2026-11-05" }]);
    expect(parsed.facts["us-gaap"]?.EarningsPerShareDiluted?.units["USD/shares"]?.[0]?.val).toBe(1.95);
    expect(parsed.facts["us-gaap"]?.LongTermDebtNoncurrent?.units.USD).toHaveLength(1);
    expect(parsed.facts["us-gaap"]?.MinorityInterest).toBeUndefined();
    const merged = mergeFacts(FLOWS, parsed);
    expect(merged.facts["us-gaap"]?.OperatingIncomeLoss?.units.USD).toHaveLength(5);
    expect(merged.facts["us-gaap"]?.NetIncomeLoss?.units.USD).toHaveLength(1);
  });
});

describe("figure extraction", () => {
  const stageB = {
    route: { base: "general" },
    capital: {
      asOf: "2025-12-31",
      interestCoverage: { ebit: 80 },
      fcf: { series: [{ date: "2025-12-31", netIncome: 70, fcfBeforeSbc: 5 }] },
      dilution: { asOf: "2025-12-31", dilutedShares: 10 },
      capexIntensity: { series: [{ date: "2025-12-31", capex: 9 }] },
      current: { asOf: "2026-06-30", periodStart: "2025-07-01", basis: "ttm", currency: "USD", ebit: 94, netIncome: null, cashBridge: { operatingCashFlow: 160, cashCapitalExpenditure: -170, standardizedFcf: -10, definition: "Consolidated FCF conversion is withheld because a complete consolidated earnings window is not established." }, debtBridge: { cashAndShortTermInvestments: 120, totalDebtIncludingLeases: 240 } },
    },
    growth: { revenueCagrs: [{ endDate: "2025-12-31", endValue: 700 }], epsDilutedCagrs: [{ endDate: "2024-12-31", endValue: 1.5 }] },
    gaps: [],
    valuation: { kind: "multiples" },
    fairValue: { status: "available" },
  };

  it("reads value, period and currency from the stored output, flips capex to an outflow and holds stale years to the latest", () => {
    const figures = extractFigures(stageB, { filingDisclosures: { currency: "USD" } });
    const byId = new Map(figures.map((figure) => [figure.id, figure]));
    expect(byId.get("revenue.fy")).toMatchObject({ value: 700, period: "FY:2025-12-31", currency: "USD" });
    expect(byId.get("capex.ttm")).toMatchObject({ value: 170, period: "TTM:2025-07-01..2026-06-30" });
    expect(byId.get("epsDiluted.fy")).toMatchObject({ value: 1.5, period: "FY:2024-12-31", referencePeriod: "FY:2025-12-31" });
    expect(byId.get("netIncome.ttm")?.value).toBeNull();
    expect(byId.get("netIncome.ttm")?.reportNote).toMatch(/withheld/);
    expect(byId.has("fv.startRevenue")).toBe(false);
  });
});

describe("accuracy CLIs", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });
  const run = (script: string, args: string[]) => spawnSync(process.execPath, ["--import", "tsx", path.join(process.cwd(), "scripts", "accuracy", script), ...args], { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 });

  it("accuracy:fetch refuses to touch the network without --network", () => {
    const result = run("fetch.ts", ["--run", "tmp/none"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--network/);
  });

  it("accuracy:check passes on the expectation and fails, naming the figure, when a value turns worse", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "accuracy-check-test-"));
    dirs.push(root);
    const caseDir = path.join(root, "run", "amzn-data-only");
    fs.mkdirSync(caseDir, { recursive: true });
    const stageB = { route: { base: "general" }, capital: { asOf: "2025-12-31", interestCoverage: { ebit: 79_975_000_000 } }, growth: {}, gaps: [], valuation: { kind: "multiples" }, fairValue: { status: "available" } };
    fs.writeFileSync(path.join(caseDir, "stageB.json"), JSON.stringify(stageB));
    fs.writeFileSync(path.join(caseDir, "report.json"), JSON.stringify({ filingDisclosures: { currency: "USD" }, meta: { evidenceTiming: { cutoffAt: "2026-10-29T15:09:25.377Z" } } }));
    const reference = { about: "", source: "", builtFrom: "", cases: { "amzn-data-only": { ticker: "AMZN", cik: 1, entityName: null, cutoffAt: "2026-10-29T09:00:00.000Z", currency: "USD" } }, entries: [
      { case: "amzn-data-only", figure: "operatingIncome.fy", period: "FY:2025-12-31", value: 79_975_000_000, kind: "filed", unit: "currency", currency: "USD", operands: [79_975_000_000], points: [], notes: [] },
    ] };
    const referenceFile = path.join(root, "reference.json");
    fs.writeFileSync(referenceFile, JSON.stringify(reference));
    const expectationFile = path.join(root, "expectation.json");
    const args = [path.join(root, "run"), "--reference", referenceFile, "--expectation", expectationFile];

    expect(run("check.ts", [...args, "--update-expectation"]).status).toBe(1);
    expect(run("check.ts", [...args, "--update-expectation", "--reason", "synthetic baseline"]).status).toBe(0);
    const pass = run("check.ts", args);
    expect(pass.status).toBe(0);
    expect(pass.stdout).toContain("every figure as expected");

    fs.writeFileSync(path.join(caseDir, "stageB.json"), JSON.stringify({ ...stageB, capital: { ...stageB.capital, interestCoverage: { ebit: 81_000_000_000 } } }));
    const fail = run("check.ts", args);
    expect(fail.status).toBe(1);
    expect(fail.stdout).toContain("WORSE: amzn-data-only operatingIncome.fy — match -> mismatch");

    // A run whose cutoff is not the one the reference was built for fails loudly, naming the case and both cutoffs.
    fs.writeFileSync(path.join(caseDir, "report.json"), JSON.stringify({ filingDisclosures: { currency: "USD" }, meta: { evidenceTiming: { cutoffAt: "2026-08-01T12:00:00.000Z" } } }));
    const stale = run("check.ts", args);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain("amzn-data-only");
    expect(stale.stderr).toContain("2026-08-01T12:00:00.000Z");
    expect(stale.stderr).toContain("2026-10-29T09:00:00.000Z");
    expect(stale.stderr).toMatch(/rebuild the filed reference/);
  });
});

describe("review round 1: the reference is valid only for its own cutoff (P2)", () => {
  const reference = (cutoffAt: string, filed = "2026-07-31"): ReferenceFile => ({
    about: "", source: "", builtFrom: "",
    cases: { c: { ticker: "C", cik: 1, entityName: null, cutoffAt, currency: "USD" } },
    entries: [{ case: "c", figure: "cash", period: "@2026-06-30", value: 70, kind: "filed", unit: "currency", currency: "USD", points: [{ concept: "Cash", unit: "USD", end: "2026-06-30", val: 70, form: "10-Q", accn: Q, filed, role: "filed line", sign: 1 }] }],
  });

  it("accepts a run whose cutoff falls on the reference's cutoff day", () => {
    const ref = reference("2026-10-29T01:00:00.000Z");
    expect(() => validateReferenceCutoff("c", "2026-10-29T23:59:00.000Z", ref, ref.entries)).not.toThrow();
  });

  it("refuses a reference built for another cutoff, naming the case and both cutoffs", () => {
    const ref = reference("2026-10-29T01:00:00.000Z");
    expect(() => validateReferenceCutoff("c", "2026-07-15T00:00:00.000Z", ref, ref.entries)).toThrow(/c: the run's evidence cutoff 2026-07-15T00:00:00.000Z differs from the cutoff the filed reference was built for \(2026-10-29T01:00:00.000Z\); rebuild/);
    expect(() => validateReferenceCutoff("c", "2026-11-30T00:00:00.000Z", ref, ref.entries)).toThrow(/differs from the cutoff/);
  });

  it("refuses a reference with no recorded cutoff, a report with none, and an operand filed after the run's cutoff", () => {
    const ref = reference("2026-10-29T01:00:00.000Z");
    expect(() => validateReferenceCutoff("other", "2026-10-29T01:00:00.000Z", ref, [])).toThrow(/records no evidence cutoff/);
    expect(() => validateReferenceCutoff("c", null, ref, ref.entries)).toThrow(/states no evidence cutoff/);
    const tampered = reference("2026-10-29T01:00:00.000Z", "2026-10-30");
    expect(() => validateReferenceCutoff("c", "2026-10-29T01:00:00.000Z", tampered, tampered.entries)).toThrow(/uses 10-Q .* filed 2026-10-30, after the run's evidence cutoff/);
  });
});

describe("review round 1: currency and unit must agree before a match (P3, P4)", () => {
  const usd = { unit: "currency" as const, currency: "USD" };
  it("never matches a value in another currency, unit or share basis, however close the number", () => {
    const filedTwd = { kind: "filed" as const, value: 1_000, unit: "currency" as const, currency: "TWD" };
    const result = classifyFigure({ metis: 1_000, metisPeriod: "p", metisMeasure: usd, reference: filedTwd, referencePeriod: "p" });
    expect(result).toEqual({ status: "mismatch", detail: "Metis states the figure in USD, the filed reference is in TWD (P4)" });
    const perShare = { kind: "filed" as const, value: 1_000, unit: "currency/share" as const, currency: "USD" };
    expect(classifyFigure({ metis: 1_000, metisPeriod: "p", metisMeasure: usd, reference: perShare, referencePeriod: "p" }).detail).toMatch(/currency\/share: not the same measure \(P3\)/);
    const shares = { kind: "filed" as const, value: 1_000, unit: "shares" as const, currency: null };
    expect(classifyFigure({ metis: 1_000, metisPeriod: "p", metisMeasure: { unit: "%", currency: null }, reference: shares, referencePeriod: "p" }).status).toBe("mismatch");
    expect(classifyFigure({ metis: 1_000, metisPeriod: "p", metisMeasure: { unit: "currency", currency: null }, reference: { ...filedTwd, currency: "USD" }, referencePeriod: "p" }).detail).toMatch(/states no currency/);
    // Control: the same measure still matches through the P8 owner.
    expect(classifyFigure({ metis: 1_000, metisPeriod: "p", metisMeasure: usd, reference: { ...filedTwd, currency: "USD" }, referencePeriod: "p" }).status).toBe("match");
  });

  const twd: CompanyConfig = { ticker: "T", case: "t", cik: 1, currency: "TWD", scale: { "fv.dilutedShares": { factor: 0.2, why: "ADS" } } };
  const filings = facts({
    Revenues: { TWD: [fact("2025-01-01", "2025-12-31", 3_000, K, "20-F", "2026-04-16")] },
    WeightedAverageNumberOfDilutedSharesOutstanding: { shares: [fact("2025-01-01", "2025-12-31", 500, K, "20-F", "2026-04-16")] },
  });
  const rate = { rate: 0.03, from: "TWD", to: "USD", note: "Valuation translated at one spot rate" };

  it("persists the comparison currency after the report's own translation, and the unit of every reference", () => {
    const revenue = buildEntry(twd, "fv.startRevenue", "FY:2025-12-31", "USD", filings, "2026-10-29", rate);
    expect(revenue).toMatchObject({ value: 90, unit: "currency", currency: "USD", kind: "derived" });
    // Not translated when the figure states the filed currency; a share count carries no currency and is never translated.
    expect(buildEntry(twd, "revenue.fy", "FY:2025-12-31", "TWD", filings, "2026-10-29", rate)).toMatchObject({ value: 3_000, unit: "currency", currency: "TWD" });
    expect(buildEntry(twd, "dilutedShares.fy", "FY:2025-12-31", null, filings, "2026-10-29", rate)).toMatchObject({ value: 500, unit: "shares", currency: null });
    // A figure in a third currency keeps the filed currency, so the check reports the disagreement instead of a match.
    expect(buildEntry(twd, "fv.startRevenue", "FY:2025-12-31", "EUR", filings, "2026-10-29", rate)).toMatchObject({ value: 3_000, currency: "TWD" });
  });

  it("reads a ratio of like amounts as a percent and refuses a sum of unlike units", () => {
    const flows = facts({ Tax: { USD: [fact("2025-01-01", "2025-12-31", 21, K, "10-K", "2026-02-06")] }, Pretax: { USD: [fact("2025-01-01", "2025-12-31", 100, K, "10-K", "2026-02-06")] }, Shares: { shares: [fact("2025-01-01", "2025-12-31", 7, K, "10-K", "2026-02-06")] } });
    const ratio = resolveReference({ op: "ratio", numerator: { op: "flow", concepts: ["Tax"] }, denominator: { op: "flow", concepts: ["Pretax"] }, scale: 100 }, "FY:2025-12-31", flows, "USD", "2026-10-29");
    expect(ratio).toMatchObject({ value: 21, measure: { unit: "%", currency: null } });
    const unlike = resolveReference({ op: "sum", terms: [
      { role: "amount", sign: 1, recipe: { op: "flow", concepts: ["Tax"] } },
      { role: "count", sign: 1, recipe: { op: "flow", concepts: ["Shares"], unit: "shares" } },
    ] }, "FY:2025-12-31", flows, "USD", "2026-10-29");
    expect("reason" in unlike && unlike.reason).toMatch(/different units or currencies/);
  });
});

describe("review round 1: an absent NCI or preferred line is a zero only when the filing proves it (P7, P10)", () => {
  const balance = facts({
    StockholdersEquity: { USD: [fact(undefined, "2026-06-30", 500, Q, "10-Q", "2026-07-31")] },
    Cash: { USD: [fact(undefined, "2026-06-30", 4, Q, "10-Q", "2026-07-31")] },
  });
  const nci = DEFAULT_RECIPES["fv.minorityInterest"]!;
  const preferred = DEFAULT_RECIPES["fv.preferred"]!;
  const base: InstanceFact[] = [
    { name: "StockholdersEquity", unit: "USD", end: "2026-06-30", val: 500, members: [] },
    { name: "Cash", unit: "USD", end: "2026-06-30", val: 4, members: [] },
  ];
  const resolveWith = (recipe: Recipe, instance: InstanceFact[] | undefined, period = "@2026-06-30") =>
    resolveReference(recipe, period, balance, "USD", "2026-10-29", instance ? { [Q]: instance } : {});

  it("leaves it unresolved when no filing on or before the cutoff carries the instant", () => {
    const result = resolveWith(nci, base, "@2026-09-30");
    expect("reason" in result && result.reason).toMatch(/no periodic report filed on or before the cutoff .* carrying a balance at 2026-09-30/);
    expect(resolveReference(nci, "@2026-06-30", balance, "USD", "2026-07-30")).toMatchObject({ reason: expect.stringMatching(/not established/) });
  });

  it("asks for the filing's own instance before deciding, and never zeroes without it", () => {
    expect(resolveWith(nci, undefined)).toMatchObject({ needsInstance: [Q], reason: expect.stringMatching(/instance .* was not read/) });
  });

  it("refuses a zero when the instance discloses NCI another way", () => {
    const dimensional = resolveWith(nci, [...base, { name: "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", unit: "USD", end: "2026-06-30", val: 12, members: ["StatementEquityComponentsAxis=NoncontrollingInterestMember"] }]);
    expect("reason" in dimensional && dimensional.reason).toMatch(/NoncontrollingInterestMember/);
    const redeemable = resolveWith(nci, [...base, { name: "RedeemableNoncontrollingInterestEquityCarryingAmount", unit: "USD", end: "2026-06-30", val: 30, members: [] }]);
    expect("reason" in redeemable && redeemable.reason).toMatch(/RedeemableNoncontrollingInterestEquityCarryingAmount = 30/);
    const gap = resolveWith(nci, [...base, { name: "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", unit: "USD", end: "2026-06-30", val: 512, members: [] }]);
    expect("reason" in gap && gap.reason).toMatch(/total equity including NCI 512 against parent equity 500/);
    const empty = resolveWith(nci, [{ name: "Cash", unit: "USD", end: "2025-12-31", val: 1, members: [] }]);
    expect("reason" in empty && empty.reason).toMatch(/carries no balance at 2026-06-30/);
  });

  it("records a proven absence as a filed zero, and a tagged alias as its own value", () => {
    const equalTotal = [...base, { name: "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", unit: "USD", end: "2026-06-30", val: 500, members: [] }, { name: "MinorityInterestOwnershipPercentageByParent", unit: "pure", end: "2026-06-30", val: 1, members: [] }];
    const proven = resolveWith(nci, equalTotal);
    expect(proven).toMatchObject({ value: 0, formula: "not presented", measure: { unit: "currency", currency: "USD" } });
    expect("notes" in proven && proven.notes[0]).toMatch(/10-Q 0000000001-26-000002 filed 2026-07-31/);
    const tagged = facts({ NonredeemableNoncontrollingInterest: { USD: [fact(undefined, "2026-06-30", 9, Q, "10-Q", "2026-07-31")] } });
    expect(resolveReference(nci, "@2026-06-30", tagged, "USD", "2026-10-29")).toMatchObject({ value: 9 });
  });

  it("does not let authorized preferred shares block the zero, but issued preferred does", () => {
    const authorized = [...base, { name: "PreferredStockSharesAuthorized", unit: "shares", end: "2026-06-30", val: 500_000_000, members: [] }, { name: "PreferredStockParOrStatedValuePerShare", unit: "USD/shares", end: "2026-06-30", val: 0.01, members: [] }];
    expect(resolveWith(preferred, authorized)).toMatchObject({ value: 0 });
    const issued = resolveWith(preferred, [...authorized, { name: "PreferredStockSharesOutstanding", unit: "shares", end: "2026-06-30", val: 1_000, members: [] }]);
    expect("reason" in issued && issued.reason).toMatch(/PreferredStockSharesOutstanding = 1000/);
    const series = resolveWith(preferred, [...base, { name: "StockholdersEquity", unit: "USD", end: "2026-06-30", val: 50, members: ["StatementEquityComponentsAxis=PreferredStockMember"] }]);
    expect("reason" in series && series.reason).toMatch(/PreferredStockMember/);
  });

  it("scans every fact of the instance with its dimension members", () => {
    const xml = `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:abc="http://abc.com/2026" xmlns:xbrldi="http://xbrl.org/2006/xbrldi">
      <xbrli:context id="i"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
      <xbrli:context id="n"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementEquityComponentsAxis">us-gaap:NoncontrollingInterestMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
      <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
      <us-gaap:StockholdersEquity contextRef="i" unitRef="usd" decimals="-6">500</us-gaap:StockholdersEquity>
      <us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest contextRef="n" unitRef="usd" decimals="-6">12</us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest>
      <abc:NoncontrollingInterestInSubsidiary contextRef="i" unitRef="usd" decimals="-6">7</abc:NoncontrollingInterestInSubsidiary>
    </xbrli:xbrl>`;
    const scanned = scanXbrlInstance(xml);
    expect(scanned).toContainEqual({ name: "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", unit: "USD", end: "2026-06-30", val: 12, members: ["StatementEquityComponentsAxis=NoncontrollingInterestMember"] });
    // An extension element counts too.
    const extension = resolveWith(nci, scanned.filter((row) => row.members.length === 0));
    expect("reason" in extension && extension.reason).toMatch(/NoncontrollingInterestInSubsidiary = 7/);
  });
});

describe("review round 1: the newest filing wins across concept aliases (P2)", () => {
  const aliases = facts({
    Revenues: { USD: [fact("2025-01-01", "2025-12-31", 100, K, "10-K", "2026-02-06")] },
    RevenueFromContractWithCustomerExcludingAssessedTax: { USD: [fact("2025-01-01", "2025-12-31", 104, Q, "10-Q", "2026-07-31")] },
  });

  it("takes a later alias's newer filing over an earlier alias's older one", () => {
    const point = selectDuration(aliases, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"], "USD", { end: "2025-12-31", durationDays: { min: 350, max: 380 } }, "2026-10-29");
    expect(point).toMatchObject({ concept: "RevenueFromContractWithCustomerExcludingAssessedTax", val: 104, accn: Q });
    // Before the newer filing exists, the older alias stands (P2).
    expect(selectDuration(aliases, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"], "USD", { end: "2025-12-31", durationDays: { min: 350, max: 380 } }, "2026-07-30")?.val).toBe(100);
  });

  it("uses concept order only to break a tie on the filing date, for instants too", () => {
    const tie = facts({
      MinorityInterest: { USD: [fact(undefined, "2026-06-30", 5, Q, "10-Q", "2026-07-31")] },
      NonredeemableNoncontrollingInterest: { USD: [fact(undefined, "2026-06-30", 6, Q, "10-Q", "2026-07-31"), fact(undefined, "2026-03-31", 1, K, "10-Q", "2026-05-01")] },
      Older: { USD: [fact(undefined, "2026-06-30", 3, K, "10-Q", "2026-07-01")] },
    });
    expect(selectInstant(tie, ["MinorityInterest", "NonredeemableNoncontrollingInterest"], "USD", "2026-06-30", "2026-10-29")?.val).toBe(5);
    expect(selectInstant(tie, ["NonredeemableNoncontrollingInterest", "MinorityInterest"], "USD", "2026-06-30", "2026-10-29")?.val).toBe(6);
    expect(selectInstant(tie, ["Older", "MinorityInterest"], "USD", "2026-06-30", "2026-10-29")?.val).toBe(5);
  });

  it("builds a TTM and finds the latest fiscal year across aliases", () => {
    const ttmFacts = facts({
      OldTag: { USD: [
        fact("2025-01-01", "2025-12-31", 80, K, "10-K", "2026-02-06"),
        fact("2026-01-01", "2026-06-30", 50, "0000000001-26-000010", "10-Q", "2026-07-20"),
        fact("2025-01-01", "2025-06-30", 40, "0000000001-26-000010", "10-Q", "2026-07-20"),
      ] },
      NewTag: { USD: [
        fact("2025-01-01", "2025-12-31", 81, K, "10-K", "2026-02-06"),
        fact("2026-01-01", "2026-06-30", 52, Q, "10-Q", "2026-07-31"),
        fact("2025-01-01", "2025-06-30", 41, Q, "10-Q", "2026-07-31"),
        fact("2026-01-01", "2026-12-31", 99, LATE, "10-K", "2027-02-01"),
      ] },
    });
    expect(buildTtm(ttmFacts, ["OldTag", "NewTag"], "USD", "2025-12-31", "2026-06-30", "2026-10-29")?.value).toBe(81 + 52 - 41);
    expect(resolveReference({ op: "flow", concepts: ["OldTag", "NewTag"] }, "TTM:2025-07-01..2026-06-30", ttmFacts, "USD", "2026-10-29")).toMatchObject({ value: 92 });
    const years = facts({ A: { USD: [fact("2024-01-01", "2024-12-31", 1, K, "10-K", "2025-02-06")] }, B: { USD: [fact("2025-01-01", "2025-12-31", 2, K, "10-K", "2026-02-06")] } });
    expect(latestFiscalYearEnd(years, ["A", "B"], "USD", "2026-06-30", "2026-10-29")).toBe("2025-12-31");
  });
});

describe("review round 1: both variants of the FFO depreciation note are read (figures.ts)", () => {
  const reit = (note: string) => ({
    capital: { asOf: "2025-12-31", current: {} }, growth: {}, gaps: [], fairValue: { status: "available" },
    valuation: { kind: "reit", reit: { asOf: "2025-12-31", ffoPerShare: 2, notes: ["FFO is approximate because ownership reconciliation is unavailable.", note] } },
  });
  const byId = (note: string) => new Map(extractFigures(reit(note), { filingDisclosures: { currency: "USD" } }).map((figure) => [figure.id, figure]));

  it("keeps the real-estate depreciation number as its own figure", () => {
    const figures = byId("FFO (approximate NAREIT reconstruction) = net income 100 + real-estate depreciation and amortization 40 − gains on property sales 10 (GainLossOnSaleOfProperties) + impairments 6 (ImpairmentOfRealEstate) = 136. APPROXIMATE: ownership reconciliation is unavailable.");
    expect(figures.get("fv.ffo.realEstateDepreciationAmortization")).toMatchObject({ value: 40, period: "FY:2025-12-31" });
    expect(figures.has("fv.ffo.depreciationAmortization")).toBe(false);
    expect(figures.get("fv.ffo.netIncome")?.value).toBe(100);
    expect(figures.get("fv.ffo.shares")?.value).toBe(68);
    expect(DEFAULT_RECIPES["fv.ffo.realEstateDepreciationAmortization"]).toMatchObject({ op: "flow" });
  });

  it("keeps the total variant, and reads a note with no APPROXIMATE tail", () => {
    const figures = byId("FFO (approximate NAREIT reconstruction) = net income 100 + total depreciation and amortization 50 − gains on property sales 10 (GainLossOnSaleOfProperties) + impairments 6 (ImpairmentOfRealEstate) = 146.");
    expect(figures.get("fv.ffo.depreciationAmortization")?.value).toBe(50);
    expect(figures.has("fv.ffo.realEstateDepreciationAmortization")).toBe(false);
    expect(figures.get("fv.ffo.shares")?.value).toBe(73);
  });
});
