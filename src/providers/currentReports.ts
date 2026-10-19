/**
 * Bounded EDGAR reads behind the 8-K and quarterly-segment ingestion (NVDA
 * report #34 audit, work package 3 and the data-depth part of 9).
 *
 *   collectCurrentReports — the latest four Item 2.02 8-Ks' EX-99.1 release and
 *     EX-99.2 commentary (guidance, issuer FCF, capital return; the newest
 *     one's narrative for the analysts), plus up to ten material-event 8-Ks
 *     since the latest annual filing (a year when that baseline is missing).
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
  parseCommitmentTables,
  parseGuidance,
  parseIssuerFreeCashFlow,
  parseNonGaapBasisNote,
  parseReconciliation,
  parseReportedPeriod,
  releaseNarrative,
  splitEightKItems,
  splitSentences,
  summarizeItem,
  MATERIAL_EVENT_ITEMS,
  type CapitalReturnFacts,
  type CommitmentTable,
  type FreeCashFlowFact,
  type IssuerGuidance,
  type ReconciliationFact,
  type ReportedPeriod,
} from "@/edgar/currentReports";
import { parseCompletedOfferingFacts, parseWorkingCapital, type FilingFact, type WorkingCapitalFacts } from "@/edgar/filingFacts";
import {
  buildQuarterlySegments,
  parseInstanceRevenue,
  parseMemberLabels,
  type QuarterlySegmentRevenue,
} from "@/edgar/segmentFacts";
import type { FetchResult, Sourced } from "@/types/core";

export const CURRENT_REPORTS_VERSION = "current-reports-1.2.1" as const;
/** Earnings releases read: four covers a year of guidance-vs-actual. */
export const MAX_EARNINGS_RELEASES = 4;
export const MAX_EVENT_FILINGS = 10;
const RELEASE_WINDOW_DAYS = 400;
const EVENT_WINDOW_DAYS = 365;
/** Bounds on retained text, so a persisted bundle stays small. */
const NARRATIVE_CHARS = 20_000;
const ITEM_TEXT_CHARS = 4_000;

/** A fact's supplying document, independent of the exhibit supplying other rows. */
export interface EarningsFactSource {
  form: string;
  accession: string;
  exhibit: string | null;
  filingDate: string;
  url: string | null;
}
type SourcedEarningsFact<T> = T & { source?: EarningsFactSource };

