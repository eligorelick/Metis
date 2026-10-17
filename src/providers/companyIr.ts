import type { FmpEarningsRow } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";

export interface CompanyIrOptions { issuer?: ConfirmedIssuerIdentity; now?: () => Date; lookup?: (hostname: string) => Promise<{ address: string; family: number }[]>; fetchImpl?: typeof fetch; signal?: AbortSignal }

function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return a > 0 && a < 224 && a !== 10 && a !== 127 && !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && [0, 168].includes(b)) && !(a === 198 && [18, 19, 51].includes(b)) && !(a === 203 && b === 0);
  }
  // Global unicast only; mapped IPv4, unique/link-local, multicast, transition
  // tunnels and documentation space cannot target local services through IPv6.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^(?:2001:(?:0{0,4}:|0?db8:)|2002:|3fff:)/i.test(address);
}
function safeUrl(raw: string, base?: string): URL | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "https:" || u.username || u.password || u.port || isIP(u.hostname.replace(/^\[|\]$/g, "")) || !u.hostname.includes(".") || /\.(?:local|localhost|internal|invalid|test)$/i.test(u.hostname)) return null;
    u.hash = "";
    return u;
  } catch { return null; }
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Pin the validated public address, preventing a second DNS lookup/rebinding. */
function pinnedFetch(url: string, init: RequestInit | undefined, target: { address: string; family: number }): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", signal: init?.signal ?? undefined, family: target.family, lookup: (_hostname, _options, cb) => cb(null, target.address, target.family), headers: { "User-Agent": "MetisResearch/1.0 (public investor-relations announcement discovery)", Accept: "text/html,application/xhtml+xml" } }, (res) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      resolve(new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status: res.statusCode ?? 500, headers }));
    });
    req.once("error", reject);
    req.end();
  });
}
function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]?.replace(/&amp;/g, "&") ?? null;
}
function visiblePublicationDateline(html: string): string | null {
  return html.match(/<(?:div|span|p)\b[^>]*class=["'][^"']*(?:news-details[_-]date|publish(?:ed)?[_-]date|release[_-]date)[^"']*["'][^>]*>([^<]+)</i)?.[1]?.trim() ?? null;
}
function publicationDate(html: string): string | null {
  for (const meta of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (/^(?:article:published_time|datePublished|date|pubdate|publish-date|DC.date.issued)$/i.test(attribute(meta, "property") ?? attribute(meta, "name") ?? "")) return attribute(meta, "content");
  }
  const structured = html.match(/["']datePublished["']\s*:\s*["']([^"']+)/i)?.[1] ?? html.match(/<time\b[^>]*datetime=["']([^"']+)/i)?.[1];
  if (structured) return structured;
  const explicit = visiblePublicationDateline(html);
  if (!explicit) return null;
  const numeric = explicit.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  if (numeric) return `${numeric[3]}-${numeric[1]!.padStart(2, "0")}-${numeric[2]!.padStart(2, "0")}`;
  const parsed = Date.parse(explicit);
  return Number.isFinite(parsed) && /\b20\d{2}\b/.test(explicit) ? new Date(parsed).toISOString().slice(0, 10) : null;
}
interface Link { url: string; text: string }
function links(html: string, base: string): Link[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, 1500).flatMap((m) => {
    const href = attribute(m[1]!, "href");
    const u = href ? safeUrl(href, base) : null;
    return u ? [{ url: u.toString(), text: m[2]!.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() }] : [];
  });
}

/** Shared bounded access for both official earnings and material-event discovery. */
function companyIrReader(opts: CompanyIrOptions) {
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000);
  const lookup = opts.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
  let requests = 0;
  const guardedFetch = (async (raw: string | URL | Request, init?: RequestInit) => {
    if (requests >= 6) throw new Error("IR request budget exhausted");
    const url = safeUrl(typeof raw === "string" ? raw : raw instanceof URL ? raw.toString() : raw.url);
    if (!url) throw new Error("IR URL rejected");
    const addresses = await abortable(lookup(url.hostname), signal);
    if (addresses.length === 0 || addresses.some((a) => !publicAddress(a.address))) throw new Error("IR hostname resolves to non-public address");
    requests++;
    return opts.fetchImpl ? opts.fetchImpl(url.toString(), init) : pinnedFetch(url.toString(), init, addresses[0]!);
  }) as typeof fetch;
  return { signal, get requests() { return requests; },
    read: (url: string) => abortable(fetchWithPolicy(url, { cache: "no-store" }, { provider: "company-ir", timeoutMs: 3500, maxRetries: 0, maxBodyBytes: 1_000_000, fetchImpl: guardedFetch, signal }), signal) };
}

