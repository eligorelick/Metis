// FIN-407 (verifier r3-verify-3): when the B-37 rule ADMITS a multi-class
// issuer's filed diluted count, valueCompany pushes an info-severity entry under
// 'valuation.perShare.economicClassBasis' (valuation.ts:5873-5876). buildEpsSeries
// (projections.ts:683-694) finds ANY gap with that field, severity ignored, and
// withholds forecast operating EPS with the admission sentence as its reason.
// Fixture: the repo's own B-37 bundle shape (two classes, equal economics,
// basic 99.5M against 100M economic units), so the DCF per share IS published.
// Twin: the same bundle with no class evidence (single class).
// CORRECT behaviour asserted: an admission (info) entry is not a refusal, so the
// admitted issuer gets the same forecast EPS path as its single-class twin, and
// no "withheld" disclosure quotes the admission as its reason.
import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { currencyBundle, M } from "./helpers/currencyBundle";

function bundle(multiClass: boolean) {
  const b = currencyBundle({ sic: "3571" });
  b.edgar.registrant = { name: "Generic", cik10: "0000000042", sic: "3571", sicDescription: null, exchanges: [], tickers: [b.symbol], fiscalYearEnd: "1231", stateOfIncorporation: null, forms: ["10-K"] };
  if (!b.quote.ok) throw new Error("fixture quote unavailable");
  b.quote.value.asOf = "2026-07-06";
  b.quote.value.data.rows[0].timestamp = Date.parse("2026-07-06T20:00:00Z") / 1000;
  for (const r of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) {
    if (r.ok) for (const row of r.value.data.rows) row.weightedAverageShsOut = 99.5 * M;
  }
  if (multiClass) {
    b.economicShareEvidence = [{ issuerId: "0000000042", securityId: b.symbol, asOf: "2026-03-31", filed: "2026-05-06", effectiveFrom: "2026-03-31", effectiveTo: null,
      complete: true, sourceHash: "retained-capital-source", sourceIds: ["filed:capital"], classes: [
        { classId: b.symbol, shares: 80 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
        { classId: "B", shares: 20 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
      ] }];
  }
  return b;
}

function view(c: ReturnType<typeof runStageB>) {
  if (c.valuation.kind !== "dcf") throw new Error("fixture route");
  const eps = c.projections?.series?.find(s => s.metric === "epsDiluted") ?? null;
  return {
    kind: c.valuation?.kind ?? null,
    perShare: c.valuation?.dcf?.perShare ?? null,
    divisor: c.valuation?.dcf?.bridge?.dilutedShares ?? null,
    classGaps: (c.valuation?.gaps ?? []).filter(g => g.field === "valuation.perShare.economicClassBasis"),
    epsBase: (eps?.base ?? []).map(p => p.value?.value ?? p.value),
    epsDisclosures: eps?.disclosures ?? [],
  };
}

const single = view(runStageB(bundle(false)));
const multi = view(runStageB(bundle(true)));

describe("FIN-407: an admitted multi-class diluted count withholds forecast EPS", () => {
  it("setup holds: both publish the same DCF per share; the multi-class run carries only an info admission", () => {
    expect(single.kind).toBe("dcf");
    expect(multi.kind).toBe("dcf");
    expect(single.perShare).not.toBeNull();
    expect(multi.perShare as number).toBeCloseTo(single.perShare as number, 9);
    expect(multi.divisor).toBe(single.divisor);
    expect(multi.classGaps.map(g => g.severity)).toEqual(["info"]);
    expect(single.epsBase.length).toBeGreaterThan(0);
  });
  it("CORRECT: the admitted issuer gets the same base-case forecast EPS as its single-class twin", () => {
    expect(multi.epsBase).toEqual(single.epsBase);
  });
  it("CORRECT: no forecast-EPS withholding quotes the admission sentence as its reason", () => {
    const admission = multi.classGaps[0]?.reason ?? "<none>";
    const withheld = multi.epsDisclosures.filter(d => /Forecast operating EPS withheld/.test(d.reason));
    expect(withheld.map(d => d.reason)).not.toContain(`Forecast operating EPS withheld: ${admission}`);
  });
});

it("FIN-407 class-A filed units use the admitted quoted-share divisor", () => {
  const b = bundle(true);
  b.economicShareEvidence![0].classes = [
    { classId: b.symbol, shares: 50 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
    { classId: "A", shares: 50 / 1500 * M, countBasis: "outstanding", economicUnitsPerQuotedShare: 1500, priceBasis: "economic-equivalence-proxy" },
  ];
  for (const result of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) if (result.ok) for (const r of result.value.data.rows) {
    r.weightedAverageShsOut = 99.5 / 1500 * M;
    r.weightedAverageShsOutDil = 100 / 1500 * M;
  }
  const weighted = view(runStageB(b));
  expect(weighted.divisor).toBeCloseTo(100 * M, 0);
  expect(weighted.epsBase).toEqual(single.epsBase);
});
it("FIN-407 an actual class refusal still withholds EPS", () => {
  const b = bundle(true);
  for (const result of [b.statements.incomeAnnual, b.statements.incomeQuarterly]) if (result.ok) for (const r of result.value.data.rows) r.weightedAverageShsOut = 80 * M;
  const refused = view(runStageB(b));
  expect(refused.classGaps.map(g => g.severity)).toEqual(["warn"]);
  expect(refused.epsBase).toEqual([]);
  expect(refused.epsDisclosures.some(d => /withheld/.test(d.reason))).toBe(true);
});
