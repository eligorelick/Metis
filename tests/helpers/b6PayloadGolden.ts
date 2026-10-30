import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import { fnv1a32, payloadFingerprint, serializePayloadForPrompt, type ContextPayload } from "@/pipeline/stageC/payload";

// D-136, 2026-10-30 B6: pin the live bytes first, then restore ONLY enumerated
// Task7/18/19/21/22/23/25 changes to preserve every pre-B6 golden assertion.
// The fixture has no peer comparison or own P/E history; Tasks5A/20/24 do not fire.
const wording = [
  {
    "task": "19 / FIN-125",
    "now": "FMP discovery candidates; at most 10 candidate profiles and three additional cached endpoints each, within 25s. Exact normalized industry AND sector; same valuation route and listing/reporting currency; market capitalization within 100× of the subject's either way, compared only between established equal currencies or same-market listings; known CIK deduplicates issuers/share classes; non-ADR equities only. When the subject's route rests on SEC evidence, same-label peers whose route the profile-only screen cannot confirm are excluded as unconfirmed; no additional SEC routing request is made.",
    "before": "FMP discovery candidates; at most 10 candidate profiles and three additional cached endpoints each, within 25s. Exact normalized industry AND sector; same valuation route and listing/reporting currency; market capitalization within 100× of the subject's either way, compared only between established equal currencies or same-market listings; known CIK deduplicates issuers/share classes; non-ADR equities only.",
    "computed": 2,
    "payload": 1
  },
  {
    "task": "18+22 / FIN-126+504",
    "now": "P/B uses market cap / common equity: explicit common equity when disclosed, otherwise parent stockholders equity less preferred; consolidated equity also requires a disclosed noncontrolling-equity allocation. Undisclosed preferred reads as zero, as for the subject; the positive reported-equity admission gate remains. P/TBV subtracts goodwill, intangible assets and explicitly disclosed preferred equity. Common-earnings comparison uses market cap / four contiguous quarters of earnings available to common. No forward EPS, currency conversion or share-class EPS assumptions. The company figure's market capitalization is the issuer-common one the multiples use: the class sum where the share classes are established, the provider's cap where its scope is only unverified, and none where the scope is unresolved; the peer median is then still shown as context (B-8).",
    "before": "P/B uses market cap / total stockholders equity; P/TBV subtracts goodwill, intangible assets and explicitly disclosed preferred equity. Common-earnings comparison uses market cap / four contiguous quarters of earnings available to common. No forward EPS, currency conversion or share-class EPS assumptions.",
    "computed": 2,
    "payload": 1
  },
  {
    "task": "23 / FIN-503",
    "now": "Medians require at least four distinct issuers surviving nonpositive/missing exclusions and the 1.5×IQR rule for that metric. EV, cash-flow and REIT peer metrics are withheld because comparable definitions are unproven. These peer observations do not change grades or intrinsic value. A peer whose four trailing quarters' non-operating income (pre-tax less operating income) exceeds 25% of positive pre-tax income is left out of the common-earnings and P/E medians, and a subject that fails the same test gets no company figure (house rule D-98); the test runs only where every quarter carries pre-tax and operating income, as for the subject's own P/E.",
    "before": "Medians require at least four distinct issuers surviving nonpositive/missing exclusions and the 1.5×IQR rule for that metric. EV, cash-flow and REIT peer metrics are withheld because comparable definitions are unproven. These peer observations do not change grades or intrinsic value.",
    "computed": 2,
    "payload": 1
  },
  {
    "task": "25 / D-136 stamps",
    "now": "SCORE_BANDS_2026_10_FINANCIAL_ROUTE_EVIDENCE",
    "before": "SCORE_BANDS_2026_10_REGULATED_UTILITY",
    "computed": 1,
    "payload": 18
  }
] as const;

