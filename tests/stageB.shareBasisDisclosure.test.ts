/**
 * D-265 (P3, P20): the bridge note and the market-value multiples' basis text say which share count each figure
 * sits on and the measured difference between them. A diluted divisor BELOW the count the quoted market cap implies
 * is never explained as option and RSU dilution (dilution can only raise a diluted count): a filed employee-trust or
 * unreleased-ESOP share count on or before the cutoff is named as filed evidence, and with none the cause is "not
 * established". Disclosure only: no market cap, EV, multiple or per-share value moves.
 *
 * Hermetic: the synthetic `currencyBundle` (price 100, diluted weighted count 100 M), with the quote's market cap set
 * so that the quote implies 95 M (divisor above) or 105 M (divisor below) shares.
 */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { CompanyFacts } from "@/edgar/xbrl";
import { compareShareBasis, employeeTrustSharesFiled, shareBasisNote, shareBasisRelation, shareBasisSentence } from "@/pipeline/stageB/dilutedDivisor";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { valuationAuditTables } from "@/report/auditTables";
import type { Dcf } from "@/report/schema";
import type { DataBundle } from "@/pipeline/types";
import { currencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

type Row = Record<string, unknown>;
const point = (end: string, val: number, extra: Record<string, unknown> = {}) =>
  ({ end, val, accn: "0000000000-26-000001", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-13", ...extra });
const factsOf = (tags: Record<string, { unit: string; points: ReturnType<typeof point>[] }>): CompanyFacts =>
  ({ cik: 1, entityName: "TEST", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([t, v]) => [t, { units: { [v.unit]: v.points } }])) } }) as unknown as CompanyFacts;
const trustFacts = (points: ReturnType<typeof point>[], tag = "CommonStockSharesHeldInEmployeeTrustShares"): CompanyFacts =>
  factsOf({ [tag]: { unit: "shares", points } });

/** The quote implies `impliedShares` shares at price 100. */
function bundle(impliedShares: number, facts?: CompanyFacts): DataBundle {
  const b = currencyBundle();
  const quote = (b.quote as unknown as { value: { data: { rows: Row[] } } }).value.data.rows[0]!;
  quote.marketCap = impliedShares * 100;
  const profile = (b.profile as unknown as { value: { data: { rows: Row[] } } }).value.data.rows[0]!;
  profile.marketCap = impliedShares * 100;
  return facts === undefined ? b : withIssuerFacts(b, facts);
}

const dcfOf = (b: DataBundle) => {
  const out = runStageB(b);
  if (out.valuation.kind !== "dcf" || !out.valuation.dcf) throw new Error("expected the DCF route");
  return { out, dcf: out.valuation.dcf };
};
const d60 = (notes: readonly string[]) => notes.find((n) => n.startsWith("Per-share values divide by"));
type StageB = ReturnType<typeof runStageB>;
const displayOf = (out: StageB) => computeDcfDisplay(out.valuation, "USD") as unknown as Dcf;
const tableNote = (dcf: Dcf) => valuationAuditTables(dcf).find((t) => t.heading === "Enterprise value to equity bridge")?.note ?? "";
const bridgeNote = (out: StageB) => tableNote(displayOf(out));

