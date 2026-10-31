import { describe, expect, it } from "vitest";
import { computeBeneish, computeSupportFlags, runForensics } from "@/pipeline/stageB/forensics";
import { selectReceivablesPair } from "@/pipeline/stageB/receivables";
import type { StatementFieldProvenance } from "@/providers/fmp";

// Structural QName examples, NOT a retained QCOM provider/tag mapping.
const total = "us-gaap/ReceivablesNetCurrent";
const trade = "us-gaap/AccountsReceivableNetCurrent";
const currentEnd = "2025-09-28";
const priorEnd = "2024-09-29";
const observedAt = "2025-11-10T12:00:00Z";
const evidence = (tag: string, end: string): StatementFieldProvenance => ({
  source: "edgar", unit: "USD", periodStart: null, periodEnd: end, observedAt,
  tags: [tag], filings: [{ accn: "0000000001-25-000001", filed: "2025-11-05", form: "10-K" }],
});
const balance = (date: string, value: number, tag?: string) => ({ date, cik: "1", reportedCurrency: "USD",
  netReceivables: value * 1e6, totalAssets: 60000e6, totalCurrentAssets: 20000e6,
  fieldProvenance: tag ? { netReceivables: evidence(tag, date) } : undefined,
});
const periods = () => [
  { income: { date: currentEnd, revenue: 44284e6 }, balance: balance(currentEnd, 4315, total) },
  { income: { date: priorEnd, revenue: 38962e6 }, balance: balance(priorEnd, 2347, trade) },
];
const candidates = () => ({ observations: [
  { value: 4315e6, issuerCik: "1", evidence: evidence(total, currentEnd) },
  { value: 3929e6, issuerCik: "1", evidence: evidence(total, priorEnd) },
], reasons: [] });
const support = (p: ReturnType<typeof periods>, options = {}) => computeSupportFlags({ income: p.map(x => x.income), balance: p.map(x => x.balance) }, options);
const route = { base: "general" as const, overlays: [], evidence: { sector: "Technology", industry: "Semiconductors" } };

