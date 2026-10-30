import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { completeCurrencyBundle } from "./currencyBundle";

export const GUIDED = "Excluding the impact of the annual sales event in both 2025 and 2026, third quarter 2026 year-over-year growth would be nearly 400 basis points higher.";
export const LATEST = "This guidance assumes that the annual sales event occurs in second quarter 2026.";
export const GUIDED_ACCESSION = "0000000001-26-000020";
export const releaseText = (qualifier = GUIDED) => `Acme Corp. Reports Second Quarter 2026 Results. Revenue for the second quarter ended June 30, 2026 was $1.1 billion. Business Outlook For the third quarter of 2026, Acme expects revenue to be in the range of $1.2-1.3 billion. ${qualifier} About Acme Corp. Acme makes things.`;

export function twoReleaseBundle(qualifier = GUIDED) {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD", estimates: false });
  bundle.builtAt = "2026-07-31T00:00:00.000Z";
  const dates = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31", "2024-12-31", "2024-09-30"];
  for (const key of ["incomeQuarterly", "balanceQuarterly", "cashflowQuarterly"] as const) {
    const member = bundle.statements[key];
    if (!member.ok) throw new Error("quarterly fixture");
    member.value.data.rows = dates.map(date => ({ ...member.value.data.rows[0], date, ...(key === "incomeQuarterly" ? { revenue: 1.1e9 } : {}) }));
  }
  const releases = [
    { accession: GUIDED_ACCESSION, filed: "2026-07-28", text: releaseText(qualifier) },
    { accession: "0000000001-26-000010", filed: "2026-04-28", text: `Acme Corp. Reports First Quarter 2026 Results. Revenue for the first quarter ended March 31, 2026 was $1.1 billion. Business Outlook For the second quarter of 2026, Acme expects revenue to be in the range of $1.05-1.15 billion. ${LATEST} About Acme Corp. Acme makes things.` },
  ].map(r => buildEarningsReleaseRecord({ filing: { accessionNumber: r.accession, filingDate: r.filed, form: "8-K" }, releaseUrl: `https://www.sec.gov/${r.accession}`, commentaryUrl: null, releaseText: r.text, commentaryText: null, includeNarrative: false }));
  bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases, events: [], notes: [] },
    asOf: "2026-07-28", source: "edgar", endpoint: "fixture", fetchedAt: bundle.builtAt } };
  return bundle;
}