describe("D-265: the filed employee-trust share count (P2 cutoff, unit and instant)", () => {
  it("reads the newest instant on or before the cutoff, in shares, from a core form", () => {
    const facts = trustFacts([
      point("2024-12-31", 48 * M, { filed: "2025-02-13", accn: "0000000000-25-000001" }),
      point("2025-12-31", 5 * M),
      // A duration fact is not a held count.
      point("2025-12-31", 9 * M, { start: "2025-01-01" }),
    ]);
    expect(employeeTrustSharesFiled(facts, "2026-07-06")).toEqual({
      tag: "CommonStockSharesHeldInEmployeeTrustShares", shares: 5 * M, instant: "2025-12-31",
      accession: "0000000000-26-000001", form: "10-K", filed: "2026-02-13",
    });
  });

  it("a fact filed after the cutoff, or for an instant after it, is not used", () => {
    expect(employeeTrustSharesFiled(trustFacts([point("2025-12-31", 5 * M, { filed: "2026-08-01" })]), "2026-07-06")).toBeNull();
    expect(employeeTrustSharesFiled(trustFacts([point("2026-09-30", 5 * M, { filed: "2026-07-01" })]), "2026-07-06")).toBeNull();
    // An older admissible fact still stands beside a post-cutoff one.
    const mixed = trustFacts([point("2024-12-31", 4 * M, { filed: "2025-02-13" }), point("2025-12-31", 5 * M, { filed: "2026-08-01" })]);
    expect(employeeTrustSharesFiled(mixed, "2026-07-06")?.shares).toBe(4 * M);
  });

  it("controls: another unit, a non-core form, a zero, no facts and an invalid cutoff read nothing", () => {
    expect(employeeTrustSharesFiled(factsOf({ CommonStockSharesHeldInEmployeeTrustShares: { unit: "USD", points: [point("2025-12-31", 5 * M)] } }), "2026-07-06")).toBeNull();
    expect(employeeTrustSharesFiled(trustFacts([point("2025-12-31", 5 * M, { form: "8-K" })]), "2026-07-06")).toBeNull();
    expect(employeeTrustSharesFiled(trustFacts([point("2025-12-31", 0)]), "2026-07-06")).toBeNull();
    expect(employeeTrustSharesFiled(null, "2026-07-06")).toBeNull();
    expect(employeeTrustSharesFiled(trustFacts([point("2025-12-31", 5 * M)]), "")).toBeNull();
  });

  it("review 2: the newest compatible observation wins before the positive test; a newer zero leaves nothing to cite", () => {
    // The same instant corrected to zero in a later filing, both before the cutoff.
    const corrected = trustFacts([point("2025-12-31", 5 * M, { filed: "2026-02-13" }),
      point("2025-12-31", 0, { filed: "2026-05-06", form: "10-Q", accn: "0000000000-26-000002" })]);
    expect(employeeTrustSharesFiled(corrected, "2026-07-06")).toBeNull();
    // A newer instant filed at zero.
    const newerZero = trustFacts([point("2025-12-31", 5 * M), point("2026-03-31", 0, { filed: "2026-05-06", form: "10-Q", accn: "0000000000-26-000002" })]);
    expect(employeeTrustSharesFiled(newerZero, "2026-07-06")).toBeNull();
    // Control: a zero filed after the cutoff does not supersede the admitted positive (P2).
    const lateZero = trustFacts([point("2025-12-31", 5 * M), point("2025-12-31", 0, { filed: "2026-08-01", accn: "0000000000-26-000003" })]);
    expect(employeeTrustSharesFiled(lateZero, "2026-07-06")?.shares).toBe(5 * M);
  });

  it("an unreleased (suspense) ESOP share count is the same class of filed evidence", () => {
    const facts = trustFacts([point("2025-12-31", 3 * M)], "EmployeeStockOwnershipPlanESOPNumberOfSuspenseShares");
    expect(employeeTrustSharesFiled(facts, "2026-07-06")).toMatchObject({ tag: "EmployeeStockOwnershipPlanESOPNumberOfSuspenseShares", shares: 3 * M });
  });
});