describe("receivables comparison evidence", () => {
  it("neutralizes a proved concept switch without a whole filed repair and suppresses its unsupported growth warning", () => {
    const [current, prior] = periods();
    const result = computeBeneish(current, prior);
    expect(result.indices.dsri).toBe(1);
    expect(result.neutralized).toContain("DSRI");
    expect(result.notes.join(" ")).toMatch(/concept|comparab/i);
    expect(support([current, prior]).flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
  });

  it("uses the complete filed total pair for DSRI and growth instead of mixing selected concepts", () => {
    const p = periods();
    const options = { filedReceivables: candidates() };
    expect(computeBeneish(p[0], p[1], options).indices.dsri).toBeCloseTo((4315 / 44284) / (3929 / 38962), 12);
    expect(support(p, options).flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
  });

  it("keeps genuinely adverse same-concept observations and both warning thresholds", () => {
    const p = periods();
    p[0].balance = balance(currentEnd, 200, total); p[1].balance = balance(priorEnd, 100, total);
    p[0].income.revenue = 1100e6; p[1].income.revenue = 1000e6;
    const report = runForensics(route, { income: p.map(x => x.income), balance: p.map(x => x.balance), cashFlow: [] });
    expect(report.beneish?.indices.dsri).toBeCloseTo(1.8181818181818181, 12);
    expect(report.flags.find(f => f.id === "receivables-vs-revenue")).toMatchObject({ severity: "flag", metrics: { receivablesGrowthPct: 100 } });
    expect(report.flags.find(f => f.id === "dsri-elevated")).toMatchObject({ severity: "warn" });
  });

  it("keeps unknown vendor numbers and warnings while qualifying unverified scope", () => {
    const p = periods();
    p[0].balance = balance(currentEnd, 4315); p[1].balance = balance(priorEnd, 2347);
    const report = runForensics(route, { income: p.map(x => x.income), balance: p.map(x => x.balance), cashFlow: [], filedReceivables: candidates() });
    expect(report.beneish?.indices.dsri).toBeCloseTo((4315 / 44284) / (2347 / 38962), 12);
    const flag = report.flags.find(f => f.id === "receivables-vs-revenue");
    expect(flag?.severity).toBe("flag");
    expect(flag?.message).toMatch(/unverified/i);
    expect(flag?.message).not.toMatch(/channel stuffing/);
    expect(report.flags.find(f => f.id === "dsri-elevated")?.message).toMatch(/unverified/i);
    expect(report.gaps.some(g => /unverified/i.test(g.reason))).toBe(false);
  });
});


describe("shared pair admission", () => {
  it("returns exact growth, endpoints and both source observations without modifying inputs", () => {
    const p = periods(); const filed = candidates();
    const freeze = (v: unknown): void => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } };
    const before = JSON.stringify({ p, filed }); freeze(p); freeze(filed);
    const pair = selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: filed });
    expect(pair.status).toBe("selected");
    if (pair.status !== "selected") return;
    expect(pair.basis).toBe("filed-pair");
    expect(pair.current.end).toBe(currentEnd); expect(pair.prior.end).toBe(priorEnd);
    expect(100 * (pair.current.value / pair.prior.value - 1)).toBeCloseTo(100 * (4315 / 3929 - 1), 12);
    expect(pair.current.evidence?.observedAt).toBe(observedAt);
    expect(JSON.stringify({ p, filed })).toBe(before);
    const report = runForensics(route, { income: p.map(x => x.income), balance: p.map(x => x.balance), cashFlow: [], filedReceivables: filed });
    expect(report.beneish?.indices.dsri).toBeCloseTo((4315 / 44284) / (3929 / 38962), 12);
    expect(report.flags.some(f => f.id === "receivables-vs-revenue" || f.id === "dsri-elevated")).toBe(false);
    const unrepaired = runForensics(route, { income: p.map(x => x.income), balance: p.map(x => x.balance), cashFlow: [] });
    expect(report.altman).toEqual(unrepaired.altman); expect(report.piotroski).toEqual(unrepaired.piotroski); expect(report.accruals).toEqual(unrepaired.accruals);
  });

  it("keeps a selected consistent trade pair despite alternative filed totals", () => {
    const p = periods(); p[0].balance = balance(currentEnd, 2855, trade);
    const pair = selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: candidates() });
    expect(pair).toMatchObject({ status: "selected", basis: "same-concept", current: { value: 2855e6 }, prior: { value: 2347e6 } });
    expect(computeBeneish(p[0], p[1]).indices.dsri).toBeCloseTo((2855/44284)/(2347/38962), 12);
  });

  it.each(["issuer", "currency", "one-day", "incomplete", "separate-filings", "ambiguous", "negative", "superseding"])("refuses %s repair evidence locally", kind => {
    const p = periods(); const filed = candidates();
    if (kind === "issuer") filed.observations.forEach(o => o.issuerCik = "2");
    if (kind === "currency") filed.observations.forEach(o => o.evidence.unit = "EUR");
    if (kind === "one-day") filed.observations[1].evidence.periodEnd = "2024-09-30";
    if (kind === "incomplete") filed.observations.pop();
    if (kind === "separate-filings") filed.observations[1].evidence.filings[0].accn = "different";
    if (["ambiguous", "negative", "superseding"].includes(kind)) {
      const extra = structuredClone(filed.observations[1]); extra.value = kind === "negative" ? -1 : 2000e6;
      if (kind === "superseding") extra.evidence.filings = [{ accn: "later", filed: "2025-11-06", form: "10-K/A" }];
      filed.observations.push(extra);
    }
    expect(selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: filed }).status).toBe("unavailable");
    expect(computeBeneish(p[0], p[1], { filedReceivables: filed }).neutralized).toContain("DSRI");
    expect(support(p, { filedReceivables: filed }).flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
  });

  it("prefers current concept, allows later agreeing copies and is permutation stable", () => {
    const p = periods(); const filed = candidates();
    filed.observations.push({ value: 2855e6, issuerCik: "1", evidence: evidence(trade, currentEnd) }, { value: 2347e6, issuerCik: "1", evidence: evidence(trade, priorEnd) });
    const agreeing = structuredClone(filed.observations[1]); agreeing.evidence.filings = [{ accn: "later", filed: "2025-11-06", form: "10-K/A" }]; filed.observations.push(agreeing);
    const selected = selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: filed });
    expect(selected).toMatchObject({ status: "selected", concept: total, prior: { value: 3929e6 } });
    expect(selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: { ...filed, observations: [...filed.observations].reverse() } })).toEqual(selected);
  });

  it("does not repair unknown vendors and does not invent missing currency or issuer metadata", () => {
    const p = periods(); const filedCandidates = candidates();
    expect(selectReceivablesPair(balance(currentEnd, 4315), balance(priorEnd, 2347), { filedCandidates })).toMatchObject({ status: "selected", basis: "vendor-unverified", prior: { value: 2347e6 } });
    expect(selectReceivablesPair({ ...p[0].balance, reportedCurrency: null }, p[1].balance, { filedCandidates })).toMatchObject({ status: "selected", basis: "filed-pair" });
    expect(selectReceivablesPair({ ...p[0].balance, cik: null }, p[1].balance, { filedCandidates }).status).toBe("unavailable");
  });

  it("refuses explicit alias conflicts and repairs both observations only with complete evidence", () => {
    const p = periods();
    const conflict = { vendorValue: 4315e6, secValue: 2855e6, usable: false as const, reason: "conflicting selected alias" };
    const current = { ...p[0].balance, accountsReceivables: 4315e6, fieldConflicts: { accountsReceivables: conflict } };
    const prior = { ...p[1].balance, accountsReceivables: 2347e6 };
    expect(selectReceivablesPair(current, prior).status).toBe("unavailable");
    expect(selectReceivablesPair(current, prior, { filedCandidates: candidates() })).toMatchObject({ status: "selected", basis: "filed-pair", prior: { value: 3929e6 } });
  });

  it("keeps zero prior undefined for ratios and preserves nonconsecutive-period suppression", () => {
    const p = periods(); p[1].balance = balance(priorEnd, 0, total);
    expect(computeBeneish(p[0], p[1]).neutralized).toContain("DSRI");
    expect(support(p).flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
    p[1].balance.date = "2023-09-29"; p[1].income.date = "2023-09-29";
    const report = runForensics(route, { income: p.map(x => x.income), balance: p.map(x => x.balance), cashFlow: [], filedReceivables: candidates() });
    expect(report.beneish).toBeNull();
    expect(report.flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
  });
});


