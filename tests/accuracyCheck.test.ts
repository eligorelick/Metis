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
import { readCompanies, type ReferenceFile } from "../scripts/accuracy/files";
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
import { DEFAULT_RECIPES, NAMED_RECIPES, resolveReference, type CompanyConfig, type Recipe } from "../scripts/accuracy/recipes";

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

describe("review round 2: the newest filing wins across balance representations (P2, P7)", () => {
  // A total line and its components are alternatives for one balance at 2025-12-31.
  const A = "0000000001-26-000011"; // filed 2026-02-01
  const B = "0000000001-26-000012"; // filed 2026-03-01
  const C = "0000000001-26-000013"; // filed 2026-03-15
  const at = (val: number, accn: string, filed: string, form = "10-K") => fact(undefined, "2025-12-31", val, accn, form, filed);
  const cashAndSti = DEFAULT_RECIPES["cashAndShortTermInvestments.latest"]!;
  const resolveAt = (recipe: Recipe, rows: CompanyFacts) => resolveReference(recipe, "@2025-12-31", rows, "USD", "2026-10-29");
  const accnsOf = (result: ReturnType<typeof resolveAt>) => ("reason" in result ? [] : [...new Set(result.points.map((point) => point.accn))]);

  it("takes newer filed components over an older filed total", () => {
    const rows = facts({
      CashCashEquivalentsAndShortTermInvestments: { USD: [at(100, A, "2026-02-01")] },
      CashAndCashEquivalentsAtCarryingValue: { USD: [at(120, B, "2026-03-01", "10-K/A")] },
      ShortTermInvestments: { USD: [at(30, B, "2026-03-01", "10-K/A")] },
    });
    const result = resolveAt(cashAndSti, rows);
    expect("reason" in result ? result.reason : result.value).toBe(150);
    expect(accnsOf(result)).toEqual([B]);
    expect("reason" in result ? [] : result.notes.join(" ")).toMatch(/newer filing wins: filed line = 100 in 10-K 0000000001-26-000011/);
    // The same rule holds for the lease recipes.
    const leases = facts({
      OperatingLeaseLiability: { USD: [at(50, A, "2026-02-01")] },
      OperatingLeaseLiabilityCurrent: { USD: [at(12, B, "2026-03-01", "10-K/A")] },
      OperatingLeaseLiabilityNoncurrent: { USD: [at(44, B, "2026-03-01", "10-K/A")] },
    });
    expect(resolveAt(DEFAULT_RECIPES["operatingLeases.latest"]!, leases)).toMatchObject({ value: 56 });
    // Before the newer filing exists, the older total stands (P2).
    expect(resolveReference(cashAndSti, "@2025-12-31", rows, "USD", "2026-02-28")).toMatchObject({ value: 100 });
  });

  it("takes a newer filed total over older filed components", () => {
    const rows = facts({
      CashCashEquivalentsAndShortTermInvestments: { USD: [at(100, B, "2026-03-01", "10-K/A")] },
      CashAndCashEquivalentsAtCarryingValue: { USD: [at(120, A, "2026-02-01")] },
      ShortTermInvestments: { USD: [at(30, A, "2026-02-01")] },
    });
    const result = resolveAt(cashAndSti, rows);
    expect("reason" in result ? result.reason : result.value).toBe(100);
    expect(accnsOf(result)).toEqual([B]);
  });

  it("uses the recipe's order only to break a tie within one filing", () => {
    const rows = facts({
      CashCashEquivalentsAndShortTermInvestments: { USD: [at(100, A, "2026-02-01")] },
      CashAndCashEquivalentsAtCarryingValue: { USD: [at(120, A, "2026-02-01")] },
      ShortTermInvestments: { USD: [at(30, A, "2026-02-01")] },
    });
    expect(resolveAt(cashAndSti, rows)).toMatchObject({ value: 100, notes: [] });
    const reversed: Recipe = { op: "first", alternatives: [...(cashAndSti as Extract<Recipe, { op: "first" }>).alternatives].reverse() };
    expect(resolveAt(reversed, rows)).toMatchObject({ value: 150 });
    // Inside a composed balance the filing is pinned, so every alternative ties and the order decides.
    const debt = facts({
      // Filed zeros: since review round 3 a line the filing does not tag is a zero only with proof.
      LongTermDebtCurrent: { USD: [at(0, A, "2026-02-01")] },
      ShortTermBorrowings: { USD: [at(0, A, "2026-02-01")] },
      FinanceLeaseLiability: { USD: [at(0, A, "2026-02-01")] },
      LongTermDebtNoncurrent: { USD: [at(1_000, A, "2026-02-01")] },
      OperatingLeaseLiability: { USD: [at(50, A, "2026-02-01")] },
      OperatingLeaseLiabilityCurrent: { USD: [at(12, A, "2026-02-01"), at(13, B, "2026-03-01", "10-K/A")] },
      OperatingLeaseLiabilityNoncurrent: { USD: [at(44, A, "2026-02-01"), at(45, B, "2026-03-01", "10-K/A")] },
    });
    const total = resolveAt(DEFAULT_RECIPES["totalDebtIncludingLeases.latest"]!, debt);
    expect("reason" in total ? total.reason : total.value).toBe(1_050);
    expect(accnsOf(total)).toEqual([A]);
  });

  it("never composes a newer total from components split across filings", () => {
    const rows = facts({
      CashCashEquivalentsAndShortTermInvestments: { USD: [at(100, A, "2026-02-01")] },
      CashAndCashEquivalentsAtCarryingValue: { USD: [at(120, B, "2026-03-01", "10-K/A")] },
      ShortTermInvestments: { USD: [at(30, C, "2026-03-15", "10-K/A")] },
    });
    const result = resolveAt(cashAndSti, rows);
    // Filing B presents cash with no short-term line and filing C carries no cash, so neither composes the balance.
    // Until review round 3 B's cash alone (120) stood as the balance, with the short-term investments filing C tags
    // at the same instant counted as zero; an untagged part is now a zero only with proof, so the filed total stands.
    expect("reason" in result ? result.reason : result.value).toBe(100);
    expect(accnsOf(result)).toEqual([A]);
    // With every component required, the split parts compose nothing and the filed total stands.
    const required: Recipe = { op: "first", alternatives: [
      { op: "instant", concepts: ["CashCashEquivalentsAndShortTermInvestments"] },
      { op: "sum", terms: [
        { role: "cash", sign: 1, recipe: { op: "instant", concepts: ["CashAndCashEquivalentsAtCarryingValue"] } },
        { role: "short-term investments", sign: 1, recipe: { op: "instant", concepts: ["ShortTermInvestments"] } },
      ] },
    ] };
    const strict = resolveAt(required, rows);
    expect("reason" in strict ? strict.reason : strict.value).toBe(100);
    expect(accnsOf(strict)).toEqual([A]);
  });
});