export interface EarningsReleaseRecord {
  accession: string;
  filingDate: string;
  /** Optional on legacy bundles, whose releases were all ordinary 8-Ks. */
  form?: string;
  /** EDGAR acceptance timestamp, when the submissions row carries one. */
  acceptedAt: string | null;
  releaseUrl: string | null;
  commentaryUrl: string | null;
  /** Original document TYPE spelling; semantic role remains EX-99.1/.2 below. */
  releaseExhibit?: string | null;
  commentaryExhibit?: string | null;
  reported: ReportedPeriod;
  guidance: IssuerGuidance | null;
  /** Supplying document role; releaseExhibit/commentaryExhibit retain its actual type (null for a primary document). */
  guidanceExhibit: "EX-99.1" | "EX-99.2" | null;
  freeCashFlow: SourcedEarningsFact<FreeCashFlowFact>[];
  capitalReturn: CapitalReturnFacts;
  /**
   * D-63: GAAP-to-non-GAAP reconciliation rows (FCF bridge, equity-securities
   * gains, their tax effect, GAAP and non-GAAP diluted EPS) by column, from the
   * release and the commentary. Optional: absent on records stored before it.
   */
  reconciliation?: SourcedEarningsFact<ReconciliationFact>[];
  /** D-63: commitments and guarantees tables (commentary first, then release). */
  commitments?: (SourcedEarningsFact<CommitmentTable> & {
    /** Zero-based parsed-table ordinal within the supplying document. */
    sourceTableIndex?: number;
  })[];
  /** D-63: the exhibit the commitments tables were read from. */
  commitmentsExhibit?: "EX-99.1" | "EX-99.2" | null;
  /** D-63: the issuer's statement of a non-GAAP basis change, when printed. */
  nonGaapBasisNote?: string | null;
  /**
   * D-66: receivables, DSO and its stated reason and outlook from the CFO
   * commentary (else the release), for every release read — the previous
   * quarter's outlook ("We expect our DSO to return to more normal levels next
   * quarter") is the test of the latest quarter's. Optional on older records.
   */
  workingCapital?: WorkingCapitalFacts | null;
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
  /** Present when bounded retention omitted part of the supplying item. */
  truncated?: boolean;
  originalChars?: number;
  /** Typed completed-offering facts read from the full item before text retention. */
  financingFacts?: FilingFact[];
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
  filing: Pick<EdgarFiling, "accessionNumber" | "filingDate" | "acceptanceDateTime"> & Partial<Pick<EdgarFiling, "form">>;
  releaseUrl: string | null;
  commentaryUrl: string | null;
  releaseExhibit?: string | null;
  commentaryExhibit?: string | null;
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
  const releaseExhibit = args.releaseExhibit === undefined ? (args.releaseUrl === null ? null : "EX-99.1") : args.releaseExhibit;
  const commentaryExhibit = args.commentaryExhibit === undefined ? (args.commentaryUrl === null ? null : "EX-99.2") : args.commentaryExhibit;
  const source = (exhibit: "EX-99.1" | "EX-99.2"): EarningsFactSource => ({
    form: filing.form ?? "8-K", accession: filing.accessionNumber, filingDate: filing.filingDate,
    exhibit: exhibit === "EX-99.1" ? releaseExhibit : commentaryExhibit,
    url: exhibit === "EX-99.1" ? args.releaseUrl : args.commentaryUrl,
  });
  const fcfRelease = parseIssuerFreeCashFlow(releaseText).map((fact) => ({ ...fact, source: source("EX-99.1") }));
  return {
    accession: filing.accessionNumber,
    filingDate: filing.filingDate,
    form: filing.form ?? "8-K",
    acceptedAt: filing.acceptanceDateTime ?? null,
    releaseUrl: args.releaseUrl,
    commentaryUrl: args.commentaryUrl,
    releaseExhibit,
    commentaryExhibit,
    reported: reported.fiscal === null && commentaryText !== null ? { ...parseReportedPeriod(commentaryText), periodEnd: reported.periodEnd ?? parseReportedPeriod(commentaryText).periodEnd } : reported,
    guidance,
    guidanceExhibit: guidance === null || guidance.items.length === 0 ? null : guidance === fromRelease ? "EX-99.1" : "EX-99.2",
    freeCashFlow: mergeEarningsObservations(fcfRelease, commentaryText === null ? [] : parseIssuerFreeCashFlow(commentaryText).map((fact) => ({ ...fact, source: source("EX-99.2") }))),
    capitalReturn: parseCapitalReturn(releaseText),
    reconciliation: mergeEarningsObservations(parseReconciliation(releaseText).map((fact) => ({ ...fact, source: source("EX-99.1") })),
      commentaryText === null ? [] : parseReconciliation(commentaryText).map((fact) => ({ ...fact, source: source("EX-99.2") }))),
    ...commitmentsOf(releaseText, commentaryText, source),
    nonGaapBasisNote: parseNonGaapBasisNote(releaseText) ?? (commentaryText === null ? null : parseNonGaapBasisNote(commentaryText)),
    workingCapital: (commentaryText === null ? null : parseWorkingCapital(commentaryText)) ?? parseWorkingCapital(releaseText),
    releaseNarrative: args.includeNarrative ? releaseNarrative(releaseText).slice(0, NARRATIVE_CHARS) : null,
    commentaryNarrative: args.includeNarrative && commentaryText !== null ? releaseNarrative(commentaryText).slice(0, NARRATIVE_CHARS) : null,
  };
}

