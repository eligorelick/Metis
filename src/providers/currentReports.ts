/**
 * Bounded EDGAR reads behind the 8-K and quarterly-segment ingestion (NVDA
 * report #34 audit, work package 3 and the data-depth part of 9).
 *
 *   collectCurrentReports — the latest four Item 2.02 8-Ks' EX-99.1 release and
 *     EX-99.2 commentary (guidance, issuer FCF, capital return; the newest
 *     one's narrative for the analysts), plus up to ten material-event 8-Ks
 *     from the last year (Items 1.01, 1.02, 2.01, 2.03, 2.05, 2.06, 5.02, 8.01).
 *   collectQuarterlySegments — the XBRL instances of the latest 10-K and up to
 *     three 10-Qs, read for segment revenue by quarter.
 *
 * Every read goes through the rate-limited, cached EdgarClient. A document
 * that cannot be read is a disclosed note, never an inferred value; the
 * member as a whole is a gap only when nothing could be read at all.
 */
import { findDocumentByType, type EdgarClient, type EdgarFiling, type FilingIndex } from "@/providers/edgar";
import { parseDocument } from "@/edgar/extract";
import {
  eventDateOf,
  hasMaterialEventItem,
  itemsOf,
  parseCapitalReturn,
  parseGuidance,
  parseIssuerFreeCashFlow,
  parseReportedPeriod,
  releaseNarrative,
  splitEightKItems,
  summarizeItem,
  MATERIAL_EVENT_ITEMS,
  type CapitalReturnFacts,
  type FreeCashFlowFact,
  type IssuerGuidance,
  type ReportedPeriod,
} from "@/edgar/currentReports";
import {
  buildQuarterlySegments,
  parseInstanceRevenue,
  parseMemberLabels,
  type QuarterlySegmentRevenue,
} from "@/edgar/segmentFacts";
import type { FetchResult, Sourced } from "@/types/core";

export const CURRENT_REPORTS_VERSION = "current-reports-1.0.0" as const;
/** Earnings releases read: four covers a year of guidance-vs-actual. */
export const MAX_EARNINGS_RELEASES = 4;
export const MAX_EVENT_FILINGS = 10;
const RELEASE_WINDOW_DAYS = 400;
const EVENT_WINDOW_DAYS = 365;
/** Bounds on retained text, so a persisted bundle stays small. */
const NARRATIVE_CHARS = 20_000;
const ITEM_TEXT_CHARS = 4_000;

export interface EarningsReleaseRecord {
  accession: string;
  filingDate: string;
  /** EDGAR acceptance timestamp, when the submissions row carries one. */
  acceptedAt: string | null;
  releaseUrl: string | null;
  commentaryUrl: string | null;
  reported: ReportedPeriod;
  guidance: IssuerGuidance | null;
  /** Which exhibit the guidance was read from. */
  guidanceExhibit: "EX-99.1" | "EX-99.2" | null;
  freeCashFlow: FreeCashFlowFact[];
  capitalReturn: CapitalReturnFacts;
  /** Narrative prose (newest release only), bounded. */
  releaseNarrative: string | null;
  commentaryNarrative: string | null;
}

export interface MaterialEventSection {
  item: string;
  title: string;
  summary: string;
  text: string;
  incorporates: string | null;
}

export interface MaterialEventFiling {
  accession: string;
  form: string;
  filingDate: string;
  /** "Date of earliest event reported" from the cover page. */
  eventDate: string | null;
  /** Items as EDGAR's submissions index lists them. */
  items: string[];
  url: string;
  sections: MaterialEventSection[];
}