/** Website -> explicitly linked IR -> news index -> earnings announcement; six requests and 12 seconds maximum. */
export async function discoverCompanyIrEarnings(website: string, symbol: string, today: string, opts: CompanyIrOptions = {}): Promise<{ announcements: FetchResult<FmpEarningsRow>[]; gaps: ManifestEntry[] }> {
  const announcements: FetchResult<FmpEarningsRow>[] = [];
  const seed = safeUrl(website);
  const attempted: string[] = [];
  if (!seed) return { announcements, gaps: [{ field: "earningsCalendarNext.companyIr", reason: "Official IR announcement unavailable: company website is not a public HTTPS URL", severity: "info", expected: true }] };
  const verified = opts.issuer ? safeUrl(opts.issuer.verifiedWebsite) : null;
  const officialHost = verified?.hostname.replace(/^www\./, "");
  if (!opts.issuer || !verified || !officialHost || (seed.toString() !== verified.toString() && seed.hostname !== officialHost && !seed.hostname.endsWith(`.${officialHost}`))) {
    return { announcements, gaps: [{ field: "earningsCalendarNext.companyIr", reason: "Official IR announcement unavailable: confirmed issuer name and website binding are required", severity: "info", expected: true }] };
  }
  const reader = companyIrReader(opts);
  const { signal } = reader;
  const now = opts.now ?? (() => new Date());
  const seedIsIr = /(?:^|\.)(?:ir|investors?)\./i.test(seed.hostname) || /\/investor(?:s|-relations)?(?:\/|$)/i.test(seed.pathname);
  const queue: { url: string; chain: string[]; stage: "company" | "ir" | "news" | "release" }[] = [{ url: seed.toString(), chain: [seed.toString()], stage: seedIsIr ? "ir" : "company" }];
  const seen = new Set<string>();
  while (queue.length && reader.requests < 6 && !signal.aborted) {
    const page = queue.shift()!;
    if (seen.has(page.url)) continue;
    seen.add(page.url);
    attempted.push(page.url);
    try {
      const res = await reader.read(page.url);
      if (!res.ok || !/html|xhtml/i.test(res.headers.get("content-type") ?? "text/html")) continue;
      const publishedAt = publicationDate(res.bodyText);
      if (publishedAt && page.stage !== "company") {
        let text = parseDocument(res.bodyText).fullText;
        const dateline = visiblePublicationDateline(res.bodyText);
        // Remove only a standalone publication element at the very start of
        // the extracted article, with the same date as publication metadata.
        // Dates embedded in earnings/conference clauses remain untouched.
        const datelineMs = dateline ? Date.parse(dateline) : NaN;
        if (dateline && Number.isFinite(datelineMs) && new Date(datelineMs).toISOString().slice(0, 10) === publishedAt.slice(0, 10) && text.trimStart().startsWith(`${dateline} `)) text = text.trimStart().slice(dateline.length).trimStart();
        const timeElement = res.bodyText.match(/<time\b([^>]*)>([^<]+)<\/time>/i);
        const timeDate = timeElement ? attribute(timeElement[1]!, "datetime") : null;
        const timeLabel = timeElement?.[2]?.replace(/\s+/g, " ").trim();
        if (timeDate && Number.isFinite(Date.parse(timeDate)) && timeDate.slice(0,10) === publishedAt.slice(0,10) && timeLabel && text.trimStart().startsWith(`${timeLabel} `)) text = text.trimStart().slice(timeLabel.length).trimStart();
        const title = (res.bodyText.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? res.bodyText.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1])?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        // Keep the document issuer title separate from its dated action. A
        // flattened heading must neither supply another sentence's subject nor
        // obscure an explicitly issuer-bound "we will report" release.
        if (title && text.trimStart().startsWith(`${title} `)) text = text.trimStart().slice(title.length).trimStart();
        const event = companyEarningsAnnouncement({ text, publishedAt, observedAt: now().toISOString(), url: page.url, authority: "company_ir", authorityChain: page.chain, issuer: opts.issuer,
          sourceHash: createHash("sha256").update(res.bodyText).digest("hex"), documentTitle: title }, symbol, today);
        if (event) { announcements.push(event); break; }
      }
      const all = links(res.bodyText, page.url);
      const add = (link: Link, stage: "ir" | "news" | "release") => {
        if (!seen.has(link.url) && !queue.some((q) => q.url === link.url)) queue.push({ url: link.url, chain: [...page.chain, link.url], stage });
      };
      if (page.stage === "company") {
        all.filter((l) => /\binvestor(?:s| relations)?\b/i.test(l.text) || /(?:^|[/.])investors?[./-]/i.test(l.url)).slice(0, 1).forEach((l) => add(l, "ir"));
      } else if (page.stage !== "release") {
        const sameOrigin = all.filter((l) => new URL(l.url).origin === new URL(page.url).origin);
        const releases = sameOrigin.filter((l) => /\b(?:results|earnings)\b/i.test(l.text) && /\b(?:announce|report|release|quarter|financial)\b/i.test(l.text));
        // Old results commonly sit beside the news link on IR homepages.
        // Reserve the path through that index instead of spending all six
        // requests on those historical releases. Index discoveries go first
        // so already queued homepage releases cannot starve the next hop.
        if (page.stage === "ir") sameOrigin.filter((l) => /news|press releases/i.test(l.text)).slice(0, 1).forEach((l) => add(l, "news"));
        const ordered = [...releases].sort((a, b) => Number(/\b(?:to|will)\s+(?:announce|report|release|publish)\b/i.test(b.text)) - Number(/\b(?:to|will)\s+(?:announce|report|release|publish)\b/i.test(a.text)));
        const pending = queue.length;
        ordered.slice(0, 3).forEach((l) => add(l, "release"));
        if (page.stage === "news") queue.unshift(...queue.splice(pending));
      }
    } catch { /* Rate limit, unsafe resolution, parse or transport failure is an honest evidence gap. */ }
  }
  return { announcements, gaps: announcements.length ? [] : [{ field: "earningsCalendarNext.companyIr", reason: "Official IR announcement unavailable or unambiguous future event/publication evidence was not found within the bounded website and investor-link path", severity: "info", expected: true, attemptedSources: attempted }] };
}

