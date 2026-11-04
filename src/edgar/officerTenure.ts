import type { ParsedDocument } from "@/edgar/extract";
import { executiveOffice, issuerScopedRole } from "@/report/executiveDecisions";

export interface OfficerTenure {
  name: string;
  office: "ceo" | "cfo";
  start: string;
  precision: "day" | "month" | "year";
  wording: string;
  quote: string;
  source: string;
  filingDate: string;
}
export interface OfficerFiling {
  source: string;
  filingDate: string;
  reportDate: string;
  issuer: string;
}

/** Bounded body sections from the already fetched/parsed annual; no proxy fetch. */
export function officerBiographiesText(parsed: ParsedDocument): { text: string; notes: string[] } {
  const sections: string[] = [];
  let retainedChars = 0;
  const retain = (section: string): void => {
    if (sections.includes(section) || retainedChars + section.length + (sections.length ? 2 : 0) > 120_000) return;
    retainedChars += section.length + (sections.length ? 2 : 0);
    sections.push(section);
  };
  const heading = /\b(?:Information\s+(?:About|Regarding)\s+(?:Our\s+)?Executiv\s*e\s+Officers|Executive officers of (?:the company|the registrant)|Item\s+6\.?\s+(?:DIRECTORS,?\s+)?(?:EXECUTIVE|SENIOR) MANAGEMENT AND EMPLOYEES|Item\s+10\.?\s+Directors,? Executive Officers,? and Corporate Governance|Composition of (?:the |our )?Board of Management|Our Board of Management)\b/gi;
  for (const match of parsed.fullText.matchAll(heading)) {
    const rest = parsed.fullText.slice(match.index! + match[0].length);
    const end = /\b(?:PART\s+II\s+)?Item\s+(?:1A|2|5|7|11)\.?\s+(?:Risk|Properties|Market|Operating|Executive Compensation)/i.exec(rest);
    const section = match[0] + rest.slice(0, Math.min(end?.index ?? 24_000, 24_000));
    retain(section);
  }
  // Issuer-qualified appointments elsewhere (e.g. remuneration footnotes).
  for (const match of parsed.fullText.matchAll(/\b(?:was appointed(?: as)?|became|succeeded[^.]{0,100}? as)\s+[^.]{0,100}\b(?:CEO|chief executive officer|CFO|chief financial officer)\s+of\s+[^.]{1,150}\./gi)) {
    retain(parsed.fullText.slice(Math.max(0, match.index! - 150), match.index! + match[0].length));
  }
  const text = [...new Set(sections)].join("\n\n");
  const incorporated = /incorporated (?:herein )?by reference[\s\S]{0,300}proxy|proxy[\s\S]{0,500}incorporated (?:herein )?by reference/i.test(text);
  return { text, notes: incorporated ? ["The officer/governance section references the proxy statement; incorporation by reference does not establish an office start."] : text ? [] : ["No supported executive-officer biography section was retained from the annual filing."] };
}

const MONTHS = "January February March April May June July August September October November December".split(" ");
const MONTH = `(?:${MONTHS.join("|")})`;
const DATE = `(?:\\d{4}-\\d{2}-\\d{2}|${MONTH} \\d{1,2},? \\d{4}|\\d{1,2} ${MONTH} \\d{4}|${MONTH} \\d{4}|\\d{4})`;
const OFFICE = "(?:chief executive officer|chief financial officer|CEO|CFO)";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Exact given/family names; middle initials may be present or omitted, never nicknames. */
function namePattern(name: string): string {
  const parts = name.trim().replace(/’/g, "'").split(/\s+/);
  if (parts.length < 2) return "(?!)";
  const middle = parts.slice(1, -1);
  const initials = middle.every(p => /^[A-Za-z]\.?$/.test(p));
  return `\\b${escape(parts[0]!)}${initials ? middle.length ? middle.map(p => `(?:\\s+${escape(p[0]!)}\\.?)?`).join("") : "(?:\\s+[A-Z]\\.?){0,2}" : middle.map(p => `\\s+${escape(p)}`).join("")}\\s+${escape(parts.at(-1)!)}\\b`;
}

/** Upper period bound is the conservative overlap start. Never invent a day. */
function period(wording: string): { lower: string; start: string; precision: OfficerTenure["precision"] } | undefined {
  const month = MONTHS.findIndex(m => new RegExp(`\\b${m}\\b`, "i").test(wording));
  const year = /\b(\d{4})\b/.exec(wording)?.[1];
  if (!year) return undefined;
  let start: string, lower: string, precision: OfficerTenure["precision"];
  if (/^\d{4}$/.test(wording)) {
    lower = `${year}-01-01`; start = `${year}-12-31`; precision = "year";
  } else if (new RegExp(`^${MONTH} \\d{4}$`, "i").test(wording)) {
    lower = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    start = new Date(Date.UTC(Number(year), month + 1, 0)).toISOString().slice(0, 10); precision = "month";
  } else {
    const d = /^(\d{1,2}) /.exec(wording)?.[1] ?? / (\d{1,2}),? /.exec(wording)?.[1];
    start = /^\d{4}-\d{2}-\d{2}$/.test(wording) ? wording : `${year}-${String(month + 1).padStart(2, "0")}-${d?.padStart(2, "0")}`;
    lower = start; precision = "day";
  }
  return Number.isFinite(Date.parse(start)) && new Date(start).toISOString().slice(0, 10) === start ? { lower, start, precision } : undefined;
}

