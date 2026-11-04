/** Entirely invented inputs and prose. No provider/model clients are invoked. */
import { writeFileSync } from "node:fs";
import { completeCurrencyBundle, M } from "../tests/helpers/currencyBundle";
import { runStageB } from "../src/pipeline/compute";
import { validateBundle } from "../src/pipeline/stageA/validate";
import { assembleContextPayload } from "../src/pipeline/stageC/payload";
import { assembleReport, runVerifyPass } from "../src/pipeline/stageC/passes";
import { bindDeterministicReportProvenance } from "../src/pipeline/stageC";
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

// Authored demonstration excerpts, shaped like filing evidence; never retrieved.
const businessText = `SYNTHETIC FILING: Thesis Example Systems sells warehouse workflow controllers,
installation and annual support subscriptions to regional warehouse operators.
Hardware and installation revenue is recognized on customer acceptance; support revenue
is recognized over the service term. Customers include independent distributors and regional
logistics operators. Installation bids compete on price; support renewals compete on uptime.
The invented planning study defines a USD 8 billion annual served market for regional
warehouse workflow equipment and support; this is a management assumption, not an external estimate.
Hardware and installation contributed USD 650 million of FY2025 revenue.
Support contributed USD 350 million of FY2025 revenue.
Domestic revenue was USD 1000 million in FY2025. All sales were domestic. The largest customer contributed USD 120 million.
Lantern Quay Automation bids lower installation prices but offers less local support.
Bramble Circuit Works has broader support coverage but slower custom deployments.
Aster Dock Software sells cheaper software-only tools without integrated controllers.
Kestrel Bay Robotics serves automated mega-sites, with higher integration costs at regional sites.
Renewal prices can increase on service quality; competitive tenders limit hardware pricing.
Support requires retraining and planned downtime to replace. Equipment demand follows warehouse
capacity investment; support follows the installed base and customer retention.`;
const managementText = `SYNTHETIC INTERIM FILING: On 2025-02-14 CEO Mira Vale and CFO Jonas Pell
issued FY2025 revenue guidance of USD 980 million to USD 1020 million.
On 2026-02-19 they reported FY2025 revenue of USD 1000 million, within that range.
During Mira Vale's and Jonas Pell's tenure, FY2025 operating cash flow was USD 220 million.
On 2025-11-18 the board reviewed USD 20 million of FY2025 share repurchases;
the program was completed by year end. Repurchase prices were not disclosed.
On 2026-01-20 the company acquired the service dispatch assets of fictional Willow Relay
Services for USD 8 million, included in the quarter's USD 10 million capital expenditure.
No goodwill was created. The purchase is an asset investment, not an additional cash outflow.
On 2026-05-12 the board appointed internal service leader Tessa Rowan as chief operating
officer, with a CEO emergency succession responsibility; Mira Vale remained CEO.
On 2026-06-15 the board approved a staged service-capacity expansion, with a readiness
review scheduled for 2026-09-15. A renewal cohort review is scheduled for 2026-10-20,
a controller acceptance pilot for 2026-12-10, and an acquisition integration review for 2027-01-20.
Mira Vale became CEO in 2022; Jonas Pell became CFO in 2024.
The case supplies no insider transaction records or board-independence determination.`;
function syntheticSection(text: string, sectionName: "item1" | "tenQItem2") {
  const reportDate = sectionName === "item1" ? "2025-12-31" : "2026-03-31";
  return { ok: true as const, value: { source: "edgar" as const,
    endpoint: "synthetic/authored-filing-no-retrieval", asOf: reportDate, fetchedAt: bundle.builtAt,
    data: { sectionName, text, method: "header-regex" as const, chars: text.length,
      accession: "DEMO-SYNTHETIC", form: sectionName === "item1" ? "10-K" as const : "10-Q" as const,
      reportDate, filingDate: "2026-07-01", documentUrl: "https://demo.invalid/synthetic-filing" } } };
}
bundle.edgar.business = syntheticSection(businessText, "item1");
bundle.edgar.tenQMdna = syntheticSection(managementText, "tenQItem2");