describe("receivables policy preservation controls", () => {
  it("keeps the existing missing-input disclosure when neither row has receivables", () => {
    const p = periods(); p.forEach(x => x.balance.netReceivables = NaN);
    const result = computeBeneish(p[0], p[1]);
    expect(result.notes).toContain("DSRI set to neutral 1.0 \u2014 inputs missing (Beneish's own missing-data convention, paper p.12).");
    expect(support(p).gaps.find(g => g.field === "forensics.flags.receivables")?.reason).toBe("accountsReceivables/netReceivables missing \u2014 receivables-vs-revenue flag not evaluated");
  });

  it("keeps a genuinely adverse complete filed repair and its warnings", () => {
    const p = periods(); const filed = candidates(); filed.observations[0].value = 200e6; filed.observations[1].value = 100e6;
    // The selected direct observation and candidate must agree within this same filing/concept.
    p[0].balance.netReceivables = 200e6;
    p[0].income.revenue = 1100e6; p[1].income.revenue = 1000e6;
    const report = runForensics(route, { income: p.map(x => x.income), balance: p.map(x => x.balance), cashFlow: [], filedReceivables: filed });
    expect(report.beneish?.indices.dsri).toBeCloseTo(1.8181818181818181, 12);
    expect(report.flags.find(f => f.id === "receivables-vs-revenue")).toMatchObject({ severity: "flag", metrics: { receivablesGrowthPct: 100 } });
    expect(report.flags.find(f => f.id === "receivables-vs-revenue")?.message).toContain("channel stuffing");
    expect(report.flags.find(f => f.id === "dsri-elevated")).toMatchObject({ severity: "warn" });
  });

  it("preserves accounts-receivable preference when both aliases are usable", () => {
    const p = periods();
    const cur = { ...p[0].balance, accountsReceivables: 2855e6, fieldProvenance: { ...p[0].balance.fieldProvenance, accountsReceivables: evidence(trade, currentEnd) } };
    const pri = { ...p[1].balance, accountsReceivables: 2347e6, fieldProvenance: { ...p[1].balance.fieldProvenance, accountsReceivables: evidence(trade, priorEnd) } };
    expect(selectReceivablesPair(cur, pri, { filedCandidates: candidates() })).toMatchObject({ status: "selected", field: "accountsReceivables", basis: "same-concept", current: { value: 2855e6 } });
  });

  it("resolves after alignment and remains stable under statement and candidate permutations", () => {
    const p = periods(); const filed = candidates();
    // Annual income alignment allows nearby dates, but the repair must use exact BALANCE endpoints.
    p[0].income.date = "2025-09-30"; p[1].income.date = "2024-09-30";
    const inputs = { income: p.map(x => x.income), balance: p.map(x => x.balance), cashFlow: [], filedReceivables: filed };
    const result = runForensics(route, inputs);
    expect(result.beneish?.indices.dsri).toBeCloseTo((4315/44284)/(3929/38962), 12);
    expect(runForensics(route, { ...inputs, income: [...inputs.income].reverse(), balance: [...inputs.balance].reverse(), filedReceivables: { ...filed, observations: [...filed.observations].reverse() } })).toEqual(result);
  });

  it("retains ambiguous selected tags as unverified rather than treating uncertainty as a conflict", () => {
    const p = periods(); p[0].balance.fieldProvenance!.netReceivables.tags.push(trade);
    expect(selectReceivablesPair(p[0].balance, p[1].balance)).toMatchObject({ status: "selected", basis: "vendor-unverified", prior: { value: 2347e6 } });
    expect(selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: candidates() })).toMatchObject({ status: "selected", basis: "vendor-unverified", prior: { value: 2347e6 } });
  });
});


