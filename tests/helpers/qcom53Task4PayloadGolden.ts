import { expect } from "vitest";
import type { ComputedMetrics } from "@/pipeline/compute";
import { fnv1a32, payloadFingerprint, serializePayloadForPrompt, type ContextPayload } from "@/pipeline/stageC/payload";

// D-138 Task 4: every live change was attributed against b0362f47.
// Pin current bytes, then restore only counted whole text leaves and exact
// descriptive additions. The unchanged B6 helper still asserts 1.54.0 and
// every earlier golden. No financial leaf is removed or rewritten.
const wording = [
  {
    "now": "NET_DEBT_V3: total debt minus cash and short-term investments (combined field); 2025-09-27: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted; EBITDA computed as operatingIncome + cash-flow D&A (latest FY, not TTM)",
    "before": "NET_DEBT_V3: total debt minus cash and short-term investments (combined field); EBITDA computed as operatingIncome + cash-flow D&A (latest FY, not TTM)",
    "computed": 1,
    "payload": 0
  },
  {
    "now": "2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted.",
    "before": "lease liabilities (capitalLeaseObligations) not disclosed — they could not be separated from totalDebt, so enterprise value is reported as-is and any lease liability inside totalDebt stays in EV under either lease setting",
    "computed": 3,
    "payload": 1
  },
  {
    "now": "WACC 8.9575%: risk-free 4.4% (fred:DGS10, observation 2026-07-04); ERP 4.18% (Damodaran implied ERP (trailing 12-month adjusted payout) (static fallback), vintage 2026-07-01); beta 1.1333 (Blume-adjusted (0.667·raw + 0.333), clamped [0.6, 2], raw 1.2 — vendor profile beta; the vendor publishes no regression window or fit; no regression check: only 0 monthly returns shared with the benchmark; 24 required for a beta estimate; observations dated on or after 2026-07-06 UTC withheld because daily bars have no settled-session signal; current-day bars remain withheld until the next UTC day, even after market close); cost of equity 9.1373%; pre-tax cost of debt 3.7362% (effective); tax rate 15% (FMP ratios effectiveTaxRate (observed effective rate)); E 96.9828% / D 3.0172% (market-value weights: equity = current market capitalization, debt = book totalDebt on the retained calculation basis, the latest balance (2026-03-28), the one the EV bridge nets (lease evidence: 2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted) as the market-value proxy; the effective cost of debt divides interest by book totalDebt on the retained calculation basis, average of the latest two fiscal-year-end balances (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt) (retained lease coverage: 2025-09-27: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted. 2024-09-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted))",
    "before": "WACC 8.9575%: risk-free 4.4% (fred:DGS10, observation 2026-07-04); ERP 4.18% (Damodaran implied ERP (trailing 12-month adjusted payout) (static fallback), vintage 2026-07-01); beta 1.1333 (Blume-adjusted (0.667·raw + 0.333), clamped [0.6, 2], raw 1.2 — vendor profile beta; the vendor publishes no regression window or fit; no regression check: only 0 monthly returns shared with the benchmark; 24 required for a beta estimate; observations dated on or after 2026-07-06 UTC withheld because daily bars have no settled-session signal; current-day bars remain withheld until the next UTC day, even after market close); cost of equity 9.1373%; pre-tax cost of debt 3.7362% (effective); tax rate 15% (FMP ratios effectiveTaxRate (observed effective rate)); E 96.9828% / D 3.0172% (market-value weights: equity = current market capitalization, debt = book totalDebt (no operating-lease liability disclosed separately, so lease liabilities remain inside it), the latest balance (2026-03-28), the one the EV bridge nets as the market-value proxy; the effective cost of debt divides interest by book totalDebt (no operating-lease liability disclosed separately, so lease liabilities remain inside it), average of the latest two fiscal-year-end balances (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt))",
    "computed": 3,
    "payload": 1
  },
  {
    "now": "no separate operating-lease observation is available on these balance sheets; invested capital uses the retained totalDebt basis without a separate operating-lease adjustment. Operating-lease coverage is unverified; no direction of ROIC bias is established",
    "before": "no balance sheet discloses an operating-lease liability separately (the provider publishes no split) — invested capital carries totalDebt, lease liabilities included, unadjusted; for a lease-heavy issuer ROIC is understated against the lease-consistent basis",
    "computed": 1,
    "payload": 0
  },
  {
    "now": "book totalDebt on the retained calculation basis, average of the latest two fiscal-year-end balances (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt) (retained lease coverage: 2025-09-27: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted. 2024-09-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted)",
    "before": "book totalDebt (no operating-lease liability disclosed separately, so lease liabilities remain inside it), average of the latest two fiscal-year-end balances (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt)",
    "computed": 1,
    "payload": 0
  },
  {
    "now": "book totalDebt on the retained calculation basis, the latest balance (2026-03-28), the one the EV bridge nets (lease evidence: 2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted)",
    "before": "book totalDebt (no operating-lease liability disclosed separately, so lease liabilities remain inside it), the latest balance (2026-03-28), the one the EV bridge nets",
    "computed": 1,
    "payload": 0
  },
  {
    "now": "debt weight uses book totalDebt on the retained calculation basis, the latest balance (2026-03-28), the one the EV bridge nets (lease evidence: 2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted) as market-value proxy; the effective cost of debt divides interest by book totalDebt on the retained calculation basis, average of the latest two fiscal-year-end balances (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt) (retained lease coverage: 2025-09-27: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted. 2024-09-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted)",
    "before": "debt weight uses book totalDebt (no operating-lease liability disclosed separately, so lease liabilities remain inside it), the latest balance (2026-03-28), the one the EV bridge nets as market-value proxy; the effective cost of debt divides interest by book totalDebt (no operating-lease liability disclosed separately, so lease liabilities remain inside it), average of the latest two fiscal-year-end balances (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt)",
    "computed": 1,
    "payload": 1
  },
  {
    "now": "market-value weights: equity = current market capitalization, debt = book totalDebt on the retained calculation basis, the latest balance (2026-03-28), the one the EV bridge nets (lease evidence: 2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted) as the market-value proxy; the effective cost of debt divides interest by book totalDebt on the retained calculation basis, average of the latest two fiscal-year-end balances (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt) (retained lease coverage: 2025-09-27: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted. 2024-09-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted)",
    "before": "market-value weights: equity = current market capitalization, debt = book totalDebt (no operating-lease liability disclosed separately, so lease liabilities remain inside it), the latest balance (2026-03-28), the one the EV bridge nets as the market-value proxy; the effective cost of debt divides interest by book totalDebt (no operating-lease liability disclosed separately, so lease liabilities remain inside it), average of the latest two fiscal-year-end balances (no quarter-end balance four quarters back, so TTM interest is measured against fiscal-year-end debt)",
    "computed": 1,
    "payload": 0
  },
  {
    "now": "2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted. EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The selected convention does not subtract the finance-lease observation. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV on the operating-lease adjustment basis 3,196,000,000,000; EV on retained debt basis 3,196,000,000,000.",
    "before": "Enterprise value EXCLUDES the OPERATING-lease liability (house default; set THESIS_EV_INCLUDE_LEASES=1 to keep it). EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments; lease liabilities were not disclosed separately, so they could not be separated from totalDebt and EV is reported as-is. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it, so removing the operating-lease liability keeps numerator and denominator on the same basis. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The finance-lease liability remains financing debt in both frames and is never removed. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV excluding the operating-lease liability 3,196,000,000,000; EV as reported 3,196,000,000,000.",
    "computed": 2,
    "payload": 0
  },
  {
    "now": "EV / (operatingIncome + D&A), TTM-computed — vendor ebitda field not trusted. 2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted. EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The selected convention does not subtract the finance-lease observation. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV on the operating-lease adjustment basis 3,196,000,000,000; EV on retained debt basis 3,196,000,000,000. Balance basis: latest quarterly balance sheet 2026-03-28.",
    "before": "EV / (operatingIncome + D&A), TTM-computed — vendor ebitda field not trusted. Enterprise value EXCLUDES the OPERATING-lease liability (house default; set THESIS_EV_INCLUDE_LEASES=1 to keep it). EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments; lease liabilities were not disclosed separately, so they could not be separated from totalDebt and EV is reported as-is. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it, so removing the operating-lease liability keeps numerator and denominator on the same basis. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The finance-lease liability remains financing debt in both frames and is never removed. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV excluding the operating-lease liability 3,196,000,000,000; EV as reported 3,196,000,000,000. Balance basis: latest quarterly balance sheet 2026-03-28.",
    "computed": 1,
    "payload": 0
  },
  {
    "now": "EV / revenue (TTM). 2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted. EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The selected convention does not subtract the finance-lease observation. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV on the operating-lease adjustment basis 3,196,000,000,000; EV on retained debt basis 3,196,000,000,000.",
    "before": "EV / revenue (TTM). Enterprise value EXCLUDES the OPERATING-lease liability (house default; set THESIS_EV_INCLUDE_LEASES=1 to keep it). EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments; lease liabilities were not disclosed separately, so they could not be separated from totalDebt and EV is reported as-is. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it, so removing the operating-lease liability keeps numerator and denominator on the same basis. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The finance-lease liability remains financing debt in both frames and is never removed. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV excluding the operating-lease liability 3,196,000,000,000; EV as reported 3,196,000,000,000.",
    "computed": 1,
    "payload": 0
  },
  {
    "now": "DCF equity bridge: EV − net debt − minority interest − preferred equity. 2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted.",
    "before": "DCF equity bridge: EV − net debt − minority interest − preferred equity. Lease liabilities were not disclosed separately, so they could not be separated from total debt; net debt is used as reported.",
    "computed": 1,
    "payload": 1
  },
  {
    "now": "Recorded operating-lease observation",
    "before": "operating leases",
    "computed": 0,
    "payload": 1
  },
  {
    "now": "Recorded finance-lease observation",
    "before": "finance leases",
    "computed": 0,
    "payload": 1
  },
  {
    "now": "Net debt on the retained basis",
    "before": "net debt including leases",
    "computed": 0,
    "payload": 3
  },
  {
    "now": "Net debt on the selected operating-lease basis",
    "before": "net debt excluding operating leases",
    "computed": 0,
    "payload": 1
  },
  {
    "now": "evToEbitda: EV / (operatingIncome + D&A), TTM-computed — vendor ebitda field not trusted. 2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted. EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The selected convention does not subtract the finance-lease observation. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV on the operating-lease adjustment basis 3,196,000,000,000; EV on retained debt basis 3,196,000,000,000. Balance basis: latest quarterly balance sheet 2026-03-28.",
    "before": "evToEbitda: EV / (operatingIncome + D&A), TTM-computed — vendor ebitda field not trusted. Enterprise value EXCLUDES the OPERATING-lease liability (house default; set THESIS_EV_INCLUDE_LEASES=1 to keep it). EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments; lease liabilities were not disclosed separately, so they could not be separated from totalDebt and EV is reported as-is. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it, so removing the operating-lease liability keeps numerator and denominator on the same basis. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The finance-lease liability remains financing debt in both frames and is never removed. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV excluding the operating-lease liability 3,196,000,000,000; EV as reported 3,196,000,000,000. Balance basis: latest quarterly balance sheet 2026-03-28.",
    "computed": 0,
    "payload": 1
  },
  {
    "now": "evToSales: EV / revenue (TTM). 2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified. The calculation uses the retained debt basis; no separate operating-lease amount was subtracted. EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The selected convention does not subtract the finance-lease observation. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV on the operating-lease adjustment basis 3,196,000,000,000; EV on retained debt basis 3,196,000,000,000.",
    "before": "evToSales: EV / revenue (TTM). Enterprise value EXCLUDES the OPERATING-lease liability (house default; set THESIS_EV_INCLUDE_LEASES=1 to keep it). EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments; lease liabilities were not disclosed separately, so they could not be separated from totalDebt and EV is reported as-is. EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses, so EBIT and EBITDA are already AFTER it, so removing the operating-lease liability keeps numerator and denominator on the same basis. Finance-lease right-of-use amortisation is included in EBIT and added back in EBITDA; finance-lease interest is below EBIT. The finance-lease liability remains financing debt in both frames and is never removed. Provided market capitalization retained; all-class economic coverage is not independently established. A single SEC share fact alone does not establish complete common-class scope. Non-operating holdings are not comprehensively resolved; this bridge does not establish a fully adjusted operating enterprise value.  EV excluding the operating-lease liability 3,196,000,000,000; EV as reported 3,196,000,000,000.",
    "computed": 0,
    "payload": 1
  },
  {
    "now": "1.55.0",
    "before": "1.54.0",
    "computed": 0,
    "payload": 1
  }
] as const;