function commitmentsOf(releaseText: string, commentaryText: string | null, source: (role: "EX-99.1" | "EX-99.2") => EarningsFactSource): Pick<EarningsReleaseRecord, "commitments" | "commitmentsExhibit"> {
  const read = (text: string, role: "EX-99.1" | "EX-99.2") => parseCommitmentTables(text)
    .map((table, sourceTableIndex) => ({ ...table, source: source(role), sourceTableIndex }));
  const supported = (table: CommitmentTable) => table.paymentTiming?.coverage !== "unavailable" &&
    ((table.total !== null && Number.isFinite(table.total)) || table.rows.some(row => Number.isFinite(row.total)));
  const fromCommentary = commentaryText === null ? [] : read(commentaryText, "EX-99.2");
  if (fromCommentary.some(supported)) return { commitments: fromCommentary, commitmentsExhibit: "EX-99.2" };
  const fromRelease = read(releaseText, "EX-99.1");
  return { commitments: [...fromCommentary, ...fromRelease],
    commitmentsExhibit: fromRelease.some(supported) ? "EX-99.1" : fromCommentary.length > 0 ? "EX-99.2" : fromRelease.length > 0 ? "EX-99.1" : null };
}

/** Only identical observations collapse; neither document nor conflicting value wins. */
function mergeEarningsObservations<T extends SourcedEarningsFact<ReconciliationFact | FreeCashFlowFact>>(first: T[], second: T[]): T[] {
  const seen = new Set<string>();
  return [...first, ...second].filter(f => {
    const s = f.source;
    const key = JSON.stringify([f.periodEnd, f.months, f.value, f.symbol,
      "metric" in f ? f.metric : null, "unit" in f ? f.unit : null, "definition" in f ? f.definition : null,
      s?.form, s?.accession, s?.filingDate, s?.exhibit, s?.url]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      text: s.text.slice(0, s.item === "5.02" ? 10_000 : ITEM_TEXT_CHARS),
      incorporates: s.incorporates,
      ...(s.item === "1.01" && s.incorporates === null ? { financingFacts: parseCompletedOfferingFacts(s.text, filing.filingDate) } : {}),
      ...(s.text.length > (s.item === "5.02" ? 10_000 : ITEM_TEXT_CHARS) ? { truncated: true, originalChars: s.text.length } : {}),
    }));
  return { accession: filing.accessionNumber, form: filing.form, filingDate: filing.filingDate, eventDate: eventDateOf(text), items: itemsOf(filing.items), url, sections };
}

/** Recent 8-K filings, newest first, within `windowDays` of `today`. */
function recentEightKs(filings: readonly EdgarFiling[], today: string, windowDays: number, accept: (f: EdgarFiling) => boolean): EdgarFiling[] {
  return filings
    .filter((f) => (f.form === "8-K" || f.form === "8-K/A") && f.filingDate <= today && daysBetween(f.filingDate, today) <= windowDays && accept(f))
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate) || (b.acceptanceDateTime ?? "").localeCompare(a.acceptanceDateTime ?? "") || b.accessionNumber.localeCompare(a.accessionNumber));
}

/** Canonical role only; retained provenance keeps the original document TYPE. */
function earningsExhibitRole(type: string): "release" | "commentary" | null {
  const match = /^EX-99\.0*([12])$/i.exec(type.trim());
  return match?.[1] === "1" ? "release" : match?.[1] === "2" ? "commentary" : null;
}