it("matches filing identity by fields regardless of property insertion order", () => {
  const p = periods(); const filed = candidates();
  const f = filed.observations[1].evidence.filings[0];
  filed.observations[1].evidence.filings[0] = { form: f.form, filed: f.filed, accn: f.accn };
  expect(selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: filed })).toMatchObject({ status: "selected", basis: "filed-pair" });
});


it("uses explicit matching provenance units when duplicate row currencies are missing", () => {
  const cur = { ...balance(currentEnd, 4315, total), reportedCurrency: undefined };
  const pri = { ...balance(priorEnd, 3929, total), reportedCurrency: undefined };
  expect(selectReceivablesPair(cur, pri)).toMatchObject({ status: "selected", basis: "same-concept" });
  expect(computeBeneish({ income: { date: currentEnd, revenue: 44284e6 }, balance: cur }, { income: { date: priorEnd, revenue: 38962e6 }, balance: pri }).indices.dsri).toBeCloseTo((4315/44284)/(3929/38962), 12);
});

it.each(["unit", "endpoint", "derived", "calculated"])("retains uncertain %s metadata as unverified without a primary override", kind => {
  const p = periods(); p[1].balance = balance(priorEnd, 2347, total);
  const e = p[0].balance.fieldProvenance!.netReceivables;
  if (kind === "unit") e.unit = "";
  if (kind === "endpoint") e.periodEnd = "";
  if (kind === "derived") e.derivation = "ytd-difference";
  if (kind === "calculated") e.calculation = "revenue-minus-cost";
  const pair = selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: candidates() });
  expect(pair).toMatchObject({ status: "selected", basis: "vendor-unverified", prior: { value: 2347e6 } });
  expect(computeBeneish(p[0], p[1]).indices.dsri).toBeCloseTo((4315/44284)/(2347/38962), 12);
  expect(support(p).flags.find(f => f.id === "receivables-vs-revenue")?.severity).toBe("flag");
});

