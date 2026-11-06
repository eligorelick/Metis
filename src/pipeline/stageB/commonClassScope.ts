import type { DataBundle, ExtractedSection } from "@/pipeline/types";
import type { Sourced } from "@/types/core";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { identicalClassRights } from "@/edgar/economicShares";
import { commonClassName, displayClassName, filingSentences, isSecClassFiling } from "@/edgar/classEvidence";
import { retainedClassEconomicRefusal } from "@/edgar/retainedClassEconomics";
import { parseFactPoints } from "@/edgar/xbrl";
import type { CombinedClassEpsBasis, WeightedShareCounts } from "./securityBasis";
import { quotePriceObservationDay } from "./priceCurrency";

/** R9: narrowly admit an explicitly combined EPS note with matching filed counts. */
export function retainedCombinedClassEpsBasis(bundle: DataBundle, counts: WeightedShareCounts): CombinedClassEpsBasis | null {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  if (!facts || !counts.periodEnd || counts.basic === null || counts.diluted === null) return null;
  const cutoff = bundle.builtAt.slice(0, 10);
  const labelPattern = /\b(?:Class [A-Z0-9]{1,8}|[A-Z][A-Z-]{0,30}) common stock\b/gi;
  const labels = (text: string): string[] => [...text.matchAll(labelPattern)].map(m => m[0].toLowerCase());
  const profile = bundle.profile.ok ? bundle.profile.value.data.rows[0] : null;
  const quoted = labels(typeof profile?.companyName === "string" ? profile.companyName : "");
  if (quoted.length !== 1) return null;
  for (const member of [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes]) {
    if (!member?.ok || member.value.source !== "edgar") continue;
    const source = member.value.data;
    if (source.reportDate !== counts.periodEnd || source.filingDate > cutoff || !/^10-[QK](?:\/A)?$/.test(source.form)) continue;
    if (!isSecClassFiling(source, String(facts.cik), cutoff)) continue;
    const combined = /same for (.{1,500}?) on an individual or combined basis, and they have been combined as common shares below\./i.exec(source.text);
    if (!combined) continue;
    const names = labels(combined[1]!);
    const remainder = combined[1]!.replace(labelPattern, "").replace(/\b(?:and|the)\b|[,\s]/gi, "");
    if (remainder || names.length < 2 || new Set(names).size !== names.length || !names.includes(quoted[0]!)) continue;
    const rights = filingSentences(source.text.slice(Math.max(0, combined.index - 1500), combined.index)).some(sentence => {
      const related = identicalClassRights(sentence.trim());
      return related && related.length === names.length && names.every(name => related.includes(name));
    });
    if (!rights) continue;
    // Both counts must be primary facts from this exact filing and interval.
    const points = (tag: string, value: number) => {
      const concept = facts.facts["us-gaap"]?.[tag] as { units?: { shares?: unknown[] } } | undefined;
      return parseFactPoints(concept?.units?.shares ?? []).filter(p => p.end === counts.periodEnd && p.val === value &&
        p.start !== undefined && p.accn === source.accession && p.filed === source.filingDate && p.form === source.form);
    };
    const basic = points("WeightedAverageNumberOfSharesOutstandingBasic", counts.basic);
    const diluted = points("WeightedAverageNumberOfDilutedSharesOutstanding", counts.diluted);
    if (!basic.some(b => diluted.some(d => d.start === b.start))) continue;
    const table = source.text.slice(combined.index + combined[0].length, combined.index + combined[0].length + 4000);
    const row = (kind: string): number[] => {
      const text = new RegExp(`\\b${kind} weighted[ -]average common shares[^\\d]{0,100}((?:[\\d,]+\\s*)+)`, "i").exec(table)?.[1];
      return text?.trim().split(/\s+/).map(n => Number(n.replaceAll(",", ""))) ?? [];
    };
    const basicRow = row("Basic"), dilutedRow = row("Diluted");
    if (!basicRow.some((value, i) => value === counts.basic && dilutedRow[i] === counts.diluted)) continue;
    return { ...counts, classIds: names.map(name => name === quoted[0] ? bundle.symbol : name), source: `${source.form} ${source.accession}, filed ${source.filingDate}; ${source.documentUrl}` };
  }
  return null;
}