export function restoreB6Golden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  const live = input.payload, computed = structuredClone(input.computed);
  if (!live.citationRegistry || !live.provenanceRegistry) throw new Error("B6 golden requires both registries");
  const finance = { scores: computed.scores, projections: computed.projections, valuation: computed.valuation, fairValue: computed.fairValue, scenarioTargets: computed.scenarioTargets };
  expect({ fingerprint: payloadFingerprint(live), promptBytes: Buffer.byteLength(serializePayloadForPrompt(live)),
    provenanceCount: live.provenanceRegistry!.length, provenanceHash: fnv1a32(JSON.stringify(live.provenanceRegistry)),
    provenanceIdsHash: fnv1a32(JSON.stringify(live.provenanceRegistry!.map(r=>r.id))), citationCount: live.citationRegistry.length,
    citationHash: fnv1a32(JSON.stringify(live.citationRegistry)), financeHash: fnv1a32(JSON.stringify(finance)),
  }).toEqual({
  "fingerprint": "1.53.0:deaeac72",
  "promptBytes": 145245,
  "provenanceCount": 530,
  "provenanceHash": "09ed4d9d",
  "provenanceIdsHash": "951b34ca",
  "citationCount": 77,
  "citationHash": "78b87168",
  "financeHash": "68685377"
});
  const restore = <T,>(value:T,scope:"computed"|"payload"):T => {
    const counts=wording.map(()=>0);
    const restored=JSON.parse(JSON.stringify(value,(_key,leaf:unknown)=>typeof leaf!=="string"?leaf:wording.reduce((text,row,index)=>{
      counts[index]+=text.split(row.now).length-1;return text.split(row.now).join(row.before);
    },leaf))) as T;
    expect(counts).toEqual(wording.map(row=>row[scope]));
    return restored;
  };
  const c=restore(computed,"computed"),payload=restore(live,"payload");
  if (!payload.citationRegistry || !payload.provenanceRegistry) throw new Error("B6 restoration lost a registry");
  // Task21 adds only an optional, unrounded share to this finance block.
  expect(c.scores.assessments!.businessQuality.evidenceCompleteness).toBe(0.8502008318478906);
  delete c.scores.assessments!.businessQuality.evidenceCompleteness;
  // Task25 header; old exact fingerprint checks below still check1.52.0.
  expect(payload.payloadVersion).toBe("1.53.0");payload.payloadVersion="1.52.0";
  // Task7: the sole priced repurchase year has no full-window price coverage.
  // Restore its old ungraded proxy, original record position and coverage note.
  const section=payload.computed[2],figure=section.figures[13];
  expect(figure).toEqual({
  "label": "current quote vs proxy buyback price (price appreciation since repurchases, not graded)",
  "value": null,
  "unit": "%",
  "source": "computed.capital.buybackPriceAnalysis",
  "asOf": "2025-09-27",
  "currency": null,
  "period": null
});
  Object.assign(figure,{
  "label": "current quote vs proxy buyback price (price appreciation since repurchases, not graded)",
  "value": 2.2903225806451655,
  "unit": "%",
  "source": "computed.capital.buybackPriceAnalysis",
  "asOf": "2025-09-27",
  "currency": null,
  "period": null,
  "provenanceId": "computed.capital-cash.current-quote-vs-proxy-buyback-price-price-appreciation-since-repurchases-not-graded"
});
  expect(payload.provenanceRegistry!.some(r=>r.id==="computed.capital-cash.current-quote-vs-proxy-buyback-price-price-appreciation-since-repurchases-not-graded")).toBe(false);
  expect(payload.provenanceRegistry![48].id).toBe("computed.forensics.beneish-m");
  payload.provenanceRegistry!.splice(48,0,{
  "id": "computed.capital-cash.current-quote-vs-proxy-buyback-price-price-appreciation-since-repurchases-not-graded",
  "label": "current quote vs proxy buyback price (price appreciation since repurchases, not graded)",
  "kind": "computed",
  "value": 2.2903225806451655,
  "unit": "percent",
  "currency": null,
  "period": null,
  "asOf": "2025-09-27",
  "origin": "computed.capital.buybackPriceAnalysis",
  "formulaVersion": "stage-b-v1",
  "displayPrecision": 4
});
  const gaps=payload.citationRegistry.filter(r=>r.id==="computed.capital.buybackPriceAnalysis");
  expect(gaps).toEqual([{"id":"computed.capital.buybackPriceAnalysis","kind":"payload-gap","asOf":"2025-09-27","origin":"computed.capital.buybackPriceAnalysis"}]);
  payload.citationRegistry=payload.citationRegistry.filter(r=>r.id!=="computed.capital.buybackPriceAnalysis");
  expect(section.notes[3]).toBe("Free cash flow = operating cash flow + capital expenditure (FMP capex negative), MINUS stock-based compensation (house default: SBC is a cash-equivalent operating expense settled in shares, not a genuine add-back — Damodaran, \"Stock Based Compensation: The Elephant in the Room\"). Both the before- and after-SBC figures are reported; the deduction is the cash-flow SBC add-back for compensation expensed or amortized during the period, not all grants or capitalized awards not yet expensed. FCF remains consolidated; NCI net income is not a parent cash-flow allocation. years with no disclosed SBC are unadjusted and say so. TWO conversion ratios are published and never conflated: FCF-after-SBC / net income is the house-default headline, and FCF-before-SBC / net income is the ratio the unbacktested balance-sheet grading band uses and the one that is GRADED — grading the after-SBC ratio on that band would charge the same expense twice, because SBC as a percentage of free cash flow is already a scored metric.");
  expect(section.notes).not.toContain("buyback price proxy covers 20.554% of buyback dollars (some years lack market-cap/share data)");
  section.notes.splice(3,0,"buyback price proxy covers 20.554% of buyback dollars (some years lack market-cap/share data)");
  // Assert exact main bytes before any older restoration chain runs.
  expect(payloadFingerprint(payload)).toBe("1.52.0:4257f13c");
  expect(fnv1a32(JSON.stringify({scores:c.scores,projections:c.projections,valuation:c.valuation,fairValue:c.fairValue,scenarioTargets:c.scenarioTargets}))).toBe("e5b05d9e");
  return { computed:c,payload };
}