/** References to an old earnings release do not themselves amend its results. */
function primaryEarningsScope(text: string | null): "earnings" | "unrelated" | "unknown" {
  if (text === null) return "unknown";
  const target = String.raw`(?:(?:the|our|its|previously|furnished|reported|issued|published)\s+){0,7}(?:earnings release|financial results|results of operations)`;
  const direct = new RegExp(String.raw`\b(?:This amendment|This Form 8-K/A|We|The Company)\s+(?:hereby\s+)?(?:amends|amend|corrects|correct|restates|restate|replaces|replace|updates|update)\s+${target}\b`, "i");
  const purpose = new RegExp(String.raw`\bThis amendment\s+is\s+(?:being\s+)?filed\s+(?:(?:solely|only)\s+)?to\s+(?:amend|correct|restate|replace|update)\s+${target}\b`, "i");
  const sentences = splitSentences(text);
  if (sentences.some((sentence) => direct.test(sentence) || purpose.test(sentence))) return "earnings";
  const disclaimsChange = /\b(?:does|do|will)\s+not\s+(?:amend|correct|restate|replace|update)\b[^.!?]{0,140}\b(?:financial results|earnings release|results of operations)\b|\b(?:financial results|earnings release|results of operations)\s+remain(?:s)?\s+unchanged\b/i;
  if (sentences.some((sentence) => disclaimsChange.test(sentence))) return "unrelated";
  return /\bItem\s+2\.02\b|\b(?:earnings release|financial results|results of operations)\b/i.test(text) ? "unknown" : "unrelated";
}

function earningsFilings(filings: readonly EdgarFiling[], today: string, notes: string[]): EdgarFiling[] {
  const recent = recentEightKs(filings, today, RELEASE_WINDOW_DAYS, () => true);
  const candidates = recent.filter((filing, i) => itemsOf(filing.items).includes("2.02") ||
    (filing.form === "8-K/A" && itemsOf(filing.items).includes("9.01") && /^\d{4}-\d{2}-\d{2}$/.test(filing.reportDate) &&
      recent.slice(i + 1).some((earlier) => itemsOf(earlier.items).includes("2.02") && earlier.reportDate === filing.reportDate)));
  // Reserve bounded inspection capacity for linked exhibit amendments. They
  // are candidates, not admitted earnings records, until their text is read.
  if (candidates.length > MAX_EARNINGS_RELEASES * 2) notes.push(`Earnings inspection limited to ${MAX_EARNINGS_RELEASES * 2} candidate filings including linked amendments; older candidates omitted.`);
  return candidates.slice(0, MAX_EARNINGS_RELEASES * 2);
}

