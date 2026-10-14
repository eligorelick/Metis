/**
 * WS7 (D-20) — the deterministic, no-model checks the verification pass runs on
 * the prose around each cited figure, and the restriction on claims that name a
 * person.
 *
 * Before this, verification measured CITATION COVERAGE only: could each figure
 * be traced to the registry record it cites. A sentence could therefore say a
 * metric "rose" while citing a negative change, name "Q3 2024" while citing an
 * FY2025 record, or write "bps" about a dollar figure, and count as fully cited.
 *
 * These tests pin four things, in this order of importance:
 *
 *  1. A genuine contradiction FAILS, with the sentence, the cited figure and a
 *     reason a reader can act on.
 *  2. Correct prose PASSES — the checks must not punish good writing. Several
 *     cases below exist only to pin a NON-failure that a naive implementation
 *     would get wrong ("growth slowed to 4%" against a +4 record; a sentence
 *     that mentions a second figure's unit; a comparison naming two years).
 *  3. What cannot be located is reported as NOT CHECKED rather than guessed at,
 *     which is why `checked` is published beside `coverage` and never merged
 *     into it.
 *  4. A claim naming a person that rests on a web-search result is rejected AND
 *     stops counting as supported — a coverage number that still counted it
 *     would say the opposite of the finding printed beside it.
 *
 * No network, no model: runVerifyPass is deterministic and the consistency
 * module is pure.
 */

import { describe, expect, it } from "vitest";

import type {
  CitationProvenanceRecord,
  NumericProvenanceRecord,
} from "@/pipeline/stageC/provenance";
import type { SourcedClaim } from "@/report/schema";
import {
  collectPersonNames,
  collectPersonRows,
  consistencyManifestEntries,
  emptyConsistencyChecks,
  isCredibilityPath,
  isDeltaRecord,
  isFilingOrTranscriptSource,
  isPayloadPersonRowSource,
  namedIndividuals,
  namesIndividual,
  personNameMatches,
  personTitleMatches,
  proseNumbers,
  runConsistencyChecks,
  splitNameAndPosition,
  statesCurrencyOnNumber,
  statesNumberWord,
  statesOnlyAllowedDates,
  type ConsistencyClaimRef,
  type PersonRow,
} from "@/pipeline/stageC/consistency";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import { buildLeadershipGuidance } from "@/pipeline/stageC/prompts";

/* ------------------------------------------------------------------------ *
 * Fixtures — a hand-built registry so each check has an exact record to hit.
 * ------------------------------------------------------------------------ */

function numeric(over: Partial<NumericProvenanceRecord>): NumericProvenanceRecord {
  return {
    id: "computed.growth.revenue-growth-yoy",
    kind: "computed",
    value: 6.4,
    unit: "percent",
    currency: null,
    period: null,
    asOf: "2025-09-27",
    origin: "computed.growth",
    formulaVersion: "stage-b-v1",
    displayPrecision: 4,
    ...over,
  };
}

function claim(text: string, source: string, over: Partial<SourcedClaim> = {}): SourcedClaim {
  return { text, label: "FACT", source, asOf: "2025-09-27", ...over };
}

function refs(...claims: SourcedClaim[]): ConsistencyClaimRef[] {
  return claims.map((c, index) => ({ claim: c, path: `fundamentals.commentary[${index}]` }));
}

function run(
  claims: ConsistencyClaimRef[],
  registry: NumericProvenanceRecord[],
  over: {
    citationRegistry?: CitationProvenanceRecord[];
    fetchedUrls?: string[];
    personNames?: string[];
    organizationNames?: string[];
    personRows?: PersonRow[];
  } = {},
) {
  return runConsistencyChecks({
    claims,
    registry,
    citationRegistry: over.citationRegistry ?? [],
    fetchedUrls: new Set(over.fetchedUrls ?? []),
    personNames: over.personNames ?? [],
    organizationNames: over.organizationNames ?? [],
    personRows: over.personRows ?? [],
  });
}

/* ------------------------------------------------------------------------ *
 * (d) Direction
 * ------------------------------------------------------------------------ */