it.each(["unit", "endpoint", "duration", "issuer"])("still refuses explicit %s contradictions without a complete repair", kind => {
  const p = periods(); p[1].balance = balance(priorEnd, 2347, total);
  const e = p[0].balance.fieldProvenance!.netReceivables;
  if (kind === "unit") e.unit = "EUR";
  if (kind === "endpoint") e.periodEnd = "2025-09-29";
  if (kind === "duration") e.periodStart = "2025-01-01";
  if (kind === "issuer") p[0].balance.cik = "2";
  expect(selectReceivablesPair(p[0].balance, p[1].balance).status).toBe("unavailable");
  expect(computeBeneish(p[0], p[1]).neutralized).toContain("DSRI");
  expect(support(p).flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
});


it.each(["derived", "calculated"])("does not treat a %s tag as a directly selected incompatible concept", kind => {
  const p = periods();
  const e = p[0].balance.fieldProvenance!.netReceivables;
  if (kind === "derived") e.derivation = "ytd-difference";
  else e.calculation = "revenue-minus-cost";
  expect(selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: candidates() })).toMatchObject({ status: "selected", basis: "vendor-unverified", prior: { value: 2347e6 } });
});


it("includes the shared qualifier once in report notes while both standalone consumers retain it", () => {
  const p = periods(); p[0].balance = balance(currentEnd, 4315); p[1].balance = balance(priorEnd, 2347);
  const pair = selectReceivablesPair(p[0].balance, p[1].balance);
  const qualifier = pair.notes[0];
  const beneish = computeBeneish(p[0], p[1]);
  const flags = support(p);
  expect(beneish.notes.filter(n => n === qualifier)).toHaveLength(1);
  expect(flags.notes.filter(n => n === qualifier)).toHaveLength(1);
  const report = runForensics(route, { income: p.map(x => x.income), balance: p.map(x => x.balance), cashFlow: [] });
  expect(report.notes.filter(n => n === qualifier)).toHaveLength(1);
  for (const note of [...beneish.notes, ...flags.notes].filter(n => n !== qualifier)) expect(report.notes).toContain(note);
});