describe("D-265: the comparison and its wording, four shapes", () => {
  const trust = { tag: "CommonStockSharesHeldInEmployeeTrustShares" as const, shares: 5 * M, instant: "2025-12-31",
    accession: "0000000000-26-000001", form: "10-K", filed: "2026-02-13" };

  it("review 4: one statement with one denominator, the divisor against the quoted count", () => {
    const below = compareShareBasis(100 * M, 105 * M, null)!;
    const above = compareShareBasis(105 * M, 100 * M, null)!;
    expect(shareBasisRelation(below)).toBe("4.76% below");
    expect(shareBasisRelation(above)).toBe("5% above");
    for (const text of [shareBasisNote(below, "2026-07-05")!, shareBasisSentence(below, true)!, shareBasisSentence(below, false)!]) {
      expect(text).toMatch(/4\.76% below/);
      expect(text).not.toMatch(/% (more|fewer)/);
    }
    expect(shareBasisSentence(above, true)).toMatch(/\(latest 105M\), 5% above that count\./);
  });

  it("divisor above the quoted count: ordinary dilution, no below-count text", () => {
    const c = compareShareBasis(100 * M, 95 * M, trust);
    expect(c).toMatchObject({ divisorShares: 100 * M, quoteShares: 95 * M, direction: "above", cause: "dilution-or-share-changes" });
    expect(c?.employeeTrust).toBeUndefined();
    expect(shareBasisNote(c!, "2026-07-05")).toBeNull();
  });

  it("review 1: divisor below with a filed trust count: the dated fact stated neutrally; the cause is not established", () => {
    const c = compareShareBasis(100 * M, 105 * M, trust)!;
    expect(c).toMatchObject({ direction: "below", cause: "not-established", shortfallShares: 5 * M, employeeTrust: trust });
    expect(c.differencePct).toBeCloseTo((100 / 105 - 1) * 100, 10);
    const note = shareBasisNote(c, "2026-07-05")!;
    expect(note).toMatch(/The diluted divisor \(100M\) is 4\.76% below the 105M shares the quoted market cap implies \(5M shares fewer\)/);
    expect(note).toMatch(/option and RSU dilution can only raise a diluted count, so it does not explain this difference/);
    expect(note).toMatch(/The filer reports 5M shares held in an employee trust \(us-gaap:CommonStockSharesHeldInEmployeeTrustShares\) at 2025-12-31 \(10-K 0000000000-26-000001, filed 2026-02-13\), a dated observation before the quote \(2026-07-05\)/);
    expect(note).toMatch(/the cause of the difference is not established by the admitted evidence/);
    const sentence = shareBasisSentence(c, true)!;
    expect(sentence).toMatch(/the filer reports 5M shares held in an employee trust \(us-gaap:CommonStockSharesHeldInEmployeeTrustShares\) at 2025-12-31 \(10-K 0000000000-26-000001, filed 2026-02-13\), a dated observation/);
    for (const text of [note, sentence]) {
      expect(text).not.toMatch(/inside the quoted count|leave them out|outside EPS|can explain|explains it|Filed evidence/);
      expect(text).not.toMatch(/carries option and RSU dilution/);
    }
  });

  it("divisor below with no filed explanation: the cause is not established", () => {
    const c = compareShareBasis(100 * M, 105 * M, null)!;
    expect(c).toMatchObject({ direction: "below", cause: "not-established" });
    const note = shareBasisNote(c, "2026-07-05")!;
    expect(note).toMatch(/cause of the difference is not established/);
    expect(note).not.toMatch(/employee trust/i);
  });

  it("review 3: a multi-class or ADS shape defers the whole statement to its owner: no counts, no basis sentence", () => {
    for (const [owner, words] of [["class", /share-class note/], ["quoted-unit", /ADS \(quoted-unit\) note/]] as const) {
      for (const quote of [105 * M, 95 * M]) {
        const c = compareShareBasis(100 * M, quote, trust, { scopeOwner: owner })!;
        expect(c).toMatchObject({ cause: "scope-owner", scopeOwner: owner });
        expect(c.employeeTrust).toBeUndefined();
        const note = shareBasisNote(c, "2026-07-05")!;
        expect(note).toMatch(words);
        expect(note).not.toMatch(/\d+(\.\d+)?%|\d+M|employee|dilution/i);
        expect(shareBasisSentence(c, true)).toBeNull();
        expect(shareBasisSentence(c, false)).toBeNull();
      }
    }
  });

  it("a difference under the 0.1% display threshold reads as agreement and attributes nothing", () => {
    const c = compareShareBasis(100 * M, 100.05 * M, null)!;
    expect(c.direction).toBe("below");
    expect(shareBasisNote(c, "2026-07-05")).toMatch(/agree within 0\.1%; no cause is attributed/);
    expect(shareBasisSentence(c, true)).toMatch(/\(latest 100M\), within 0\.1% of that count\.$/);
  });

  it("no comparison without two positive counts", () => {
    expect(compareShareBasis(null, 105 * M, null)).toBeNull();
    expect(compareShareBasis(100 * M, 0, null)).toBeNull();
  });
});