describe("direction check", () => {
  const decline = numeric({ value: -3.2 });

  it("fails a direction word that contradicts the sign of the cited change", () => {
    const result = run(
      refs(claim("Revenue rose 3.2% year over year.", decline.id)),
      [decline],
    );
    expect(result.checks.direction).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
    const finding = result.findings.find((f) => f.check === "direction");
    expect(finding?.reason).toBe("direction-mismatch");
    // The failure has to name all three things a reader needs.
    expect(finding?.sentence).toBe("Revenue rose 3.2% year over year.");
    expect(finding?.figure).toContain("-3.2 percent");
    expect(finding?.sourceId).toBe(decline.id);
    expect(finding?.note).toContain('says "rose"');
    expect(finding?.note).toContain("negative");
  });

  it("passes a direction word that matches the sign", () => {
    const result = run(
      refs(claim("Revenue fell 3.2% year over year.", decline.id)),
      [decline],
    );
    expect(result.checks.direction).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
    expect(result.findings).toEqual([]);
  });

  it("reads a comma between the word and the number as an apposition, not a delta (audit 2026-09-06, F191)", () => {
    // "growth came in lower, 6.4%": 6.4 is the LEVEL of growth and "lower" is
    // second-order. Before the audit the comma did not break the reading and a
    // correct sentence about a +6.4 record failed as a direction mismatch.
    const growth = numeric({ id: "computed.growth-margins.latest-revenue-yoy", value: 6.4 });
    const apposition = run(refs(claim("Revenue growth came in lower, 6.4%.", growth.id)), [growth]);
    expect(apposition.checks.direction.checked).toBe(0);
    expect(apposition.findings).toEqual([]);
    // Without the punctuation the word still owns the number.
    const glued = run(refs(claim("Revenue growth was up 6.4%.", growth.id)), [growth]);
    expect(glued.checks.direction).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
  });

  it("does not read a capitalised word inside a company name as a direction word (audit 2026-09-06, F192)", () => {
    // "Advanced Micro Devices" carried a +1 "advanced" that failed every
    // correct decline sentence naming the peer.
    const named = run(refs(claim("Advanced Micro Devices revenue fell 3.2% in the quarter.", decline.id)), [decline]);
    expect(named.checks.direction).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
    // The same word as a verb keeps its sign.
    const verb = run(refs(claim("Revenue advanced 3.2% in the quarter.", decline.id)), [decline]);
    expect(verb.checks.direction).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
  });

  it("classifies delta vs level by the figure's OWN name, using the real registry id shapes (audit 2026-09-06, F186/F197)", () => {
    // payload.ts registers every growth-section figure as
    // computed.growth-margins.<label slug> with origin computed.growth.*; the
    // old identity test read "growth" from the section and origin, so a margin
    // LEVEL was a delta and "gross margin climbed 46.2%" was checked as if 46.2
    // could be a decline.
    const level = numeric({
      id: "computed.growth-margins.gross-margin-latest",
      origin: "computed.growth.margins.gross",
      value: 46.2,
    });
    expect(isDeltaRecord(level)).toBe(false);
    const result = run(refs(claim("Gross margin climbed 46.2% in FY2025.", level.id)), [level]);
    expect(result.checks.direction.checked).toBe(0);
    expect(result.findings).toEqual([]);
    for (const id of [
      "computed.growth-margins.revenue-cagr-3y",
      "computed.growth-margins.latest-revenue-yoy",
      "computed.growth-margins.diluted-eps-cagr-5y.2",
    ]) {
      expect(isDeltaRecord(numeric({ id, origin: "computed.growth.revenueCagrs" }))).toBe(true);
    }
    expect(isDeltaRecord(numeric({ id: "computed.returns.roic-latest", origin: "computed.returns.roic" }))).toBe(false);
  });

  it("reads basis points as hundredths of a point when locating the cited change", () => {
    const bps = numeric({ id: "computed.margins.operating-margin-change", value: -1.2, unit: "percentage-points" });
    const bad = run(refs(claim("Operating margin expanded 120 bps.", bps.id)), [bps]);
    expect(bad.checks.direction.failed).toBe(1);
    const good = run(refs(claim("Operating margin contracted 120 bps.", bps.id)), [bps]);
    expect(good.checks.direction).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
  });

  it("does not check a LEVEL figure — 'margin rose to 30%' says nothing about the sign of 30", () => {
    const level = numeric({ id: "computed.margins.operating-margin", origin: "computed.margins", value: 30 });
    expect(isDeltaRecord(level)).toBe(false);
    const result = run(refs(claim("Operating margin rose to 30% this year.", level.id)), [level]);
    expect(result.checks.direction.checked).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("does not read 'to' as a delta: 'growth fell to 4%' is not a claim that 4 is negative", () => {
    // The classic false positive. "fell" describes the growth RATE declining,
    // while the cited value (+4) is the rate itself.
    const growth = numeric({ value: 4 });
    const result = run(refs(claim("Revenue growth fell to 4% this year.", growth.id)), [growth]);
    expect(result.checks.direction.checked).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("ignores second-order words whose sign is about the rate of change, not the change", () => {
    const growth = numeric({ value: 4 });
    for (const sentence of [
      "Revenue growth slowed 4% versus last year.",
      "Revenue growth accelerated 4%.",
      "The spread narrowed 4%.",
    ]) {
      expect(run(refs(claim(sentence, growth.id)), [growth]).checks.direction.checked).toBe(0);
    }
  });

  it("ignores an evaluative word whose sign depends on whether the metric is good or bad", () => {
    // 2026-09 review: "improved"/"deteriorated" and their family sat in the
    // vocabulary with fixed signs, so every correct sentence about a
    // LOWER-IS-BETTER metric (leverage, churn, DSO, net debt, a cost ratio) was
    // filed as a direction mismatch. They are excluded for exactly the reason
    // the module docstring already gave for "widened"/"narrowed".
    const leverageFell = numeric({
      id: "computed.leverage.net-debt-to-ebitda-change",
      origin: "computed.leverage",
      value: -0.4,
      unit: "percentage-points",
    });
    const leverageRose = numeric({ ...leverageFell, value: 0.4 });
    for (const [sentence, record] of [
      ["Net leverage improved 0.4 points after the debt paydown.", leverageFell],
      ["Net leverage improvement of 0.4 points followed the paydown.", leverageFell],
      ["Days sales outstanding deteriorated 0.4 points on the quarter.", leverageRose],
      ["Cost coverage weakened 0.4 points on the quarter.", leverageRose],
      ["The cost ratio worsened 0.4 points on the quarter.", leverageRose],
      ["Coverage strengthened 0.4 points on the quarter.", leverageFell],
    ] as const) {
      const result = run(refs(claim(sentence, record.id)), [record]);
      expect(result.checks.direction.checked).toBe(0);
      expect(result.findings).toEqual([]);
    }
  });

  it("does not attach a direction word to a number that is not the cited figure", () => {
    const decline2 = numeric({ value: -3.2 });
    const result = run(
      refs(claim("Operating income rose 12.0% while revenue slipped 3.2%.", decline2.id)),
      [decline2],
    );
    // "slipped 3.2%" is the cited change and matches; "rose 12.0%" is a
    // different figure and must not be judged against this record.
    expect(result.checks.direction).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
  });
});

/* ------------------------------------------------------------------------ *
 * (d) Period
 * ------------------------------------------------------------------------ */

describe("period check", () => {
  const fy = numeric({
    id: "payload.statements.income-statement-annual.2025-09-27.revenue",
    kind: "provider",
    origin: "fmp:income-statement(annual)",
    formulaVersion: null,
    value: 416161000000,
    unit: "currency",
    currency: "USD",
    period: "2025-09-27",
  });

  it("fails a period phrase that names another year", () => {
    const result = run(refs(claim("Revenue reached $416.2 billion in FY2023.", fy.id)), [fy]);
    expect(result.checks.period).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
    const finding = result.findings.find((f) => f.check === "period");
    expect(finding?.reason).toBe("period-word-mismatch");
    expect(finding?.note).toContain('"FY2023"');
    expect(finding?.note).toContain("2025-09-27");
    expect(finding?.figure).toContain("416161000000 currency USD");
  });

  it("keeps the existing fiscal-spelling tolerance: FY2025 IS the 2025-09-27 column", () => {
    for (const phrase of ["FY2025", "fiscal 2025", "Q4 2025", "in 2025"]) {
      const result = run(refs(claim(`Revenue in ${phrase} was $416.2 billion.`, fy.id)), [fy]);
      expect(result.checks.period).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
    }
  });

  it("passes a comparison that names the cited year alongside another", () => {
    const result = run(
      refs(claim("Revenue grew from $391.0 billion in FY2024 to $416.2 billion in FY2025.", fy.id)),
      [fy],
    );
    expect(result.checks.period.failed).toBe(0);
  });

  it("does not check a sentence in which the cited figure was never located (audit 2026-09-06, F189)", () => {
    // The module rule is locate-first. The period check used to run before the
    // guard, so "in FY2024" around a figure the sentence never wrote was judged
    // against the cited record's period.
    const dated = numeric({ value: 6.4, period: "2025-09-27" });
    const result = run(refs(claim("Revenue growth was strong in FY2024.", dated.id)), [dated]);
    expect(result.checks.period.checked).toBe(0);
    expect(result.findings).toEqual([]);
    // With the figure present the same phrase is checked and fails.
    const located = run(refs(claim("Revenue grew 6.4% in FY2024.", dated.id)), [dated]);
    expect(located.checks.period).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
  });

  it("does not check a bare quarter — no fiscal calendar, no verdict", () => {
    // Apple's Q3 FY2025 ends in June. Guessing which ISO period end "Q3" means
    // would fail correct sentences, so it is reported as not checked.
    const result = run(refs(claim("Revenue was strong in Q3.", fy.id)), [fy]);
    expect(result.checks.period.checked).toBe(0);
  });

  it("does not check a record the registry stored without a period", () => {
    const timeless = numeric({ period: null });
    const result = run(refs(claim("Growth was 6.4% in FY2025.", timeless.id)), [timeless]);
    expect(result.checks.period.checked).toBe(0);
  });

  it("does not read the number after a bare quarter as a two-digit year", () => {
    // 2026-09 review: the optional century let "Q1" swallow the number that
    // followed it, so "Q1 15% growth" claimed the sentence named the period
    // "Q1 15". The phrase starts at the Q, so the value-span guard could not
    // help; the pattern now requires the century.
    const dated = numeric({ value: 15, period: "2025-12-31" });
    const result = run(refs(claim("Q1 15% growth was reported.", dated.id)), [dated]);
    expect(result.checks.period.checked).toBe(0);
    expect(result.findings.some((f) => f.check === "period")).toBe(false);

    // A quarter that really does name a year is still checked, and still passes.
    const full = run(refs(claim("Q1 2025 growth was 15%.", dated.id)), [dated]);
    expect(full.checks.period).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
  });

  it("does not mistake a four-digit VALUE for a year", () => {
    const count = numeric({
      id: "payload.quote.volume",
      kind: "provider",
      origin: "fmp:quote",
      formulaVersion: null,
      value: 2025,
      unit: "count",
      period: "2026-03-28",
    });
    const result = run(refs(claim("The reading was 2025 units.", count.id)), [count]);
    expect(result.checks.period.checked).toBe(0);
  });
});

/* ------------------------------------------------------------------------ *
 * (d) Unit
 * ------------------------------------------------------------------------ */

describe("unit check", () => {
  const money = numeric({
    id: "payload.statements.income-statement-annual.2025-09-27.revenue",
    kind: "provider",
    origin: "fmp:income-statement(annual)",
    formulaVersion: null,
    value: 416161000000,
    unit: "currency",
    currency: "USD",
    period: "2025-09-27",
  });

  it("fails a monetary figure written as a percentage", () => {
    const result = run(refs(claim("Revenue was 416.2%.", money.id)), [money]);
    expect(result.checks.unit).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
    const finding = result.findings.find((f) => f.check === "unit");
    expect(finding?.reason).toBe("unit-word-mismatch");
    expect(finding?.note).toContain("percent units");
    expect(finding?.note).toContain("registry records it as currency (USD)");
  });

  it("fails a percentage figure written in dollars", () => {
    const pct = numeric({ value: 6.4 });
    const result = run(refs(claim("Growth was $6.4 billion.", pct.id)), [pct]);
    expect(result.checks.unit.checked).toBe(0); // $6.4bn does not locate a 6.4 value
    const scaled = run(refs(claim("Growth was $6.4 for the year.", pct.id)), [pct]);
    expect(scaled.checks.unit).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
  });

  it("passes the same figure written correctly, with or without the dollar sign", () => {
    for (const sentence of [
      "Revenue was $416.2 billion in FY2025.",
      "Revenue was 416.2 billion in FY2025.",
      "Revenue was 416,161,000,000 in FY2025.", // no unit token: not eligible
    ]) {
      expect(run(refs(claim(sentence, money.id)), [money]).checks.unit.failed).toBe(0);
    }
  });

  it("accepts a bare scale word on a share count — a magnitude names no unit (audit 2026-09-06, F185)", () => {
    const shares = numeric({
      id: "computed.capital.diluted-shares-latest",
      origin: "computed.capital.shares",
      value: 15_200_000_000,
      unit: "shares",
    });
    const bare = run(refs(claim("The diluted share count stood at 15.2 billion.", shares.id)), [shares]);
    expect(bare.checks.unit).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
    // A currency prefix still claims money, which a share count is not.
    const dollars = run(refs(claim("The diluted share count stood at $15.2 billion.", shares.id)), [shares]);
    expect(dollars.checks.unit).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
  });

  it("judges only the CITED figure's unit, not every unit in the sentence", () => {
    // A naive implementation flags this: the sentence contains "%" and the
    // record is currency. The percentage belongs to a different figure.
    const result = run(
      refs(claim("Revenue of $416.2 billion carried a 30.5% operating margin.", money.id)),
      [money],
    );
    expect(result.checks.unit).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
  });

  it("keeps only the best-scale match when a percentage coincides with a scaled value", () => {
    // 2026-09 review: the speculative display scales tried for a large-magnitude
    // record made "5.0%" locate a $5.0e9 record (5.0 × 1e9), so a correctly
    // written sentence failed the unit check on a figure it never cited. A
    // reading whose scale the sentence actually WROTE wins over a speculative
    // one, and only the winners are judged.
    const revenue = numeric({
      id: "payload.statements.income-statement-annual.2025-09-27.revenue",
      kind: "provider",
      origin: "fmp:income-statement(annual)",
      formulaVersion: null,
      value: 5_000_000_000,
      unit: "currency",
      currency: "USD",
      period: "2025-09-27",
    });
    const result = run(
      refs(claim("Revenue of $5.0 billion came with a 5.0% operating margin.", revenue.id)),
      [revenue],
    );
    expect(result.checks.unit).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
    expect(result.findings).toEqual([]);
  });

  it("does not invent a rule for dimensionless readings", () => {
    const score = numeric({ id: "computed.scores.quality", origin: "computed.scores", value: 72, unit: "score" });
    const result = run(refs(claim("The quality score was 72 out of 100.", score.id)), [score]);
    expect(result.checks.unit.checked).toBe(0);
  });
});

/* ------------------------------------------------------------------------ *
 * "checked" is reported separately from "coverage"
 * ------------------------------------------------------------------------ */

describe("checked vs coverage", () => {
  it("reports a null rate when nothing was eligible, never synthetic perfection", () => {
    const empty = emptyConsistencyChecks();
    for (const family of ["direction", "period", "unit", "namedIndividual"] as const) {
      expect(empty[family]).toEqual({ checked: 0, passed: 0, failed: 0, rate: null });
    }
    const result = run(refs(claim("A purely qualitative judgment.", "computed")), []);
    expect(result.checks.direction.rate).toBeNull();
    expect(result.checks.unit.rate).toBeNull();
  });

  it("counts a cited-but-contradicted sentence as CITED and FAILED at the same time", async () => {
    // The exact situation the split exists for: perfect provenance, wrong prose.
    const decline = numeric({ value: -3.2 });
    const payload = {
      provenanceRegistry: [decline],
      citationRegistry: [],
    } as unknown as ContextPayload;
    const report = {
      commentary: [claim("Revenue rose 3.2% year over year.", decline.id)],
    };

    const verify = await runVerifyPass({} as PassDeps, payload, report);
    expect(verify.coverage.factualClaims).toEqual({ supported: 1, total: 1, rate: 1 });
    expect(verify.checks.direction).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });

    const checkEntry = verify.log.find((entry) => entry.check === "direction");
    expect(checkEntry?.outcome).toBe("unverified");
    expect(checkEntry?.reason).toBe("direction-mismatch");
    expect(checkEntry?.claim).toBe("Revenue rose 3.2% year over year.");
    expect(checkEntry?.note).toContain("Cited figure:");
    expect(checkEntry?.path).toBe("commentary[0]");
    // The coverage entry for the same claim stays a separate row.
    expect(verify.log.filter((entry) => entry.check === undefined).length).toBeGreaterThan(0);
  });

  it("discloses failing families in the missing-data manifest, and nothing when none fail", () => {
    // The verification log is long; the manifest is where a reader looks for
    // "what is wrong with this report", so a failure has to appear in both.
    const checks = emptyConsistencyChecks();
    expect(consistencyManifestEntries(checks)).toEqual([]);

    checks.direction = { checked: 4, passed: 3, failed: 1, rate: 0.75 };
    checks.namedIndividual = { checked: 2, passed: 0, failed: 2, rate: 0 };
    const entries = consistencyManifestEntries(checks);
    expect(entries.map((entry) => entry.field)).toEqual([
      "verify.check.direction",
      "verify.check.namedIndividual",
    ]);
    expect(entries.every((entry) => entry.severity === "warn")).toBe(true);
    expect(entries[0].reason).toContain("1 of 4 checked");
    expect(entries[0].reason).toContain("verification log");
    expect(entries[1].reason).toContain("2 of 2 checked");
  });
});

/* ------------------------------------------------------------------------ *
 * (e) Named individuals
 * ------------------------------------------------------------------------ */

describe("claims that name a person", () => {
  const transcript: CitationProvenanceRecord = {
    id: "fmp:earning-call-transcript",
    kind: "payload-text",
    asOf: "2026-05-01",
    origin: "fmp:earning-call-transcript",
  };
  const filing: CitationProvenanceRecord = {
    id: "edgar:10-K item7",
    kind: "payload-text",
    asOf: "2025-09-27",
    origin: "edgar:10-K item7",
  };
  const news: CitationProvenanceRecord = {
    id: "fmp:news",
    kind: "payload-text",
    asOf: "2026-07-03",
    origin: "fmp:news",
  };

  it("finds people from the payload's own rows, not from guesswork", () => {
    expect(
      collectPersonNames({
        leadershipNotes: ["Tim Cook — CEO (since 2011-08-24), pay 99000000 USD [fmp:key-executives]"],
        insiderNotes: ["2026-06-01 Katherine Adams (General Counsel): S-Sale 5000 @ 205 [fmp:insider-trades · 2026-06-01]"],
        executiveNames: ["Luca Maestri"],
      }),
    ).toEqual(expect.arrayContaining(["Tim Cook", "Katherine Adams", "Luca Maestri"]));
  });

  it("recognizes a person by name, honorific or role, and not a bare role", () => {
    expect(namesIndividual("Tim Cook said margins hold.", ["Tim Cook"])).toBe("Tim Cook");
    expect(namesIndividual("Dr. Rivera joined the board.", [])).toContain("Rivera");
    expect(namesIndividual("CEO Jane Roe reiterated guidance.", [])).toContain("Jane Roe");
    // No name: a claim about "the CEO" is a claim about the company's office.
    expect(namesIndividual("The CEO reiterated guidance.", [])).toBeNull();
    expect(namesIndividual("Free cash flow covered the dividend.", [])).toBeNull();
  });

  it("does not read an honorific inside a company name as a person (audit 2026-09-06, F187)", () => {
    const orgs = ["Keurig Dr Pepper Inc.", "Dr. Reddy's Laboratories Limited"];
    expect(namesIndividual("Keurig Dr Pepper grew volumes 3% in the quarter.", [], orgs)).toBeNull();
    expect(namesIndividual("Dr. Reddy's generics pricing weighed on margins.", [], orgs)).toBeNull();
    // A person keeps being a person beside the same organisation list.
    expect(namesIndividual("Dr. Rivera joined the board.", [], orgs)).toContain("Rivera");
    // Through the check itself: a company claim citing news is not a
    // named-individual claim at all.
    const result = run(
      refs(claim("Keurig Dr Pepper grew volumes 3% in the quarter.", news.id)),
      [],
      { citationRegistry: [news], organizationNames: orgs },
    );
    expect(result.checks.namedIndividual.checked).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("accepts a named-person claim that cites the payload's own executive or insider row (audit 2026-09-06, F188)", () => {
    // The rows the names are harvested from are payload facts, registered as
    // citations under these tags; rejecting a claim that cites one contradicted
    // the prompt's "or a payload figure".
    const executives: CitationProvenanceRecord = {
      id: "fmp:key-executives",
      kind: "payload-text",
      asOf: null,
      origin: "fmp:key-executives",
    };
    const insiders: CitationProvenanceRecord = {
      id: "fmp:insider-trades",
      kind: "payload-text",
      asOf: "2026-06-01",
      origin: "fmp:insider-trades",
    };
    expect(isPayloadPersonRowSource(executives.id)).toBe(true);
    expect(isPayloadPersonRowSource(insiders.id)).toBe(true);
    expect(isPayloadPersonRowSource("fmp:executive-compensation")).toBe(true);
    expect(isPayloadPersonRowSource(news.id)).toBe(false);
    // D-43: the cited rows must list the person. Before, this claim passed
    // with no row at all.
    const cookRows = collectPersonRows({
      leadershipNotes: ["Tim Cook — CEO (since 2011-08-24), pay 99000000 USD [fmp:key-executives]"],
      insiderNotes: ["2026-06-01 Tim Cook (CEO): S-Sale 50000 @ 205 [fmp:insider-trades · 2026-06-01]"],
    });
    for (const source of [executives, insiders]) {
      const asOf = source.asOf ?? null;
      const result = run(
        refs(claim("Tim Cook has led the company since 2011.", source.id, { asOf })),
        [],
        { citationRegistry: [executives, insiders, news], personNames: ["Tim Cook"], personRows: cookRows },
      );
      expect(result.checks.namedIndividual).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
      expect(result.findings).toEqual([]);
      // The same claim against rows listing only someone else fails closed.
      const elsewhere = run(
        refs(claim("Tim Cook has led the company since 2011.", source.id, { asOf })),
        [],
        {
          citationRegistry: [executives, insiders, news],
          personNames: ["Tim Cook"],
          personRows: cookRows.map((row) => ({ ...row, name: "Jane Roe" })),
        },
      );
      expect(elsewhere.findings[0]?.reason).toBe("named-individual-not-in-source");
      expect(elsewhere.rejectedClaimPaths.has("fundamentals.commentary[0]")).toBe(true);
      // No rows at all is no evidence, never a pass on the tag.
      const none = run(
        refs(claim("Tim Cook has led the company since 2011.", source.id, { asOf })),
        [],
        { citationRegistry: [executives, insiders, news], personNames: ["Tim Cook"] },
      );
      expect(none.checks.namedIndividual.failed).toBe(1);
    }
  });

  it("rejects a named-person claim sourced to a web-search result", async () => {
    const url = "https://example.com/interview";
    const payload = {
      provenanceRegistry: [],
      citationRegistry: [],
      leadership: { notes: ["Tim Cook — CEO [fmp:key-executives]"] },
    } as unknown as ContextPayload;
    const report = {
      governanceNotes: [claim("Tim Cook said the buyback pace continues.", `web:${url}`)],
    };

    const verify = await runVerifyPass({} as PassDeps, payload, report, { fetchedUrls: [url] });

    expect(verify.checks.namedIndividual).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
    const finding = verify.log.find((entry) => entry.check === "named-individual");
    expect(finding?.reason).toBe("named-individual-web-source");
    expect(finding?.note).toContain("Tim Cook");
    expect(finding?.note).toContain("restricted to filings and transcripts");
    // Rejected means it stops counting as supported — otherwise the coverage
    // number beside the finding would contradict it.
    expect(verify.coverage.factualClaims).toEqual({ supported: 0, total: 1, rate: 0 });
  });

  it("rejects a named-person claim with no source at all", () => {
    const result = run(
      refs(claim("Tim Cook has beaten guidance every quarter.", "analyst memory")),
      [],
      { personNames: ["Tim Cook"] },
    );
    expect(result.checks.namedIndividual.failed).toBe(1);
    expect(result.findings[0].reason).toBe("named-individual-unsourced");
  });

  it("accepts a named-person claim grounded in a transcript, a filing or a registry figure", () => {
    const figure = numeric({ id: "payload.leadership.comp-tim-cook-fy2025", value: 99000000, unit: "currency", currency: "USD" });
    for (const source of [transcript.id, filing.id, figure.id]) {
      const result = run(refs(claim("Tim Cook reiterated the margin target.", source)), [figure], {
        citationRegistry: [transcript, filing],
        personNames: ["Tim Cook"],
      });
      expect(result.checks.namedIndividual.passed).toBe(1);
      expect(result.findings).toEqual([]);
    }
  });

  it("restricts EVERY claim naming a person, not just the credibility section", () => {
    // 2026-09 review: the filing-or-transcript test ran on the credibility path
    // only, so an ordinary person-naming claim could cite anything in the
    // citation registry — a news item, a press release — while the prompt, the
    // module docstring, the README notes and the reader-facing table all said
    // "filings/transcripts only". Now they all say the same thing.
    const result = run(
      refs(claim("Tim Cook reiterated the margin target.", news.id)),
      [],
      { citationRegistry: [news, transcript], personNames: ["Tim Cook"] },
    );
    expect(result.checks.namedIndividual).toEqual({ checked: 1, passed: 0, failed: 1, rate: 0 });
    expect(result.findings[0].reason).toBe("named-individual-unsourced");
    expect(result.findings[0].note).toContain("Tim Cook");
    expect(result.findings[0].note).toContain("neither a registry figure, a filing or transcript, nor a payload executive, compensation or insider row");
    expect(result.rejectedClaimPaths.has("fundamentals.commentary[0]")).toBe(true);
  });

  it("restricts the executive-credibility section to filings, transcripts and registry figures", () => {
    expect(isCredibilityPath("leadership.executives[0].reasoning[1]")).toBe(true);
    expect(isCredibilityPath("leadership.executives[2].evidence.guidanceVsActuals[0]")).toBe(true);
    expect(isCredibilityPath("outlook.guidanceCredibility[0]")).toBe(true);
    expect(isCredibilityPath("leadership.governanceNotes[0]")).toBe(false);
    expect(isFilingOrTranscriptSource("edgar:10-K item1A")).toBe(true);
    expect(isFilingOrTranscriptSource("fmp:earning-call-transcript")).toBe(true);
    expect(isFilingOrTranscriptSource("fmp:news")).toBe(false);

    // A news tag is a legitimate payload citation elsewhere, but not here.
    const credibility = [
      { claim: claim("Guidance was met in each of the last four quarters.", news.id), path: "outlook.guidanceCredibility[0]" },
    ];
    const rejected = runConsistencyChecks({
      claims: credibility,
      registry: [],
      citationRegistry: [news, transcript],
      fetchedUrls: new Set<string>(),
      personNames: [],
    });
    expect(rejected.checks.namedIndividual.failed).toBe(1);
    expect(rejected.findings[0].reason).toBe("credibility-source-restricted");
    expect(rejected.rejectedClaimPaths.has("outlook.guidanceCredibility[0]")).toBe(true);

    const accepted = runConsistencyChecks({
      claims: [{ ...credibility[0], claim: claim("Guidance was met in each of the last four quarters.", transcript.id) }],
      registry: [],
      citationRegistry: [news, transcript],
      fetchedUrls: new Set<string>(),
      personNames: [],
    });
    expect(accepted.checks.namedIndividual).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
  });

  it("tells the model the same rule the verifier enforces", () => {
    const guidance = buildLeadershipGuidance();
    expect(guidance).toContain("NAMED-INDIVIDUAL RULE");
    expect(guidance).toContain("A web-search result is NOT an acceptable source");
    expect(guidance).toContain("outlook.guidanceCredibility");
    // The old instruction pointed the model at web search for exactly this.
    expect(guidance).not.toContain("cited web-search results —");
    // D-43: the compensation rows are named, with the row-content rule, and
    // the example is reader prose, never a pipeline label ("comp … FY2025").
    expect(guidance).toContain("executive-compensation");
    expect(guidance).toContain("spelled as that row spells");
    expect(guidance).toContain("never write a");
    expect(guidance).not.toMatch(/comp [A-Z][^'"]* FY\d{4}/);
  });
});

/* ------------------------------------------------------------------------ *
 * (f) Person-row content and currency (D-43, 2026-10-13)
 * ------------------------------------------------------------------------ */

// The rows reports 25 (META) and 26 (JPM) showed, from the cached FMP
// governance-executive-compensation responses.
const META_COMP = [
  "Mark Zuckerberg Chief Executive Officer",
  "Andrew Bosworth Chief Technology Officer",
  "Susan Li Chief Financial Officer",
  "Christopher K. Cox Chief Product Officer",
  "Javier Olivan Chief Operating Officer",
];
const JPM_COMP = [
  "James Dimon Chairman and CEO",
  "Jeremy Barnum CFO",
  "Mary Callahan Erdoes CEO, Asset & Wealth Management",
  "Douglas Petno Co-CEO, Commercial & Investment Bank",
  "Troy Rohrbaugh Co-CEO, Commercial & Investment Bank",
];
function compFigures(rows: readonly string[], asOf: string, year = 2025) {
  return rows.map((row) => ({ label: `comp ${row} FY${year}`, source: "fmp:executive-compensation", asOf }));
}
function compCitation(asOf: string): CitationProvenanceRecord {
  return { id: "fmp:executive-compensation", kind: "payload-unestablished", asOf, origin: "fmp:executive-compensation", currencyUnknown: true };
}

describe("person-row citations are read for the person and title (D-43)", () => {
  it("reads key-executive, insider and compensation rows", () => {
    const rows = collectPersonRows({
      leadershipNotes: [
        "Mark Elliot Zuckerberg — Founder, Chairman & Chief Executive Officer (since 2004-07-01), pay 25125904 USD [fmp:key-executives]",
        // A null currencyPay renders a double space before the tag.
        "Susan J. Li — Chief Financial Officer, pay 1000000  [fmp:key-executives]",
      ],
      insiderNotes: ["2026-06-01 Li Susan J. (officer: Chief Financial Officer): S-Sale 5000 @ 600 [fmp:insider-trades · 2026-06-01]"],
      leadershipFigures: [
        ...compFigures(["Christopher K. Cox Chief Product Officer"], "2026-04-16"),
        { label: "comp Tim Cook — CEO FY2025", source: "fmp:executive-compensation", asOf: "2026-01-10" },
        { label: "comp Sheryl K. Sandberg Former Chief Operating Officer FY2022", source: "fmp:executive-compensation", asOf: "2023-04-14" },
        { label: "market cap", source: "fmp:stock-peers", asOf: "2026-10-13" },
      ],
    });
    expect(rows).toEqual([
      { tag: "fmp:key-executives", asOf: null, name: "Mark Elliot Zuckerberg", title: "Founder, Chairman & Chief Executive Officer", anyOrder: false },
      { tag: "fmp:key-executives", asOf: null, name: "Susan J. Li", title: "Chief Financial Officer", anyOrder: false },
      { tag: "fmp:insider-trades", asOf: "2026-06-01", name: "Li Susan J.", title: "Chief Financial Officer", anyOrder: true },
      { tag: "fmp:executive-compensation", asOf: "2026-04-16", name: "Christopher K. Cox", title: "Chief Product Officer", anyOrder: false },
      { tag: "fmp:executive-compensation", asOf: "2026-01-10", name: "Tim Cook", title: "CEO", anyOrder: false },
      { tag: "fmp:executive-compensation", asOf: "2023-04-14", name: "Sheryl K. Sandberg", title: "Former Chief Operating Officer", anyOrder: false },
    ]);
    // The name ends at the FIRST position token, not the last name-like one.
    expect(splitNameAndPosition("Mary Callahan Erdoes CEO, Asset & Wealth Management")).toEqual({
      name: "Mary Callahan Erdoes",
      title: "CEO, Asset & Wealth Management",
    });
  });

  it("matches a name only as the row writes it", () => {
    const row = (name: string, anyOrder = false): PersonRow => ({ tag: "t", asOf: null, name, title: null, anyOrder });
    expect(personNameMatches("Mark Zuckerberg", false, row("Mark Elliot Zuckerberg"))).toBe(true);
    expect(personNameMatches("Troy Rohrbaugh", false, row("Troy Larry Rohrbaugh"))).toBe(true);
    expect(personNameMatches("Susan Li", false, row("Li Susan J.", true))).toBe(true);
    expect(personNameMatches("Dimon", true, row("James Dimon"))).toBe(true);
    // A nickname, an initial the row lacks, a dropped surname, someone else.
    expect(personNameMatches("Chris Cox", false, row("Christopher K. Cox"))).toBe(false);
    expect(personNameMatches("Susan J. Li", false, row("Susan Li"))).toBe(false);
    expect(personNameMatches("Mary Callahan", false, row("Mary Callahan Erdoes"))).toBe(false);
    expect(personNameMatches("Sheryl Sandberg", false, row("Susan Li"))).toBe(false);
  });

  it("matches a title only with the row's modifiers and scope", () => {
    expect(personTitleMatches("CEO of Asset & Wealth Management", "CEO, Asset & Wealth Management")).toBe(true);
    expect(personTitleMatches("Chairman and CEO", "Chairman and Chief Executive Officer")).toBe(true);
    expect(personTitleMatches("CFO", "Chief Financial Officer")).toBe(true);
    expect(personTitleMatches("Chief Executive Officer", "Founder, Chairman & Chief Executive Officer")).toBe(true);
    expect(personTitleMatches("Co-President", "CEO of Consumer & Community Banking and Co-President")).toBe(true);
    // Dropped Co-, dropped scope, Vice, and Former either way.
    expect(personTitleMatches("CEO", "Co-CEO, Commercial & Investment Bank")).toBe(false);
    expect(personTitleMatches("Co-CEO", "Co-CEO, Commercial & Investment Bank")).toBe(false);
    expect(personTitleMatches("CEO", "CEO of Consumer & Community Banking and Co-President")).toBe(false);
    expect(personTitleMatches("Chairman", "Vice Chairman")).toBe(false);
    expect(personTitleMatches("Chief Operating Officer", "Former Chief Operating Officer")).toBe(false);
    expect(personTitleMatches("Former Chief Operating Officer", "Chief Operating Officer")).toBe(false);
    // CIO names two offices, so it does not expand into either.
    expect(personTitleMatches("Chief Information Officer", "CIO")).toBe(false);
  });

  it("verifies report 25's and 26's compensation-row claims against the rows shown", () => {
    // Every one of these failed as named-individual-unsourced (report 25:
    // leadership.executives[0-4].reasoning[0]; report 26:
    // leadership.executives[0-4].evidence.compensation[0]).
    const meta = [
      "The compensation disclosure identifies Mark Zuckerberg as Chief Executive Officer.",
      "The compensation disclosure identifies Andrew Bosworth as Chief Technology Officer.",
      "The compensation disclosure identifies Susan Li as Chief Financial Officer.",
      "The compensation disclosure identifies Christopher K. Cox as Chief Product Officer.",
      "The compensation disclosure identifies Javier Olivan as Chief Operating Officer.",
    ];
    const jpm = [
      "The annual compensation records identify James Dimon as Chairman and CEO. Latest annual compensation exceeds the preceding year's amount in the same table; its currency is undisclosed.",
      "The annual compensation records identify Jeremy Barnum as CFO. Latest annual compensation exceeds the preceding year's disclosed amount; its currency is undisclosed.",
      "The annual compensation records identify Mary Callahan Erdoes as CEO of Asset & Wealth Management. Latest annual compensation exceeds the preceding year's amount; its currency is undisclosed.",
      "The annual compensation record identifies Douglas Petno as Co-CEO of Commercial & Investment Bank. The compensation currency is undisclosed, and no preceding-year comparison for him appears in the available annual table.",
      "The annual compensation records identify Troy Rohrbaugh as Co-CEO of Commercial & Investment Bank. Latest annual compensation exceeds the preceding year's disclosed amount; its currency is undisclosed.",
    ];
    const cases = [
      { texts: meta, rows: META_COMP, asOf: "2026-04-16", names: ["Mark Zuckerberg", "Andrew Bosworth", "Susan Li", "Christopher K. Cox", "Javier Olivan"], path: (i: number) => `leadership.executives[${i}].reasoning[0]` },
      { texts: jpm, rows: JPM_COMP, asOf: "2026-04-06", names: ["James Dimon", "Jeremy Barnum", "Mary Callahan Erdoes", "Douglas Petno", "Troy Rohrbaugh"], path: (i: number) => `leadership.executives[${i}].evidence.compensation[0]` },
    ];
    for (const { texts, rows, asOf, names, path } of cases) {
      const result = runConsistencyChecks({
        claims: texts.map((text, i) => ({ claim: claim(text, "fmp:executive-compensation", { asOf }), path: path(i) })),
        registry: [],
        citationRegistry: [compCitation(asOf)],
        fetchedUrls: new Set<string>(),
        personNames: names,
        personRows: collectPersonRows({ leadershipFigures: compFigures(rows, asOf) }),
      });
      expect(result.findings).toEqual([]);
      expect(result.checks.namedIndividual).toEqual({ checked: 5, passed: 5, failed: 0, rate: 1 });
    }
  });

  it("rejects a person or title the cited rows do not give", () => {
    const personRows = collectPersonRows({ leadershipFigures: compFigures(JPM_COMP, "2026-04-06") });
    const check = (text: string, names: string[] = []) => run(
      refs(claim(text, "fmp:executive-compensation", { asOf: "2026-04-06" })),
      [],
      { citationRegistry: [compCitation("2026-04-06")], personNames: names, personRows },
    );
    // Registering the tag alone would have let this pass.
    const wrongPerson = check("Sheryl Sandberg, the CEO, received the largest award.");
    expect(wrongPerson.findings[0].reason).toBe("named-individual-not-in-source");
    expect(wrongPerson.rejectedClaimPaths.size).toBe(1);
    expect(check("The records identify Douglas Petno as CEO.", ["Douglas Petno"]).findings[0].reason)
      .toBe("named-individual-title-mismatch");
    expect(check("The records identify Mary Callahan as CEO of Asset & Wealth Management.", ["Mary Callahan"]).findings[0].reason)
      .toBe("named-individual-not-in-source");
    // One person in the rows does not carry another who is not.
    expect(check("James Dimon and Sheryl Sandberg, the COO, lead the firm.", ["James Dimon"]).findings[0].reason)
      .toBe("named-individual-not-in-source");
    // A row from another proxy (another as-of) is not the row the FACT cites.
    const otherProxy = run(
      refs(claim("The records identify Jeremy Barnum as CFO.", "fmp:executive-compensation", { asOf: "2025-04-07" })),
      [],
      { citationRegistry: [compCitation("2025-04-07")], personNames: ["Jeremy Barnum"], personRows },
    );
    expect(otherProxy.findings[0].reason).toBe("named-individual-not-in-source");
  });

  it("content-checks a compensation row that is a registered figure before the figure could accept it", () => {
    const figure = numeric({ id: "payload.leadership.comp-james-dimon-chairman-and-ceo-fy2025", value: 39_000_000, unit: "currency", currency: "USD", asOf: "2026-04-06" });
    const personRows = collectPersonRows({
      leadershipFigures: [{ label: "comp James Dimon Chairman and CEO FY2025", source: "fmp:executive-compensation", asOf: "2026-04-06", provenanceId: figure.id }],
    });
    const result = run(
      refs(claim("The proxy identifies Jeremy Barnum as CFO.", figure.id, { asOf: "2026-04-06" })),
      [figure],
      { personNames: ["Jeremy Barnum"], personRows },
    );
    expect(result.findings[0].reason).toBe("named-individual-not-in-source");
  });

  it("keeps namesIndividual's answer and reads the name a pattern found", () => {
    expect(namedIndividuals("CEO Jane Roe reiterated guidance.", [])).toEqual([
      { match: "CEO Jane Roe", name: "Jane Roe", surnameOnly: false, title: "CEO" },
    ]);
    expect(namedIndividuals("Dr. Rivera joined the board.", [])[0]).toMatchObject({ name: "Rivera", surnameOnly: true });
    // The longer known name wins over the shorter one inside it.
    expect(namedIndividuals("Mark Elliot Zuckerberg founded it.", ["Elliot Zuckerberg", "Mark Elliot Zuckerberg"]).map((p) => p.name))
      .toEqual(["Mark Elliot Zuckerberg"]);
  });
});

describe("a gap or unestablished citation supports no number (D-43)", () => {
  it("reads past identifiers, forms and dates, and keeps quantities", () => {
    for (const text of [
      "The CET1 ratio (as reported) is withheld.",
      "Tier 1 leverage and Basel III ratios are not in the filings and data reviewed.",
      "No insider Form 4 filings were available for 2025.",
      "No Item 7A rate sensitivity table is in the evidence reviewed.",
      "Trades under a Rule 10b5-1 plan are not shown.",
      "A 5-year history is not available for FY2025 or Q3.",
      "The 10-K and DEF 14A excerpts carry no such table.",
      // Report 26 leadership.graded.reasoning[2], with its inline tag.
      "Average repurchase-price analysis is unavailable [computed.capital-cash.diluted-share-count-trend-5y · 2025-12-31].",
    ]) {
      expect(proseNumbers(text), text).toEqual([]);
    }
    expect(proseNumbers("Net debt/EBITDA is 1.2x.")).toEqual([1.2]);
    expect(proseNumbers("Buybacks were $4.5 billion.")).toEqual([4.5]);
    expect(proseNumbers("The spread is 25 bps.")).toEqual([25]);
    expect(proseNumbers("The score is 3.")).toEqual([3]);
    expect(proseNumbers("Revenue was 2025 million.")).toEqual([2025]);
  });

  it("finds a currency put on a number, and not a currency mentioned without one", () => {
    for (const text of ["The consensus target is $781.", "Consensus target 781 USD.", "US$781 consensus", "The target is USD 781.", "Target €781.", "Pay was 25.1 million dollars."]) {
      expect(statesCurrencyOnNumber(text), text).toBe(true);
    }
    for (const text of [
      // Report 26 valuation.graded.reasoning[5] and outlook.estimateRevisionTrend[1].
      "The analyst-consensus target has an undisclosed currency. It is not used as a comparable USD scenario value or as evidence of a probability-weighted return.",
      "Without a comparable target history, disclosed currency and realization horizon, it cannot establish an earnings-revision trend or a comparable USD scenario return.",
      "FY2025 USD reporting is not established for this row.",
      "JPM 43 peers",
    ]) {
      expect(statesCurrencyOnNumber(text), text).toBe(false);
    }
  });

  it("fails a sentence that puts a currency on a figure of unknown currency", () => {
    const target: CitationProvenanceRecord = {
      id: "fmp:price-target-consensus", kind: "payload-unestablished", asOf: "2026-07-01", origin: "fmp:price-target-consensus", currencyUnknown: true,
    };
    const failing = run(refs(claim("The consensus target is $781.", target.id, { asOf: "2026-07-01" })), [], { citationRegistry: [target] });
    expect(failing.findings[0]).toMatchObject({ check: "unit", reason: "currency-not-established" });
    expect(failing.rejectedClaimPaths.has("fundamentals.commentary[0]")).toBe(true);
    const passing = run(
      refs(claim("The analyst-consensus target has an undisclosed currency and is not used as a scenario value.", target.id, { asOf: "2026-07-01" })),
      [],
      { citationRegistry: [target] },
    );
    expect(passing.findings).toEqual([]);
    expect(passing.rejectedClaimPaths.size).toBe(0);
  });
});

/* ------------------------------------------------------------------------ *
 * (g) Review of D-43, 2026-10-13: shapes that verified on a person row, an
 *     absence or a date row before the reviewer's fixes
 * ------------------------------------------------------------------------ */

describe("person-row claims are read however the name and title are written (review)", () => {
  const personRows = collectPersonRows({ leadershipFigures: compFigures(JPM_COMP, "2026-04-06") });
  const check = (text: string, names: string[] = personRows.map((row) => row.name)) => run(
    refs(claim(text, "fmp:executive-compensation", { asOf: "2026-04-06" })),
    [],
    {
      citationRegistry: [compCitation("2026-04-06")],
      personNames: names,
      organizationNames: ["JPMorgan Chase & Co."],
      personRows,
    },
  );

  it("reads a title written after 'is' or 'serves as', and one written before the name", () => {
    for (const text of [
      "Jeremy Barnum is the CEO.",
      "Jeremy Barnum serves as CEO.",
      "Jeremy Barnum is also CEO.",
      "CFO James Dimon received the largest award.",
      "JPMorgan's CFO, James Dimon, received the largest award.",
      // The role before the name keeps its modifier, and still needs the row's scope.
      "Co-CEO Troy Rohrbaugh met investors.",
    ]) {
      expect(check(text).findings[0]?.reason, text).toBe("named-individual-title-mismatch");
    }
    for (const text of [
      "Jeremy Barnum is the CFO.",
      "James Dimon is Chairman and CEO.",
      "Under Jeremy Barnum, the CFO, the finance function was reorganized.",
    ]) {
      expect(check(text).findings, text).toEqual([]);
    }
  });

  it("reads a name no list or pattern knows, and fails it unless the rows list it", () => {
    for (const text of [
      "Sheryl Sandberg is CEO.",
      "Susan Bosworth is CFO.",
      "James Dimon and Sheryl Sandberg lead the firm.",
      // A lone surname opening the sentence, before a verb a person takes.
      "Sandberg received the largest award.",
    ]) {
      expect(check(text).findings[0]?.reason, text).toBe("named-individual-not-in-source");
    }
    for (const text of [
      "Dimon received the largest award.",
      "Without a covered period, the pay entries are not comparable.",
      "Tenure is not disclosed in the rows.",
    ]) {
      expect(check(text).findings, text).toEqual([]);
    }
    // Title words, the rows' own scope words, the issuer and a sentence-opening
    // word are not names; neither is a surname the rows list.
    for (const text of [
      "The Summary Compensation Table lists Mary Callahan Erdoes as CEO of Asset & Wealth Management.",
      "Latest annual compensation exceeds the preceding year; Dimon leads.",
      "JPMorgan Chase pays Jeremy Barnum.",
    ]) {
      expect(check(text).findings, text).toEqual([]);
    }
  });

  it("reads unlisted names only for a claim citing a person row", () => {
    expect(namedIndividuals("Sheryl Sandberg is CEO.", [])).toEqual([]);
    expect(namedIndividuals("Sheryl Sandberg is CEO.", [], [], { unlistedNames: { extraWords: [] } })).toEqual([
      { match: "Sheryl Sandberg", name: "Sheryl Sandberg", surnameOnly: false, title: "CEO" },
    ]);
  });
});

describe("numbers a gap or date row cannot carry (review)", () => {
  it("keeps a number glued to a currency code and reads numbers written in words", () => {
    expect(proseNumbers("Net debt is EUR5bn.")).toEqual([5]);
    expect(proseNumbers("It was 12pct.")).toEqual([12]);
    expect(statesNumberWord("Net debt/EBITDA is two times.")).toBe(true);
    expect(statesNumberWord("Net debt runs at twice EBITDA.")).toBe(true);
    // How a gap is written: "one of", "the first half", a form or rule number.
    expect(statesNumberWord("CET1 is one of the ratios not reported for the first half.")).toBe(false);
    expect(statesNumberWord("No Form 4 or Rule 10b5-1 filings were reviewed.")).toBe(false);
  });

  it("lets a date row support that date only, at the precision written", () => {
    const allowed = ["2027-01-14"];
    for (const text of [
      "The next report is scheduled for 2027-01-14.",
      "The provider calendar lists January 14, 2027.",
      "Results are expected on 14 Jan.",
      "Results are expected in January 2027.",
      "A next date is on the provider calendar, not confirmed by the company.",
    ]) {
      expect(statesOnlyAllowedDates(text, allowed), text).toBe(true);
    }
    for (const text of [
      "The next report is scheduled for 2027-02-14.",
      "The provider calendar lists January 15, 2027.",
      "Results are expected in February 2027.",
      "Results are expected on 1/15/2027.",
      "Results on 2027-01-14 should show EPS of 4.85.",
      "Results come in two weeks.",
    ]) {
      expect(statesOnlyAllowedDates(text, allowed), text).toBe(false);
    }
  });
});