describe("review R1: selected primary evidence constrains repair", () => {
  const later = (tag: string, end: string) => ({ ...evidence(tag, end), filings: [{ accn: "later", filed: "2025-11-06", form: "10-K/A" }] });

  it("refuses an older common pair contradicted by the newer selected primary observation in both consumers", () => {
    const p = periods(); p[0].balance.netReceivables = 5000e6;
    p[0].balance.fieldProvenance!.netReceivables = later(total, currentEnd);
    const filed = candidates(); const before = JSON.stringify({ p, filed });
    expect(computeBeneish(p[0], p[1], { filedReceivables: filed }).indices.dsri).toBe(1);
    expect(computeBeneish(p[0], p[1], { filedReceivables: filed }).neutralized).toContain("DSRI");
    const flags = support(p, { filedReceivables: filed });
    expect(flags.flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
    expect(flags.gaps.find(g => g.field === "forensics.flags.receivables")?.reason).toContain("no complete eligible");
    expect(selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: filed }).status).toBe("unavailable");
    expect(JSON.stringify({ p, filed })).toBe(before);
  });

  it.each(["current", "prior"])("checks newer %s conflict evidence without replacing it with the older candidate collection", side => {
    const p = periods(); const index = side === "current" ? 0 : 1;
    const row = { ...p[index].balance, fieldConflicts: { netReceivables: {
      vendorValue: p[index].balance.netReceivables, secValue: 5000e6, usable: false as const,
      reason: "newer primary copy conflicts", secEvidence: later(total, side === "current" ? currentEnd : priorEnd),
    } } };
    const current = index === 0 ? row : p[0].balance; const prior = index === 1 ? row : p[1].balance;
    expect(selectReceivablesPair(current, prior, { filedCandidates: candidates() }).status).toBe("unavailable");
  });

  it("checks eligible same-concept aliases and multiple direct filing references as contradiction evidence only", () => {
    const p = periods();
    const alias = later(total, currentEnd); alias.filings.push(evidence(total, currentEnd).filings[0]);
    const cur = { ...p[0].balance, accountsReceivables: 5000e6, fieldProvenance: { ...p[0].balance.fieldProvenance, accountsReceivables: alias } };
    expect(selectReceivablesPair(cur, p[1].balance, { filedCandidates: candidates() }).status).toBe("unavailable");
    expect(selectReceivablesPair(cur, p[1].balance, { filedCandidates: { ...candidates(), observations: candidates().observations.slice(1) } }).status).toBe("unavailable");
  });

  it.each(["direct", "conflict"])("keeps an older common pair when later %s evidence agrees", kind => {
    const p = periods(); const e = later(total, currentEnd);
    const current = kind === "direct" ? { ...p[0].balance, fieldProvenance: { netReceivables: e } } :
      { ...p[0].balance, fieldConflicts: { netReceivables: { vendorValue: 4315e6, secValue: 4315e6, usable: false as const, reason: "other discrepancy", secEvidence: e } } };
    const filed = candidates();
    expect(selectReceivablesPair(current, p[1].balance, { filedCandidates: filed })).toMatchObject({ status: "selected", basis: "filed-pair", prior: { value: 3929e6 } });
    expect(computeBeneish({ ...p[0], balance: current }, p[1], { filedReceivables: filed }).indices.dsri).toBeCloseTo((4315/44284)/(3929/38962), 12);
    expect(computeSupportFlags({ income: p.map(x => x.income), balance: [current, p[1].balance] }, { filedReceivables: filed }).gaps.some(g => g.field === "forensics.flags.receivables")).toBe(false);
  });

  it("does not equate newer conflict evidence for a different concept with the repaired concept", () => {
    const p = periods();
    const current = { ...p[0].balance, fieldConflicts: { netReceivables: { vendorValue: 4315e6, secValue: 5000e6, usable: false as const, reason: "different concept", secEvidence: later(trade, currentEnd) } } };
    expect(selectReceivablesPair(current, p[1].balance, { filedCandidates: candidates() })).toMatchObject({ status: "selected", basis: "filed-pair", concept: total });
  });

  it("admits a newer complete candidate pair that accounts for the selected observation", () => {
    const p = periods(); p[0].balance.netReceivables = 5000e6; p[0].balance.fieldProvenance!.netReceivables = later(total, currentEnd);
    const filed = candidates(); filed.observations.push({ value: 5000e6, issuerCik: "1", evidence: later(total, currentEnd) }, { value: 4000e6, issuerCik: "1", evidence: later(total, priorEnd) });
    expect(selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: filed })).toMatchObject({ status: "selected", basis: "filed-pair", current: { value: 5000e6 }, prior: { value: 4000e6 } });
    expect(computeBeneish(p[0], p[1], { filedReceivables: filed }).indices.dsri).toBeCloseTo((5000/44284)/(4000/38962), 12);
    expect(support(p, { filedReceivables: filed }).gaps.some(g => g.field === "forensics.flags.receivables")).toBe(false);
  });
});

