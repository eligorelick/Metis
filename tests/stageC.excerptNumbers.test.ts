/**
 * D-45 (2026-10-13) — a number cited to a filing or transcript excerpt is read
 * against that excerpt's own text.
 *
 * Report 26 (JPM) logged 25 numbers as text-source and report 25 (META) 5:
 * the verifier knew only numeric registry records, although the excerpt the
 * model was shown prints most of those figures. The excerpt text below is
 * copied verbatim from the JPM 10-K item 7 / 10-Q item 2 and META 10-Q item 2
 * excerpts those reports were built from (rebuilt from the cached filings).
 *
 * Every test of an acceptance is paired with the wrong value, wrong meaning,
 * wrong section or wrong currency that must still fail.
 */

import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import {
  descriptionTokens,
  excerptNumberMentions,
  matchExcerptNumber,
} from "@/pipeline/stageC/excerptNumbers";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import {
  assembleContextPayload,
  excerptBodyForVerification,
  truncateWithDisclosure,
  type ContextPayload,
  type TextExcerpt,
} from "@/pipeline/stageC/payload";
import type { JudgeOutput } from "@/report/schema";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

const TEN_K_ITEM7 = [
  "Firmwide overview JPMorganChase reported net income of $57.0 billion for 2025, down 2%, earnings per share of $20.02, ROE of 17% and ROTCE of 20%.",
  "Year ended December 31, (in millions, except per share data and ratios) 2025 2024 Change Selected income statement data Noninterest revenue $ 87,004 $ 84,973 2% Net interest income 95,443 92,583 3 Total net revenue 182,447 177,556 3 Total noninterest expense 95,640 91,797 4 Pre-provision profit 86,807 85,759 1 Provision for credit losses 14,212 10,678 33 Net income 57,048 58,471 (2) Diluted earnings per share 20.02 19.75 1 Selected ratios and metrics Return on common equity 17 % 18 % Return on tangible common equity 20 22 Book value per share $ 126.99 $ 116.07 9 Tangible book value per share 107.56 97.3 11 Capital ratios - Standardized (a)(b) CET1 capital 14.6 % 15.7 % Tier 1 capital 15.5 16.8 Total capital 17.4 18.5",
  "CIB ROE 18% • Investment Banking fees up 7%; #1 ranking for Global Investment Banking fees with 8.4% wallet share for the year • Markets revenue up 19%, with Fixed Income Markets up 12% and Equity Markets up 33% • Average Banking & Payments loans (c) flat; average client deposits (d) up 14% AWM ROE 40% • Assets under management (\"AUM\") of $4.8 trillion, up 18%",
  "Selected capital and other metrics • CET1 capital was $288.5 billion, and the Standardized and Advanced CET1 ratios were 14.6% and 14.1%, respectively. • SLR was 5.8%. • TBVPS grew 10.5%, ending 2025 at $107.56. • As of December 31, 2025, the Firm had eligible end-of-period High Quality Liquid Assets (“HQLA”) of approximately $915 billion and unencumbered marketable securities with a fair value of approximately $548 billion, resulting in approximately $1.5 trillion of liquidity sources.",
].join("\n");

const TEN_Q_ITEM2 =
  "Selected ratios and metrics Return on common equity 24 % 18 % 22 % 18 % Return on tangible common equity 29 21 26 21 Book value per share $ 133.01 $ 122.51 9 $ 133.01 $ 122.51 9 Tangible book value per share 113.35 103.40 10 113.35 103.40 10 Capital ratios - Standardized (a) CET1 capital 14.2 % 15.1 % 14.2 % 15.1 % Tier 1 capital 15.1 16.1 15.1 16.1 Total capital 17.0 17.8 17.0 17.8 Memo: NII excluding Markets (b) $ 23,677 $ 22,753 4 $ 46,957 $ 45,343 4";

const META_TEN_Q_ITEM2 =
  "Family of Apps Metrics • Family daily active people (DAP) was 3.60 billion on average for June 2026, an increase of 3% year-over-year.";

const VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

function excerpt(source: string, asOf: string, text: string): TextExcerpt {
  return { title: source, text, source, asOf, truncated: false, originalChars: text.length };
}