export interface CurrentReports {
  version: typeof CURRENT_REPORTS_VERSION;
  /** Newest first. */
  releases: EarningsReleaseRecord[];
  /** Newest first. */
  events: MaterialEventFiling[];
  /** Read failures and parse limits, disclosed with the data. */
  notes: string[];
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

async function fetchText(edgar: EdgarClient, cik: string, filing: EdgarFiling, filename: string): Promise<{ text: string; url: string; fetchedAt: string } | string> {
  try {
    const doc = await edgar.fetchFilingDocument(cik, { ...filing, primaryDocument: filename }, { asOf: filing.filingDate });
    if (!doc.ok) return doc.gap.reason;
    return { text: doc.value.data, url: doc.value.endpoint, fetchedAt: doc.value.fetchedAt };
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function indexOf(edgar: EdgarClient, cik: string, accession: string): Promise<FilingIndex | string> {
  try {
    const idx = await edgar.filingIndexHeaders(cik, accession);
    return idx.ok ? idx.value.data : idx.gap.reason;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** The client refuses malformed or unadmitted rows; nothing is requested for them. */
function filingProblem(edgar: EdgarClient, cik: string, filing: EdgarFiling): string | null {
  return typeof edgar.filingProblem === "function" ? edgar.filingProblem(cik, filing) : null;
}

function plain(html: string): string {
  return parseDocument(html.slice(0, 2_000_000)).fullText;
}

/**
 * One earnings 8-K's facts from its exhibits' plain text. Guidance comes from
 * the release, else the commentary; so does issuer FCF. Pure.
 */
export function buildEarningsReleaseRecord(args: {
  filing: Pick<EdgarFiling, "accessionNumber" | "filingDate" | "acceptanceDateTime">;
  releaseUrl: string | null;
  commentaryUrl: string | null;
  releaseText: string;
  commentaryText: string | null;
  includeNarrative: boolean;
}): EarningsReleaseRecord {
  const { filing, releaseText, commentaryText } = args;
  const fromRelease = parseGuidance(releaseText);
  const releaseHasItems = fromRelease !== null && fromRelease.items.length > 0;
  const fromCommentary = releaseHasItems || commentaryText === null ? null : parseGuidance(commentaryText);
  const guidance = releaseHasItems ? fromRelease : fromCommentary !== null && fromCommentary.items.length > 0 ? fromCommentary : fromRelease ?? fromCommentary;
  const reported = parseReportedPeriod(releaseText);
  const fcfRelease = parseIssuerFreeCashFlow(releaseText);
  return {
    accession: filing.accessionNumber,
    filingDate: filing.filingDate,
    acceptedAt: filing.acceptanceDateTime ?? null,
    releaseUrl: args.releaseUrl,
    commentaryUrl: args.commentaryUrl,
    reported: reported.fiscal === null && commentaryText !== null ? { ...parseReportedPeriod(commentaryText), periodEnd: reported.periodEnd } : reported,
    guidance,
    guidanceExhibit: guidance === null || guidance.items.length === 0 ? null : guidance === fromRelease ? "EX-99.1" : "EX-99.2",
    freeCashFlow: fcfRelease.length > 0 || commentaryText === null ? fcfRelease : parseIssuerFreeCashFlow(commentaryText),
    capitalReturn: parseCapitalReturn(releaseText),
    releaseNarrative: args.includeNarrative ? releaseNarrative(releaseText).slice(0, NARRATIVE_CHARS) : null,
    commentaryNarrative: args.includeNarrative && commentaryText !== null ? releaseNarrative(commentaryText).slice(0, NARRATIVE_CHARS) : null,
  };
}

/** One material-event 8-K from its primary document's plain text. Pure. */
export function buildMaterialEventFiling(
  filing: Pick<EdgarFiling, "accessionNumber" | "form" | "filingDate" | "items">,
  text: string,
  url: string,
): MaterialEventFiling {
  const sections = splitEightKItems(text)
    .filter((s) => s.item in MATERIAL_EVENT_ITEMS)
    .map((s): MaterialEventSection => ({
      item: s.item,
      title: s.title,
      summary: s.incorporates !== null ? `Incorporates Item ${s.incorporates} by reference.` : summarizeItem(s),
      text: s.text.slice(0, ITEM_TEXT_CHARS),
      incorporates: s.incorporates,
    }));
  return { accession: filing.accessionNumber, form: filing.form, filingDate: filing.filingDate, eventDate: eventDateOf(text), items: itemsOf(filing.items), url, sections };
}

/** Recent 8-K filings, newest first, within `windowDays` of `today`. */
function recentEightKs(filings: readonly EdgarFiling[], today: string, windowDays: number, accept: (f: EdgarFiling) => boolean): EdgarFiling[] {
  return filings
    .filter((f) => (f.form === "8-K" || f.form === "8-K/A") && f.filingDate <= today && daysBetween(f.filingDate, today) <= windowDays && accept(f))
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate) || b.accessionNumber.localeCompare(a.accessionNumber));
}

export async function collectCurrentReports(
  edgar: EdgarClient,
  cik: string,
  filings: readonly EdgarFiling[],
  today: string,
  submissionsEndpoint: string,
): Promise<FetchResult<CurrentReports>> {
  const notes: string[] = [];
  const releases: EarningsReleaseRecord[] = [];
  const events: MaterialEventFiling[] = [];
  let fetchedAt: string | null = null;
  let attempted = 0;

  const earnings = recentEightKs(filings, today, RELEASE_WINDOW_DAYS, (f) => f.form === "8-K" && itemsOf(f.items).includes("2.02"))
    .slice(0, MAX_EARNINGS_RELEASES);
  for (const [position, filing] of earnings.entries()) {
    attempted += 1;
    const problem = filingProblem(edgar, cik, filing);
    if (problem !== null) {
      notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}) not read: ${problem}`);
      continue;
    }
    const index = await indexOf(edgar, cik, filing.accessionNumber);
    if (typeof index === "string") {
      notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}): exhibit index unreadable (${index})`);
      continue;
    }
    const releaseDoc = index.documents.find((d) => /^EX-99\.1$/i.test(d.type.trim())) ?? findDocumentByType(index, "EX-99");
    const commentaryDoc = index.documents.find((d) => /^EX-99\.2$/i.test(d.type.trim()) && d !== releaseDoc) ?? null;
    if (!releaseDoc) {
      notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}): Item 2.02 filing furnishes no EX-99 exhibit`);
      continue;
    }
    const release = await fetchText(edgar, cik, filing, releaseDoc.filename);
    if (typeof release === "string") {
      notes.push(`8-K ${filing.accessionNumber} EX-99 (${releaseDoc.filename}) unreadable: ${release}`);
      continue;
    }
    fetchedAt ??= release.fetchedAt;
    const releaseText = plain(release.text);
    let commentaryText: string | null = null;
    let commentaryUrl: string | null = null;
    if (commentaryDoc) {
      const commentary = await fetchText(edgar, cik, filing, commentaryDoc.filename);
      if (typeof commentary === "string") notes.push(`8-K ${filing.accessionNumber} EX-99.2 (${commentaryDoc.filename}) unreadable: ${commentary}`);
      else { commentaryText = plain(commentary.text); commentaryUrl = commentary.url; }
    }
    const record = buildEarningsReleaseRecord({
      filing,
      releaseUrl: release.url,
      commentaryUrl,
      releaseText,
      commentaryText,
      includeNarrative: position === 0,
    });
    const guidance = record.guidance;
    if (guidance === null) notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}): no outlook section was found in the release or commentary`);
    else if (guidance.items.length === 0) notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}): an outlook section was found but none of its sentences could be read as guidance`);
    for (const sentence of guidance?.unparsed ?? []) notes.push(`8-K ${filing.accessionNumber}: outlook sentence not read as guidance: "${sentence}"`);
    releases.push(record);
  }
  if (earnings.length === 0) notes.push(`no Item 2.02 (results) 8-K among the filings of the last ${RELEASE_WINDOW_DAYS} days`);

  const eventFilings = recentEightKs(filings, today, EVENT_WINDOW_DAYS, (f) => hasMaterialEventItem(f.items)).slice(0, MAX_EVENT_FILINGS);
  for (const filing of eventFilings) {
    attempted += 1;
    const problem = filingProblem(edgar, cik, filing);
    if (problem !== null) {
      notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}) not read: ${problem}`);
      continue;
    }
    const doc = await fetchText(edgar, cik, filing, filing.primaryDocument);
    if (typeof doc === "string") {
      notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}) primary document unreadable: ${doc}`);
      continue;
    }
    fetchedAt ??= doc.fetchedAt;
    const event = buildMaterialEventFiling(filing, plain(doc.text), doc.url);
    if (event.sections.length === 0) notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}) lists Items ${event.items.join(", ")} but no item heading could be read in its primary document`);
    events.push(event);
  }

  if (attempted > 0 && releases.length === 0 && events.length === 0) {
    return { ok: false, gap: { field: "edgar.currentReports", reason: `no 8-K document could be read: ${notes.slice(0, 3).join("; ")}`, severity: "warn", attemptedSources: [submissionsEndpoint] } };
  }
  const newest = [...releases.map((r) => r.filingDate), ...events.map((e) => e.filingDate)].sort().at(-1) ?? today;
  const value: Sourced<CurrentReports> = {
    data: { version: CURRENT_REPORTS_VERSION, releases, events, notes },
    asOf: newest,
    source: "edgar",
    endpoint: `${submissionsEndpoint} (8-K EX-99 releases and material-event items)`,
    fetchedAt: fetchedAt ?? `${today}T00:00:00.000Z`,
  };
  return { ok: true, value };
}