export function restoreQcom53Task4Golden(input: { computed: ComputedMetrics; payload: ContextPayload }) {
  const computed = structuredClone(input.computed), payload = structuredClone(input.payload);
  if (!payload.citationRegistry || !payload.provenanceRegistry) throw new Error("Task4 golden requires both registries");
  const finance = { scores: computed.scores, projections: computed.projections, valuation: computed.valuation, fairValue: computed.fairValue, scenarioTargets: computed.scenarioTargets };
  expect({ fingerprint: payloadFingerprint(payload), promptBytes: Buffer.byteLength(serializePayloadForPrompt(payload)),
    provenanceCount: payload.provenanceRegistry.length, provenanceHash: fnv1a32(JSON.stringify(payload.provenanceRegistry)),
    provenanceIdsHash: fnv1a32(JSON.stringify(payload.provenanceRegistry.map(r => r.id))), citationCount: payload.citationRegistry.length,
    citationHash: fnv1a32(JSON.stringify(payload.citationRegistry)), financeHash: fnv1a32(JSON.stringify(finance)),
    computedHash: fnv1a32(JSON.stringify(computed)),
  }).toEqual({
  "fingerprint": "1.55.0:af8f54bd",
  "promptBytes": 147779,
  "provenanceCount": 530,
  "provenanceHash": "4dddbe66",
  "provenanceIdsHash": "951b34ca",
  "citationCount": 77,
  "citationHash": "fc174a94",
  "financeHash": "db6cd59d",
  "computedHash": "92bf340d"
});
  const bridge = computed.capital.current?.debtBridge;
  if (!bridge) throw new Error("Task4 fixture requires the retained debt bridge");
  expect(bridge.leaseEvidence).toEqual({
  "operating": {
    "coverage": "unverified",
    "verifiedZero": false
  },
  "finance": {
    "coverage": "unverified",
    "verifiedZero": false
  },
  "combined": {
    "coverage": "unverified",
    "verifiedZero": false
  },
  "observedLeaseLine": "missing"
});
  expect(bridge.leaseEvidenceNote).toBe("2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified.");
  delete bridge.leaseEvidence;
  delete bridge.leaseEvidenceNote;
  // Exactly one current-capital note and six balance-row notes were appended.
  expect(payload.computed[4].notes.slice(3)).toEqual([
  "2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified."
]);
  payload.computed[4].notes.splice(3, 1);
  expect(payload.statements[2].notes).toEqual([
  "2025-09-27: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified.",
  "2024-09-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified.",
  "2023-09-30: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified.",
  "2022-09-24: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified.",
  "2021-09-25: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified."
]);
  payload.statements[2].notes.splice(0, 5);
  expect(payload.statements[3].notes).toEqual([
  "2026-03-28: No valid combined lease-line observation is available. Operating, finance and combined lease coverage is unverified."
]);
  payload.statements[3].notes.splice(0, 1);
  // The neutral caption replaces two different historical captions. Restore
  // these eleven exact positions separately rather than guessing from text.
  const currentCaptions = [payload.computed[4].figures[15], payload.provenanceRegistry[95], payload.provenanceRegistry[106]];
  expect(currentCaptions.map(r => r.label)).toEqual(Array(3).fill("Debt used in this report"));
  for (const row of currentCaptions) row.label = "total debt including leases";
  const statementCaptions = [262, 263, 264, 265, 266, 275].map(index => payload.provenanceRegistry![index]);
  expect(statementCaptions.map(r => r.label)).toEqual(Array(6).fill("Debt used in this report"));
  for (const row of statementCaptions) row.label = "total debt";
  const statementLines = [payload.statements[2].lineItems[3], payload.statements[3].lineItems[3]];
  expect(statementLines.map(r => r.lineItem)).toEqual(Array(2).fill("Debt used in this report"));
  for (const row of statementLines) row.lineItem = "total debt";
  const restore = <T,>(value: T, scope: "computed" | "payload"): T => {
    const counts = wording.map(() => 0);
    const restored = JSON.parse(JSON.stringify(value, (_key, leaf: unknown) => {
      if (typeof leaf !== "string") return leaf;
      const index = wording.findIndex(row => row.now === leaf);
      if (index < 0) return leaf;
      counts[index]++;
      return wording[index].before;
    })) as T;
    expect(counts).toEqual(wording.map(row => row[scope]));
    return restored;
  };
  return { computed: restore(computed, "computed"), payload: restore(payload, "payload") };
}