describe("D-265: runStageB, the bridge note and the multiples basis text", () => {
  const trust = trustFacts([point("2025-12-31", 5 * M)]);

  it("ordinary dilution (divisor above the quoted count): the present sentences stand", () => {
    const { out, dcf } = dcfOf(bundle(95 * M, trust));
    expect(d60([...out.valuation.notes, ...dcf.notes])).toMatch(/The gap is option and RSU dilution plus repurchases or issuance since the quarter/);
    expect(bridgeNote(out)).toMatch(/The diluted weighted-average count carries option and RSU dilution the quoted share count omits\./);
    expect(dcf.bridge.shareBasis).toMatchObject({ direction: "above", divisorShares: 100 * M });
  });

  it("divisor below with a filed trust count: both notes name the filed fact; no dilution attribution", () => {
    const { out, dcf } = dcfOf(bundle(105 * M, trust));
    for (const note of [d60([...out.valuation.notes, ...dcf.notes])!, bridgeNote(out)]) {
      expect(note).toMatch(/The filer reports 5M shares held in an employee trust \(us-gaap:CommonStockSharesHeldInEmployeeTrustShares\) at 2025-12-31/);
      expect(note).toMatch(/cause of the difference is not established by the admitted evidence/);
      expect(note).not.toMatch(/The gap is option and RSU dilution|carries option and RSU dilution the quoted share count omits|inside the quoted count|% (more|fewer)/);
    }
    expect(d60([...out.valuation.notes, ...dcf.notes])).toMatch(/implies 105M shares outstanding at the quote, and the divisor is 4\.76% below that count\./);
    expect(dcf.bridge.shareBasis).toMatchObject({ direction: "below", cause: "not-established", employeeTrust: { shares: 5 * M } });
    if (out.valuation.kind !== "dcf") throw new Error("expected the DCF route");
    const rows = out.valuation.multiples.multiples;
    for (const key of ["priceToFcf", "priceToBook", "evToSales", "evToEbitda"]) {
      const row = rows.find((m) => m.key === key);
      if (row?.current === null || row === undefined) continue;
      expect(row.basis).toMatch(/Share basis: market cap is the quote price × the 105M shares the provider's market cap implies; diluted EPS and per-share values divide by weighted-average diluted shares \(latest 100M\), 4\.76% below that count\. The difference is not dilution, and its cause is not established by the admitted evidence; the filer reports 5M shares held in an employee trust \(us-gaap:CommonStockSharesHeldInEmployeeTrustShares\) at 2025-12-31 \(10-K 0000000000-26-000001, filed 2026-02-13\)\.$/);
      // The fixture's quote is 2025-07-05, so the 2025-12-31 count is not older than the quote and is not called dated.
      expect(row.basis).not.toMatch(/dated observation/);
    }
    const pe = rows.find((m) => m.key === "peTtm")?.basis;
    expect(pe).toMatch(/Share basis: price \/ diluted EPS sits on weighted-average diluted shares \(latest 100M\); the market-cap multiples sit on the 105M shares the quoted market cap implies, and the diluted count is 4\.76% below that count\./);
    expect(pe).not.toMatch(/% (more|fewer)/);
  });

  it("divisor below with no filed fact, and with the only fact filed after the cutoff: not established", () => {
    for (const facts of [undefined, trustFacts([point("2025-12-31", 5 * M, { filed: "2026-08-01" })])]) {
      const { out, dcf } = dcfOf(bundle(105 * M, facts));
      expect(dcf.bridge.shareBasis).toMatchObject({ direction: "below", cause: "not-established" });
      expect(dcf.bridge.shareBasis?.employeeTrust).toBeUndefined();
      for (const note of [d60([...out.valuation.notes, ...dcf.notes])!, bridgeNote(out)]) {
        expect(note).toMatch(/cause of the difference is not established/);
        expect(note).not.toMatch(/The gap is option and RSU dilution|carries option and RSU dilution the quoted share count omits/);
      }
    }
  });

  it("review 2: a trust count corrected to zero before the cutoff is not cited", () => {
    const corrected = trustFacts([point("2025-12-31", 5 * M), point("2025-12-31", 0, { filed: "2026-05-06", form: "10-Q", accn: "0000000000-26-000002" })]);
    const { out, dcf } = dcfOf(bundle(105 * M, corrected));
    expect(dcf.bridge.shareBasis).toMatchObject({ direction: "below", cause: "not-established" });
    expect(dcf.bridge.shareBasis?.employeeTrust).toBeUndefined();
    expect(bridgeNote(out)).not.toMatch(/employee trust \(us-gaap/);
  });

  it("review 3 control: a two-class issuer whose diluted economic count is not admitted: the class owner speaks and no share-basis sentence appears", () => {
    const b = bundle(100 * M, trust);
    b.edgar.registrant = { name: "Generic", cik10: "0000000001", sic: "3571", sicDescription: null, exchanges: [], tickers: [b.symbol], fiscalYearEnd: "1231", stateOfIncorporation: null, forms: ["10-K"] };
    if (!b.quote.ok) throw new Error("fixture quote unavailable");
    b.quote.value.asOf = "2026-07-06";
    (b.quote.value.data.rows[0] as Row).timestamp = Date.parse("2026-07-06T20:00:00Z") / 1000;
    b.economicShareEvidence = [{ issuerId: "0000000001", securityId: b.symbol, asOf: "2026-03-31", filed: "2026-05-06", effectiveFrom: "2026-03-31", effectiveTo: null,
      complete: true, sourceHash: "retained-capital-source", sourceIds: ["filed:capital"], classes: [
        { classId: b.symbol, shares: 100 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
        { classId: "B", shares: 10 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price", observedPrice: { value: 100, currency: "USD", asOf: "2026-07-06", sourceIds: ["quote:B"], sourceHash: "retained-B-quote" } },
      ] }];
    const out = runStageB(b);
    expect(out.valuation.multiples?.enterpriseValue.equityScope?.status).toBe("resolved");
    for (const row of out.valuation.multiples?.multiples ?? []) expect(row.basis).not.toMatch(/Share basis:/);
    for (const c of out.valuation.multiples?.peerCoverage?.comparisons ?? []) expect(c.basis).not.toMatch(/Share basis:/);
    if (out.valuation.kind === "dcf" && out.valuation.dcf?.bridge.shareBasis) {
      expect(out.valuation.dcf.bridge.shareBasis).toMatchObject({ cause: "scope-owner", scopeOwner: "class" });
      expect(bridgeNote(out)).toMatch(/share-class note/);
      expect(bridgeNote(out)).not.toMatch(/100M|carries option and RSU dilution/);
    }
  });

  it("disclosure only: the trust fact moves no market cap, EV, multiple or per-share value", () => {
    const withTrust = runStageB(bundle(105 * M, trust));
    const without = runStageB(bundle(105 * M));
    if (withTrust.valuation.kind !== "dcf" || without.valuation.kind !== "dcf") throw new Error("expected the DCF route");
    expect(withTrust.valuation.dcf?.perShare).toBe(without.valuation.dcf?.perShare);
    expect(withTrust.valuation.dcf?.bridge.dilutedShares).toBe(without.valuation.dcf?.bridge.dilutedShares);
    expect(withTrust.valuation.multiples.enterpriseValue).toEqual(without.valuation.multiples.enterpriseValue);
    expect(withTrust.valuation.multiples.multiples.map((m) => m.current)).toEqual(without.valuation.multiples.multiples.map((m) => m.current));
    expect(withTrust.scores).toEqual(without.scores);
  });

  it("a stored bridge without the disclosure field: the read-time note follows the two stored counts", () => {
    const { out } = dcfOf(bundle(105 * M));
    const display = displayOf(out);
    expect(display.bridge?.shareBasisNote).toMatch(/cause of the difference is not established/);
    const legacy = { ...display, bridge: { ...display.bridge!, shareBasisNote: undefined } } as Dcf;
    const note = tableNote(legacy);
    expect(note).toMatch(/below the 105(\.00)?M shares outstanding at the quote; option and RSU dilution can only raise a diluted count/);
    expect(note).not.toMatch(/carries option and RSU dilution the quoted share count omits/);
  });
});
