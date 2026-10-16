import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import type { SourcedClaim } from "@/report/schema";
import frozen from "./fixtures/nvda-metric-context.json";

const cases = frozen.cases as { path: string; claim: SourcedClaim; record: NumericProvenanceRecord }[];
const check = (entry: typeof cases[number], text = entry.claim.text, record = entry.record) => validateClaimNumericSupport(
  { ...entry.claim, text }, { record, excerpts: [], sourceId: entry.record.id, reportingCurrency: "USD", ignoreWords: ["NVIDIA Corporation", "NVDA"] },
);
const bySource = (suffix: string) => cases.find((entry) => entry.record.id.endsWith(suffix))!;
const leftUnchecked = (entry: typeof cases[number]) => /sgiNeutralScore|relativeStrength\.12/.test(entry.record.origin);

describe("saved NVDA report metric context against its original typed records", () => {
  it.each(cases.filter((entry) => !leftUnchecked(entry)))("validates the equivalent source contract at $path", (entry) => {
    expect(check(entry).status).toBe("validated");
  });

  it.each(cases.filter(leftUnchecked))("retains unestablished scope at $path", (entry) => {
    expect(check(entry).status).toBe("unchecked");
  });

  it("retains guidance accounting basis, target period, issuance date, metric and currency", () => {
    const margin = bySource("gross-margin-gaap-guidance-midpoint");
    for (const text of [margin.claim.text.replace("(GAAP)", "(non-GAAP)"), margin.claim.text.replace("Q3", "Q4"),
      margin.claim.text.replace("2026-08-26", "2026-08-25"), margin.claim.text.replace("gross margin", "operating margin")]) {
      expect(check(margin, text).status).not.toBe("validated");
    }
    const revenue = bySource("revenue-guidance-midpoint");
    expect(check(revenue, revenue.claim.text.replace("USD", "EUR")).status).not.toBe("validated");
  });

  it("preserves the executive, award type, target-value definition and negation", () => {
    const award = bySource("parker-new-hire-performance-based-restricted-stock-units-target-value-appointment-package");
    for (const text of [award.claim.text.replace("Nicholas Parker", "Jensen Huang"), award.claim.text.replace("performance-based", "time-based"),
      award.claim.text.replace("target value", "realized value"), award.claim.text.replace("target value", "annual compensation value"),
      award.claim.text.replace("had", "did not have")]) {
      expect(check(award, text).status).not.toBe("validated");
    }
  });

  it("does not turn a lock-up restriction into an upward change or discard its scope", () => {
    const lockup = bySource("lock-up-restrictions-as-of-2026-07-26");
    expect(check(lockup, lockup.claim.text.replace("were", "increased by")).status).not.toBe("validated");
    expect(check(lockup, lockup.claim.text.replace("subject to short-term lock-up restrictions", "not subject to short-term lock-up restrictions")).status).not.toBe("validated");
  });

  it("keeps the explicit six-month horizon and current trailing P/E definition", () => {
    const strength = bySource("relative-strength-vs-spy-6-month");
    expect(check(strength, strength.claim.text.replace("six months", "three months")).status).not.toBe("validated");
    expect(check(strength, strength.claim.text.replace("SPY", "QQQ")).status).not.toBe("validated");
    const pe = bySource("pettm-current");
    expect(check(pe, "Current forward P/E is 27.5x.").status).not.toBe("validated");
  });

  it("binds FCFF and operating EPS aliases only to their known forecast contracts", () => {
    const fcff = bySource("fcf-weighted-12m-ending-2029-07-26");
    expect(check(fcff, fcff.claim.text, { ...fcff.record, origin: "computed.capital.fcf" }).status).not.toBe("validated");
    expect(check(fcff, fcff.claim.text.replace("2029", "2030")).status).not.toBe("validated");
    const eps = bySource("epsdiluted-weighted-12m-ending-2031-07-26");
    for (const replacement of ["GAAP EPS", "basic EPS", "non-GAAP EPS"]) {
      expect(check(eps, eps.claim.text.replace("operating EPS", replacement)).status).not.toBe("validated");
    }
    expect(check(eps, eps.claim.text, { ...eps.record, origin: "fmp:income-statement" }).status).not.toBe("validated");
  });

  it("keeps the standardized FCF formula and the say-on-pay denominator", () => {
    const fcf = bySource("free-cash-flow-operating-cash-flow-less-capex-quarter-ended-2026-07-26");
    expect(check(fcf, fcf.claim.text.replace("less capex", "less dividends")).status).not.toBe("validated");
    const vote = bySource("say-on-pay-support-votes-for-for-against-abstentions");
    expect(check(vote, vote.claim.text.replace(", against and abstentions", " and against")).status).not.toBe("validated");
    expect(check(vote, vote.claim.text.replace("support", "opposition")).status).not.toBe("validated");
    expect(check(vote, vote.claim.text.replace("as votes for divided", "as votes against divided")).status).not.toBe("validated");
  });

  it("does not transfer source-specific metadata and labels to other producers", () => {
    for (const entry of cases.filter((item) => !leftUnchecked(item) && !/lock-up|relative-strength|pettm-current/.test(item.record.id))) {
      expect(check(entry, entry.claim.text, { ...entry.record, origin: "unestablished:other-producer" }).status).not.toBe("validated");
    }
  });
});
