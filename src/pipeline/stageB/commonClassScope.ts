import type { DataBundle } from "@/pipeline/types";

export interface CommonClassAmbiguity {
  reason: string;
  sourceIds: string[];
}

/** Detect scope ambiguity only. Filing class labels do not establish counts or economic equivalence. */
export function retainedCommonClassAmbiguity(bundle: DataBundle): CommonClassAmbiguity | null {
  const cutoff = bundle.builtAt.slice(0, 10);
  const observed = [...(bundle.edgar.economicShareInventory ?? [])].filter(row => row.source.filingDate <= cutoff &&
    new Set(row.observations?.map(o => o.classId) ?? []).size > 1).sort((a, b) => b.source.filingDate.localeCompare(a.source.filingDate))[0];
  if (observed && !observed.evidence) return {
    reason: `Primary ${observed.source.form} ${observed.source.accession} retains outstanding common-class observations at ${[...new Set(observed.observations!.map(o => o.asOf))].sort().join(", ")}. Complete inventory, aligned measurement dates and economic rights remain unresolved; no class sum or current issuer capitalization is inferred.`,
    sourceIds: observed.observations!.map(o => o.sourceId),
  };
  const inventory = [...(bundle.edgar.economicShareInventory ?? [])].filter(row => row.source.filingDate <= cutoff && row.classes.length > 1).sort((a, b) => b.source.filingDate.localeCompare(a.source.filingDate))[0];
  if (inventory) return { reason: `Primary ${inventory.source.form} ${inventory.source.accession} explicitly enumerates multiple outstanding common classes. ${inventory.reason}`, sourceIds: [inventory.source.documentUrl] };
  const notes = [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes].flatMap(member =>
    member?.ok && member.value.data.filingDate <= cutoff && member.value.data.reportDate <= cutoff ? [member.value] : []);
  // An omitted capital description never proves a previously filed class disappeared.
  notes.sort((a, b) => b.data.filingDate.localeCompare(a.data.filingDate));
  for (const latest of notes) {
    const statement = (latest.data.statementsText ?? "").slice(0, 12_000);
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