/** Periodic filings whose instances cover eight quarters: the latest 10-K and up to three 10-Qs within 15 months. */
export function segmentFilings(filings: readonly EdgarFiling[], today: string): EdgarFiling[] {
  const periodic = filings
    .filter((f) => (f.form === "10-Q" || f.form === "10-K") && f.filingDate <= today && daysBetween(f.filingDate, today) <= 460)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const tenK = periodic.find((f) => f.form === "10-K");
  const tenQs = periodic.filter((f) => f.form === "10-Q").slice(0, 3);
  return [...(tenK ? [tenK] : []), ...tenQs].sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

export async function collectQuarterlySegments(
  edgar: EdgarClient,
  cik: string,
  filings: readonly EdgarFiling[],
  today: string,
): Promise<FetchResult<QuarterlySegmentRevenue>> {
  const chosen = segmentFilings(filings, today);
  const field = "edgar.quarterlySegments";
  if (chosen.length === 0) {
    return { ok: false, gap: { field, reason: "no 10-Q or 10-K among the filings of the last 15 months", severity: "info" } };
  }
  const read: { accession: string; form: string; filingDate: string; facts: ReturnType<typeof parseInstanceRevenue>["facts"]; concept: string | null }[] = [];
  const problems: string[] = [];
  let labels: Record<string, string> = {};
  let fetchedAt: string | null = null;
  let endpoint: string | null = null;
  for (const [position, filing] of chosen.entries()) {
    const problem = filingProblem(edgar, cik, filing);
    if (problem !== null) { problems.push(`${filing.form} ${filing.accessionNumber}: not read (${problem})`); continue; }
    const index = await indexOf(edgar, cik, filing.accessionNumber);
    if (typeof index === "string") { problems.push(`${filing.form} ${filing.accessionNumber}: index unreadable (${index})`); continue; }
    const instance = index.documents.find((d) => /_htm\.xml$/i.test(d.filename)) ?? findDocumentByType(index, "EX-101.INS");
    if (!instance) { problems.push(`${filing.form} ${filing.accessionNumber}: no XBRL instance in the filing index`); continue; }
    const doc = await fetchText(edgar, cik, filing, instance.filename);
    if (typeof doc === "string") { problems.push(`${filing.form} ${filing.accessionNumber}: instance unreadable (${doc})`); continue; }
    fetchedAt ??= doc.fetchedAt;
    endpoint ??= doc.url;
    const parsed = parseInstanceRevenue(doc.text);
    read.push({ accession: filing.accessionNumber, form: filing.form, filingDate: filing.filingDate, facts: parsed.facts, concept: parsed.concept });
    if (position === 0) {
      const lab = findDocumentByType(index, "EX-101.LAB") ?? index.documents.find((d) => /_lab\.xml$/i.test(d.filename));
      if (lab) {
        const labDoc = await fetchText(edgar, cik, filing, lab.filename);
        if (typeof labDoc !== "string") labels = parseMemberLabels(labDoc.text);
      }
    }
  }
  const series = read.length > 0 ? buildQuarterlySegments(read, labels) : null;
  if (series === null) {
    return { ok: false, gap: { field, reason: `no quarterly revenue could be read from ${chosen.length} periodic XBRL instance(s)${problems.length > 0 ? `: ${problems.slice(0, 3).join("; ")}` : ""}`, severity: "info", attemptedSources: chosen.map((f) => f.accessionNumber) } };
  }
  const value: Sourced<QuarterlySegmentRevenue> = {
    data: { ...series, notes: problems },
    asOf: series.quarters[0]!.end,
    source: "edgar",
    endpoint: `${endpoint ?? "edgar"} (+${read.length - 1} earlier periodic XBRL instance(s): segment revenue)`,
    fetchedAt: fetchedAt ?? `${today}T00:00:00.000Z`,
  };
  return { ok: true, value };
}