const claim = (text: string, label: SourcedClaim["label"] = "JUDGMENT", source = "edgar:10-K item1"): SourcedClaim => ({ text, label, source, asOf: source === "edgar:10-K item1" ? "2025-12-31" : source === "edgar:10-Q item2" ? "2026-03-31" : "2026-07-02" });
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
  ], managementActions: [{ occurredOn: "2026-06-15", actor: "board", category: "strategy", action: [claim("In this invented June strategy note, the board prioritized service capacity over acquisitions.", "FACT", "edgar:10-Q item2")], assessment: [claim("The plan appears consistent with protecting liquidity, but future delivery remains uncertain.")], shareholderAlignment: "aligned" }], insiderSummary: [claim("No insider transactions are supplied; absence of records does not establish absence of activity.")], governanceNotes: [claim("The invented strategy note does not establish board independence or compensation alignment.")] },
  competitive: { moatGraded: g(), competitors: [claim("In this fictional market, Lantern Quay Automation competes on installation price and Bramble Circuit Works competes on support coverage.", "FACT", "edgar:10-K item1"), claim("Thesis Example Systems appears better placed in support continuity than in winning the cheapest installation bid.")], peerTable: [], moatAssessment: [{ source: "switchingCosts", strength: "narrow", reasoning: [claim("Replacement requires retraining and downtime, but does not prevent customers from switching.")] }], marketShareDirection: "Share direction is unmeasured; growth alone does not establish share gains." },
  catalystsRisks: { catalysts: [{ title: "Support capacity expansion", expectedDate: "2027", direction: "mixed", significance: "medium", reasoning: [claim("More service capacity could improve renewals, while additional staff costs could arrive before revenue.", "ESTIMATE")] }], risks: [{ title: "Customer investment delays", severity: "high", probability: "unknown", source: "fmp:profile", reasoning: [claim("Delayed warehouse projects could reduce installations and weaken cash conversion.")] }] },
  outlook: { segmentTrajectories: [claim("Support should be steadier than installation demand, subject to renewals and service quality.", "ESTIMATE")], estimateRevisionTrend: [claim("Only a single invented estimate snapshot is supplied; a revision trend cannot be inferred.")], guidanceCredibility: [claim("There is no multi-period guidance scorecard, so management credibility remains unassessed.")], scenarioNarratives: { y1: [claim("Customer payment timing is the near-term test of earnings quality.", "ESTIMATE")], y3: [claim("Support relationships could deepen if service reliability holds.", "ESTIMATE")], y5: [claim("Longer-term returns depend on resisting price competition and funding maintenance.", "ESTIMATE")] } },
  macro: { relevantSeries: [], sensitivityNotes: [claim("Higher financing costs for customers could delay warehouse investments; no real macroeconomic observations are used.")], fredAttribution: FRED_ATTRIBUTION_TEXT }, disagreements: [],
};