export interface CommonClassAmbiguity {
  reason: string;
  sourceIds: string[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_DAY = `(?:${MONTHS.join("|")}) \\d{1,2},`;
const FULL_DATE = `${MONTH_DAY} \\d{4}`;
const DATE_PAIR = `${FULL_DATE} and (?:${MONTH_DAY} )?\\d{4}`;
const validDay = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;

function classDate(text: string): string | null {
  const m = /^(\w+) (\d{1,2}), (\d{4})$/.exec(text);
  if (!m) return null;
  const month = MONTHS.findIndex(name => name.toLowerCase() === m[1]!.toLowerCase()) + 1;
  const day = `${m[3]}-${String(month).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return validDay(day) ? day : null;
}

function classDates(text: string): (string | null)[] {
  const [first, second] = text.split(/ and /i);
  return [classDate(first!), classDate(/^\d{4}$/.test(second ?? "") ? first!.replace(/\d{4}$/, second!) : second ?? "")];
}

/** Only a dated balance-sheet common row, not a zero or count elsewhere in a cap. */
function datedCommonRow(section: ExtractedSection, issuerName: string): { row: string; dates: string[] } | null {
  const text = (section.statementsText ?? "").slice(0, 12_000).replace(/\s+/g, " ");
  const headings = [...text.matchAll(new RegExp(`\\b(?:CONSOLIDATED )?BALANCE SHEETS\\s*(?:\\([^)]{0,100}\\)\\s*)*(${FULL_DATE}) (${FULL_DATE}) Assets\\b`, "gi"))];
  if (headings.length !== 1) return null;
  const heading = headings[0]!, dates = [classDate(heading[1]!), classDate(heading[2]!)];
  const issuer = issuerName.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const preceding = text.slice(0, heading.index).replace(/\bCONDENSED\s*$/i, "").trimEnd();
  if (!issuer || !preceding.replace(/[^a-z0-9]/gi, "").toLowerCase().endsWith(issuer)) return null;
  if (!dates[0] || !dates[1] || dates[0] !== section.reportDate || dates[1] >= dates[0]) return null;
  const balance = text.slice(heading.index! + heading[0].length).split(/\b(?:CONSOLIDATED STATEMENTS|See accompanying notes)\b/i)[0]!;
  const rows = [...balance.matchAll(/\bCommon stock[;:]/gi)];
  if (rows.length !== 1) return null;
  const row = balance.slice(rows[0]!.index).split(/\b(?:Treasury stock|Additional paid[ -]in capital|Retained earnings)\b/i)[0]!;
  // A numbered class prefix would make this a named row, not the renamed common.
  if (/\bClass\s+\w+\s*$/i.test(balance.slice(0, rows[0]!.index))) return null;
  const counts = [...row.matchAll(new RegExp(`\\b([\\d,]+) and ([\\d,]+) shares outstanding as of (${DATE_PAIR}),? respectiv\\s*ely\\b`, "gi"))];
  if (counts.length !== 1 || Number(counts[0]![1]!.replaceAll(",", "")) <= 0) return null;
  if (classDates(counts[0]![3]!).some((d, i) => d !== dates[i])) return null;
  return { row, dates: [dates[0], dates[1]] };
}

/**
 * D-205: remove only proved historical footnote mentions from the fallback's
 * analysis copy. This is not a class inventory or economic-rights admission.
 * Supported form: one compound common row, current-first comparative dates,
 * zero outstanding at BOTH dates, and an unconditional dated elimination /
 * rename in the same primary filing. Unsupported forms keep the old refusal.
 */
function currentClassStatement(bundle: DataBundle, source: Sourced<ExtractedSection>, notes: Sourced<ExtractedSection>[], evidenceRefusal: string | null): string {
  const original = (source.data.statementsText ?? "").slice(0, 12_000);
  const cutoff = bundle.builtAt.slice(0, 10), registrant = bundle.edgar.registrant;
  const profile = bundle.profile.ok ? bundle.profile.value.data.rows[0] : null;
  if (evidenceRefusal || !registrant || !profile || !validDay(cutoff) || !/^\d{10}$/.test(registrant.cik10) ||
      Number(profile.cik) !== Number(registrant.cik10) || profile.symbol !== bundle.symbol || !registrant.tickers.includes(bundle.symbol)) return original;
  const eligible = (s: Sourced<ExtractedSection>) => s.source === "edgar" && /^10-[KQ](?:\/A)?$/.test(s.data.form) &&
    validDay(s.data.reportDate) && s.data.reportDate <= s.data.filingDate && isSecClassFiling(s.data, registrant.cik10, cutoff);
  if (!eligible(source)) return original;
  // The fallback's cutoff filter may omit an unparseable report date. Such a
  // retained filing cannot silently become evidence that no later class exists.
  if ([bundle.edgar.tenQNotes, bundle.edgar.tenKNotes].some(m => m?.ok && m.value.data.filingDate <= cutoff &&
      (!validDay(m.value.data.reportDate) || m.value.data.reportDate > m.value.data.filingDate))) return original;
  const statement = original.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ");
  const owner = "(?:the Company's )?";
  const events = [...statement.matchAll(new RegExp(`(?:^|[.] |\\(\\d+\\) )On (${FULL_DATE}), all authorized shares of ${owner}Class ([A-Z0-9]{1,8}) common stock were eliminated and ${owner}Class ([A-Z0-9]{1,8}) common stock was renamed to "?common stock,?"?(?:,? pursuant to the terms of ${owner}amended and restated certificate of incorporation)?\\.`, "gi"))];
  if (events.length !== 1) return original;
  const event = events[0]!, effective = classDate(event[1]!), removed = event[2]!, renamed = event[3]!;
  const priceDay = quotePriceObservationDay(bundle.quote.ok ? bundle.quote.value.data.rows[0] : null);
  if (!effective || effective > source.data.reportDate || (priceDay !== null && effective > priceDay) || removed.toUpperCase() === renamed.toUpperCase()) return original;
  const proof = datedCommonRow(source.data, registrant.name);
  if (!proof) return original;
  // The named portions must be the two authorization clauses in this single
  // common row. Separate/combined live-class rows are deliberately not inferred.
  const mentions = [...proof.row.matchAll(/\bClass ([A-Z0-9]{1,8})\b/gi)];
  if (mentions.length !== 2 || mentions[0]![1]!.toUpperCase() !== renamed.toUpperCase() || mentions[1]![1]!.toUpperCase() !== removed.toUpperCase()) return original;
  if (!new RegExp(`\\bClass ${renamed} shares authorized;`, "i").test(proof.row)) return original;
  const zero = new RegExp(`\\b(?:zero|0) and [\\d,]+ Class ${removed} shares authorized as of (${DATE_PAIR}), respectively, (?:zero|0) shares issued and outstanding as of each of (${DATE_PAIR})\\b`, "i").exec(proof.row);
  if (!zero || [zero[1]!, zero[2]!].some(pair => classDates(pair).some((d, i) => d !== proof.dates[i]))) return original;
  if (!/^\s*(?:\(\d+\)\s*)?[\d,\s$—–-]*$/.test(proof.row.slice(zero.index + zero[0].length))) return original;
  // Later omission is insufficient: every retained report at or after this
  // period must independently carry a current positive plain-common row.
  for (const later of notes.filter(s => s.data.reportDate >= source.data.reportDate && s !== source)) {
    const current = eligible(later) ? datedCommonRow(later.data, registrant.name) : null;
    if (!current || /\bClass\s+[A-Z0-9]+\b/i.test(later.data.statementsText ?? "")) return original;
  }
  // Even one positive cover observation contradicts elimination. The existing
  // multi-class, count/cover and rights guards continue to run independently.
  if ((bundle.edgar.economicShareInventory ?? []).some(inventory => inventory.source.filingDate <= cutoff &&
      [...(inventory.observations ?? []), ...inventory.classes].some(o => o.shares !== null && o.shares > 0 && o.asOf >= effective &&
        commonClassName(o.classId) === `class ${removed.toLowerCase()} common stock`))) return original;
  const alias = new RegExp(`Unless otherwise noted, all references herein to ${owner}common stock refer to (?:the (?:Company's )?)?Class ${renamed} common stock prior to the effectiveness of the certificate\\.`, "gi");
  const current = statement.replace(event[0], " ").replace(alias, " ");
  // Any other named common-class assertion is unclassified, not historical by
  // association. Retain the refusal even if only one such mention remains.
  return /\bClass\s+[A-Z0-9]+\s+(?:(?:non-?voting|voting)\s+)?common\s+(?:stock|shares)\b/i.test(current) ? original : current;
}

/** Detect scope ambiguity only. Filing class labels do not establish counts or economic equivalence. */
export function retainedCommonClassAmbiguity(bundle: DataBundle): CommonClassAmbiguity | null {
  const cutoff = bundle.builtAt.slice(0, 10);
  const observed = [...(bundle.edgar.economicShareInventory ?? [])].filter(row => row.source.filingDate <= cutoff &&
    new Set(row.observations?.map(o => o.classId) ?? []).size > 1).sort((a, b) => b.source.filingDate.localeCompare(a.source.filingDate))[0];
  const evidenceRefusal = retainedClassEconomicRefusal(bundle);
  if (observed && (!observed.evidence || evidenceRefusal)) return {
    reason: `Primary ${observed.source.form} ${observed.source.accession} retains outstanding common-class observations at ${[...new Set(observed.observations!.map(o => o.asOf))].sort().join(", ")}. Classes requiring complete count, treasury and economic-rights resolution: ${observed.observations!.map(o => {
      const name = commonClassName(o.classId);
      return name ? displayClassName(name) : o.classId.replace(/^[^:]+:|Member$/g, "").replace(/([a-z])([A-Z])/g, "$1 $2");
    }).join(", ")}. ${evidenceRefusal ? `${evidenceRefusal} ` : ""}Complete economic class coverage is not established; no class sum or current issuer capitalization is inferred.`,
    sourceIds: observed.observations!.map(o => o.sourceId),
  };
  const inventory = [...(bundle.edgar.economicShareInventory ?? [])].filter(row => row.source.filingDate <= cutoff && row.classes.length > 1).sort((a, b) => b.source.filingDate.localeCompare(a.source.filingDate))[0];
  if (inventory) return { reason: `Primary ${inventory.source.form} ${inventory.source.accession} explicitly enumerates multiple outstanding common classes. ${inventory.reason}`, sourceIds: [inventory.source.documentUrl] };
  const notes = [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes].flatMap(member =>
    member?.ok && member.value.data.filingDate <= cutoff && member.value.data.reportDate <= cutoff ? [member.value] : []);
  // An omitted capital description never proves a previously filed class disappeared.
  notes.sort((a, b) => b.data.filingDate.localeCompare(a.data.filingDate));
  for (const latest of notes) {
    const statement = currentClassStatement(bundle, latest, notes, evidenceRefusal);
    const classPattern = /\bclass\s+([a-z0-9]{1,8})\s+(?:(?:voting|nonvoting|non-voting)\s+)?(?:common\s+(?:stock|shares)|ordinary\s+shares)\b/gi;
    const classes = new Set([...statement.matchAll(classPattern)].map(match => match[1].toUpperCase()));
    const unqualified = statement.replace(classPattern, "");
    const extraUnqualifiedCommon = classes.size > 0 && /\bcommon\s+(?:stock|shares)\b[^.;\n]{0,180}\b(?:issued|outstanding)\b/i.test(unqualified);
    if (classes.size > 1 || extraUnqualifiedCommon) return {
      reason: `Retained ${latest.data.form} ${latest.data.accession} capital statement identifies multiple common classes; raw SEC share facts do not prove complete economic coverage or equivalent rights.`,
      sourceIds: [latest.endpoint],
    };
  }
  // Class rights may be disclosed deep in annual ownership risks or business
  // descriptions. Locate explicit capital mentions in the full retained text,
  // then inspect only a bounded context around each mention. Authorization or
  // hypothetical future issuance alone does not establish an outstanding class.
  const annual = [bundle.edgar.item1a, bundle.edgar.business].flatMap(member =>
    member?.ok && /^(?:10-K|20-F)(?:\/A)?$/.test(member.value.data.form) &&
      member.value.data.filingDate <= cutoff && member.value.data.reportDate <= cutoff ? [member.value] : []);
  for (const source of annual) {
    const text = source.data.text;
    const classPattern = /\bclass\s+([a-z0-9]{1,8})\s+(?:(?:voting|nonvoting|non-voting)\s+)?(?:common\s+(?:stock|shares)|ordinary\s+shares)\b/gi;
    const outstandingClasses = new Set<string>();
    let distinctPlainCommon = false;
    for (const match of text.matchAll(classPattern)) {
      const before = text.slice(Math.max(0, match.index - 180), match.index);
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 100);
      if (/\boutstanding\s+$/i.test(before) || /^\s+(?:(?:is|are|was|were)\s+)?outstanding\b/i.test(after)) {
        outstandingClasses.add(match[1].toUpperCase());
        // An explicit 'common stock and Class X common stock' enumeration
        // distinguishes the plain class from the named outstanding class.
        if (/\bcommon\s+(?:stock|shares)\s+and\s+$/i.test(before)) distinctPlainCommon = true;
      }
    }
    if (outstandingClasses.size > 1 || (outstandingClasses.size > 0 && distinctPlainCommon)) return {
      reason: `Retained ${source.data.form} ${source.data.accession} ${source.data.sectionName} explicitly identifies outstanding common classes; full economic class coverage and rights remain unresolved.`,
      sourceIds: [source.endpoint],
    };
  }
  const gaps = bundle.gaps.filter(gap => gap.field.startsWith("keyless.sharesOutstanding.classes"));
  return gaps.length ? { reason: "SEC cover-share counts contain unnamed multiple classes or duplicate-class ambiguity; economic class rights are unresolved.",
    sourceIds: [...new Set(gaps.flatMap(gap => gap.attemptedSources ?? []))] } : null;
}