describe("review round 3: a total is never added to its own parts (current debt, P7)", () => {
  const A = "0000000001-26-000021";
  const at = (val: number, accn = A, filed = "2026-02-01", form = "10-K") => fact(undefined, "2025-12-31", val, accn, form, filed);
  const totalDebt = DEFAULT_RECIPES["totalDebtIncludingLeases.latest"]!;
  // An instance that carries the balance sheet and nothing about leases, debt or investments.
  const clean: InstanceFact[] = [{ name: "Assets", unit: "USD", end: "2025-12-31", val: 1_000, members: [] }];
  const resolveAt = (recipe: Recipe, rows: CompanyFacts, instance?: InstanceFact[]) => resolveReference(recipe, "@2025-12-31", rows, "USD", "2026-10-29", instance ? { [A]: instance } : {});
  const valueOf = (result: ReturnType<typeof resolveAt>) => ("reason" in result ? result.reason : result.value);
  const conceptsOf = (result: ReturnType<typeof resolveAt>) => ("reason" in result ? [] : result.points.map((point) => point.concept));
  // The lease liabilities are presented as filed zeros, so only the debt composition is in question.
  const noLeases = { OperatingLeaseLiability: { USD: [at(0)] }, FinanceLeaseLiability: { USD: [at(0)] } };

  it("the reviewer's case: DebtCurrent beside ShortTermBorrowings, with no LongTermDebtCurrent, is 130 and not 140", () => {
    const rows = facts({
      DebtCurrent: { USD: [at(30)] },
      ShortTermBorrowings: { USD: [at(10)] },
      LongTermDebtNoncurrent: { USD: [at(100)] },
      CashAndCashEquivalentsAtCarryingValue: { USD: [at(40)] },
      ShortTermInvestments: { USD: [at(5)] },
      ...noLeases,
    });
    const total = resolveAt(totalDebt, rows, clean);
    expect(valueOf(total)).toBe(130);
    // The total stands in place of the part it exceeds: the borrowing is inside it, never beside it.
    expect(conceptsOf(total)).toEqual(["DebtCurrent", "LongTermDebtNoncurrent", "OperatingLeaseLiability", "FinanceLeaseLiability"]);
    expect(valueOf(resolveAt(DEFAULT_RECIPES["fv.netDebt"]!, rows, clean))).toBe(130 - 45);
    // DebtCurrent is debt and finance lease obligations: it stands alone only once the filing is shown to have no leases.
    expect(resolveAt(totalDebt, rows)).toMatchObject({ needsInstance: [A] });
  });

  it("uses the parts when the total reconciles with them, which proves there is no other current debt", () => {
    const rows = facts({ DebtCurrent: { USD: [at(30)] }, LongTermDebtCurrent: { USD: [at(20)] }, ShortTermBorrowings: { USD: [at(10)] }, LongTermDebtNoncurrent: { USD: [at(100)] }, ...noLeases });
    const total = resolveAt(totalDebt, rows);
    expect(valueOf(total)).toBe(130);
    expect(conceptsOf(total)).not.toContain("DebtCurrent");
    expect("reason" in total ? "" : total.notes.join(" ")).toMatch(/DebtCurrent 30 is these parts, not added to them/);
  });

  it("does not count current finance leases twice when DebtCurrent holds them", () => {
    // DebtCurrent 15 = short-term borrowings 10 + current finance leases 5; the finance lease liability 25 carries the 5.
    const withBorrowings = facts({ DebtCurrent: { USD: [at(15)] }, ShortTermBorrowings: { USD: [at(10)] }, FinanceLeaseLiabilityCurrent: { USD: [at(5)] }, FinanceLeaseLiability: { USD: [at(25)] }, OperatingLeaseLiability: { USD: [at(0)] }, LongTermDebtNoncurrent: { USD: [at(100)] } });
    expect(valueOf(resolveAt(totalDebt, withBorrowings))).toBe(10 + 100 + 25);
    // All of DebtCurrent is the current finance lease liability: there is no other current debt.
    const leasesOnly = facts({ DebtCurrent: { USD: [at(5)] }, FinanceLeaseLiabilityCurrent: { USD: [at(5)] }, FinanceLeaseLiability: { USD: [at(25)] }, OperatingLeaseLiability: { USD: [at(0)] }, LongTermDebtNoncurrent: { USD: [at(100)] } });
    const result = resolveAt(totalDebt, leasesOnly);
    expect(valueOf(result)).toBe(100 + 25);
    expect(conceptsOf(result)).not.toContain("DebtCurrent");
  });

  it("establishes nothing when the total cannot be split, contradicts its parts or may hold leases", () => {
    const base = { LongTermDebtNoncurrent: { USD: [at(100)] }, OperatingLeaseLiability: { USD: [at(0)] } };
    const unsplit = facts({ ...base, DebtCurrent: { USD: [at(40)] }, ShortTermBorrowings: { USD: [at(10)] }, FinanceLeaseLiabilityCurrent: { USD: [at(5)] }, FinanceLeaseLiability: { USD: [at(25)] } });
    expect(valueOf(resolveAt(totalDebt, unsplit))).toMatch(/how much of the total is debt and how much is finance leases is not established/);
    const below = facts({ ...base, DebtCurrent: { USD: [at(5)] }, LongTermDebtCurrent: { USD: [at(20)] }, FinanceLeaseLiability: { USD: [at(0)] } });
    expect(valueOf(resolveAt(totalDebt, below))).toMatch(/DebtCurrent 5 is less than its tagged parts/);
    // A finance lease liability with no current split: DebtCurrent may hold its current part.
    const mayHold = facts({ ...base, DebtCurrent: { USD: [at(30)] }, FinanceLeaseLiability: { USD: [at(25)] } });
    expect(valueOf(resolveAt(totalDebt, mayHold, clean))).toMatch(/beside a finance lease liability FinanceLeaseLiability 25 whose current part is not tagged/);
  });

  it("keeps commercial paper inside short-term borrowings unless the filing's own total shows it outside", () => {
    const parts = { LongTermDebtCurrent: { USD: [at(20)] }, ShortTermBorrowings: { USD: [at(10)] }, CommercialPaper: { USD: [at(4)] }, LongTermDebtNoncurrent: { USD: [at(100)] }, ...noLeases };
    expect(valueOf(resolveAt(totalDebt, facts(parts)))).toBe(130);
    expect(valueOf(resolveAt(totalDebt, facts({ ...parts, DebtCurrent: { USD: [at(34)] } })))).toBe(134);
    // Commercial paper alone is the short-term borrowing when no ShortTermBorrowings is tagged (and the total agrees).
    const paperOnly = facts({ DebtCurrent: { USD: [at(24)] }, LongTermDebtCurrent: { USD: [at(20)] }, CommercialPaper: { USD: [at(4)] }, LongTermDebtNoncurrent: { USD: [at(100)] }, ...noLeases });
    expect(valueOf(resolveAt(totalDebt, paperOnly))).toBe(124);
  });

  it("never reads LongTermDebt, the total including current maturities, into the default sum", () => {
    // A face-value LongTermDebt beside the two balance-sheet lines: the lines are the debt.
    const lines = facts({ LongTermDebt: { USD: [at(133)] }, LongTermDebtCurrent: { USD: [at(3)] }, ShortTermBorrowings: { USD: [at(1)] }, LongTermDebtNoncurrent: { USD: [at(129)] }, ...noLeases });
    const result = resolveAt(totalDebt, lines);
    expect(valueOf(result)).toBe(133);
    expect(conceptsOf(result)).not.toContain("LongTermDebt");
    // With no noncurrent line the total is not guessed to be one: an override must say which line it is.
    const totalOnly = facts({ LongTermDebt: { USD: [at(120)] }, LongTermDebtCurrent: { USD: [at(20)] }, ShortTermBorrowings: { USD: [at(0)] }, ...noLeases });
    expect(valueOf(resolveAt(totalDebt, totalOnly))).toMatch(/debt, noncurrent: no LongTermDebtNoncurrent/);
  });

  it("no recipe, default or override, adds a total to one of its parts or lists them as aliases", () => {
    const PARTS_OF: Record<string, string[]> = {
      // The overlap of DebtCurrent with current finance leases is reconciled inside `currentDebt` (tested above).
      DebtCurrent: ["LongTermDebtCurrent", "ShortTermBorrowings", "CommercialPaper"],
      ShortTermBorrowings: ["CommercialPaper"],
      LongTermDebt: ["LongTermDebtCurrent", "LongTermDebtNoncurrent"],
      DebtLongtermAndShorttermCombinedAmount: ["DebtCurrent", "LongTermDebt", "LongTermDebtCurrent", "LongTermDebtNoncurrent", "ShortTermBorrowings", "CommercialPaper"],
      DebtAndCapitalLeaseObligations: ["DebtCurrent", "LongTermDebt", "LongTermDebtCurrent", "LongTermDebtNoncurrent", "ShortTermBorrowings", "CommercialPaper", "FinanceLeaseLiability", "FinanceLeaseLiabilityCurrent", "FinanceLeaseLiabilityNoncurrent"],
      OperatingLeaseLiability: ["OperatingLeaseLiabilityCurrent", "OperatingLeaseLiabilityNoncurrent"],
      FinanceLeaseLiability: ["FinanceLeaseLiabilityCurrent", "FinanceLeaseLiabilityNoncurrent"],
      CashCashEquivalentsAndShortTermInvestments: ["CashAndCashEquivalentsAtCarryingValue", "ShortTermInvestments", "MarketableSecuritiesCurrent", "DebtSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
      LongTermInvestments: ["MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "EquitySecuritiesWithoutReadilyDeterminableFairValueAmount", "EquityMethodInvestments"],
    };
    // Inside one term, alternatives (`first`) may name a total and its parts; across the terms of one sum they may not.
    const reach = (recipe: Recipe): string[] => {
      switch (recipe.op) {
        case "instant": return recipe.concepts;
        case "sum": return recipe.terms.flatMap((term) => reach(term.recipe));
        case "first": return recipe.alternatives.flatMap(reach);
        case "currentDebt": return ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings", "CommercialPaper"];
        case "use": return reach(NAMED_RECIPES[recipe.name]);
        default: return [];
      }
    };
    const offences: string[] = [];
    const walk = (recipe: Recipe, where: string): void => {
      if (recipe.op === "instant" || recipe.op === "flow" || recipe.op === "latestShares") {
        for (const concept of recipe.concepts) for (const part of PARTS_OF[concept] ?? []) if (recipe.concepts.includes(part)) offences.push(`${where}: alias list holds ${concept} and its part ${part}`);
      }
      if (recipe.op === "sum") {
        const perTerm = recipe.terms.map((term) => reach(term.recipe));
        perTerm.forEach((concepts, i) => concepts.forEach((concept) => (PARTS_OF[concept] ?? []).forEach((part) => perTerm.forEach((other, j) => {
          if (i !== j && other.includes(part)) offences.push(`${where}: ${concept} (${recipe.terms[i]!.role}) is added to its part ${part} (${recipe.terms[j]!.role})`);
        }))));
        recipe.terms.forEach((term) => walk(term.recipe, where));
      }
      if (recipe.op === "first") recipe.alternatives.forEach((alternative) => walk(alternative, where));
      if (recipe.op === "ratio") { walk(recipe.numerator, where); walk(recipe.denominator, where); }
    };
    for (const [figure, recipe] of Object.entries(DEFAULT_RECIPES)) walk(recipe, `default ${figure}`);
    for (const company of readCompanies()) for (const [figure, override] of Object.entries(company.overrides ?? {})) walk(override.recipe, `${company.ticker} ${figure}`);
    // The one exception, proven from the filing in its `why`: QCOM tags its noncurrent balance-sheet line LongTermDebt.
    const allowed = offences.filter((offence) => /^QCOM (totalDebtIncludingLeases\.latest|fv\.netDebt): LongTermDebt \(long-term debt \(noncurrent balance-sheet line\)\) is added to its part LongTermDebtCurrent/.test(offence));
    expect(allowed).toHaveLength(2);
    expect(offences.filter((offence) => !allowed.includes(offence))).toEqual([]);
    const qcom = readCompanies().find((company) => company.ticker === "QCOM")!;
    expect(qcom.overrides!["totalDebtIncludingLeases.latest"]!.why).toMatch(/LongTermDebt here excludes the current maturities/);
    // The lint itself catches the defect: the alias the reviewer found, and a total beside its part.
    offences.length = 0;
    walk({ op: "sum", terms: [
      { role: "debt, current", sign: 1, recipe: { op: "instant", concepts: ["LongTermDebtCurrent", "DebtCurrent"] } },
      { role: "short-term borrowings", sign: 1, recipe: { op: "instant", concepts: ["ShortTermBorrowings", "CommercialPaper"] } },
    ] }, "old");
    expect(offences).toEqual(expect.arrayContaining([expect.stringMatching(/alias list holds DebtCurrent and its part LongTermDebtCurrent/), expect.stringMatching(/DebtCurrent \(debt, current\) is added to its part ShortTermBorrowings/)]));
  });

  it("resolves a named building block as its one definition", () => {
    const rows = facts({ OperatingLeaseLiabilityCurrent: { USD: [at(12)] }, OperatingLeaseLiabilityNoncurrent: { USD: [at(44)] } });
    expect(valueOf(resolveAt({ op: "use", name: "operatingLeases" }, rows))).toBe(56);
    expect(resolveAt({ op: "use", name: "operatingLeases" }, rows)).toEqual(resolveAt(DEFAULT_RECIPES["operatingLeases.latest"]!, rows));
  });
});

describe("review round 3: a part the filing does not tag is a zero only with proof (P7, P10)", () => {
  const K = "0000000001-26-000031"; // 10-K for 2025-12-31
  const Q2 = "0000000001-26-000032"; // 10-Q for 2026-06-30
  const at = (val: number, end = "2026-06-30", accn = Q2, filed = "2026-07-31", form = "10-Q") => fact(undefined, end, val, accn, form, filed);
  const totalDebt = DEFAULT_RECIPES["totalDebtIncludingLeases.latest"]!;
  const cashAndSti = DEFAULT_RECIPES["cashAndShortTermInvestments.latest"]!;
  const clean: InstanceFact[] = [{ name: "Assets", unit: "USD", end: "2026-06-30", val: 1_000, members: [] }];
  const resolveAt = (recipe: Recipe, rows: CompanyFacts, instance?: InstanceFact[]) => resolveReference(recipe, "@2026-06-30", rows, "USD", "2026-10-29", instance ? { [Q2]: instance } : {});
  const valueOf = (result: ReturnType<typeof resolveAt>) => ("reason" in result ? result.reason : result.value);
  // Debt lines and the finance lease liability are filed; only the operating lease liability is untagged.
  const debt = { LongTermDebtCurrent: { USD: [at(0)] }, ShortTermBorrowings: { USD: [at(0)] }, LongTermDebtNoncurrent: { USD: [at(100)] }, FinanceLeaseLiability: { USD: [at(0)] } };
  const fromInstance = (name: string, val: number, members: string[] = []): InstanceFact => ({ name, unit: "USD", end: "2026-06-30", val, members });

  it("asks for the filing's instance, refuses on evidence of operating leases and records a proven absence", () => {
    const rows = facts(debt);
    expect(resolveAt(totalDebt, rows)).toMatchObject({ needsInstance: [Q2], reason: expect.stringMatching(/operating lease liabilities: .*instance .* was not read/) });
    // The deferred tax on operating lease liabilities shows they exist although the liability itself is not tagged.
    expect(valueOf(resolveAt(totalDebt, rows, [...clean, fromInstance("DeferredTaxAssetsOperatingLeaseLiabilities", 14)]))).toMatch(/tags DeferredTaxAssetsOperatingLeaseLiabilities = 14 USD: absence of operating lease liabilities is not established/);
    // So does a liability tagged only on a balance-sheet-location member, which companyfacts drops.
    expect(valueOf(resolveAt(totalDebt, rows, [...clean, fromInstance("OperatingLeaseLiability", 7, ["BalanceSheetLocationAxis=OtherLiabilitiesMember"])]))).toMatch(/discloses OperatingLeaseLiability = 7 USD on BalanceSheetLocationAxis=OtherLiabilitiesMember/);
    // Control: a subsidiary registrant's lease (another entity, P5) and a finance lease asset say nothing about it.
    const unrelated = [...clean, fromInstance("OperatingLeaseLiability", 7, ["LegalEntityAxis=SubsidiaryMember"]), fromInstance("LessorOperatingLeasePaymentsToBeReceived", 9)];
    const proven = resolveAt(totalDebt, rows, unrelated);
    expect(valueOf(proven)).toBe(100);
    expect("reason" in proven ? "" : proven.notes.join(" ")).toMatch(/operating lease liabilities: .* recorded as none presented/);
  });

  it("does not take a quarterly report's silence for a zero when a filing within the year shows the balance", () => {
    const rows = facts({ ...debt, OperatingLeaseLiability: { USD: [at(8, "2025-12-31", K, "2026-02-06", "10-K")] } });
    expect(valueOf(resolveAt(totalDebt, rows, clean))).toMatch(/10-K 0000000001-26-000031 \(filed 2026-02-06\) tags OperatingLeaseLiability = 8 at 2025-12-31: the issuer has operating lease liabilities/);
    // Control: a balance last tagged more than a year earlier does not block the proven absence.
    const old = facts({ ...debt, OperatingLeaseLiability: { USD: [at(8, "2024-12-31", K, "2025-02-06", "10-K")] } });
    expect(valueOf(resolveAt(totalDebt, old, clean))).toBe(100);
  });

  it("needs both parts of a lease liability: one part alone is not the liability", () => {
    const noncurrentOnly = facts({ ...debt, OperatingLeaseLiabilityNoncurrent: { USD: [at(44)] } });
    expect(valueOf(resolveAt(DEFAULT_RECIPES["operatingLeases.latest"]!, noncurrentOnly))).toMatch(/operating lease liability, current: no OperatingLeaseLiabilityCurrent/);
    expect(valueOf(resolveAt(totalDebt, noncurrentOnly, clean))).toMatch(/operating lease liabilities: .*no OperatingLeaseLiabilityCurrent/);
    const both = facts({ ...debt, OperatingLeaseLiabilityNoncurrent: { USD: [at(44)] }, OperatingLeaseLiabilityCurrent: { USD: [at(12)] } });
    expect(valueOf(resolveAt(totalDebt, both))).toBe(156);
  });

  it("takes a debt-securities line for all current investments only when the filing shows no other", () => {
    const rows = facts({ CashAndCashEquivalentsAtCarryingValue: { USD: [at(22)] }, DebtSecuritiesCurrent: { USD: [at(34)] } });
    expect(resolveAt(cashAndSti, rows)).toMatchObject({ needsInstance: [Q2] });
    // A current marketable equity securities line beside it: the debt securities are not the whole.
    expect(valueOf(resolveAt(cashAndSti, rows, [...clean, fromInstance("EquitySecuritiesFvNi", 43)]))).toMatch(/DebtSecuritiesCurrent is one kind of short-term investments, and 10-Q 0000000001-26-000032 also tags EquitySecuritiesFvNi = 43 USD/);
    // Control: equity securities of a trust fund (a dimension member) and noncurrent securities are not a current line.
    const control = [...clean, fromInstance("EquitySecuritiesFvNi", 71, ["InvestmentTypeAxis=NuclearDecommissioningTrustFundMember"]), fromInstance("AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", 30)];
    expect(valueOf(resolveAt(cashAndSti, rows, control))).toBe(56);
    // A classified total needs no such proof.
    expect(valueOf(resolveAt(cashAndSti, facts({ CashAndCashEquivalentsAtCarryingValue: { USD: [at(22)] }, ShortTermInvestments: { USD: [at(30)] } })))).toBe(52);
  });

  it("takes cash alone for cash and short-term investments only when the filing shows no investment line", () => {
    const rows = facts({ CashAndCashEquivalentsAtCarryingValue: { USD: [at(22)] } });
    expect(resolveAt(cashAndSti, rows)).toMatchObject({ needsInstance: [Q2] });
    expect(valueOf(resolveAt(cashAndSti, rows, [...clean, fromInstance("MarketableSecurities", 9)]))).toMatch(/tags MarketableSecurities = 9 USD: absence of short-term investments is not established/);
    const proven = resolveAt(cashAndSti, rows, clean);
    expect(valueOf(proven)).toBe(22);
    expect("reason" in proven ? "" : proven.notes.join(" ")).toMatch(/recorded as none presented/);
  });

  it("composes long-term investments from the filed noncurrent lines only when they are the whole", () => {
    const lti = DEFAULT_RECIPES["fv.nonOperatingInvestments"]!;
    const pieces = facts({ EquitySecuritiesWithoutReadilyDeterminableFairValueAmount: { USD: [at(122)] }, EquityMethodInvestments: { USD: [at(3)] } });
    expect(resolveAt(lti, pieces)).toMatchObject({ needsInstance: [Q2] });
    const instance = [...clean, fromInstance("EquitySecuritiesWithoutReadilyDeterminableFairValueAmount", 122), fromInstance("EquityMethodInvestments", 3)];
    expect(valueOf(resolveAt(lti, pieces, instance))).toBe(125);
    // The balance-sheet line is a filer extension element that holds more than the tagged piece: the piece is not the whole.
    expect(valueOf(resolveAt(lti, pieces, [...instance, fromInstance("NonMarketableSecurities", 151)]))).toMatch(/tags NonMarketableSecurities = 151 USD/);
    // A filed total needs no composition.
    expect(valueOf(resolveAt(lti, facts({ LongTermInvestments: { USD: [at(200)] }, EquityMethodInvestments: { USD: [at(3)] } })))).toBe(200);
  });
});

describe("review round 3: a composed value stands on one filing, the newest that composes all of it (P2, P7)", () => {
  const K = "0000000001-26-000041"; // 10-K, filed 2026-02-01
  const LATER = "0000000001-26-000042"; // a later filing, filed 2026-05-01
  const at = (val: number, accn = K, filed = "2026-02-01", form = "10-K") => fact(undefined, "2025-12-31", val, accn, form, filed);
  const later = (val: number, form = "10-Q") => at(val, LATER, "2026-05-01", form);
  const totalDebt = DEFAULT_RECIPES["totalDebtIncludingLeases.latest"]!;
  const resolveAt = (recipe: Recipe, rows: CompanyFacts) => resolveReference(recipe, "@2025-12-31", rows, "USD", "2026-10-29");
  const valueOf = (result: ReturnType<typeof resolveAt>) => ("reason" in result ? result.reason : result.value);
  const accnsOf = (result: ReturnType<typeof resolveAt>) => ("reason" in result ? [] : [...new Set(result.points.map((point) => point.accn))]);

  it("falls back to the filing that carries every part when a later one repeats only some of them", () => {
    // The 10-K carries the debt lines and the lease notes; the next 10-Q repeats the debt lines as comparatives.
    const rows = facts({
      LongTermDebtCurrent: { USD: [at(5), later(5)] },
      ShortTermBorrowings: { USD: [at(0), later(0)] },
      LongTermDebtNoncurrent: { USD: [at(100), later(100)] },
      OperatingLeaseLiability: { USD: [at(20)] },
      FinanceLeaseLiability: { USD: [at(0)] },
    });
    const result = resolveAt(totalDebt, rows);
    expect(valueOf(result)).toBe(125);
    expect(accnsOf(result)).toEqual([K]);
  });

  it("establishes nothing when the later filing restates a part without the others", () => {
    const rows = facts({
      LongTermDebtCurrent: { USD: [at(5), later(5)] },
      ShortTermBorrowings: { USD: [at(0), later(0)] },
      LongTermDebtNoncurrent: { USD: [at(100), later(101)] },
      OperatingLeaseLiability: { USD: [at(20)] },
      FinanceLeaseLiability: { USD: [at(0)] },
    });
    expect(valueOf(resolveAt(totalDebt, rows))).toMatch(/LongTermDebtNoncurrent at 2025-12-31 is 100 in 10-K 0000000001-26-000041 .* restates it as 101 without the other parts/);
    // Control: a later filing that carries the whole composition is simply the newest (P2).
    const whole = facts({
      LongTermDebtCurrent: { USD: [at(5), later(6, "10-K/A")] },
      ShortTermBorrowings: { USD: [at(0), later(0, "10-K/A")] },
      LongTermDebtNoncurrent: { USD: [at(100), later(101, "10-K/A")] },
      OperatingLeaseLiability: { USD: [at(20), later(21, "10-K/A")] },
      FinanceLeaseLiability: { USD: [at(0), later(0, "10-K/A")] },
    });
    const result = resolveAt(totalDebt, whole);
    expect(valueOf(result)).toBe(128);
    expect(accnsOf(result)).toEqual([LATER]);
  });

  it("refuses a flow sum or a ratio whose operands come from different filings", () => {
    const year = (val: number, accn: string, filed: string, form: string) => fact("2025-01-01", "2025-12-31", val, accn, form, filed);
    // Operating cash flow is restated by a 10-K/A that does not repeat capital spending.
    const split = facts({
      NetCashProvidedByUsedInOperatingActivities: { USD: [year(50, K, "2026-02-01", "10-K"), year(52, LATER, "2026-05-01", "10-K/A")] },
      PaymentsToAcquirePropertyPlantAndEquipment: { USD: [year(10, K, "2026-02-01", "10-K")] },
      IncomeTaxExpenseBenefit: { USD: [year(21, K, "2026-02-01", "10-K"), year(22, LATER, "2026-05-01", "10-K/A")] },
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: { USD: [year(100, K, "2026-02-01", "10-K")] },
    });
    const fcf = resolveReference(DEFAULT_RECIPES["fcf.fy"]!, "FY:2025-12-31", split, "USD", "2026-10-29");
    expect("reason" in fcf ? fcf.reason : fcf.value).toMatch(/terms come from different filings .*\(P7\)/);
    const rate = resolveReference(DEFAULT_RECIPES["fv.taxRate"]!, "FY:2025-12-31", split, "USD", "2026-10-29");
    expect("reason" in rate ? rate.reason : rate.value).toMatch(/numerator and denominator come from different filings/);
    // Control: before the amendment exists both operands stand on the 10-K.
    expect(resolveReference(DEFAULT_RECIPES["fcf.fy"]!, "FY:2025-12-31", split, "USD", "2026-04-30")).toMatchObject({ value: 40 });
    expect(resolveReference(DEFAULT_RECIPES["fv.taxRate"]!, "FY:2025-12-31", split, "USD", "2026-04-30")).toMatchObject({ value: 21 });
  });
});

describe("review round 3: TTM operands stand on one basis (P1)", () => {
  const PRIOR_Q = "0000000001-25-000009"; // the prior year's 10-Q, filed 2025-08-01
  const rows = (priorYtdInNewFiling: number, extra: SecFact[] = []) => facts({ OperatingIncomeLoss: { USD: [
    fact("2025-01-01", "2025-12-31", 80, K, "10-K", "2026-02-06"),
    fact("2026-01-01", "2026-06-30", 51, Q, "10-Q", "2026-07-31"),
    fact("2025-01-01", "2025-06-30", priorYtdInNewFiling, Q, "10-Q", "2026-07-31"),
    fact("2025-01-01", "2025-06-30", 37, PRIOR_Q, "10-Q", "2025-08-01"),
    ...extra,
  ] } });

  it("refuses a fiscal year filed before the 10-Q recast the prior-year year to date", () => {
    // Control: the comparative equals what the issuer first filed for that period.
    expect(buildTtm(rows(37), ["OperatingIncomeLoss"], "USD", "2025-12-31", "2026-06-30", "2026-10-29")?.value).toBe(94);
    // The 10-Q states 39 for a period first filed as 37: the 10-K's fiscal year is on the old basis.
    expect(buildTtm(rows(39), ["OperatingIncomeLoss"], "USD", "2025-12-31", "2026-06-30", "2026-10-29")).toBeNull();
    const result = resolveReference({ op: "flow", concepts: ["OperatingIncomeLoss"] }, "TTM:2025-07-01..2026-06-30", rows(39), "USD", "2026-10-29");
    expect("reason" in result ? result.reason : result.value).toMatch(/all three on one basis/);
  });

  it("refuses a fiscal year restated after the year-to-date filing", () => {
    const restated = rows(37, [fact("2025-01-01", "2025-12-31", 82, "0000000001-26-000050", "10-K/A", "2026-08-15")]);
    expect(buildTtm(restated, ["OperatingIncomeLoss"], "USD", "2025-12-31", "2026-06-30", "2026-10-29")).toBeNull();
    // Before the amendment exists the three operands agree (P2).
    expect(buildTtm(restated, ["OperatingIncomeLoss"], "USD", "2025-12-31", "2026-06-30", "2026-08-14")?.value).toBe(94);
  });
});

describe("review round 3: the report's own window, never one inferred from its end (P1)", () => {
  const excessReturn = {
    capital: { asOf: "2025-09-28", current: {} }, growth: {}, gaps: [], fairValue: { status: "available" },
    returns: { commonReturnTtm: { asOf: "2026-06-28", incomeAvailableToCommon: 110 } },
    valuation: { kind: "excess-return", excessReturn: { asOf: "2026-06-28", openingBookValue: { value: 900 } } },
  };
  // A 52/53-week filer: the fiscal year ends on the last Sunday of September.
  const weeks = facts({ NetIncomeLossAvailableToCommonStockholdersBasic: { USD: [
    fact("2024-09-30", "2025-09-28", 100, K, "10-K", "2025-11-05"),
    fact("2025-09-29", "2026-06-28", 70, Q, "10-Q", "2026-07-29"),
    fact("2024-09-30", "2025-06-29", 60, Q, "10-Q", "2026-07-29"),
  ] } });

  it("states only the end the report states, and reads the filed twelve months for it", () => {
    const figure = extractFigures(excessReturn, { filingDisclosures: { currency: "USD" } }).find((row) => row.id === "fv.incomeAvailableToCommon")!;
    expect(figure.period).toBe("TTM-TO:2026-06-28");
    const reference = resolveReference(DEFAULT_RECIPES["fv.incomeAvailableToCommon"]!, figure.period, weeks, "USD", "2026-10-29");
    expect(reference).toMatchObject({ value: 110, period: "TTM-TO:2026-06-28" });
    expect("reason" in reference ? "" : reference.notes[0]).toMatch(/the filed twelve months are 2025-06-30 to 2026-06-28/);
    expect(classifyFigure({ metis: 110, metisPeriod: figure.period!, metisMeasure: { unit: "currency", currency: "USD" }, reference: { kind: "derived", value: 110, operands: [100, 70, 60], unit: "currency", currency: "USD" }, referencePeriod: "reason" in reference ? null : reference.period }).status).toBe("match");
    // A stated window is still held to the filed one: a calendar-year start is not this filer's window.
    expect(resolveReference(DEFAULT_RECIPES["fv.incomeAvailableToCommon"]!, "TTM:2025-06-29..2026-06-28", weeks, "USD", "2026-10-29")).toMatchObject({ period: "TTM:2025-06-30..2026-06-28" });
  });
});

describe("review round 3: a filing's own instance (P3)", () => {
  const head = `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2026" xmlns:srt="http://fasb.org/srt/2026" xmlns:abc="http://www.abc.com/20260630">
    <xbrli:context id="i"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
    <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>`;
  const parse = (body: string) => parseXbrlInstance(`${head}${body}</xbrli:xbrl>`, { accn: Q, form: "10-Q", filed: "2026-07-31" });

  it("keeps the most precise statement of a fact the filing states twice", () => {
    // A note sentence rounds the liability to the hundred thousand before the table states it to the thousand.
    const parsed = parse(`<us-gaap:OperatingLeaseLiability contextRef="i" unitRef="usd" decimals="-5">4800000</us-gaap:OperatingLeaseLiability>
      <us-gaap:OperatingLeaseLiability contextRef="i" unitRef="usd" decimals="-3">4776000</us-gaap:OperatingLeaseLiability>
      <us-gaap:Cash contextRef="i" unitRef="usd" decimals="-3">70000</us-gaap:Cash>
      <us-gaap:Cash contextRef="i" unitRef="usd" decimals="-3">71000</us-gaap:Cash>`);
    expect(parsed.facts["us-gaap"]?.OperatingLeaseLiability?.units.USD).toEqual([{ end: "2026-06-30", val: 4_776_000, accn: Q, form: "10-Q", filed: "2026-07-31" }]);
    // Two equally precise statements that disagree are no value.
    expect(parsed.facts["us-gaap"]?.Cash).toBeUndefined();
  });

  it("reads a filer extension element as ext:Name, and leaves other published taxonomies out", () => {
    const parsed = parse(`<abc:NonMarketableSecurities contextRef="i" unitRef="usd" decimals="-6">51157000000</abc:NonMarketableSecurities>
      <srt:SomethingElse contextRef="i" unitRef="usd" decimals="-6">5</srt:SomethingElse>`);
    expect(parsed.facts.ext?.NonMarketableSecurities?.units.USD?.[0]?.val).toBe(51_157_000_000);
    expect(Object.keys(parsed.facts)).toEqual(["ext"]);
    expect(resolveReference({ op: "instant", concepts: ["ext:NonMarketableSecurities"] }, "@2026-06-30", parsed, "USD", "2026-10-29")).toMatchObject({ value: 51_157_000_000, points: [{ concept: "ext:NonMarketableSecurities", accn: Q }] });
  });
});
