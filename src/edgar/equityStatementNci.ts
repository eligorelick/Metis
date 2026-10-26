/**
 * Noncontrolling interest from a periodic filing's own equity statement
 * (audit 2026-10-22 C-15).
 *
 * Some filers tag NCI on the 10-K face (`MinorityInterest`) but in each 10-Q
 * only as a dimensional fact: the consolidated-equity concept on
 * `StatementEquityComponentsAxis = NoncontrollingInterestMember`. Companyfacts
 * carries no dimensional facts, so the quarterly balance had total equity
 * only. This reads, from the primary iXBRL document already fetched, each
 * instant's NCI column and the undimensioned consolidated total beside it.
 * A context with any other member (a co-registrant subsidiary on
 * `LegalEntityAxis`) is not the issuer's column and is skipped; an instant
 * whose facts disagree is dropped.
 *
 * Pure: no network, no clock.
 */
import { decodeEntities, htmlToText } from "@/edgar/extract";

const TOTAL = "us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest";
const AXIS = "us-gaap:StatementEquityComponentsAxis";
const MEMBER = "us-gaap:NoncontrollingInterestMember";

export interface EquityStatementNciObservation {
  end: string;
  currency: string;
  noncontrollingInterest: number;
  /** The undimensioned consolidated total at the same instant, when tagged. */
  totalEquity: number | null;
}

export interface FilingEquityStatementNci {
  issuerId: string;
  source: { form: string; accession: string; filingDate: string };
  observations: EquityStatementNciObservation[];
}

const attr = (s: string, name: string): string => decodeEntities(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(s)?.[1] ?? "");
const day = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

/** A displayed iXBRL number: digits with thousands separators, scaled, signed by `sign="-"`. */
function factValue(attrs: string, inner: string): number | null {
  const format = attr(attrs, "format");
  const raw = htmlToText(inner).trim();
  const scale = Number(attr(attrs, "scale") || "0");
  if (!Number.isInteger(scale) || scale < 0 || scale > 9) return null;
  let value: number;
  if (/fixed-zero$/.test(format)) value = 0;
  else if (/^(?:ixt:num-dot-decimal|ixt:numdotdecimal)?$/.test(format) && /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(raw)) value = Number(raw.replaceAll(",", "")) * 10 ** scale;
  else return null;
  return attr(attrs, "sign") === "-" ? -value : value;
}

export function parseEquityStatementNci(html: string, identity: { issuerId: string; form: string; accession: string; filingDate: string }): FilingEquityStatementNci {
  const out: FilingEquityStatementNci = { issuerId: identity.issuerId, source: { form: identity.form, accession: identity.accession, filingDate: identity.filingDate }, observations: [] };
  if (!/^(?:10-K|10-Q)(?:\/A)?$/.test(identity.form) || !day(identity.filingDate)) return out;
  // context id -> instant and whether it is the issuer's NCI column (true) or its undimensioned total (false)
  const contexts = new Map<string, { instant: string; nci: boolean }>();
  const seen = new Set<string>();
  for (const m of html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/g)) {
    const id = attr(m[1]!, "id");
    if (seen.has(id)) { contexts.delete(id); continue; }
    seen.add(id);
    const body = m[2]!;
    const issuer = /<xbrli:identifier\b[^>]*>\s*(\d+)\s*<\/xbrli:identifier>/.exec(body);
    const instant = /<xbrli:instant>\s*([^<\s]+)\s*<\/xbrli:instant>/.exec(body)?.[1] ?? "";
    if (!issuer || Number(issuer[1]) !== Number(identity.issuerId) || !day(instant) || instant > identity.filingDate) continue;
    if (/<(?:xbrldi:)?typedMember\b|<xbrli:scenario\b/.test(body)) continue;
    const members = [...body.matchAll(/<xbrldi:explicitMember\b([^>]*)>\s*([^<\s]+)\s*<\/xbrldi:explicitMember>/g)].map(x => [attr(x[1]!, "dimension"), x[2]!]);
    if (members.length === 0) contexts.set(id, { instant, nci: false });
    else if (members.length === 1 && members[0]![0] === AXIS && members[0]![1] === MEMBER) contexts.set(id, { instant, nci: true });
  }
  const units = new Map<string, string>();
  for (const m of html.matchAll(/<xbrli:unit\b([^>]*)>([\s\S]*?)<\/xbrli:unit>/g)) {
    const code = /^\s*<xbrli:measure>\s*iso4217:([A-Z]{3})\s*<\/xbrli:measure>\s*$/.exec(m[2]!)?.[1];
    if (code) units.set(attr(m[1]!, "id"), code);
  }
  const byInstant = new Map<string, { nci: Set<string>; total: Set<string>; invalid: boolean }>();
  for (const f of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/g)) {
    if (attr(f[1]!, "name") !== TOTAL) continue;
    const ctx = contexts.get(attr(f[1]!, "contextRef"));
    if (!ctx) continue;
    const record = byInstant.get(ctx.instant) ?? { nci: new Set<string>(), total: new Set<string>(), invalid: false };
    const currency = units.get(attr(f[1]!, "unitRef"));
    const value = factValue(f[1]!, f[2]!);
    if (!currency || value === null) record.invalid = true;
    else (ctx.nci ? record.nci : record.total).add(`${currency}|${value}`);
    byInstant.set(ctx.instant, record);
  }
  for (const [end, record] of [...byInstant].sort(([a], [b]) => a.localeCompare(b))) {
    if (record.invalid || record.nci.size !== 1 || record.total.size > 1) continue;
    const [currency, nci] = [...record.nci][0]!.split("|") as [string, string];
    const total = record.total.size === 1 ? [...record.total][0]!.split("|") as [string, string] : null;
    if (total && total[0] !== currency) continue;
    out.observations.push({ end, currency, noncontrollingInterest: Number(nci), totalEquity: total ? Number(total[1]) : null });
  }
  return out;
}