// Interpret the invented evidence without changing any calculation or verification rule.
function enrichNarrative(payload: ReturnType<typeof assembleContextPayload>) {
  const fact = (text: string, source = "edgar:10-K item1") => claim(text, "FACT", source);
  const management = (text: string) => fact(text, "edgar:10-Q item2");
  const metricClaim = (id: string, display: (value: number) => string) => {
    const record = payload.provenanceRegistry?.find(r => r.id === id);
    if (!record) throw new Error(`Missing narrative metric ${id}`);
    return { ...fact(display(record.value), id), asOf: record.asOf };
  };
  judge.fundamentals.commentary = [
    metricClaim("computed.growth-margins.revenue-cagr-1y", v => `Revenue CAGR over one year was ${v.toFixed(2)}%.`),
    metricClaim("computed.growth-margins.operating-margin-latest", v => `FY2025 operating margin was ${v.toFixed(2)}%.`),
    metricClaim("computed.capital-cash.latest-fcf-after-sbc-house-default", v => `FY2025 FCF after SBC was USD ${(v / M).toFixed(2)} million.`),
    claim("Sales growth is outpacing cash growth. Sustaining margins requires renewals without heavy concessions and collections that keep pace with installation acceptance."),
  ];
  judge.technicals.graded.reasoning = [metricClaim("computed.technicals.rsi-14", v => `RSI-14 was ${v.toFixed(2)}.`), claim("A smooth rising synthetic series limits what momentum can tell us about risk.")];
  judge.balanceSheet.coverage.commentary.unshift(metricClaim("computed.current-capital.net-debt-including-leases", v => `Net debt on the retained basis was USD ${(v / M).toFixed(2)} million at 2026-03-31.`));
  judge.balanceSheet.capexTrajectory.commentary.push(metricClaim("computed.capital-cash.capex-revenue-latest", v => `FY2025 capex as a share of revenue was ${v.toFixed(2)}%.`));
  judge.quality.graded.reasoning = [metricClaim("computed.capital-cash.fcf-conversion-latest-after-sbc", v => `FY2025 FCF conversion after SBC was ${v.toFixed(2)}x.`), claim("Cash conversion supports earnings quality, but unavailable forensic inputs are a reason to reserve judgment.")];
  judge.technicals.read.momentum = "The RSI reading is extreme because the invented closes rise smoothly. This demonstration series cannot establish a durable trading edge.";
  judge.verdict.synthesis = "JUDGMENT: A credible cash generator with a modest valuation cushion. Recurring support can soften equipment cyclicality, but does not remove it. Recent asset investment and a succession appointment strengthen service execution; neither proves durable pricing power. The model's narrow positive scenario range understates a severe customer-spending shock. Renewal quality and cash collection would determine whether this view holds. This invented case is informational, not a recommendation.";
  judge.verdict.executiveSummary = [
    claim("The thesis rests on service continuity: recurring support can cushion installation delays, provided renewals do not require price concessions."),
    claim("A reader focused only on equipment orders could miss the installed base's support economics; this is a thesis about resilience, not evidence of market mispricing."),
    claim("Cash generation supports reinvestment, but slowing cash growth relative to sales warrants watching collections and service staffing costs."),
    claim("The valuation offers a modest cushion under the model assumptions; the narrow sensitivity range does not represent the full economic downside."),
    claim("The Willow Relay asset purchase and internal succession step address service capacity. Integration failures, lost renewals or weaker cash conversion would change the favorable operating view.", "JUDGMENT", "edgar:10-Q item2"),
  ];
  judge.verdict.executiveSummary.push(metricClaim("computed.valuation.dcf-per-share", v => `DCF per share is USD ${v.toFixed(2)} under the modeled assumptions; this is a sensitivity result, not a future-price forecast.`));
  const segmentRevenue = (value: number) => ({ value: value * M, unit: "currency", currency: "USD", period: "2025-12-31", source: "edgar:10-K item1", asOf: "2025-12-31", verified: null });
  judge.business.segments = { product: [
    { name: "Hardware and installation", revenue: segmentRevenue(650), sharePct: null },
    { name: "Support", revenue: segmentRevenue(350), sharePct: null },
  ], geographic: [{ name: "Domestic", revenue: segmentRevenue(1000), sharePct: null }] };
  judge.business.whatTheySell = [fact("Controllers, installation and annual support subscriptions serve regional warehouse operators. Equipment revenue is recognized on acceptance; support is recognized over the service term."), fact("Hardware and installation contributed USD 650 million of FY2025 revenue."), fact("Support contributed USD 350 million of FY2025 revenue."), fact("All sales were domestic; customers include independent distributors and regional logistics operators.")];
  judge.business.marketStructure = [fact("The invented management planning study defines a USD 8 billion annual served market for regional warehouse equipment and support. This is a fictional planning assumption, not an independent market estimate."), claim("Value accrues to reliable service and integration expertise; hardware tenders remain price competitive."), claim("Renewal pricing power appears narrow: switching disrupts operations, but cheaper installation bids and software substitutes constrain lifetime economics."), claim("Warehouse capacity spending drives equipment demand; the installed base supports service demand through the cycle. No measured market-share trend is supplied.")];
  judge.business.concentrationRisks = [fact("The largest customer contributed USD 120 million of FY2025 revenue."), claim("Domestic exposure and regional customers concentrate the business in the same warehouse investment cycle; renewal resilience should be tested when capacity budgets tighten.")];
  judge.competitive.competitors = [
    claim("Against Lantern Quay Automation, Thesis wins on local service continuity and loses on installation price."),
    claim("Against Bramble Circuit Works, Thesis wins on custom deployment speed and loses on support-network breadth."),
    claim("Against Aster Dock Software, Thesis wins where integrated controllers are necessary and loses on cost where software alone is sufficient."),
    claim("Against Kestrel Bay Robotics, Thesis suits regional-site integration budgets but loses complex mega-site automation work."),
  ];
  judge.leadership.executives = [
    { name: "Mira Vale", title: "Chief Executive Officer", tenureYears: 4, grade: "B", credibilityGrade: "B", reasoning: [claim("Service investment fits the installed-base strategy; the acquisition still needs an operating result.", "JUDGMENT", "edgar:10-Q item2")], evidence: { capitalAllocation: [] } },
    { name: "Jonas Pell", title: "Chief Financial Officer", tenureYears: 2, grade: "B", credibilityGrade: "B", reasoning: [claim("Cash discipline looks constructive; undisclosed repurchase prices prevent a judgment on buyback timing.", "JUDGMENT", "edgar:10-Q item2")], evidence: { capitalAllocation: [] } },
  ];
  // An exact typed statement outcome supports execution, not personal guidance credibility.
  const cash = payload.provenanceRegistry?.find(r => r.id.startsWith("payload.statements.") && r.label === "operating cash flow" && r.period === "2025-12-31");
  if (!cash) throw new Error("Missing FY2025 operating cash flow evidence");
  for (const executive of judge.leadership.executives) executive.evidence.capitalAllocation = [{ ...fact(`${executive.name}: operating cash flow was USD 220 million (2025-12-31).`, cash.id), asOf: cash.asOf }];
  judge.leadership.managementActions = [
    { occurredOn: "2026-06-15", actor: "board", category: "strategy", action: [management("The board approved a staged service-capacity expansion on 2026-06-15.")], assessment: [claim("Staging capacity limits the risk that staffing costs precede renewals.", "JUDGMENT", "edgar:10-Q item2")], shareholderAlignment: "aligned" },
    { occurredOn: "2026-05-12", actor: "board", category: "leadership-change", action: [management("The board appointed Tessa Rowan as chief operating officer with emergency CEO succession responsibility on 2026-05-12; Mira Vale remained CEO.")], assessment: [claim("Internal succession reduces disruption risk, while concentrating execution responsibility in the existing team.", "JUDGMENT", "edgar:10-Q item2")], shareholderAlignment: "aligned" },
    { occurredOn: "2026-02-19", actor: "company", category: "guidance", action: [management("Mira Vale and Jonas Pell reported FY2025 revenue of USD 1000 million within their guidance range of USD 980 million to USD 1020 million issued on 2025-02-14.")], assessment: [claim("Meeting the range is encouraging, but a single annual comparison cannot establish a repeatable guidance record.", "JUDGMENT", "edgar:10-Q item2")], shareholderAlignment: "aligned" },
    { occurredOn: "2026-01-20", actor: "company", category: "acquisition-divestiture", action: [management("The company acquired Willow Relay Services dispatch assets for USD 8 million on 2026-01-20, included in quarterly capital expenditure.")], assessment: [claim("A focused asset purchase fits the service strategy; integration costs and retention will determine the return.", "JUDGMENT", "edgar:10-Q item2")], shareholderAlignment: "mixed" },
    { occurredOn: "2025-11-18", actor: "board", category: "capital-allocation", action: [management("The board reviewed USD 20 million of FY2025 share repurchases; the program completed by year end.")], assessment: [claim("Repurchases returned capital, but undisclosed prices prevent assessing timing or value creation.", "JUDGMENT", "edgar:10-Q item2")], shareholderAlignment: "unclear" },
  ];
  judge.leadership.insiderSummary = [claim("No insider transaction records are supplied; this does not establish that no transactions occurred.", "JUDGMENT", "edgar:10-Q item2")];
  judge.leadership.governanceNotes = [claim("The succession step is constructive, but board independence and compensation alignment remain unestablished.", "JUDGMENT", "edgar:10-Q item2")];
  judge.outlook.guidanceCredibility = [claim("The annual revenue comparison met the issued range. A single observation is insufficient for a personal credibility grade.", "JUDGMENT", "edgar:10-Q item2")];
  judge.catalystsRisks.catalysts = [
    ["Service readiness review", "2026-09-15", "Readiness evidence could support renewals; premature hiring would pressure operating margin."],
    ["Renewal cohort review", "2026-10-20", "Retention without discounts would support recurring revenue quality; concessions would weaken the pricing thesis."],
    ["Controller acceptance pilot", "2026-12-10", "Customer acceptance could release installation revenue and cash; slippage would defer both."],
    ["Willow Relay integration review", "2027-01-20", "Better dispatch productivity could contain service costs; integration delays would reduce returns on the asset purchase."],
  ].map(([title, expectedDate, text]) => ({ title, expectedDate, direction: "mixed" as const, significance: "medium" as const, reasoning: [claim(text, "JUDGMENT", "edgar:10-Q item2")] }));
  judge.catalystsRisks.risks = [
    ["Customer investment delays", "Deferred warehouse projects would reduce installation revenue and cash collection. Watch acceptance dates and receivables."],
    ["Renewal price concessions", "Discounting to retain accounts would weaken support revenue and operating margin. Watch renewal prices alongside retention."],
    ["Service expansion execution", "Staffing ahead of renewals would raise operating expenses and lower free cash flow. Watch technician utilization and response times."],
    ["Customer concentration", "Losing a major account would reduce equipment and support revenue together. Watch contract renewals and the largest customer's spending."],
    ["Cash quality and reinvestment", "Working-capital absorption or underfunded maintenance would weaken distributable cash. Watch operating cash flow, capital expenditure and service failures together."],
  ].map(([title, text]) => ({ title, severity: "high" as const, probability: "unknown" as const, source: "edgar:10-K item1", reasoning: [claim(text)] }));
  judge.balanceSheet.capitalAllocation = [claim("Service investment and selective asset purchases fit the strategy, provided capital returns do not erode the liquidity cushion.", "JUDGMENT", "edgar:10-Q item2")];
  judge.quality.flags.push({ text: "Cash conversion is constructive, but missing forensic inputs prevent a clean bill of accounting health. Watch collections and maintenance spending together.", severity: "low", source: "edgar:10-K item1" });
  judge.technicals.read.momentum = "The smooth invented price series produces an extreme momentum reading; it is a demonstration artifact, not realistic evidence of a durable trading edge.";
  judge.technicals.read.keyLevels = "The moving averages below are reference levels; a loss of trend alongside weaker cash collection would reduce confidence in the thesis.";
  judge.valuation.reverseDcf.narrative = "JUDGMENT: Compare the implied growth requirement below with customer spending and renewal quality. The favorable model values depend on continued operating performance; they do not establish a floor under the share price.";
  judge.valuation.scenarios.forEach(scenario => { scenario.assumptions = [scenario.name === "bull" ? "Higher near-term growth with unchanged modeled margins" : scenario.name === "bear" ? "Lower near-term growth with unchanged modeled margins" : "Base growth and margin path"]; });
  judge.competitive.marketShareDirection = "Unmeasured: company growth and a fictional served-market assumption do not establish share gains.";
}

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
  enrichNarrative(payload);
  // Resolve only the same semantic producer and period, never a nearby value.
  const bindNumbers = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if ("value" in node && "source" in node && "unit" in node) {
      const number = node as import("../src/report/schema").TracedNumber;
      const matches = payload.provenanceRegistry?.filter(r => r.origin === number.source &&
        r.asOf === number.asOf && (r.period === number.period ||
          (r.period === null && (number.period === number.asOf || r.label === number.period ||
            r.label?.toLowerCase().includes(` ${number.period?.toLowerCase()}`)))) &&
        typeof number.value === "number" && Math.abs(r.value - number.value) <= Math.max(0.000001, Math.abs(r.value) * 1e-8));
      if (matches?.length === 1) { number.source = matches[0].id; number.sourceId = matches[0].id; if (!number.source.startsWith("computed.technicals.")) number.period = matches[0].period; }
      return;
    }
    Object.values(node).forEach(bindNumbers);
  };
  bindNumbers(judge);
  // Letter bands and numeric drivers come from Stage B; explanations are ours.
  for (const key of ["fundamentals", "valuation", "technicals", "quality", "leadership", "moat", "balanceSheet"] as const) {
    const aspect = computed.scores.aspects[key];
    const explanations = {
      fundamentals: "Growth is encouraging, while margin durability still needs watching.",
      valuation: "The model value depends on sustained cash generation and disciplined reinvestment.",
      technicals: "The invented price series rises, with limited confirmation from other signals.",
      quality: "Cash conversion is constructive; incomplete forensic inputs limit confidence.",
      leadership: "Cash generation supports an execution assessment; a repeatable personal guidance record remains unestablished.",
      moat: "Profitability supports the score; switching costs remain a qualitative judgment.",
      balanceSheet: "No funded debt offers flexibility, while operating liabilities still require cash.",
    };
    const reasoning = {
      valuation: claim("The positive base valuation depends on the revenue anchor and steady margins; wider operating sensitivities show why the narrow scenario fan is not a downside floor."),
      balanceSheet: claim("Net cash supports flexibility, but undisclosed lease components and maintenance needs limit how much liquidity is truly distributable."),
      leadership: claim("Operating cash generation supports an execution assessment; the asset purchase and succession plan still need follow-through.", "JUDGMENT", "edgar:10-Q item2"),
      moat: claim("Service switching costs look narrow despite strong measured profitability; regional support coverage and hardware price competition constrain the advantage."),
    };
    const grade = { ...g(), reasoning: key === "technicals" ? judge.technicals.graded.reasoning : key === "quality" ? judge.quality.graded.reasoning : key === "fundamentals" ? judge.fundamentals.commentary : [reasoning[key as keyof typeof reasoning]], grade: aspect.band ?? "D", assessmentStatus: aspect.band === null ? "not-assessed" as const : "deterministic" as const, keyNumbers: aspect.drivers,
      oneLineWhy: aspect.band === null ? "Insufficient evidence to assess this aspect of the fictional business." : explanations[key] };
    judge.verdict.gradeStrip[key] = grade;
    if (key === "moat") judge.competitive.moatGraded = grade;
    else judge[key].graded = grade;
  }
  const provisional = assembleReport({ symbol: "DEMO", bundle, computed, judgeOutput: judge, verify: { verificationRate: null, log: [] }, costEntries: [], model: "synthetic-handwritten", provisionalVerification: true }, generatedAt);
  const verify = await runVerifyPass({ model: "synthetic-handwritten", runPass: async () => { throw new Error("Sample generation must never call a model"); } }, payload, bindDeterministicReportProvenance(provisional, payload), { fetchedUrls: [] });
  // As in the real pipeline, deterministic tables cite their registered provenance rows.
  const report = bindDeterministicReportProvenance(assembleReport({ symbol: "DEMO", bundle, computed, judgeOutput: verify.verifiedReport, verify, costEntries: [], model: "synthetic-handwritten", validationGaps: validation.gaps }, generatedAt), payload);
  const chart = priceChartPropsFromBundle(bundle, computed);
  writeFileSync("fixtures/report/DEMO-current.json", JSON.stringify(ReportSchema.parse(report), null, 2) + "\n");
  writeFileSync("fixtures/report/DEMO-current-charts.json", JSON.stringify({ market: { bars: chart.rows, crosses: chart.crosses, relativeStrength: relativeStrengthSeriesFromBundle(bundle) }, fundamentals: fundamentalsChartDataFromBundle(bundle, computed) }, null, 2) + "\n");
  process.stdout.write(`Built fictional DEMO report; fair value ${report.fairValue?.status}; scenarios ${report.scenarioTargets?.status}; ${verify.log.length} verification entries.\n`);
}
void main();
