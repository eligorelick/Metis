import { findDocumentByType, type EdgarClient, type EdgarFiling } from "@/providers/edgar";
import { parseDocument } from "@/edgar/extract";
import type { FmpEarningsRow, FmpNewsArticleRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

export interface CompanyAnnouncementEvidence { text: string; publishedAt: string; observedAt: string; url: string; authority: "company_ir" | "sec_filing"; authorityChain?: string[] }
function validDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi;

/** Conservative explicit-date extraction; publication, observation and event dates remain distinct. */
export function companyEarningsAnnouncement(evidence: CompanyAnnouncementEvidence, symbol: string, today: string): FetchResult<FmpEarningsRow> | null {
  const published = evidence.publishedAt.slice(0, 10);
  const observed = evidence.observedAt.slice(0, 10);
  if (!validDay(published) || !validDay(observed) || !validDay(today) || published > today || observed > today || published > observed) return null;
  let url: URL;
  try { url = new URL(evidence.url); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (evidence.authority === "sec_filing" && url.hostname !== "sec.gov" && !url.hostname.endsWith(".sec.gov")) return null;
  const candidates: { date: string; text: string }[] = [];
  for (const sentence of evidence.text.slice(0, 100_000).replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)) {
    if (!/\b(?:financial results|earnings|(?:quarter|year)(?:ly)?\b.{0,80}\bresults)\b/i.test(sentence)) continue;
    if (!/\b(?:will|to)\s+(?:report|release|announce|publish)\b|\bwill\s+be\s+(?:reported|released|announced|published)\b/i.test(sentence)) continue;
    if (/\b(?:expect(?:s|ed)?|estimat(?:e[sd]?|ed)|may|might|tentative|subject to)\b/i.test(sentence)) continue;
    const dates = [...sentence.matchAll(DATE_RE)].map((m) => `${m[3]}-${String(MONTHS.indexOf(m[1]!.toLowerCase()) + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`);
    // Every date in the sentence remains a possible event date. Equality with
    // the publication date does not prove that a date is merely a dateline.
    const unique = [...new Set(dates)];
    if (unique.length !== 1) continue;
    const date = unique[0]!;
    if (!validDay(date) || date < today || (Date.parse(date) - Date.parse(today)) / 86_400_000 > 180 || date < published) continue;
    candidates.push({ date, text: sentence.slice(0, 1500) });
  }
  if (new Set(candidates.map((c) => c.date)).size !== 1) return null;
  const event = candidates[0]!;
  return { ok: true, value: { data: { symbol, date: event.date, epsActual: null, revenueActual: null, confirmation: "company_confirmed", announcedAt: evidence.publishedAt, observedAt: evidence.observedAt, announcementUrl: evidence.url, evidenceText: event.text, ...(evidence.authorityChain ? { authorityChain: evidence.authorityChain } : {}) }, asOf: observed, source: evidence.authority === "sec_filing" ? "edgar" : "computed", endpoint: evidence.url, fetchedAt: evidence.observedAt } };
}

export function preferCompanyEarnings(vendor: FetchResult<FmpEarningsRow>, announcements: (FetchResult<FmpEarningsRow> | null)[], today: string): FetchResult<FmpEarningsRow> {
  const company = announcements.filter((r): r is Extract<FetchResult<FmpEarningsRow>, { ok: true }> => r?.ok === true && r.value.data.confirmation === "company_confirmed" && typeof r.value.data.date === "string" && validDay(r.value.data.date) && r.value.data.date >= today && typeof r.value.data.announcedAt === "string" && r.value.data.announcedAt.slice(0, 10) <= today && typeof r.value.data.observedAt === "string" && r.value.data.observedAt.slice(0, 10) <= today)
    .sort((a, b) => b.value.data.announcedAt!.localeCompare(a.value.data.announcedAt!) || a.value.data.date!.localeCompare(b.value.data.date!));
  const first = company[0];
  // Same-publication conflicting dates have no authoritative winner.
  if (first && !company.some((r) => r.value.data.announcedAt === first.value.data.announcedAt && r.value.data.date !== first.value.data.date)) return first;
  return vendor.ok ? { ...vendor, value: { ...vendor.value, data: { ...vendor.value.data, confirmation: "vendor_estimate", observedAt: vendor.value.fetchedAt } } } : vendor;
}

/** Only company-owned press-release URLs prove company authority; wire-service snippets do not. */
export function pressReleaseEarningsAnnouncements(press: FetchResult<FmpPayload<FmpNewsArticleRow>>, companyWebsite: string | null, symbol: string, today: string): FetchResult<FmpEarningsRow>[] {
  if (!press.ok || !companyWebsite) return [];
  let companyHost: string;
  try { companyHost = new URL(companyWebsite).hostname.toLowerCase().replace(/^www\./, ""); } catch { return []; }
  return press.value.data.rows.slice(0, 50).flatMap((row) => {
    if (row.symbol?.toUpperCase() !== symbol.toUpperCase() || !row.url || !row.publishedDate) return [];
    let host: string;
    try { host = new URL(row.url).hostname.toLowerCase(); } catch { return []; }
    if (host !== companyHost && !host.endsWith(`.${companyHost}`)) return [];
    const event = companyEarningsAnnouncement({ text: `${row.title ?? ""}. ${row.text ?? ""}`, publishedAt: row.publishedDate, observedAt: press.value.fetchedAt, url: row.url, authority: "company_ir" }, symbol, today);
    return event ? [event] : [];
  });
}

/** At most three recent 8-Ks, each primary and one EX-99 exhibit, via the rate-limited cached SEC client. */
export async function discoverFiledEarningsAnnouncement(edgar: EdgarClient, cik: string, filings: EdgarFiling[], symbol: string, today: string, observedAt: string): Promise<FetchResult<FmpEarningsRow>[]> {
  const selected = filings.filter((f) => f.form === "8-K" && validDay(f.filingDate) && f.filingDate <= today && (Date.parse(today) - Date.parse(f.filingDate)) / 86_400_000 <= 90 && (!f.items || /(?:2\.02|8\.01)/.test(f.items))).sort((a, b) => b.filingDate.localeCompare(a.filingDate)).slice(0, 3);
  const out: FetchResult<FmpEarningsRow>[] = [];
  for (const filing of selected) {
    try {
      const primary = await edgar.fetchFilingDocument(cik, filing, { asOf: filing.filingDate });
      if (!primary.ok) continue;
      const extract = (document: FetchResult<string>) => document.ok ? companyEarningsAnnouncement({ text: parseDocument(document.value.data.slice(0, 500_000)).fullText, publishedAt: filing.acceptanceDateTime ?? filing.filingDate, observedAt: document.value.fetchedAt || observedAt, url: document.value.endpoint, authority: "sec_filing" }, symbol, today) : null;
      const event = extract(primary);
      if (event) { out.push(event); continue; }
      const index = await edgar.filingIndexHeaders(cik, filing.accessionNumber);
      const exhibit = index.ok ? findDocumentByType(index.value.data, "EX-99") : null;
      if (!exhibit) continue;
      const found = extract(await edgar.fetchFilingDocument(cik, { ...filing, primaryDocument: exhibit.filename }, { asOf: filing.filingDate }));
      if (found) out.push(found);
    } catch { /* Unavailable documents preserve vendor fallback; never infer confirmation. */ }
  }
  return out;
}