export interface CompanyIrMaterialEvent {
  symbol: string;
  category: "acquisition" | "executive-transition";
  /** What the issuer states; neither label is independent confirmation. */
  status: "issuer-stated-completed" | "issuer-announced";
  title: string;
  url: string;
  publishedAt: string;
  observedAt: string;
  authorityChain: string[];
  sourceHash: string;
  text: string;
  originalChars: number;
  span: { start: number; end: number; text: string };
  /** The bounded narrative reader does not establish transaction economics. */
  consideration: null;
  funding: null;
}
export interface CompanyIrMaterialEvents { events: CompanyIrMaterialEvent[]; notes: string[] }

/** Exact issuer subjects only: a name elsewhere in an article does not bind its action. */
function materialStatement(text: string, issuer: ConfirmedIssuerIdentity): { category: CompanyIrMaterialEvent["category"]; status: CompanyIrMaterialEvent["status"]; start: number; end: number } | null {
  const canonical = issuer.canonicalName.trim();
  const core = canonical.replace(/,?\s+(?:incorporated|inc|corporation|corp|limited|ltd|plc|llc)\.?$/i, "");
  const aliases = [...new Set([canonical, canonical.replace(/,\s*(?=(?:inc|corp|ltd)\.?$)/i, " "),
    ...(core.split(/\s+/).length >= 2 ? [core] : []), ...(issuer.validAliases ?? [])])].filter((alias) => alias.length >= 3);
  for (const sentence of splitSentences(text)) {
    for (const alias of aliases) {
      const subject = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // A dateline may precede the subject, but quoted commentary, a different
      // grammatical subject, and a future/negated completion cannot establish it.
      const lead = String.raw`(?:^|[-–—]\s+)${subject}\s+(?:today\s+)?`;
      const completed = new RegExp(`${lead}(?:announced that it )?(?:has )?(?:acquired\\s+|completed (?:its |the )?acquisition of\\s+)`, "i");
      const announcedDeal = new RegExp(`${lead}announced (?:an? |the |its )?(?:agreement to acquire|acquisition of)\\s+`, "i");
      const officer = new RegExp(`${lead}announced (?:the )?(?:appointment|departure|retirement|resignation) of\\s+`, "i");
      const completion = completed.exec(sentence);
      const announcement = announcedDeal.exec(sentence);
      const appointment = officer.exec(sentence);
      // A denial such as "acquired no interest" is not a completed acquisition.
      // Check the object immediately following the operative action, rather
      // than interpreting a negative elsewhere in the article as a denial.
      const deniedObject = (action: RegExpExecArray | null): boolean => {
        if (action === null) return false;
        const object = sentence.slice(action.index + action[0].length).trimStart()
          .split(/[,;.!?]|\b(?:in|of|over|with|that|which|who)\b/i, 1)[0]!.trim();
        if (/^(?:neither|nothing|none)\b/i.test(object)) return true;
        if (!/^(?:no|zero)\s+/i.test(object)) return false;
        // Read compound modifiers ("no direct or indirect economic interest")
        // within this object, without scanning a later descriptive clause.
        // Over-budget negative objects are ambiguous, so withhold the claim.
        return object.split(/\s+/).length > 14 ||
          /^(?:no|zero)\s+(?:[a-z][a-z-]*\s+){0,12}(?:interests?|shares?|stakes?|assets?|ownership|control|acquisitions?|percent)\b/i.test(object);
      };
      const announcedOfficer = appointment !== null && !deniedObject(appointment);
      const status = completion !== null && !deniedObject(completion) ? "issuer-stated-completed"
        : announcement !== null && !deniedObject(announcement) || announcedOfficer ? "issuer-announced" : null;
      if (status !== null) {
        const start = text.indexOf(sentence);
        return { category: announcedOfficer ? "executive-transition" : "acquisition", status, start, end: start + sentence.length };
      }
    }
  }
  return null;
}

