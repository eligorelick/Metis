import { describe, expect, it } from "vitest";
import { filedReceivablesCandidates } from "@/edgar/receivables";
import type { CompanyFacts } from "@/edgar/xbrl";

const point = (end: string, val: number, extra = {}) => ({ end, val, accn: "0000000001-25-000001", filed: "2025-11-05", form: "10-K", ...extra });
const facts = (): CompanyFacts => ({ cik: 1, entityName: "Synthetic issuer", facts: { "us-gaap": {
  ReceivablesNetCurrent: { units: { USD: [point("2025-09-28", 4315e6), point("2024-09-29", 3929e6)] } },
  AccountsReceivableNetCurrent: { units: { USD: [point("2025-09-28", 2855e6), point("2024-09-29", 2347e6)] } },
} } });
const options = { periods: [{ end: "2025-09-28", currency: "USD" }, { end: "2024-09-29", currency: "USD" }], asOf: "2025-11-10T14:00:00Z", observedAt: "2025-11-10T12:00:00Z" };

describe("filed receivables observations", () => {
  it("retains both concepts and all copies with actual acquisition provenance", () => {
    const f = facts(); const before = JSON.stringify(f);
    const found = filedReceivablesCandidates(f, options);
    expect(found.observations).toHaveLength(4);
    expect(found.observations.map(o => o.evidence.tags[0])).toContain("us-gaap/ReceivablesNetCurrent");
    expect(found.observations[0]).toMatchObject({ issuerCik: "1", evidence: { observedAt: options.observedAt, unit: "USD", periodStart: null } });
    expect(JSON.stringify(f)).toBe(before);
    const reversed = facts(); reversed.facts["us-gaap"] = Object.fromEntries(Object.entries(reversed.facts["us-gaap"]).reverse());
    expect(filedReceivablesCandidates(reversed, options)).toEqual(found);
  });

  it.each([
    ["duration", { start: "2025-01-01" }], ["form", { form: "8-K" }],
    ["future filing", { filed: "2025-11-11" }], ["future end", { end: "2025-11-11" }],
    ["invalid date", { filed: "2025-02-30" }], ["missing accession", { accn: "" }],
    ["one-day endpoint", { end: "2024-09-30" }],
  ])("excludes %s observations", (_name, extra) => {
    const f: CompanyFacts = { cik: 1, entityName: "Synthetic", facts: { "us-gaap": { ReceivablesNetCurrent: { units: { USD: [point("2025-09-28", 4315e6, extra)] } } } } };
    expect(filedReceivablesCandidates(f, options).observations).toHaveLength(0);
  });

  it("requires declared currency, known issuer and actual valid acquisition time without inventing USD", () => {
    expect(filedReceivablesCandidates(facts(), { ...options, periods: options.periods.map(p => ({ ...p, currency: null })) }).observations).toHaveLength(0);
    expect(filedReceivablesCandidates(facts(), { ...options, periods: options.periods.map(p => ({ ...p, currency: "EUR" })) }).observations).toHaveLength(0);
    expect(filedReceivablesCandidates({ ...facts(), cik: 0 }, options).observations).toHaveLength(0);
    expect(filedReceivablesCandidates(null, options).observations).toHaveLength(0);
    for (const observedAt of ["", "nonsense", "2025-11-11T12:00:00Z", "2025-02-30T12:00:00Z", "2025-11-10"]) expect(filedReceivablesCandidates(facts(), { ...options, observedAt }).observations).toHaveLength(0);
    expect(filedReceivablesCandidates(facts(), { ...options, asOf: "bad" }).observations).toHaveLength(0);
  });

  it("retains negative and conflicting copies so later pair admission cannot hide them", () => {
    const f: CompanyFacts = { cik: 1, entityName: "Synthetic", facts: { "us-gaap": { ReceivablesNetCurrent: { units: { USD: [point("2025-09-28", 4315e6), point("2025-09-28", -1, { filed: "2025-11-06", accn: "later" })] } } } } };
    expect(filedReceivablesCandidates(f, options).observations.map(o => o.value)).toEqual([-1, 4315e6]);
  });
});

it.each(["shares", "USD/shares"])("never extracts %s as a monetary receivables repair candidate", unit => {
  const f: CompanyFacts = { cik: 1, entityName: "Synthetic", facts: { "us-gaap": {
    ReceivablesNetCurrent: { units: { [unit]: [point("2025-09-28", 200e6), point("2024-09-29", 100e6)] } },
  } } };
  expect(filedReceivablesCandidates(f, { ...options, periods: options.periods.map(p => ({ ...p, currency: unit })) }).observations).toHaveLength(0);
});
