import type { DataBundle } from "@/pipeline/types";
import type { OfficialIrDocument } from "@/providers/companyIrDocuments";
import type { TextExcerpt } from "@/pipeline/stageC/payload";
import { selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";
import { isIsoDate } from "@/pipeline/stageC/provenance";

const DAY = 86_400_000;
const HASH = /^[a-f0-9]{64}$/;
function https(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.hash && (!u.port || u.port === "443") ? u.href : null;
  } catch { return null; }
}
function observationFits(publishedAt: string, observedAt: string, fetchedAt: string, today: string, maxDays: number): boolean {
  const day = publishedAt.slice(0, 10);
  return isIsoDate(day) && day <= today && Date.parse(today) - Date.parse(day) <= maxDays * DAY &&
    Number.isFinite(Date.parse(publishedAt)) && Number.isFinite(Date.parse(observedAt)) && Number.isFinite(Date.parse(fetchedAt)) &&
    // Cached SEC documents were fetched before this collection observed them;
    // issuer discovery starts its observation before its requests finish.
    Date.parse(publishedAt) <= Math.min(Date.parse(observedAt), Date.parse(fetchedAt)) &&
    observedAt.slice(0, 10) <= today && fetchedAt.slice(0, 10) <= today;
}

function proxyCutoff(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 18, 1));
  const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  month.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return month.toISOString().slice(0, 10);
}

/** Recheck retained collection evidence against this bundle; no network or inferred authority. */
function issuerDocuments(bundle: DataBundle): OfficialIrDocument[] {
  const result = bundle.companyIrDocuments;
  const website = bundle.profile.ok ? bundle.profile.value.data.rows[0]?.website : null;
  const verifiedWebsite = typeof website === "string" ? https(website) : null;
  if (!result?.ok || result.value.source !== "computed" || result.value.endpoint !== "company-ir:documents" || !verifiedWebsite) return [];
  return result.value.data.filter(d => HASH.test(d.sourceHash) && https(d.url) === d.url &&
    d.authorityChain.length >= 1 && https(d.authorityChain[0]!) === verifiedWebsite &&
    d.authorityChain.at(-1) === d.url && d.authorityChain.every(url => https(url) !== null) &&
    d.originalChars === d.text.length && d.text.trim().length > 0 &&
    observationFits(d.publishedAt, d.observedAt, result.value.fetchedAt, bundle.builtAt.slice(0, 10), d.kind === "press-release" ? 30 : 180))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.url.localeCompare(b.url));
}

function issuerExcerpt(document: OfficialIrDocument, budget: number): TextExcerpt {
  const selected = selectMaterialEvidence(document.text, budget);
  return {
    title: `Official ${document.kind === "earnings-transcript" ? "earnings-call transcript" : "company press release"}: ${document.title} (published ${document.publishedAt.slice(0, 10)}; bounded public-document discovery)`,
    source: document.url, asOf: document.publishedAt.slice(0, 10), ...selected,
    sourceEvidence: { kind: "issuer-statement", publishedAt: document.publishedAt, observedAt: document.observedAt,
      sourceHash: document.sourceHash, authorityChain: document.authorityChain },
  };
}

export function publicTranscriptExcerpt(bundle: DataBundle, budget: number): TextExcerpt | null {
  const document = issuerDocuments(bundle).find(d => d.kind === "earnings-transcript");
  return document ? issuerExcerpt(document, budget) : null;
}

export function publicDocumentExcerpts(bundle: DataBundle): TextExcerpt[] {
  const out = issuerDocuments(bundle).filter(d => d.kind === "press-release").slice(0, 3).map(d => issuerExcerpt(d, 6_000));
  const result = bundle.publicGovernance;
  if (!result?.ok || result.value.source !== "edgar") return out;
  const d = result.value.data;
  const today = bundle.builtAt.slice(0, 10);
  if (!isIsoDate(today)) return out;
  const cik = bundle.edgar.cik?.ok ? bundle.edgar.cik.value.data.cik10 : bundle.edgar.registrant?.cik10;
  const url = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/([A-Za-z0-9._-]+\.html?)$/.exec(d.documentUrl);
  if (!cik || d.cik !== cik || d.form !== "DEF 14A" || !/^\d{10}-\d{2}-\d{6}$/.test(d.accession) ||
      !url || Number(url[1]) !== Number(cik) || url[2] !== d.accession.replaceAll("-", "") || result.value.endpoint !== d.documentUrl ||
      result.value.asOf !== d.filingDate || !HASH.test(d.sourceHash) ||
      !observationFits(d.filingDate, d.observedAt, result.value.fetchedAt, today, 550) || d.filingDate < proxyCutoff(today) ||
      // A proxy reportDate may be a future shareholder meeting. Availability
      // follows the filing date; the source table defines the compensation year.
      (d.reportDate !== null && !isIsoDate(d.reportDate))) return out;
  for (const [label, excerpt] of [["annual compensation", d.compensation], ["beneficial ownership", d.beneficialOwnership]] as const) {
    if (!excerpt || excerpt.text.trim().length === 0 || excerpt.text.length !== excerpt.originalChars || excerpt.text.length > 20_000) continue;
    // Whole bounded source tables and their local qualifiers survive intact.
    // Raw HTML offsets remain in the bundle; these spans address retained text.
    out.push({ title: `DEF 14A ${label}: ${excerpt.caption} (${d.accession}; filed ${d.filingDate}; annual proxy evidence, not a complete holdings or compensation feed)`,
      source: d.documentUrl, asOf: d.filingDate, text: excerpt.text, originalChars: excerpt.originalChars, truncated: false,
      spans: [{ start: 0, end: excerpt.text.length, text: excerpt.text }],
      coverage: { version: "public-proxy-excerpt-1", retainedChars: excerpt.text.length, omittedChars: 0, categories: [] },
      sourceEvidence: { kind: "sec-filing", publishedAt: d.filingDate, observedAt: d.observedAt,
        sourceHash: d.sourceHash, authorityChain: [d.documentUrl] } });
  }
  return out;
}
