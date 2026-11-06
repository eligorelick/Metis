import { createHash } from "node:crypto";
import { companyIrLinks, createCompanyIrReader, safeCompanyIrUrl, type CompanyIrOptions } from "@/providers/companyIr";
import type { ConfirmedIssuerIdentity } from "@/providers/companyEvents";
import { decodeEntities, htmlToText, stripHiddenBlocks } from "@/edgar/extract";
import type { ManifestEntry } from "@/types/core";

export interface OfficialIrDocument {
  kind: "press-release" | "earnings-transcript";
  title: string;
  url: string;
  publishedAt: string;
  observedAt: string;
  sourceHash: string;
  authorityChain: string[];
  text: string;
  originalChars: number;
  /** Explicitly printed in this document's title; never inferred from a date. */
  fiscalYear?: number;
  quarter?: 1 | 2 | 3 | 4;
}

type Needs = { pressReleases: boolean; transcript: boolean };
type Page = { url: string; chain: string[]; stage: "company" | "ir" | "index" | "event" | "document"; kindHint?: OfficialIrDocument["kind"]; indexedDocument?: boolean };
const DAY_MS = 86_400_000;
const MAX_DOCUMENTS = 4;

function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"))?.slice(1).find(v => v !== undefined)?.trim() ?? null;
}

function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function publicationValue(value: string): string | null {
  const raw = decodeEntities(value).trim();
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/i.test(raw)) {
    return validDay(raw.slice(0, 10)) && Number.isFinite(Date.parse(raw)) ? raw : null;
  }
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/.exec(raw);
  if (numeric) {
    const first = Number(numeric[1]), second = Number(numeric[2]);
    // An issuer's address does not establish whether 11/05 means May 11 or
    // November 5. Withhold that date instead of changing the freshness window.
    if (first <= 12 && second <= 12 && first !== second) return null;
    const day = `${numeric[3]}-${numeric[1]!.padStart(2, "0")}-${numeric[2]!.padStart(2, "0")}`;
    return validDay(day) ? day : null;
  }
  const named = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})$/i.exec(raw);
  if (!named) return null;
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const day = `${named[3]}-${String(months.indexOf(named[1]!.toLowerCase()) + 1).padStart(2, "0")}-${named[2]!.padStart(2, "0")}`;
  return validDay(day) ? day : null;
}

/** Only publication-labelled evidence counts. Event times and search ages do not. */
function publishedAt(html: string, article: { title: string; html: string }, url: string): string | null {
  const values: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = attribute(tag, "property") ?? attribute(tag, "name");
    if (/^(?:article:published_time|datePublished|pubdate|publication-date|publish-date|DC.date.issued)$/i.test(name ?? "")) values.push(attribute(tag, "content") ?? "");
  }
  for (const match of article.html.matchAll(/<time\b([^>]*)>([\s\S]*?)<\/time>/gi)) {
    if (/^datePublished$/i.test(attribute(match[1]!, "itemprop") ?? "")) values.push(attribute(match[1]!, "datetime") ?? htmlToText(match[2]!));
  }
  for (const match of article.html.matchAll(/<(?:div|span|p)\b([^>]*)>([^<]+)<\/(?:div|span|p)>/gi)) {
    if (/(?:^|\s)(?:news-details[_-]date|publish(?:ed)?[_-]date|release[_-]date)(?:\s|$)/i.test(attribute(match[1]!, "class") ?? "")) values.push(match[2]!);
  }
  for (const match of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].slice(0, 30)) {
    if (attribute(match[1]!, "type")?.toLowerCase() !== "application/ld+json" || match[2]!.length > 100_000) continue;
    try {
      const root: unknown = JSON.parse(match[2]!);
      const candidates: unknown[] = Array.isArray(root) ? root.slice(0, 30) : [root];
      if (root && typeof root === "object" && "@graph" in root && Array.isArray(root["@graph"])) candidates.push(...root["@graph"].slice(0, 30));
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object" || !("@type" in candidate) || !("datePublished" in candidate)) continue;
        if ("headline" in candidate && (typeof candidate.headline !== "string" || htmlToText(candidate.headline).toLowerCase() !== article.title.toLowerCase())) continue;
        if (!("headline" in candidate)) {
          const mainPage = "mainEntityOfPage" in candidate ? candidate.mainEntityOfPage : undefined;
          const references = ["url" in candidate ? candidate.url : undefined,
            typeof mainPage === "string" ? mainPage : mainPage && typeof mainPage === "object" && "@id" in mainPage ? mainPage["@id"] : undefined];
          if (!references.some(reference => typeof reference === "string" && safeCompanyIrUrl(reference, url)?.toString() === url)) continue;
        }
        const kinds = Array.isArray(candidate["@type"]) ? candidate["@type"] : [candidate["@type"]];
        if (kinds.some(kind => typeof kind === "string" && /^(?:NewsArticle|Article|PressRelease|BlogPosting|Report)$/i.test(kind)) && typeof candidate.datePublished === "string") values.push(candidate.datePublished);
      }
    } catch { /* Malformed structured metadata never supplies a publication date. */ }
  }
  if (!values.length) return null;
  const parsed = values.map(publicationValue);
  if (parsed.some(value => value === null) || new Set(parsed.map(value => value!.slice(0, 10))).size !== 1) return null;
  return parsed.find(value => value!.includes("T")) ?? parsed[0]!;
}

