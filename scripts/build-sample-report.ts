/** Entirely invented inputs and prose. No provider/model clients are invoked. */
import { writeFileSync } from "node:fs";
import { completeCurrencyBundle, M } from "../tests/helpers/currencyBundle";
import { runStageB } from "../src/pipeline/compute";
import { validateBundle } from "../src/pipeline/stageA/validate";
import { assembleContextPayload } from "../src/pipeline/stageC/payload";
import { assembleReport, runVerifyPass } from "../src/pipeline/stageC/passes";
import { enrichDataOnlyReport } from "../src/pipeline/stageC/dataOnlyReport";
import { FRED_ATTRIBUTION_TEXT, ReportSchema, type JudgeOutput, type SourcedClaim } from "../src/report/schema";
import { fundamentalsChartDataFromBundle, priceChartPropsFromBundle, relativeStrengthSeriesFromBundle } from "../src/components/charts/map";

const generatedAt = "2026-11-03T12:00:00.000Z";
const bundle = completeCurrencyBundle({ symbol: "DEMO", annualCurrency: "USD", siblingQuarterCurrencies: Array(4).fill("USD"), estimateCurrency: "USD", priceTargetCurrency: "USD", sic: "3571" });
// Reuse only the synthetic helper's invented statements. All identity and quote
// fields below belong to this fictional issuer. July is the frozen evidence date.
if (!bundle.profile.ok || !bundle.quote.ok || !bundle.eodPrices.ok) throw new Error("Missing synthetic inputs");
Object.assign(bundle.profile.value.data.rows[0]!, { companyName: "Thesis Example Systems", industry: "Workflow systems", description: "Fictional workflow hardware and support subscriptions for regional warehouses.", price: 32, marketCap: 3200 * M });
Object.assign(bundle.quote.value.data.rows[0]!, { price: 32, marketCap: 3200 * M, timestamp: Date.parse("2026-07-02T21:00:00Z") / 1000 });
bundle.quote.value.asOf = "2026-07-02";
bundle.eodPrices.value.data.rows = bundle.eodPrices.value.data.rows.filter(row => {
  const day = new Date(`${row.date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
});
for (const row of bundle.eodPrices.value.data.rows) for (const key of ["open", "high", "low", "close", "adjClose"] as const) if (typeof row[key] === "number") row[key] *= 0.32;
bundle.sharesFloat = { ok: true, value: { source: "fmp", endpoint: "synthetic/shares", asOf: "2026-07-02", fetchedAt: bundle.builtAt, data: { rows: [{ date: "2026-07-02", outstandingShares: 100 * M }], raw: {} } } };
if (bundle.priceTargetConsensus.ok) Object.assign(bundle.priceTargetConsensus.value.data.rows[0]!, { targetConsensus: 34, targetHigh: 40, targetLow: 30 });
bundle.macro.core.DGS10 = { ok: true, value: { source: "fred", endpoint: "synthetic/risk-free-assumptions", asOf: "2026-07-02", fetchedAt: bundle.builtAt, data: [2022, 2023, 2024, 2025].map(year => ({ date: `${year}-12-31`, value: 4 })).concat([{ date: "2026-07-02", value: 4 }]) } };
// Provider enums describe the input adapter shape, never actual retrieval.
bundle.gaps.push({ field: "fixture.reserved(DEMO)", reason: "Entirely fictional issuer, people, sources and figures. Evidence is frozen in July 2026; this is not a live market snapshot.", severity: "info" });
bundle.sourceManifest = { synthetic: { provider: "fmp", endpoint: "synthetic/invented-inputs-no-retrieval", asOf: "2026-07-02", fetchedAt: bundle.builtAt, stale: false } };

const claim = (text: string, label: SourcedClaim["label"] = "JUDGMENT", source = "fmp:profile"): SourcedClaim => ({ text, label, source, asOf: "2026-07-02" });
const g = () => ({ grade: "B" as const, oneLineWhy: "Recurring support helps cushion a cyclical installation business.", reasoning: [claim("Support relationships offer some resilience, but new installations still depend on customer budgets.")], confidence: "medium" as const, keyNumbers: [] });
const num = (value: number) => ({ value, unit: "USD/share", currency: "USD", source: "computed", asOf: null, verified: null });
const judge: JudgeOutput = {
  verdict: {
    synthesis: "Thesis Example Systems combines a growing installation base with recurring support. Cash generation is encouraging, but the valuation depends on preserving margins as customers expand more slowly. This fictional case illustrates a sound business with execution risk rather than a recommendation.",
    executiveSummary: [claim("The attractive feature is the support relationship after installation; the weak point is dependence on warehouse investment cycles."), claim("The model's fair value and scenario range are sensitivities to operating assumptions, not forecasts of a future share price.")],
    gradeStrip: { fundamentals: g(), valuation: g(), technicals: g(), quality: g(), leadership: g(), moat: g() },
  },
  business: { whatTheySell: [claim("Fictional workflow hardware and support subscriptions for regional warehouses.", "FACT")], marketStructure: [claim("Installation work is fragmented. Support contracts are stickier because replacing a system interrupts warehouse operations."), claim("No independently measured market size or market share is supplied in this invented case.")], segments: { product: [], geographic: [] }, concentrationRisks: [claim("A slowdown in warehouse expansion could delay installations even if existing customers renew support.")] },
  fundamentals: { graded: g(), growthTable: [], marginTrend: [], returns: [], fcf: [], commentary: [claim("Revenue growth is useful only if it converts into cash. Watch working capital as installation volumes rise.")] },
  balanceSheet: { debtProfile: { commentary: [claim("The invented balance sheet has no funded debt. Operating liabilities still require cash and should not be treated as free financing.")], numbers: [] }, coverage: { commentary: [claim("Liquidity provides a cushion for uneven customer payments; there is no interest burden in this case.")], numbers: [] }, capexTrajectory: { commentary: [claim("Maintenance and installation capacity require continuing capital spending.")], numbers: [] }, capitalAllocation: [claim("Preserving liquidity takes priority over an acquisition-led expansion in this scenario.")] },
  valuation: { graded: g(), dcf: { perShare: num(0), assumptions: [], sensitivityGrid: [], upsidePct: null }, reverseDcf: { impliedMetric: "revenue growth", impliedValue: null, narrative: "Compare the market-implied growth requirement with the operating scenarios; neither is a promise of delivery." }, multiples: [], scenarios: (["bull", "base", "bear"] as const).map(name => ({ name, probability: name === "base" ? 0.5 : 0.25, priceTarget: num(0), horizon: "12mo", assumptions: [name === "bull" ? "Faster installations and resilient margins" : name === "bear" ? "Slower installations and margin pressure" : "Steady growth and measured reinvestment"], whatWouldHaveToBeTrue: ["Cash collection keeps pace with recognized revenue"] })) },
  quality: { graded: g(), forensicScores: { altman: { variant: "Z", score: null, zone: null }, beneish: { variant: "M", score: null, zone: null }, piotroski: { variant: "F", score: null, zone: null }, accruals: { variant: "cash-flow", score: null, zone: null } }, flags: [] },
  technicals: { graded: g(), read: { trend: "Measured from the invented price series", momentum: "A persistent rise can reverse quickly when operating expectations change.", keyLevels: "Moving averages provide reference levels rather than guaranteed support.", relativeStrength: "No external benchmark is supplied in this fictional case." }, indicators: [], flags: [] },
  leadership: { graded: g(), executives: [
    { name: "Mira Vale", title: "Chief Executive Officer", tenureYears: 4, grade: "not-assessed", credibilityGrade: "not-assessed", assessmentReason: "The fictional case supplies a strategy action, but no guidance-versus-actual history sufficient to grade this executive.", reasoning: [claim("A focus on supporting installed systems is sensible; execution evidence remains limited.")], evidence: { capitalAllocation: [claim("The fictional plan favors service capacity over acquisitions.")] } },
    { name: "Jonas Pell", title: "Chief Financial Officer", tenureYears: 2, grade: "not-assessed", credibilityGrade: "not-assessed", assessmentReason: "No independently supported personal track record is supplied in this fictional case.", reasoning: [claim("Cash discipline matters most when customers delay installation payments.")], evidence: {} },
  ], managementActions: [{ occurredOn: "2026-06-15", actor: "board", category: "strategy", action: [claim("In this invented June strategy note, the board prioritized service capacity over acquisitions.", "FACT", "synthetic:strategy-note")], assessment: [claim("The plan appears consistent with protecting liquidity, but future delivery remains uncertain.")], shareholderAlignment: "aligned" }], insiderSummary: [claim("No insider transactions are supplied; absence of records does not establish absence of activity.")], governanceNotes: [claim("The invented strategy note does not establish board independence or compensation alignment.")] },
  competitive: { moatGraded: g(), competitors: [claim("In this fictional market, Lantern Quay Automation competes on installation price and Bramble Circuit Works competes on support coverage.", "FACT", "synthetic:market-note"), claim("Thesis Example Systems appears better placed in support continuity than in winning the cheapest installation bid.")], peerTable: [], moatAssessment: [{ source: "switchingCosts", strength: "narrow", reasoning: [claim("Replacement requires retraining and downtime, but does not prevent customers from switching.")] }], marketShareDirection: "Share direction is unmeasured; growth alone does not establish share gains." },
  catalystsRisks: { catalysts: [{ title: "Support capacity expansion", expectedDate: "2027", direction: "mixed", significance: "medium", reasoning: [claim("More service capacity could improve renewals, while additional staff costs could arrive before revenue.", "ESTIMATE")] }], risks: [{ title: "Customer investment delays", severity: "high", probability: "unknown", source: "fmp:profile", reasoning: [claim("Delayed warehouse projects could reduce installations and weaken cash conversion.")] }] },
  outlook: { segmentTrajectories: [claim("Support should be steadier than installation demand, subject to renewals and service quality.", "ESTIMATE")], estimateRevisionTrend: [claim("Only a single invented estimate snapshot is supplied; a revision trend cannot be inferred.")], guidanceCredibility: [claim("There is no multi-period guidance scorecard, so management credibility remains unassessed.")], scenarioNarratives: { y1: [claim("Customer payment timing is the near-term test of earnings quality.", "ESTIMATE")], y3: [claim("Support relationships could deepen if service reliability holds.", "ESTIMATE")], y5: [claim("Longer-term returns depend on resisting price competition and funding maintenance.", "ESTIMATE")] } },
  macro: { relevantSeries: [], sensitivityNotes: [claim("Higher financing costs for customers could delay warehouse investments; no real macroeconomic observations are used.")], fredAttribution: FRED_ATTRIBUTION_TEXT }, disagreements: [],
};

async function main() {
  const computed = runStageB(bundle);
  const validation = validateBundle(bundle, { now: new Date(bundle.builtAt) });
  const payload = assembleContextPayload(bundle, computed, validation);
  const seed = assembleReport({ symbol: "DEMO", bundle, computed, judgeOutput: judge, verify: { verificationRate: null, log: [] }, costEntries: [], model: "synthetic-handwritten", provisionalVerification: true }, generatedAt);
  const deterministic = enrichDataOnlyReport(seed, { bundle, computed, reason: "Synthetic demonstration" });
  // Reuse the production table builder, retaining the hand-written commentary.
  for (const key of ["growthTable", "marginTrend", "returns", "fcf"] as const) judge.fundamentals[key] = deterministic.fundamentals[key];
  for (const key of ["debtProfile", "coverage", "capexTrajectory"] as const) judge.balanceSheet[key].numbers = deterministic.balanceSheet[key].numbers;
  judge.technicals.indicators = deterministic.technicals.indicators;
  judge.quality.flags = deterministic.quality.flags;
  // Letter bands and numeric drivers come from Stage B; explanations are ours.
  for (const key of ["fundamentals", "valuation", "technicals", "quality", "leadership", "moat", "balanceSheet"] as const) {
    const aspect = computed.scores.aspects[key];
    const explanations = {
      fundamentals: "Growth is encouraging, while margin durability still needs watching.",
      valuation: "The model value depends on sustained cash generation and disciplined reinvestment.",
      technicals: "The invented price series rises, with limited confirmation from other signals.",
      quality: "Cash conversion is constructive; incomplete forensic inputs limit confidence.",
      leadership: "Capital stewardship is measurable here; personal management credibility remains unassessed.",
      moat: "Profitability supports the score; switching costs remain a qualitative judgment.",
      balanceSheet: "No funded debt offers flexibility, while operating liabilities still require cash.",
    };
    const grade = { ...g(), grade: aspect.band ?? "D", assessmentStatus: aspect.band === null ? "not-assessed" as const : "deterministic" as const, keyNumbers: aspect.drivers,
      oneLineWhy: aspect.band === null ? "Insufficient evidence to assess this aspect of the fictional business." : explanations[key] };
    judge.verdict.gradeStrip[key] = grade;
    if (key === "moat") judge.competitive.moatGraded = grade;
    else judge[key].graded = grade;
  }
  const provisional = assembleReport({ symbol: "DEMO", bundle, computed, judgeOutput: judge, verify: { verificationRate: null, log: [] }, costEntries: [], model: "synthetic-handwritten", provisionalVerification: true }, generatedAt);
  const verify = await runVerifyPass({ model: "synthetic-handwritten", runPass: async () => { throw new Error("Sample generation must never call a model"); } }, payload, provisional, { fetchedUrls: [] });
  const report = assembleReport({ symbol: "DEMO", bundle, computed, judgeOutput: verify.verifiedReport, verify, costEntries: [], model: "synthetic-handwritten", validationGaps: validation.gaps }, generatedAt);
  const chart = priceChartPropsFromBundle(bundle, computed);
  writeFileSync("fixtures/report/DEMO-current.json", JSON.stringify(ReportSchema.parse(report), null, 2) + "\n");
  writeFileSync("fixtures/report/DEMO-current-charts.json", JSON.stringify({ market: { bars: chart.rows, crosses: chart.crosses, relativeStrength: relativeStrengthSeriesFromBundle(bundle) }, fundamentals: fundamentalsChartDataFromBundle(bundle, computed) }, null, 2) + "\n");
  process.stdout.write(`Built fictional DEMO report; fair value ${report.fairValue?.status}; scenarios ${report.scenarioTargets?.status}; ${verify.log.length} verification entries.\n`);
}
void main();