/**
 * Website -> explicitly linked official IR/news -> three material headlines.
 * Six requests, twelve seconds, one MiB/page, and a one-year publication window.
 * No partner-site traversal, implied deal terms, or comprehensive-ledger claim.
 */
export async function discoverCompanyIrMaterialEvents(website: string, symbol: string, today: string, opts: CompanyIrOptions = {}): Promise<FetchResult<CompanyIrMaterialEvents>> {
  const attempted: string[] = [];
  const unavailable = (reason: string): FetchResult<CompanyIrMaterialEvents> => ({ ok: false, gap: { field: "companyIrMaterialEvents", severity: "info", expected: true,
    reason: `${reason}; bounded discovery is not evidence that no material events occurred.`, attemptedSources: attempted } });
  const seed = safeUrl(website);
  const verified = opts.issuer ? safeUrl(opts.issuer.verifiedWebsite) : null;
  if (!seed || !verified || !opts.issuer || seed.hostname.replace(/^www\./, "") !== verified.hostname.replace(/^www\./, "")) return unavailable("A confirmed issuer and its public HTTPS website are required");
  const reader = companyIrReader(opts);
  const now = opts.now ?? (() => new Date());
  const events: CompanyIrMaterialEvent[] = [];
  const seedIsIr = /(?:^|\.)(?:ir|investors?)\./i.test(seed.hostname) || /\/investor(?:s|-relations)?(?:\/|$)/i.test(seed.pathname);
  const queue: { url: string; chain: string[]; stage: "company" | "ir" | "news" | "release" }[] = [{ url: seed.toString(), chain: [seed.toString()], stage: seedIsIr ? "ir" : "company" }];
  const seen = new Set<string>();
  while (queue.length && reader.requests < 6 && events.length < 3 && !reader.signal.aborted) {
    const page = queue.shift()!;
    if (seen.has(page.url)) continue;
    seen.add(page.url);
    attempted.push(page.url);
    try {
      const response = await reader.read(page.url);
      if (!response.ok || !/html|xhtml/i.test(response.headers.get("content-type") ?? "text/html")) continue;
      if (page.stage === "release") {
        const publishedAt = publicationDate(response.bodyText);
        const publishedDay = publishedAt?.slice(0, 10);
        const observedAt = now().toISOString();
        if (!publishedAt || !publishedDay || !/^\d{4}-\d{2}-\d{2}$/.test(publishedDay) || !Number.isFinite(Date.parse(publishedAt)) ||
          new Date(`${publishedDay}T00:00:00Z`).toISOString().slice(0, 10) !== publishedDay || publishedDay > today ||
          Date.parse(publishedAt) > Date.parse(observedAt) || Date.parse(today) - Date.parse(publishedDay) > 365 * 86_400_000) continue;
        const text = parseDocument(response.bodyText).fullText;
        // A title or publication dateline is not the subject of a following
        // sentence. Strip these only when they are leading standalone elements.
        const title = (response.bodyText.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ?? response.bodyText.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "Material event").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        const prefix = text.startsWith(title) ? title.length : 0;
        const afterTitle = text.slice(prefix).trimStart();
        const dateline = visiblePublicationDateline(response.bodyText);
        const body = dateline && afterTitle.startsWith(dateline) ? afterTitle.slice(dateline.length).trimStart() : afterTitle;
        const statement = materialStatement(body, opts.issuer);
        if (statement === null || statement.end - statement.start > 1_800) continue;
        const start = text.indexOf(body) + statement.start;
        let end = start + statement.end - statement.start;
        // Keep whole following sentences while the source excerpt stays bounded.
        for (const sentence of splitSentences(text.slice(end))) {
          const next = text.indexOf(sentence, end);
          if (next < 0 || next + sentence.length - start > 1_800 || /^(?:About |Forward[- ]Looking)/i.test(sentence)) break;
          end = next + sentence.length;
        }
        const excerpt = text.slice(start, end);
        events.push({ symbol, category: statement.category, status: statement.status, title, url: page.url, publishedAt, observedAt, authorityChain: page.chain,
          sourceHash: createHash("sha256").update(response.bodyText).digest("hex"), text: excerpt, originalChars: text.length,
          span: { start, end, text: excerpt }, consideration: null, funding: null });
        continue;
      }
      const all = links(response.bodyText, page.url);
      const sameOrigin = all.filter((link) => new URL(link.url).origin === new URL(page.url).origin);
      const add = (link: Link, stage: (typeof queue)[number]["stage"]) => { if (!seen.has(link.url) && !queue.some((entry) => entry.url === link.url)) queue.push({ url: link.url, chain: [...page.chain, link.url], stage }); };
      if (page.stage === "company") {
        const ir = all.find((link) => /\binvestor(?:s| relations)?\b/i.test(link.text) || /(?:^|[/.])investors?[./-]/i.test(link.url));
        if (ir) add(ir, "ir");
        else sameOrigin.filter((link) => /newsroom|news|press releases/i.test(link.text)).slice(0, 1).forEach((link) => add(link, "news"));
      } else {
        if (page.stage === "ir") sameOrigin.filter((link) => /news|press releases/i.test(link.text)).slice(0, 1).forEach((link) => add(link, "news"));
        const pending = queue.length;
        sameOrigin.filter((link) => /\b(?:acquir(?:e[sd]?|ing)|acquisition|appoint(?:ment|s|ed)?|retires?|resigns?|leadership transition)\b/i.test(link.text)).slice(0, 3).forEach((link) => add(link, "release"));
        if (page.stage === "news") queue.unshift(...queue.splice(pending));
      }
    } catch { /* Public source failure is a disclosed bounded evidence gap. */ }
  }
  if (events.length === 0) return unavailable("No dated issuer-bound material statement was retained from the bounded official website/IR path");
  events.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.url.localeCompare(b.url));
  return { ok: true, value: { data: { events, notes: ["Bounded official-news selection, not a comprehensive acquisition or executive-transition ledger. Events are issuer statements, not independently verified completion. Consideration and funding are not established by this narrative reader."] },
    source: "computed", endpoint: "company-ir:material-events", asOf: events[0]!.publishedAt.slice(0, 10), fetchedAt: now().toISOString() } };
}
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { Readable } from "node:stream";
import { parseDocument } from "@/edgar/extract";
import { companyEarningsAnnouncement, type ConfirmedIssuerIdentity } from "@/providers/companyEvents";
import { fetchWithPolicy } from "@/providers/http";
import { createHash } from "node:crypto";
import { splitSentences } from "@/edgar/currentReports";
