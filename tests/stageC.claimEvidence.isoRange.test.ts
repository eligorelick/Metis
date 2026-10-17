import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { runVerifyPass } from "@/pipeline/stageC/passes";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const base: NumericProvenanceRecord = {
  id: "payload.filing-facts.inventory-cash-flow-contribution", kind: "provider",
  label: "Inventory cash-flow contribution, 2025-01-01 to 2025-06-30",
  value: -120e6, unit: "currency", currency: "USD", period: "2025-06-30",
  asOf: "2025-08-06", origin: "edgar:xbrl us-gaap/IncreaseDecreaseInInventories",
  formulaVersion: null, displayPrecision: 4,
};
const sentence = (range = "2025-01-01 to 2025-06-30", value = "USD -120 million") =>
  `Inventory cash-flow contribution for ${range} was ${value}.`;
const check = (text: string, changes: Partial<NumericProvenanceRecord> = {}) => {
  const record = { ...base, ...changes };
  return validateClaimNumericSupport({ label: "FACT", text, source: record.id, asOf: record.asOf },
    { record, excerpts: [], sourceId: record.id, reportingCurrency: "USD" });
};

describe("typed source explicit ISO duration claims", () => {
  it("validates the complete source-established interval instead of contradicting its start date", () => {
    expect(check(sentence()).status).toBe("validated");
  });
  it.each([
    ["2024-10-01", "2025-09-30"],
    ["2024-02-29", "2024-03-31"],
  ])("supports an exact source interval %s to %s without guessing a calendar/fiscal basis", (start, end) => {
    expect(check(sentence(`${start} to ${end}`), {
      label: `Inventory cash-flow contribution, ${start} to ${end}`, period: end,
    }).status).toBe("validated");
  });
  it.each([
    "2025-04-01 to 2025-06-30", "2025-01-01 to 2025-09-30",
    "2025-06-30 to 2025-01-01", "2024-01-01 to 2024-06-30",
    "2025-02-30 to 2025-06-30", "2025-01-01 to 2025-06-31",
    "2025-01-01 to 2025-06-30 as of 2024-12-31",
  ])("does not validate a changed, reversed, invalid or additionally conflicting claim interval: %s", range => {
    expect(check(sentence(range)).status).not.toBe("validated");
  });
  it.each([
    { label: "Inventory cash-flow contribution" },
    { label: "Inventory cash-flow contribution, 2025-01-01 and 2025-06-30" },
    { label: "Inventory cash-flow contribution, 2025-01-01 to 2025-06-30", period: "2025-09-30" },
    { label: "Inventory cash-flow contribution, 2025-06-30 to 2025-01-01" },
    { label: "Inventory cash-flow contribution, 2025-02-30 to 2025-06-30" },
    { label: "Inventory cash-flow contribution, 2025-01-01 to 2025-06-30 and 2025-04-01 to 2025-06-30" },
    { label: "Inventory cash-flow contribution, 2025-01-01 to 2025-06-30, scope unresolved" },
    { period: null },
    { periodContext: { kind: "instant" as const, at: "2025-06-30" } },
    { periodContext: { kind: "duration" as const, start: "2025-04-01", end: "2025-06-30" } },
    { periodContext: { kind: "duration" as const, start: "2025-01-01", end: "2025-06-31" } },
    { periodContext: { kind: "duration" as const, start: "2025-01-01", end: "2025-06-30", fiscalLabel: "Q2 FY2025" }, fiscalPeriod: "FY2025" },
  ])("does not invent missing or conflicting source duration proof: %j", changes => {
    expect(check(sentence(), changes).status).not.toBe("validated");
  });
  it("does not turn a duration's start date into an independent observation date", () => {
    expect(check(sentence("2025-01-01")).status).not.toBe("validated");
    expect(check(sentence("2025-06-30")).status).toBe("validated");
  });
  it.each(["; filed on 2024-12-31", "; a later reference was December 31, 2024", "; also 2025-01-01 to 2025-06-30"])(
    "does not borrow period scope past a sentence boundary: %s", suffix => {
      expect(check(sentence() + suffix).status).not.toBe("validated");
    },
  );
  it("honors matching explicit duration metadata and a source-established one-day duration", () => {
    expect(check(sentence(), { periodContext: { kind: "duration", start: "2025-01-01", end: "2025-06-30" } }).status).toBe("validated");
    expect(check(sentence("2025-06-30 to 2025-06-30"), { label: "Inventory cash-flow contribution, 2025-06-30 to 2025-06-30" }).status).toBe("validated");
    expect(check(sentence("2025-06-30 to 2025-06-30"), { label: "Inventory cash-flow contribution" }).status).not.toBe("validated");
  });
  it("retains unit admission and checks a foreign period before the numeric clause", () => {
    expect(check(sentence(), { unit: "shares", currency: null }).status).not.toBe("validated");
    expect(check(sentence(), { unit: "currency-per-share" }).status).not.toBe("validated");
    expect(check("As of 2024-12-31; " + sentence()).status).not.toBe("validated");
  });
  it.each(["USD 120 million", "USD -121 million", "EUR -120 million"]) (
    "preserves sign, value and currency checks: %s", value => {
      expect(check(sentence(undefined, value)).status).not.toBe("validated");
    },
  );
  it("preserves metric scope and supports a genuine zero", () => {
    expect(check(sentence().replace("Inventory", "Receivables")).status).not.toBe("validated");
    expect(check(sentence(undefined, "USD 0 million"), { value: 0 }).status).toBe("validated");
  });
  it.each(["correct", "unknown-source", "wrong-as-of"])("preserves normal verifier citation admission: %s", async variant => {
    const bundle = completeCurrencyBundle({});
    bundle.edgar.companyFacts = { ok: false, gap: { field: "synthetic.companyFacts", reason: "Synthetic fixture has no SEC facts", severity: "info" } };
    const payload = assembleContextPayload(bundle, runStageB(bundle), validateBundle(bundle));
    payload.provenanceRegistry!.push(base);
    const claim = { label: "FACT" as const, text: sentence(),
      source: variant === "unknown-source" ? "payload.filing-facts.not-registered" : base.id,
      asOf: variant === "wrong-as-of" ? "2025-08-07" : base.asOf };
    const verified = await runVerifyPass({ model: "must-not-call", runPass: async () => { throw new Error("No model call permitted"); } },
      payload, { claims: [claim] });
    expect(verified.coverage.factualValidation?.validated).toBe(variant === "correct" ? 1 : 0);
    expect(verified.verifiedReport.claims[0].text).toBe(claim.text);
  });
});