function articleContent(html: string): { title: string; text: string; html: string } | null {
  const source = html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ");
  // Reuse the balanced hidden-element removal for HTML's hidden attribute and
  // aria-hidden content too. Attribute tokenization keeps quoted words and
  // data-hidden attributes from turning visible article content into a stub.
  const hiddenMarked = source.replace(/<[a-zA-Z][^>]*>/g, tag => {
    const hidden = [...tag.matchAll(/\s([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].some(match => {
      const name = match[1]!.toLowerCase();
      return name === "hidden" || (name === "aria-hidden" && decodeEntities(match[2] ?? match[3] ?? match[4] ?? "").toLowerCase() === "true");
    });
    return hidden ? tag.replace(/^<([^\s/>]+)/, '<$1 style="display:none"') : tag;
  });
  const visible = stripHiddenBlocks(hiddenMarked);
  const scoped = visible.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? visible.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const main = scoped ?? visible.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? visible;
  const withoutNavigation = main.replace(/<(nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const content = scoped === undefined ? withoutNavigation.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ") : withoutNavigation;
  const title = htmlToText(content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  if (title.length < 8 || title.length > 350) return null;
  // Preserve block boundaries so an actual speaker turn remains distinguishable
  // from a sentence mentioning a speaker or a menu linking to a transcript.
  const text = content.split(/<\/(?:p|div|section|h[1-6]|li|tr)>|<br\s*\/?\s*>/gi).map(htmlToText).filter(Boolean).join("\n");
  return text.length >= 180 ? { title, text, html: content } : null;
}

function issuerAliases(issuer: ConfirmedIssuerIdentity): string[] {
  const name = issuer.canonicalName.trim();
  const core = name.replace(/,?\s+(?:incorporated|inc|corporation|corp|limited|ltd|plc|llc)\.?$/i, "");
  return [...new Set([name, name.replace(/,\s*(?=(?:inc|corp|ltd)\.?$)/i, " "), ...(core.split(/\s+/).length > 1 ? [core] : []), ...(issuer.validAliases ?? [])])].filter(alias => alias.length >= 3);
}

function namesIssuer(title: string, issuer: ConfirmedIssuerIdentity): boolean {
  return issuerAliases(issuer).some(alias => new RegExp(`(?:^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(title));
}

function transcriptContent(title: string, text: string): boolean {
  if (!/\btranscript\b/i.test(title) || !/\b(?:earnings|results|conference)\s+call\b/i.test(`${title}\n${text.slice(0, 1500)}`) || text.length < 450) return false;
  if (!/\bquestions?\s*(?:and|&|-)\s*answers?\b|\bQ\s*&\s*A\b/i.test(text)) return false;
  const speakers = text.split("\n").filter(line => /^(?:[A-Z][A-Za-z.'’-]+\s+){1,4}[A-Z][A-Za-z.'’-]+(?:\s*[-–—,]\s*[^:]{2,90})?:$/.test(line.trim()) && line.trim().length < 130);
  return new Set(speakers.map(s => s.replace(/\s*[-–—,].*|:$/g, "").trim())).size >= 2;
}

/** Read only the document's explicit title label, never a comparison or date. */
function fiscalTitle(title: string): Pick<OfficialIrDocument, "fiscalYear" | "quarter"> {
  const labels: { quarter: 1 | 2 | 3 | 4; fiscalYear: number }[] = [];
  for (const match of title.matchAll(/\bQ([1-4])\s*(?:FY\s*|fiscal\s+(?:year\s+)?)?(20\d{2})\b|\b(First|Second|Third|Fourth)[ -]Quarter(?:\s+of)?\s+(?:Fiscal\s+(?:Year\s+)?)?(20\d{2})\b/gi)) {
    labels.push({ quarter: (match[1] ? Number(match[1]) : ["first", "second", "third", "fourth"].indexOf(match[3]!.toLowerCase()) + 1) as 1 | 2 | 3 | 4, fiscalYear: Number(match[2] ?? match[4]) });
  }
  return labels.length && labels.every(label => label.quarter === labels[0]!.quarter && label.fiscalYear === labels[0]!.fiscalYear) ? labels[0]! : {};
}

const PRESS_HEADLINE = /\b(?:announc(?:e|es|ed|ing)|reports?|results|launches?|acquir(?:e[sd]?|ing)|appoint(?:s|ed)?|declares?|introduces?|unveils?)\b/i;
const REPORT_NAVIGATION = /^(?:20\d{2}\s+)?(?:(?:annual|quarterly|financial|integrated|sustainability|responsibility|esg)\s+)?reports?(?:\s*(?:&|and)\s*(?:proxies|proxy statements?))?(?:\s+(?:archive|library))?(?:\s+20\d{2})?\s*$/i;
const NEWS_INDEX = /^(?:latest\s+)?(?:news(?:room)?|press releases?|news (?:and|&) press releases?|news (?:and|&) events)\s*$/i;
const EVENTS_INDEX = /^(?:events?(?:\s+(?:and|&)\s+presentations?)?|presentations?|quarterly results|financial results|earnings(?:\s+(?:and|&)\s+events)?)\s*$/i;

/**
 * One public HTML discovery pass: six requests including redirects, twelve
 * seconds, one MB per response, and at most three releases plus one call.
 * Search snippets, inferred hosts, PDF text and generated substitutes are not
 * evidence. Each hosted-IR hop must be an actual link from an admitted page.
 */
export async function discoverCompanyIrDocuments(
  website: string,
  symbol: string,
  today: string,
  opts: CompanyIrOptions & { needs: Needs },
): Promise<{ documents: OfficialIrDocument[]; gaps: ManifestEntry[] }> {
  const documents: OfficialIrDocument[] = [];
  const gaps: ManifestEntry[] = [];
  const attempted: string[] = [];
  const gap = (reason: string, urls: string[] = attempted, field = "companyIrDocuments") => {
    if (gaps.length < 16) gaps.push({ field, reason, severity: "info", expected: true, attemptedSources: [...urls] });
  };
  if (!opts.needs.pressReleases && !opts.needs.transcript) return { documents, gaps };
  const seed = safeCompanyIrUrl(website);
  const verified = opts.issuer ? safeCompanyIrUrl(opts.issuer.verifiedWebsite) : null;
  if (!seed || !verified || !opts.issuer?.canonicalName.trim() || seed.hostname.replace(/^www\./, "") !== verified.hostname.replace(/^www\./, "") || !validDay(today)) {
    gap("Official documents unavailable: a confirmed issuer and matching public HTTPS website are required.", []);
    return { documents, gaps };
  }
  const issuer = opts.issuer;
  const officialHost = verified.hostname.replace(/^www\./, "");
  const sameIssuerHost = (url: string) => { const host = new URL(url).hostname; return host === officialHost || host.endsWith(`.${officialHost}`); };
  const reader = createCompanyIrReader(opts);
  const observedAt = (opts.now ?? (() => new Date()))().toISOString();
  const seedIsIr = /(?:^|\.)(?:ir|investors?)\./i.test(seed.hostname) || /\/investor(?:s|-relations)?(?:\/|$)/i.test(seed.pathname);
  const queue: Page[] = [{ url: seed.toString(), chain: [seed.toString()], stage: seedIsIr ? "ir" : "company" }];
  const seen = new Set<string>();
  const priority = (page: Page): number => page.stage !== "document" ? 1
    : page.indexedDocument && page.kindHint && !documents.some(document => document.kind === page.kindHint) ? 0 : 2;
  while (queue.length && reader.requests < 6 && !reader.signal.aborted && documents.length < MAX_DOCUMENTS) {
    // A document discovered in a content index gets the next request while
    // its evidence type is missing. Keep relevant indexes ahead of extra
    // same-kind documents and undated IR-homepage candidates.
    queue.sort((a, b) => priority(a) - priority(b));
    const page = queue.shift()!;
    if (seen.has(page.url)) continue;
    seen.add(page.url);
    attempted.push(page.url);
    try {
      const response = await reader.read(page.url);
      if (response.finalUrl !== page.url) {
        page.url = response.finalUrl;
        page.chain = [...page.chain, page.url];
        seen.add(page.url);
        attempted.push(page.url);
      }
      if (!response.ok) { gap(`Official document unavailable: HTTP ${response.status}; blocked responses and cross-origin redirects are not bypassed.`, [page.url]); continue; }
      const mime = response.headers.get("content-type") ?? "";
      if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(mime) || /^\s*%PDF/.test(response.bodyText)) {
        gap(/pdf/i.test(mime) || /^\s*%PDF/.test(response.bodyText) ? "PDF document unsupported: no safe PDF text reader is configured; the link supplies no transcript or release facts." : "Document format unsupported: only public HTML articles are read.", [page.url]);
        continue;
      }
      if (page.stage !== "company") {
        const article = articleContent(response.bodyText);
        if (article && namesIssuer(article.title, issuer)) {
          const isTranscript = /\btranscript\b/i.test(article.title);
          const kind = isTranscript ? (opts.needs.transcript && transcriptContent(article.title, article.text) ? "earnings-transcript" : null)
            : opts.needs.pressReleases && PRESS_HEADLINE.test(article.title) && !/\b(?:webcast|presentation|prepared remarks)\b/i.test(article.title) ? "press-release" : null;
          if (kind) {
            const publication = publishedAt(response.bodyText, article, page.url);
            const day = publication?.slice(0, 10);
            const maxAgeDays = kind === "press-release" ? 30 : 180;
            if (!publication || !day || day > today || Date.parse(publication) > Date.parse(observedAt) || Date.parse(today) - Date.parse(day) > maxAgeDays * DAY_MS) {
              gap(`Official ${kind} withheld: publication evidence is missing, conflicting, invalid, future-dated or outside the ${maxAgeDays}-day window.`, [page.url]);
            } else if (kind === "press-release" ? documents.filter(d => d.kind === kind).length < 3 : !documents.some(d => d.kind === kind)) {
              documents.push({ kind, title: article.title, url: page.url, publishedAt: publication, observedAt, sourceHash: createHash("sha256").update(response.bodyText).digest("hex"), authorityChain: page.chain,
                text: article.text, originalChars: article.text.length, ...(kind === "earnings-transcript" ? fiscalTitle(article.title) : {}) });
            }
          } else if (isTranscript && opts.needs.transcript) gap("Earnings transcript unavailable: the fetched article did not establish speaker-labelled call content and a question-and-answer section; prepared remarks or download notices are not substituted.", [page.url]);
        }
      }
      const all = companyIrLinks(response.bodyText, page.url).map(link => ({ ...link, text: decodeEntities(link.text) }));
      const add = (link: { url: string; text: string }, stage: Page["stage"], kindHint?: OfficialIrDocument["kind"]) => {
        if (seen.has(link.url)) return;
        const indexedDocument = page.stage === "index" || page.stage === "event";
        const queued = queue.find(candidate => candidate.url === link.url);
        if (queued) {
          if (queued.stage === "document" && stage === "document" && indexedDocument) {
            queued.indexedDocument = true;
            queued.kindHint ??= kindHint;
          }
          return;
        }
        if (/\.(?:pdf|docx?|pptx?|xlsx?|zip)(?:$|\?)/i.test(link.url)) {
          gap(/\.pdf(?:$|\?)/i.test(link.url) ? "PDF document unsupported: no safe PDF text reader is configured; this discovered link is diagnostic only." : "Document format unsupported: this discovered link is diagnostic only.", [link.url]);
          seen.add(link.url);
          return;
        }
        if (queue.length < 12) queue.push({ url: link.url, chain: [...page.chain, link.url], stage, kindHint, indexedDocument });
      };
      // Issuer pages often link PDFs on a separate document CDN. Keep that
      // explicit link as a diagnostic without fetching or trusting its content.
      all.filter(link => /\.pdf(?:$|\?)/i.test(link.url) && ((opts.needs.transcript && /\btranscript\b/i.test(link.text)) ||
        (opts.needs.pressReleases && PRESS_HEADLINE.test(link.text)))).slice(0, 3).forEach(link => add(link, "document"));
      if (page.stage === "company") {
        const ir = all.find(link => /\binvestor(?:s| relations)?\b/i.test(link.text));
        if (ir) add(ir, "ir");
        if (opts.needs.pressReleases) all.filter(link => sameIssuerHost(link.url) && NEWS_INDEX.test(link.text)).slice(0, 1).forEach(link => add(link, "index"));
        continue;
      }
      const local = all.filter(link => new URL(link.url).origin === new URL(page.url).origin);
      if (page.stage === "ir") {
        if (opts.needs.pressReleases) local.filter(link => NEWS_INDEX.test(link.text)).slice(0, 1).forEach(link => add(link, "index"));
        if (opts.needs.transcript) local.filter(link => EVENTS_INDEX.test(link.text)).slice(0, 1).forEach(link => add(link, "index"));
      }
      if (opts.needs.transcript && !documents.some(d => d.kind === "earnings-transcript")) {
        local.filter(link => /\btranscript\b/i.test(link.text)).slice(0, 2).forEach(link => add(link, "document", "earnings-transcript"));
        if (page.stage !== "document" && page.stage !== "event") local.filter(link => /\b(?:earnings|results|conference)\s+(?:call|webcast)\b/i.test(link.text) && !/\btranscript\b/i.test(link.text)).slice(0, 1).forEach(link => add(link, "event"));
      }
      if (opts.needs.pressReleases && page.stage !== "document" && documents.filter(d => d.kind === "press-release").length < 3) {
        local.filter(link => PRESS_HEADLINE.test(link.text) && !REPORT_NAVIGATION.test(link.text) && !NEWS_INDEX.test(link.text) && !EVENTS_INDEX.test(link.text) && !/\b(?:transcript|webcast|presentation|call)\b/i.test(link.text)).slice(0, 3).forEach(link => add(link, "document", "press-release"));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 200) : "request failed";
      gap(`Official document unavailable: ${reason}.`, [page.url]);
    }
  }
  documents.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.url.localeCompare(b.url));
  if (opts.needs.pressReleases && !documents.some(d => d.kind === "press-release")) gap(`No recent issuer press release was retained for ${symbol}; unread or unsupported pages remain unavailable.`, attempted, "companyIrDocuments.pressReleases");
  if (opts.needs.transcript && !documents.some(d => d.kind === "earnings-transcript")) gap(`No genuine recent earnings-call transcript was retained for ${symbol}; transcript evidence remains unavailable.`, attempted, "companyIrDocuments.transcript");
  gap("Bounded official-site discovery is not comprehensive coverage; absence of retained documents does not establish that no releases or transcripts exist.", attempted, "companyIrDocuments.coverage");
  return { documents, gaps };
}