describe("review R2: explicit dimensions are not missing currency metadata", () => {
  it.each([["shares", "USD"], ["USD/shares", "USD"], ["shares", "shares"]])("refuses %s versus %s with absent row labels in both consumers", (currentUnit, priorUnit) => {
    const current = { income: { date: currentEnd, revenue: 1100e6 }, balance: { ...balance(currentEnd, 200, total), reportedCurrency: undefined } };
    const prior = { income: { date: priorEnd, revenue: 1000e6 }, balance: { ...balance(priorEnd, 100, total), reportedCurrency: undefined } };
    current.balance.fieldProvenance!.netReceivables.unit = currentUnit;
    prior.balance.fieldProvenance!.netReceivables.unit = priorUnit;
    const filed = candidates();
    expect(computeBeneish(current, prior, { filedReceivables: filed }).neutralized).toContain("DSRI");
    expect(selectReceivablesPair(current.balance, prior.balance, { filedCandidates: filed }).status).toBe("unavailable");
    const result = computeSupportFlags({ income: [current.income, prior.income], balance: [current.balance, prior.balance] }, { filedReceivables: filed });
    expect(result.flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
    expect(result.gaps.find(g => g.field === "forensics.flags.receivables")?.reason).toContain("no complete eligible");
  });

  it.each(["USD", ""])("preserves matching monetary or truly missing units (%s) without row labels", unit => {
    const current = { income: { date: currentEnd, revenue: 1100e6 }, balance: { ...balance(currentEnd, 200, total), reportedCurrency: undefined } };
    const prior = { income: { date: priorEnd, revenue: 1000e6 }, balance: { ...balance(priorEnd, 100, total), reportedCurrency: undefined } };
    current.balance.fieldProvenance!.netReceivables.unit = unit;
    expect(selectReceivablesPair(current.balance, prior.balance, { filedCandidates: candidates() })).toMatchObject({ status: "selected", basis: unit ? "same-concept" : "vendor-unverified", current: { value: 200e6 }, prior: { value: 100e6 } });
    expect(computeBeneish(current, prior).indices.dsri).toBeCloseTo(1.8181818181818181, 12);
    expect(computeSupportFlags({ income: [current.income, prior.income], balance: [current.balance, prior.balance] }).flags.find(f => f.id === "receivables-vs-revenue")?.severity).toBe("flag");
  });

  it("allows monetary repair only with independently declared matching currency and keeps its adverse warning", () => {
    const current = { income: { date: currentEnd, revenue: 1100e6 }, balance: balance(currentEnd, 200, total) };
    const prior = { income: { date: priorEnd, revenue: 1000e6 }, balance: balance(priorEnd, 100, total) };
    current.balance.fieldProvenance!.netReceivables.unit = "shares";
    const filed = candidates(); filed.observations[0].value = 200e6; filed.observations[1].value = 100e6;
    expect(selectReceivablesPair(current.balance, prior.balance, { filedCandidates: filed })).toMatchObject({ status: "selected", basis: "filed-pair" });
    expect(computeBeneish(current, prior, { filedReceivables: filed }).indices.dsri).toBeCloseTo(1.8181818181818181, 12);
    expect(computeSupportFlags({ income: [current.income, prior.income], balance: [current.balance, prior.balance] }, { filedReceivables: filed }).flags.find(f => f.id === "receivables-vs-revenue")?.severity).toBe("flag");
  });
});

it("never constructs a repair from selected evidence plus an incomplete candidate collection", () => {
  const p = periods(); const filed = candidates(); filed.observations.shift();
  expect(selectReceivablesPair(p[0].balance, p[1].balance, { filedCandidates: filed }).status).toBe("unavailable");
});

it.each(["older", "wrong-endpoint", "wrong-unit", "non-core-form", "missing-acquisition"])("does not equate %s conflict evidence with an eligible superseding monetary copy", kind => {
  const p = periods(); const e = evidence(total, currentEnd);
  e.filings = [{ accn: "other", filed: "2025-11-06", form: "10-K/A" }];
  if (kind === "older") e.filings[0].filed = "2025-11-04";
  if (kind === "wrong-endpoint") e.periodEnd = "2025-09-29";
  if (kind === "wrong-unit") e.unit = "EUR";
  if (kind === "non-core-form") e.filings[0].form = "8-K";
  if (kind === "missing-acquisition") e.observedAt = "";
  const current = { ...p[0].balance, fieldConflicts: { netReceivables: { vendorValue: 4315e6, secValue: 5000e6, usable: false as const, reason: "not an eligible superseding same-basis copy", secEvidence: e } } };
  expect(selectReceivablesPair(current, p[1].balance, { filedCandidates: candidates() })).toMatchObject({ status: "selected", basis: "filed-pair", current: { value: 4315e6 }, prior: { value: 3929e6 } });
});