/** Reporting-period order, with filing/acceptance order only breaking ties. */
export function orderedEarningsReleases(records: readonly EarningsReleaseRecord[]): EarningsReleaseRecord[] {
  const fiscalOrder = (record: EarningsReleaseRecord): number | null => record.reported.fiscal === null ? null
    : record.reported.fiscal.fiscalYear * 4 + (record.reported.fiscal.fiscalQuarter ?? 4);
  return [...records].sort((a, b) => {
    if (a.reported.periodEnd !== null && b.reported.periodEnd !== null && a.reported.periodEnd !== b.reported.periodEnd) return b.reported.periodEnd.localeCompare(a.reported.periodEnd);
    const af = fiscalOrder(a), bf = fiscalOrder(b);
    if (af !== null && bf !== null && af !== bf) return bf - af;
    if ((af !== null) !== (bf !== null)) return af === null ? 1 : -1;
    return b.filingDate.localeCompare(a.filingDate) || (b.acceptedAt ?? "").localeCompare(a.acceptedAt ?? "") || b.accession.localeCompare(a.accession);
  });
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
  const amendedEvents = new Map<string, EdgarFiling>();

  const earnings = earningsFilings(filings, today, notes);
  for (const filing of earnings) {
    const event = /^\d{4}-\d{2}-\d{2}$/.test(filing.reportDate) ? filing.reportDate : null;
    const amendment = event === null ? undefined : amendedEvents.get(event);
    if (amendment) {
      notes.push(`${filing.form} ${filing.accessionNumber} (${filing.filingDate}) superseded for earnings by 8-K/A ${amendment.accessionNumber} (${amendment.filingDate}); original values are not substituted for unreadable amended evidence.`);
      continue;
    }
    const linkedExhibitAmendment = !itemsOf(filing.items).includes("2.02");
    // Withhold the original while linked amendment scope is unknown. Only a
    // readable, unrelated primary/exhibit permits restoring that original.
    if (filing.form === "8-K/A" && event !== null) amendedEvents.set(event, filing);
    attempted += 1;
    const problem = filingProblem(edgar, cik, filing);
    if (problem !== null) {
      notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}) not read: ${problem}`);
      continue;
    }
    const indexResult = await indexOf(edgar, cik, filing.accessionNumber);
    if (typeof indexResult === "string") notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}): exhibit index unreadable (${indexResult})`);
    const index: FilingIndex = typeof indexResult === "string" ? { documents: [], typeByFilename: {} } : indexResult;
    let primary = linkedExhibitAmendment ? await fetchText(edgar, cik, filing, filing.primaryDocument) : null;
    const primaryText = primary !== null && typeof primary !== "string" ? plain(primary.text) : null;
    const primaryScope = primaryEarningsScope(primaryText);
    const releaseDoc = index.documents.find((d) => earningsExhibitRole(d.type) === "release") ??
      findDocumentByType({ ...index, documents: index.documents.filter((d) => earningsExhibitRole(d.type) !== "commentary") }, "EX-99");
    const commentaryDoc = index.documents.find((d) => earningsExhibitRole(d.type) === "commentary") ?? null;
    if (!releaseDoc && !commentaryDoc) {
      if (linkedExhibitAmendment && typeof indexResult !== "string" && primaryScope === "unrelated" && event !== null) {
        amendedEvents.delete(event);
        notes.push(`8-K/A ${filing.accessionNumber}: linked Item 9.01 amendment supplies no earnings scope or EX-99 exhibit; original earnings evidence retained.`);
        continue;
      }
      if (typeof indexResult !== "string") notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}): Item 2.02 filing furnishes no EX-99 exhibit`);
    }
    let releaseText = "";
    let releaseUrl: string | null = null;
    if (releaseDoc) {
      const release = await fetchText(edgar, cik, filing, releaseDoc.filename);
      if (typeof release === "string") notes.push(`8-K ${filing.accessionNumber} EX-99 (${releaseDoc.filename}) unreadable: ${release}`);
      else { releaseText = plain(release.text); releaseUrl = release.url; fetchedAt ??= release.fetchedAt; }
    }
    let commentaryText: string | null = null;
    let commentaryUrl: string | null = null;
    if (commentaryDoc) {
      const commentary = await fetchText(edgar, cik, filing, commentaryDoc.filename);
      if (typeof commentary === "string") notes.push(`8-K ${filing.accessionNumber} EX-99.2 (${commentaryDoc.filename}) unreadable: ${commentary}`);
      else { commentaryText = plain(commentary.text); commentaryUrl = commentary.url; fetchedAt ??= commentary.fetchedAt; }
    }
    let primaryAlternative = false;
    if (releaseUrl === null && commentaryUrl === null) {
      // The cover may itself contain the earnings disclosure. Read it once
      // when exhibits cannot supply evidence; an exhibit reference alone
      // never establishes guidance or any reported value.
      primary ??= await fetchText(edgar, cik, filing, filing.primaryDocument);
      if (typeof primary === "string") {
        notes.push(`8-K ${filing.accessionNumber}: primary document alternative unreadable: ${primary}`);
        continue;
      }
      const text = plain(primary.text);
      if ((parseGuidance(text)?.items.length ?? 0) === 0 && parseReportedPeriod(text).fiscal === null && parseIssuerFreeCashFlow(text).length === 0) {
        notes.push(`8-K ${filing.accessionNumber}: primary document alternative contained no readable earnings facts; exhibits remain unavailable.`);
        continue;
      }
      releaseText = text;
      releaseUrl = primary.url;
      fetchedAt ??= primary.fetchedAt;
      primaryAlternative = true;
      notes.push(`8-K ${filing.accessionNumber}: primary document used as an alternative to unavailable earnings exhibits.`);
    }
    const record = buildEarningsReleaseRecord({
      filing,
      releaseUrl,
      commentaryUrl,
      releaseExhibit: primaryAlternative ? null : releaseDoc?.type.trim() ?? null,
      commentaryExhibit: commentaryDoc?.type.trim() ?? null,
      releaseText,
      commentaryText,
      includeNarrative: true,
    });
    if (linkedExhibitAmendment) {
      const exhibits = [releaseText, commentaryText ?? ""];
      const exhibitEarnings = exhibits.some((text) => parseReportedPeriod(text).fiscal !== null && /\b(?:financial results|earnings|CFO commentary)\b/i.test(text.slice(0, 6_000)));
      const parsedEarnings = record.reported.fiscal !== null || record.reported.periodEnd !== null || record.freeCashFlow.length > 0 ||
        (record.reconciliation?.length ?? 0) > 0 || (record.guidance?.items.length ?? 0) > 0;
      if (!(exhibitEarnings || primaryScope === "earnings") || !parsedEarnings) {
        const allRead = typeof indexResult !== "string" && (releaseDoc === null || releaseDoc === undefined || releaseUrl !== null) && (commentaryDoc === null || commentaryUrl !== null);
        if (primaryScope === "unrelated" && allRead && event !== null) {
          amendedEvents.delete(event);
          notes.push(`8-K/A ${filing.accessionNumber}: readable linked Item 9.01 primary/exhibits contain no earnings scope; original earnings evidence retained.`);
        } else notes.push(`8-K/A ${filing.accessionNumber}: linked Item 9.01 earnings scope remains unestablished; corresponding original withheld.`);
        continue;
      }
    }
    const guidance = record.guidance;
    if (guidance === null) notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}): no outlook section was found in the release or commentary`);
    else if (guidance.items.length === 0) notes.push(`8-K ${filing.accessionNumber} (${filing.filingDate}): an outlook section was found but none of its sentences could be read as guidance`);
    for (const sentence of guidance?.unparsed ?? []) notes.push(`8-K ${filing.accessionNumber}: outlook sentence not read as guidance: "${sentence}"`);
    releases.push(record);
  }
  const ordered = orderedEarningsReleases(releases).slice(0, MAX_EARNINGS_RELEASES);
  releases.splice(0, releases.length, ...ordered.map((record, i) => i === 0 ? record : { ...record, releaseNarrative: null, commentaryNarrative: null }));
  if (earnings.length === 0) notes.push(`no Item 2.02 (results) 8-K among the filings of the last ${RELEASE_WINDOW_DAYS} days`);

  const annual = filings.filter((f) => ["10-K", "20-F", "40-F"].includes(f.form) && /^\d{4}-\d{2}-\d{2}$/.test(f.filingDate) && f.filingDate <= today)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))[0];
  const eventWindow = annual === undefined ? EVENT_WINDOW_DAYS : daysBetween(annual.filingDate, today);
  const eventCandidates = recentEightKs(filings, today, eventWindow, (f) => hasMaterialEventItem(f.items));
  const eventFilings = eventCandidates.slice(0, MAX_EVENT_FILINGS);
  if (eventCandidates.length > eventFilings.length) notes.unshift(`Material-event reads limited to ${MAX_EVENT_FILINGS} of ${eventCandidates.length} filings since ${annual?.filingDate ?? `${EVENT_WINDOW_DAYS} days before ${today}`}; omitted unread evidence: ${eventCandidates.slice(MAX_EVENT_FILINGS).map((f) => `${f.accessionNumber} (${f.filingDate}; Items ${f.items ?? "unknown"})`).join("; ")}.`);
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
    for (const section of event.sections.filter((s) => s.truncated)) notes.push(`8-K ${filing.accessionNumber} Item ${section.item}: retained ${section.text.length} of ${section.originalChars} source characters; omitted officer/event terms remain unreviewed.`);
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
    data: { ...series, notes: [...series.notes, ...problems] },
    asOf: series.quarters[0]!.end,
    source: "edgar",
    endpoint: `${endpoint ?? "edgar"} (+${read.length - 1} earlier periodic XBRL instance(s): segment revenue)`,
    fetchedAt: fetchedAt ?? `${today}T00:00:00.000Z`,
  };
  return { ok: true, value };
}