/**
 * The real assembled bank-route payload (its statements establish USD), with
 * the JPM excerpts attached and registered exactly as assembly registers a
 * filing excerpt: one payload-text citation per (source, as-of).
 */
function payloadWith(...excerpts: TextExcerpt[]): ContextPayload {
  const bundle = completeCurrencyBundle({ bank: true });
  const payload = assembleContextPayload(bundle, runStageB(bundle), VALIDATION);
  payload.filings = excerpts;
  for (const ex of excerpts) {
    payload.citationRegistry!.push({ id: ex.source, kind: "payload-text", asOf: ex.asOf, origin: ex.source });
  }
  return payload;
}

const K = () => excerpt("edgar:10-K item7", "2025-12-31", TEN_K_ITEM7);
const Q = () => excerpt("edgar:10-Q item2", "2026-06-30", TEN_Q_ITEM2);

function num(value: number, unit: string, source: string, asOf: string, currency?: string) {
  return { value, unit, ...(currency === undefined ? {} : { currency }), source, asOf, verified: null };
}

async function verifyOne(payload: ContextPayload, number: object, rowLabel?: string) {
  const root = rowLabel === undefined
    ? { keyNumbers: [number] }
    : { marginTrend: [{ label: rowLabel, values: [{ period: "2025-12-31", value: number }] }] };
  const result = await runVerifyPass({} as PassDeps, payload, root as unknown as JudgeOutput, { fetchedUrls: [] });
  const entry = result.log.find((logged) => logged.evidenceKind === "number");
  const verified = result.verifiedReport as unknown as typeof root;
  return { entry: entry!, number: (rowLabel === undefined ? verified.keyNumbers![0] : verified.marginTrend![0].values[0].value) as Record<string, unknown> };
}

