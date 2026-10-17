import { findDocumentByType, type EdgarClient, type EdgarFiling } from "@/providers/edgar";
import { parseDocument } from "@/edgar/extract";
import type { FmpEarningsRow, FmpNewsArticleRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { createHash } from "node:crypto";

export interface ConfirmedIssuerIdentity {
  cik: string | null;
  canonicalName: string;
  validAliases?: readonly string[];
  verifiedWebsite: string;
}
export interface CompanyAnnouncementEvidence {
  text: string; publishedAt: string; observedAt: string; url: string; authority: "company_ir" | "sec_filing"; authorityChain?: string[];
  issuer?: ConfirmedIssuerIdentity;
  /** Hash of retained source bytes when the acquiring adapter has them. */
  sourceHash?: string;
  /** A named issuer in the article title establishes a subjectless release only with a bound source. */
  documentTitle?: string;
}
const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function issuerAliases(issuer: ConfirmedIssuerIdentity): string[] {
  const canonical = issuer.canonicalName.trim();
  const core = canonical.replace(/,?\s+(?:incorporated|inc|corporation|corp|limited|ltd|plc|llc)\.?$/i, "");
  // Legal-form punctuation and omission do not invent a business alias. Keep
  // multiword cores only; short brands still require a verified alias.
  const variants = [canonical.replace(/,\s*(?=(?:incorporated|inc|corporation|corp|limited|ltd|plc|llc)\.?$)/i, " ")];
  if (core !== canonical) {
    variants.push(canonical.replace(/\.$/, ""), variants[0]!.replace(/\.$/, ""));
    if (core.split(/\s+/).length >= 2) variants.push(core);
  }
  return [...new Set([canonical, ...variants, ...(issuer.validAliases ?? [])].map((s) => s.trim()).filter((s) => s.length >= 3))];
}
function mentionsIssuer(text: string, issuer: ConfirmedIssuerIdentity): boolean {
  return issuerAliases(issuer).some((alias) => new RegExp(`(?:^|[^a-z0-9])${escapeRegex(alias)}(?:$|[^a-z0-9])`, "i").test(text));
}
/** A website relationship permits hosted IR; it does not establish an event subject. */
function sourceBoundToIssuer(evidence: CompanyAnnouncementEvidence, url: URL, issuer: ConfirmedIssuerIdentity): boolean {
  if (evidence.authority === "sec_filing") {
    const cik = issuer.cik?.replace(/^0+/, "");
    const documentCik = url.pathname.match(/^\/Archives\/edgar\/data\/(\d+)\//i)?.[1]?.replace(/^0+/, "");
    return Boolean(cik && documentCik === cik && (url.hostname === "sec.gov" || url.hostname.endsWith(".sec.gov")));
  }
  let website: URL;
  try { website = new URL(issuer.verifiedWebsite); } catch { return false; }
  if (website.protocol !== "https:" || website.username || website.password || website.port) return false;
  const officialHost = website.hostname.toLowerCase().replace(/^www\./, "");
  if (url.hostname === officialHost || url.hostname.endsWith(`.${officialHost}`)) return true;
  const chain = evidence.authorityChain;
  if (!chain || chain.length < 2 || chain[chain.length - 1] !== url.toString()) return false;
  try { return new URL(chain[0]!).toString() === website.toString() && chain.every((raw) => new URL(raw).protocol === "https:"); } catch { return false; }
}
// Only recognized places are datelines. Arbitrary uppercase/wire/issuer
// prefixes must not move an unrelated issuer mention to the clause's start.
const LOCATION_DATELINE_PREFIX = /^(?:SEATTLE|REDMOND|NEW YORK|SAN FRANCISCO|BOSTON|CHICAGO|LONDON|DUBLIN)\s*(?:--|[–—])\s*/i;
function announcementBody(sentence: string, publishedAt: string): string {
  const dated = new RegExp(`^(?:SEATTLE|REDMOND|NEW YORK|SAN FRANCISCO|BOSTON|CHICAGO|LONDON|DUBLIN),\\s*(${DATE_RE.source})\\s*(?:--|[–—])\\s*`, "i").exec(sentence.trimStart());
  if (dated && Number.isFinite(Date.parse(dated[1]!)) && new Date(dated[1]!).toISOString().slice(0, 10) === publishedAt.slice(0, 10)) return sentence.trimStart().slice(dated[0].length);
  return sentence.trimStart().replace(LOCATION_DATELINE_PREFIX, "");
}
function eventSubject(sentence: string, evidence: CompanyAnnouncementEvidence, issuer: ConfirmedIssuerIdentity): { alias: string | null; method: "named-subject" | "issuer-document" } | null {
  if (/\b(?:subsidiary|subsidiaries|parent company|on behalf of)\b/i.test(sentence)) return null;
  // Normalize only for subject recognition; retained evidence spans and the
  // publication/event-date ambiguity checks still use the original sentence.
  const subjectSentence = announcementBody(sentence, evidence.publishedAt);
  const dateAt = new RegExp(DATE_RE.source, "i").exec(subjectSentence)?.index ?? subjectSentence.length;
  const action = [...subjectSentence.matchAll(/\b(?:will|to)\s+(?:report|release|announce|publish)\b|\bwill\s+be\s+(?:reported|released|announced|published)\b/gi)].filter((m) => m.index < dateAt).at(-1);
  if (!action) return null;
  const prefix = subjectSentence.slice(0, action.index);
  for (const alias of issuerAliases(issuer)) {
    // The name must introduce the reporting action, not just occur elsewhere
    // in a parent/subsidiary description or another issuer's announcement.
    const pattern = new RegExp(`^${escapeRegex(alias)}[,.]?\\s*(?:\\([^)]*\\)\\s*)?(?:(?:today\\s+)?announced(?:\\s+today)?(?:\\s+that)?(?:\\s+it)?\\s+)?$`, "i");
    if (pattern.test(prefix.trimStart())) return { alias, method: "named-subject" };
  }
  if (evidence.documentTitle && mentionsIssuer(evidence.documentTitle, issuer) &&
      /^(?:(?:we|the company|it)\s+)?(?:will\s+(?:report|release|announce|publish)|(?:financial results|earnings)\s+will\s+be\s+(?:reported|released|announced|published))\b/i.test(sentence.trim())) {
    return { alias: null, method: "issuer-document" };
  }
  return null;
}
function announcementSentences(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  let start = 0;
  for (const boundary of text.matchAll(/[.!?]\s+/g)) {
    const end = boundary.index + 1;
    if (text[boundary.index] === "." && /\b(?:inc|corp|ltd|co)\.$/i.test(text.slice(start, end))) continue;
    out.push({ text: text.slice(start, end), start, end });
    start = boundary.index + boundary[0].length;
  }
  if (start < text.length) out.push({ text: text.slice(start), start, end: text.length });
  return out;
}
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
  if (url.protocol !== "https:" || url.username || url.password || url.port || !evidence.issuer || !sourceBoundToIssuer(evidence, url, evidence.issuer)) return null;
  const candidates: { date: string; text: string; start: number; end: number; subject: NonNullable<ReturnType<typeof eventSubject>> }[] = [];
  for (const span of announcementSentences(evidence.text.slice(0, 100_000))) {
    const sentence = span.text;
    if (!/\b(?:financial results|earnings|(?:quarter|year)(?:ly)?\b.{0,80}\bresults)\b/i.test(sentence)) continue;
    if (!/\b(?:will|to)\s+(?:report|release|announce|publish)\b|\bwill\s+be\s+(?:reported|released|announced|published)\b/i.test(sentence)) continue;
    if (/\b(?:expect(?:s|ed)?|estimat(?:e[sd]?|ed)|may|might|tentative|subject to)\b/i.test(sentence)) continue;
    const subject = eventSubject(sentence, evidence, evidence.issuer);
    if (subject === null) continue;
    const body = announcementBody(sentence, evidence.publishedAt);
    const dates = [...body.matchAll(DATE_RE)].flatMap((m) => {
      const date = `${m[3]}-${String(MONTHS.indexOf(m[1]!.toLowerCase()) + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
      // Only an explicitly completed reporting-period clause removes a date
      // from the action's candidates; past release/conference dates remain.
      const reportingPeriod = /\bfor\s+(?:the\s+)?(?:period|quarter|year)\s+ended\s*$/i.test(body.slice(0, m.index));
      return reportingPeriod && validDay(date) && date <= published ? [] : [date];
    });
    const unique = [...new Set(dates)];
    if (unique.length !== 1) continue;
    const date = unique[0]!;
    if (!validDay(date) || date < today || (Date.parse(date) - Date.parse(today)) / 86_400_000 > 180 || date < published) continue;
    candidates.push({ date, text: sentence.slice(0, 1500), start: span.start, end: Math.min(span.end, span.start + 1500), subject });
  }
  if (new Set(candidates.map((c) => c.date)).size !== 1) return null;
  const event = candidates[0]!;
  const issuerId = evidence.issuer.cik ? `cik:${evidence.issuer.cik.replace(/^0+/, "")}` : `name:${evidence.issuer.canonicalName}`;
  const issuerBinding = { issuerId, canonicalName: evidence.issuer.canonicalName, matchedAlias: event.subject.alias, method: event.subject.method,
    sourceHash: evidence.sourceHash ?? createHash("sha256").update(evidence.text).digest("hex"), hashBasis: evidence.sourceHash ? "source-bytes" : "extracted-text",
    sourceUrl: evidence.url, publishedAt: evidence.publishedAt, observedAt: evidence.observedAt, eventDate: event.date, span: { start: event.start, end: event.end, text: event.text, coordinateBasis: "extracted-text" } };
  return { ok: true, value: { data: { symbol, date: event.date, epsActual: null, revenueActual: null, confirmation: "company_confirmed", announcedAt: evidence.publishedAt, observedAt: evidence.observedAt, announcementUrl: evidence.url, evidenceText: event.text, issuerBinding, ...(evidence.authorityChain ? { authorityChain: evidence.authorityChain } : {}) }, asOf: observed, source: evidence.authority === "sec_filing" ? "edgar" : "computed", endpoint: evidence.url, fetchedAt: evidence.observedAt } };
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
export function pressReleaseEarningsAnnouncements(press: FetchResult<FmpPayload<FmpNewsArticleRow>>, companyWebsite: string | null, symbol: string, today: string, issuer?: ConfirmedIssuerIdentity): FetchResult<FmpEarningsRow>[] {
  if (!press.ok || !companyWebsite || !issuer) return [];
  let companyHost: string;
  try { companyHost = new URL(companyWebsite).hostname.toLowerCase().replace(/^www\./, ""); } catch { return []; }
  return press.value.data.rows.slice(0, 50).flatMap((row) => {
    if (row.symbol?.toUpperCase() !== symbol.toUpperCase() || !row.url || !row.publishedDate) return [];
    let host: string;
    try { host = new URL(row.url).hostname.toLowerCase(); } catch { return []; }
    if (host !== companyHost && !host.endsWith(`.${companyHost}`)) return [];
    const event = companyEarningsAnnouncement({ text: `${row.title ?? ""}. ${row.text ?? ""}`, publishedAt: row.publishedDate, observedAt: press.value.fetchedAt, url: row.url, authority: "company_ir", issuer, documentTitle: row.title }, symbol, today);
    return event ? [event] : [];
  });
}

/** At most three recent 8-Ks, each primary and one EX-99 exhibit, via the rate-limited cached SEC client. */
export async function discoverFiledEarningsAnnouncement(edgar: EdgarClient, cik: string, filings: EdgarFiling[], symbol: string, today: string, observedAt: string, issuer?: ConfirmedIssuerIdentity): Promise<FetchResult<FmpEarningsRow>[]> {
  if (!issuer || issuer.cik?.replace(/^0+/, "") !== cik.replace(/^0+/, "")) return [];
  const selected = filings.filter((f) => f.form === "8-K" && validDay(f.filingDate) && f.filingDate <= today && (Date.parse(today) - Date.parse(f.filingDate)) / 86_400_000 <= 90 && (!f.items || /(?:2\.02|8\.01)/.test(f.items))).sort((a, b) => b.filingDate.localeCompare(a.filingDate)).slice(0, 3);
  const out: FetchResult<FmpEarningsRow>[] = [];
  for (const filing of selected) {
    try {
      const extract = (document: FetchResult<string>) => document.ok ? companyEarningsAnnouncement({ text: parseDocument(document.value.data.slice(0, 500_000)).fullText, publishedAt: filing.acceptanceDateTime ?? filing.filingDate, observedAt: document.value.fetchedAt || observedAt, url: document.value.endpoint, authority: "sec_filing", issuer, sourceHash: createHash("sha256").update(document.value.data).digest("hex") }, symbol, today) : null;
      // Cover documents and exhibits are independent primary sources. A
      // missing cover must not suppress an available, CIK-bound EX-99.
      try {
        const event = extract(await edgar.fetchFilingDocument(cik, filing, { asOf: filing.filingDate }));
        if (event) { out.push(event); continue; }
      } catch { /* Try the bounded exhibit alternative below. */ }
      const index = await edgar.filingIndexHeaders(cik, filing.accessionNumber);
      const exhibit = index.ok ? findDocumentByType(index.value.data, "EX-99") : null;
      if (!exhibit) continue;
      const found = extract(await edgar.fetchFilingDocument(cik, { ...filing, primaryDocument: exhibit.filename }, { asOf: filing.filingDate }));
      if (found) out.push(found);
    } catch { /* Unavailable documents preserve vendor fallback; never infer confirmation. */ }
  }
  return out;
}