// What may stand right before the office and leave it the same job. Anything else qualifies it: "Deputy CEO" is another role.
const BEFORE_OFFICE = new Set(["", "and", "&", "as", "our", "the", "its", "to", "is", "president", "chairman", "chairwoman", "chairperson", "chair",
  "director", "officer", "treasurer", "secretary", "board", "became", "appointed", "promoted", "been", "served", "serving", "new", "sole", "group", "company's"]);

export function extractOfficerTenures(text: string, roster: readonly { name: string; title: string }[], filing: OfficerFiling, conflicts: Pick<OfficerTenure, "name" | "office">[] = []): OfficerTenure[] {
  const normalized = text.replace(/’/g, "'").replace(/\n{2,}/g, " \u0000 ").replace(/\s+/g, " ");
  const results: OfficerTenure[] = [];
  for (const officer of roster) {
    const office = executiveOffice(officer.title);
    if (!office) continue;
    const candidates: (OfficerTenure & { lower: string })[] = [];
    for (const name of normalized.matchAll(new RegExp(namePattern(officer.name), "gi"))) {
      const begin = name.index!;
      const boundary = normalized.indexOf("\u0000", begin);
      const aliasEnd = Math.min(boundary < 0 ? normalized.length : boundary, begin + name[0].length + 1_200);
      const aliasBio = normalized.slice(begin, aliasEnd);
      let end = aliasEnd;
      for (const other of roster.filter(r => r !== officer)) {
        const next = new RegExp(namePattern(other.name), "i").exec(normalized.slice(begin + name[0].length));
        if (next) end = Math.min(end, begin + name[0].length + next.index);
      }
      const bio = normalized.slice(begin, end);
      if (/\.{3,}/i.test(normalized.slice(Math.max(0, begin - 40), begin + 100))) continue;
      const surname = officer.name.split(/\s+/).at(-1)!;
      const subjects = [{ index: 0, length: name[0].length }];
      const namedSpans = [...aliasBio.matchAll(new RegExp(namePattern(officer.name), "gi"))];
      const otherNamedPerson = [...aliasBio.matchAll(new RegExp(`\\b[A-Z][\\p{L}'’-]+(?:\\s+[A-Z]\\.?)?\\s+${escape(surname)}\\b`, "gu"))]
        .some(m => !/^(?:Mr|Ms|Mrs|Dr)\b/.test(m[0]) && !namedSpans.some(s => m.index! >= s.index! && m.index! + m[0].length <= s.index! + s[0].length));
      if (!otherNamedPerson && roster.filter(r => r.name.split(/\s+/).at(-1) === surname).length === 1) {
        for (const alias of aliasBio.matchAll(new RegExp(`\\b(?:Mr|Ms|Mrs|Dr)\\.?\\s+${escape(surname)}\\b`, "g"))) subjects.push({ index: alias.index!, length: alias[0].length });
      }
      for (const subject of subjects) {
        const subjectBio = subject.index === 0 ? bio : aliasBio;
        const tail = subjectBio.slice(subject.index + subject.length).replace(/^\.?\s*/, "");
        const stop = /[.!?](?=\s|$)/.exec(tail);
        const sentence = tail.slice(0, stop ? stop.index + 1 : tail.length);
        if (/\b(?:retired|stepped down|resigned|will|would|expected|plans to)\b/i.test(sentence)) continue;
        const before = subject.index === 0 ? normalized.slice(Math.max(0, begin - 45), begin) : subjectBio.slice(Math.max(0, subject.index - 45), subject.index);
        const opening = new RegExp(`(?:On|In) (${DATE}),? $`, "i").exec(before)?.[1];
        const matches = [...sentence.matchAll(new RegExp(`(${OFFICE})([^.;]{0,150}?)\\s+(?:\\(?since|in|on|effective(?: as of)?)\\s+(${DATE})(?=[).,; ]|$)`, "gi"))];
        // A table heading can bind an unadorned year to the current office.
        // "Executive Officer Since" and "Director Since" cannot do so.
        if (/Name Age Office Held Since/i.test(normalized.slice(Math.max(0, begin - 1500), begin))) {
          for (const row of sentence.matchAll(new RegExp(`(${OFFICE})([^.;\\d]{0,100}?)\\s+(${DATE})(?=[).,; ]|$)`, "gi"))) matches.push(row);
        }
        if (!matches.length && opening && /^(?:was (?:appointed|promoted)(?: as| to)?|succeeded .+? as|became)\b/i.test(sentence)) {
          const role = new RegExp(`(${OFFICE})([^.;]{0,100})`, "i").exec(sentence);
          if (role) matches.push(Object.assign([role[0], role[1], role[2], opening], { index: role.index }) as RegExpExecArray);
        }
        for (const match of matches) {
          const prefix = sentence.slice(0, match.index);
          const beforeOffice = /([\p{L}&'\u2019-]+)[\s,]*$/u.exec(prefix)?.[1]?.toLowerCase().replace(/-$/, "") ?? "";
          if (!BEFORE_OFFICE.has(beforeOffice) && !(beforeOffice === "co" && /\bco-?(?:ceo|chief)/i.test(officer.title))) continue;
          // What follows the date can name another employer, an end date or the true start.
          const after = sentence.slice(match.index! + match[0].length);
          if (/^[\s,]*(?:until|through)\b/i.test(after)) continue;
          const employer = /^[\s,]*(?:at|with|of|for)\s+([^.,;]+)/i.exec(after)?.[1];
          if (employer && issuerScopedRole(`x of ${employer}`, filing.issuer) !== "x") continue;
          const effective = new RegExp(`^[^.;]*?\\b(?:effective(?: as of)?|with effect from)\\s+(${DATE})`, "i").exec(after)?.[1];
          const wording = effective ?? match[3]!;
          const datePrefix = match[0].slice(0, match[0].lastIndexOf(match[3]!));
          if (/\b(?:in|on)\s+$/i.test(datePrefix) && !/\b(?:became|was appointed|was promoted|succeeded)\b/i.test(prefix)) continue;
          if (/\b(?:joined|from|prior|before|after|former|previously)\b/i.test(prefix)) continue;
          const body = sentence.replace(/^,?\s*(?:age\s*)?\d{1,3},?\s*/, "").replace(/^,\s*/, "");
          if (!/^(?:Chair\w*|President|Chief|Executive|Senior|CEO|CFO|Vice|Member|became|was appointed|was promoted|has (?:been|served)|have (?:been|served)|succeeded)\b/i.test(body)) continue;
          let suffix = match[2]!.trim().replace(/\((?:CEO|CFO)\)\s*\(?$/i, "").replace(/\($/, "").replace(/,$/, "").trim();
          if (/\b(?:since|at|for|joined|served|became|appointed|Mr|Ms|Mrs|Dr|he|she|prior|previously|as|in|from)\b/i.test(suffix)) continue;
          suffix = suffix.replace(/,?\s+and (?:a )?member of the (?:Board(?: of (?:Directors|Management))?|Executive Committee),?$/i, "");
          const statedRole = `${match[1]}${suffix ? ` ${suffix}` : ""}`;
          const role = issuerScopedRole(statedRole, filing.issuer);
          if (suffix && role === statedRole && !/^(?:,\s*|and\s+|&\s*)(?:president|chair\w*|director|member|executive|senior|vice|chief|CEO|CFO)\b/i.test(suffix)) continue;
          if (executiveOffice(role) !== office) continue;
          const headingContext = normalized.slice(Math.max(0, begin - 500), begin);
          if (/\b(?:Our directors|Director biographies|Biographies of directors)\b/i.test(headingContext) && !/^of\s+/i.test(suffix)) continue;
          const bounds = period(wording);
          if (!bounds || bounds.start > filing.filingDate || filing.reportDate > filing.filingDate) continue;
          const quoteStart = begin + subject.index - (opening ? new RegExp(`(?:On|In) (${DATE}),? $`, "i").exec(before)![0].length : 0);
          const bodyStart = begin + subject.index + subject.length;
          const gap = normalized.slice(bodyStart).match(/^\.?\s*/)?.[0].length ?? 0;
          const quote = normalized.slice(quoteStart, bodyStart + gap + sentence.length);
          candidates.push({ name: officer.name, office, ...bounds, wording, quote, source: filing.source, filingDate: filing.filingDate });
        }
      }
    }
    // Repeated/less-precise statements may agree. Disjoint periods conflict.
    if (candidates.length && Math.max(...candidates.map(c => Date.parse(c.lower))) <= Math.min(...candidates.map(c => Date.parse(c.start)))) {
      const best = candidates.sort((a, b) => (a.start.localeCompare(b.start) || b.lower.localeCompare(a.lower)))[0]!;
      const { lower: _lower, ...tenure } = best;
      void _lower;
      results.push(tenure);
    } else if (candidates.length) {
      conflicts.push({ name: officer.name, office });
    }
  }
  return results;
}