describe("reading a cited excerpt's figures (D-45)", () => {
  it("reads prose, scale words, percent cells and table cells with their printed precision", () => {
    const mentions = excerptNumberMentions(TEN_K_ITEM7);
    const find = (raw: string) => mentions.find((mention) => mention.raw === raw);
    expect(find("$915 billion")).toMatchObject({ value: 915e9, unit: "currency", step: 1e9, rowLabel: null });
    expect(find("14.6%")).toMatchObject({ value: 14.6, unit: "percent", step: 0.1 });
    // A non-dollar comma cell under "(in millions" with a "$" above it is a
    // money cell in millions, labelled by its row.
    expect(find("95,640")).toMatchObject({ value: 95_640e6, unit: "currency", table: true });
    expect(find("95,640")?.rowLabel).toContain("Total noninterest expense");
    // A decimal "$" cell is never scaled: $126.99 is book value per share,
    // not $126.99 million (the finding's prototype read it as millions).
    expect(find("$ 126.99")).toMatchObject({ value: 126.99, unit: "currency", table: false });
    // Under "except per share", a "$" cell is not scaled either.
    expect(find("$ 87,004")).toMatchObject({ value: 87_004, table: false });
    // Years and "% Change" headers are not figures; "(2)" is a negative.
    expect(mentions.some((mention) => mention.value === 2025)).toBe(false);
    expect(find("(2)")?.value).toBe(-2);
  });

  it("keeps only the issuer-neutral, distinctive words of a description", () => {
    expect(descriptionTokens("% Standardized CET1 ratio", ["JPMorgan Chase & Co.", "JPM"])).toEqual(["standardized", "cet1"]);
    expect(descriptionTokens("currency FACT: Annual noninterest expense")).toEqual(["noninterest", "expense"]);
    expect(descriptionTokens("%")).toEqual([]);
    expect(descriptionTokens("currency JPMorgan total", ["JPMorgan Chase & Co."])).toEqual([]);
  });

  it("matches only within the printed precision, unit and currency", () => {
    const opts = { reportingCurrency: "USD", description: "currency eligible HQLA" };
    expect(matchExcerptNumber({ value: 915e9, unit: "currency", currency: "USD" }, TEN_K_ITEM7, opts)).toMatchObject({ ok: true, currency: "USD" });
    expect(matchExcerptNumber({ value: 915e9, unit: "currency", currency: null }, TEN_K_ITEM7, opts)).toMatchObject({ ok: true, currency: "USD" });
    // More precise than printed, one unit off in the last digit, the wrong sign.
    for (const value of [915.3e9, 916e9, 914e9, -915e9]) {
      expect(matchExcerptNumber({ value, unit: "currency", currency: "USD" }, TEN_K_ITEM7, opts)).toMatchObject({ ok: false, reason: "text-source" });
    }
    expect(matchExcerptNumber({ value: 915e9, unit: "currency", currency: "EUR" }, TEN_K_ITEM7, opts)).toMatchObject({ ok: false, reason: "currency-mismatch" });
    expect(matchExcerptNumber({ value: 915e9, unit: "currency", currency: "USD" }, TEN_K_ITEM7, { ...opts, reportingCurrency: null })).toMatchObject({ ok: false, reason: "currency-mismatch" });
    expect(matchExcerptNumber({ value: 915e9, unit: "currency", currency: "EUR" }, TEN_K_ITEM7, { ...opts, reportingCurrency: "EUR" })).toMatchObject({ ok: false, reason: "currency-mismatch" });
    expect(matchExcerptNumber({ value: 915, unit: "percent", currency: null }, TEN_K_ITEM7, opts)).toMatchObject({ ok: false, reason: "text-source" });
    expect(matchExcerptNumber({ value: 126.99, unit: "currency-per-share", currency: "USD" }, TEN_K_ITEM7, opts)).toMatchObject({ ok: false, reason: "unit-mismatch" });
    // Per-share cells are not read as millions.
    expect(matchExcerptNumber({ value: 126.99e6, unit: "currency", currency: "USD" }, TEN_K_ITEM7, { ...opts, description: "currency book value" })).toMatchObject({ ok: false, reason: "text-source" });
  });

  it("refuses a low-precision figure that matches by chance (report 26: 20%, 29%, 7%; the bare 4 Change cell)", () => {
    const opts = { reportingCurrency: "USD", description: "% Investment Banking fees growth" };
    expect(matchExcerptNumber({ value: 7, unit: "percent", currency: null }, TEN_K_ITEM7, opts)).toMatchObject({ ok: false, reason: "text-ambiguous" });
    expect(matchExcerptNumber({ value: 20, unit: "percent", currency: null }, TEN_K_ITEM7, { ...opts, description: "% ROTCE" })).toMatchObject({ ok: false, reason: "text-ambiguous" });
    // "$ 23,677 $ 22,753 4": the 4 is a bare Change cell, not a printed percent.
    expect(matchExcerptNumber({ value: 4, unit: "percent", currency: null }, TEN_Q_ITEM2, { ...opts, description: "% NII excluding Markets growth" })).toMatchObject({ ok: false, reason: "text-source" });
  });

  it("requires the number's own description beside the printed figure", () => {
    const run = (value: number, unit: "percent" | "currency", description: string, body = TEN_K_ITEM7) =>
      matchExcerptNumber({ value, unit, currency: unit === "currency" ? "USD" : null }, body, { reportingCurrency: "USD", description });
    // Report 26 stored these with a bare unit: printed, but nothing says what they are.
    expect(run(14.6, "percent", "%")).toMatchObject({ ok: false, reason: "text-context-mismatch" });
    expect(run(915e9, "currency", "currency")).toMatchObject({ ok: false, reason: "text-context-mismatch" });
    // Described as the excerpt describes them, they verify.
    expect(run(14.6, "percent", "% Standardized CET1 ratio")).toMatchObject({ ok: true });
    expect(run(8.4, "percent", "% Investment Banking fees wallet share")).toMatchObject({ ok: true });
    expect(run(4.8e12, "currency", "currency assets under management")).toMatchObject({ ok: true });
    // A right value under the wrong meaning fails: the 8.4% is wallet share,
    // and AUM is not $915 billion.
    expect(run(8.4, "percent", "% net charge-off rate")).toMatchObject({ ok: false, reason: "text-context-mismatch" });
    expect(run(915e9, "currency", "currency assets under management")).toMatchObject({ ok: false, reason: "text-context-mismatch" });
    // "15.1 %" is printed only in the CET1 row; Tier 1's 15.1 carries no "%".
    expect(run(15.1, "percent", "% Tier 1 capital ratio", TEN_Q_ITEM2)).toMatchObject({ ok: false, reason: "text-context-mismatch" });
    expect(run(15.1, "percent", "% Standardized CET1 ratio", TEN_Q_ITEM2)).toMatchObject({ ok: true });
  });

  it("binds a table cell to its own row label, not to a neighbouring row", () => {
    const run = (value: number, description: string) =>
      matchExcerptNumber({ value, unit: "currency", currency: "USD" }, TEN_K_ITEM7, { reportingCurrency: "USD", description });
    expect(run(95_640e6, "currency Annual noninterest expense")).toMatchObject({ ok: true, mention: { raw: "95,640" } });
    expect(run(86_807e6, "currency Annual pre-provision profit, not operating margin")).toMatchObject({ ok: true });
    // Net interest income sits two rows above the expense row, well inside
    // 250 characters; it is not "noninterest expense".
    expect(run(95_443e6, "currency Annual noninterest expense")).toMatchObject({ ok: false, reason: "text-context-mismatch" });
    // Provision for credit losses shares one word with "pre-provision profit".
    expect(run(14_212e6, "currency Annual pre-provision profit, not operating margin")).toMatchObject({ ok: false, reason: "text-context-mismatch" });
  });

  it("reads META's DAP as a count, never as 'people'", () => {
    expect(matchExcerptNumber({ value: 3.6e9, unit: "count", currency: null }, META_TEN_Q_ITEM2, { reportingCurrency: "USD", description: "count Family daily active people" }))
      .toMatchObject({ ok: true, mention: { raw: "3.60 billion" } });
  });

  it("strips the assembler's truncation marker before reading", () => {
    const cut = truncateWithDisclosure(`${TEN_K_ITEM7}\n${"x".repeat(20_000)}`, 14_000);
    const body = excerptBodyForVerification({ title: "t", source: "edgar:10-K item7", asOf: "2025-12-31", ...cut });
    expect(cut.text).toMatch(/TRUNCATED \d+ of \d+ chars omitted/);
    expect(body).not.toContain("TRUNCATED");
    const dropped = Number(/TRUNCATED (\d+) of/.exec(cut.text)![1]);
    expect(excerptNumberMentions(body).some((mention) => mention.value === dropped)).toBe(false);
  });
});

describe("runVerifyPass reads excerpt-cited numbers (D-45)", () => {
  it("verifies a described number printed in the cited excerpt, logs excerpt-match and fills the currency", async () => {
    const payload = payloadWith(K(), Q());
    const { entry, number } = await verifyOne(payload, {
      ...num(915e9, "currency eligible end-of-period High Quality Liquid Assets HQLA approximately", "edgar:10-K item7", "2025-12-31"),
      period: "2025-12-31",
    });
    expect(entry).toMatchObject({ outcome: "verified", reason: "supported", traceKind: "excerpt-match" });
    expect(entry.validationStatus).toBe("validated");
    expect(entry.sourceSpans?.[0]?.text).toContain("$915 billion");
    expect(number).toMatchObject({ verified: true, currency: "USD" });
    const abridged = await verifyOne(payload, num(915e9, "currency eligible HQLA", "edgar:10-K item7", "2025-12-31"));
    expect(abridged.entry).toMatchObject({ outcome: "unverified", validationStatus: "unchecked" });
  });

  it("leaves a flattened multi-column table unchecked when no period-specific cell binding is established", async () => {
    const payload = payloadWith(K());
    const { entry } = await verifyOne(payload, num(91_797e6, "currency", "edgar:10-K item7", "2025-12-31", "USD"), "FACT: Annual noninterest expense");
    expect(entry).toMatchObject({ outcome: "unverified", traceKind: "untraced", validationStatus: "unchecked" });
  });

  it.each([
    // Report 26's stored shapes: bare units carry no description.
    [num(14.2, "%", "edgar:10-Q item2", "2026-06-30"), "text-context-mismatch"],
    [num(915e9, "currency", "edgar:10-K item7", "2025-12-31", "USD"), "text-context-mismatch"],
    [num(7, "%", "edgar:10-K item7", "2025-12-31"), "text-ambiguous"],
    [num(4, "%", "edgar:10-Q item2", "2026-06-30"), "text-source"],
    // Report 25's META shape: a noun in place of the unit.
    [num(3.6e9, "people", "edgar:10-Q item2", "2026-06-30"), "unit-mismatch"],
    // The right figure cited to the other section, or to the right section at another date.
    [num(915e9, "currency eligible HQLA", "edgar:10-Q item2", "2026-06-30", "USD"), "text-source"],
    [num(915e9, "currency eligible HQLA", "edgar:10-K item7", "2024-12-31", "USD"), "text-source"],
    // A wrong value under the right description.
    [num(916e9, "currency eligible HQLA", "edgar:10-K item7", "2025-12-31", "USD"), "text-source"],
    [num(548e9, "currency eligible HQLA", "edgar:10-K item7", "2025-12-31", "EUR"), "currency-mismatch"],
  ])("leaves %j unverified as %s", async (number, reason) => {
    const { entry, number: stored } = await verifyOne(payloadWith(K(), Q()), number);
    expect(entry).toMatchObject({ outcome: "unverified", reason, traceKind: "untraced" });
    expect(stored.verified).toBe(false);
  });

  it("verifies a described count, the unit the EXCERPT NUMBERS rule asks for (META DAP)", async () => {
    // "count daily active people" did not canonicalize before review
    // (2026-10-13), so the rule's own example shape failed as unit-mismatch.
    const payload = payloadWith(excerpt("edgar:10-Q item2", "2026-06-30", META_TEN_Q_ITEM2));
    const { entry } = await verifyOne(payload, num(3.6e9, "count Family daily active people DAP on average for June 2026", "edgar:10-Q item2", "2026-06-30"));
    expect(entry).toMatchObject({ outcome: "verified", traceKind: "excerpt-match" });
    const abridged = await verifyOne(payload, num(3.6e9, "count daily active people", "edgar:10-Q item2", "2026-06-30"));
    expect(abridged.entry).toMatchObject({ outcome: "unverified", validationStatus: "unchecked" });
    const { entry: wrong } = await verifyOne(payload, num(3.6e9, "count monthly advertisers", "edgar:10-Q item2", "2026-06-30"));
    expect(wrong).toMatchObject({ outcome: "unverified", reason: "text-context-mismatch" });
  });

  // Review 2026-10-13: both verified before the reviewer's fixes.
  it("reads a named row's name as part of the description", async () => {
    // A segment row renders its revenue under the segment's name; the HQLA
    // figure is not Consumer & Community Banking's revenue.
    const root = {
      segments: [{ name: "Consumer & Community Banking", revenue: num(915e9, "currency eligible HQLA", "edgar:10-K item7", "2025-12-31", "USD"), sharePct: null }],
    };
    const result = await runVerifyPass({} as PassDeps, payloadWith(K()), root as unknown as JudgeOutput, { fetchedUrls: [] });
    expect(result.log.find((entry) => entry.evidenceKind === "number")).toMatchObject({ outcome: "unverified", reason: "text-context-mismatch" });
  });

  it.each([
    // "Tier 1 capital 15.1" is a percent cell whose "%" only the first row prints.
    [num(15.1, "count Tier 1 capital", "edgar:10-Q item2", "2026-06-30")],
    [num(113.35, "count tangible book value per share", "edgar:10-Q item2", "2026-06-30")],
  ])("does not read a bare decimal table cell as a count: %j", async (number) => {
    const { entry } = await verifyOne(payloadWith(Q()), number);
    expect(entry).toMatchObject({ outcome: "unverified", reason: "text-source" });
  });

  it("keeps text-source for a text row that is not an excerpt", async () => {
    const payload = payloadWith(K());
    payload.citationRegistry!.push({ id: "fmp:news", kind: "payload-text", asOf: "2026-07-01", origin: "fmp:news" });
    const { entry } = await verifyOne(payload, num(915e9, "currency eligible HQLA", "fmp:news", "2026-07-01", "USD"));
    expect(entry).toMatchObject({ outcome: "unverified", reason: "text-source", note: "[unverified] text-source" });
  });
});
