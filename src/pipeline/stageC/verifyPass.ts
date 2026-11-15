/**
 * The verify pass, split out of passes.ts: collecting traced numbers, sourced claims and plain
 * prose from the report, matching each claim to its cited source, and recording what stays
 * unverified. Verification fails closed (P19).
 */

import { supplementalNumericAudit } from "@/report/supplementalNumericAudit";
import { guardEarningsReferences } from "@/report/earningsReferences";
import { guardEarningsSchedule } from "@/report/earningsSchedule";
import { buildSourceFactSummary } from "@/report/sourceFacts";
import { JUDGE_OUTPUT_KEYS, type JudgeOutput, type Report, type VerificationLogEntry, type TracedNumber, type SourcedClaim, type ProvenanceCoverage } from "@/report/schema";
import { excerptBodyForVerification, reciteFeedClaims, type ContextPayload } from "@/pipeline/stageC/payload";
import { calculateCoverage, canonicalizeFetchedUrl, canonicalizeTracedUnit, matchProvenanceRecord, namedUnitMatchesRecord, periodsAgree, recordEstablishesInterval, type CitationProvenanceRecord, type NumericProvenanceRecord, type ProvenanceFailureReason } from "@/pipeline/stageC/provenance";
import { currencyCandidateInBaseUnits, matchExcerptNumber } from "@/pipeline/stageC/excerptNumbers";
import { sameTracedDisplayValue, unitLabel } from "@/report/format";
import { buildPlainFigureIndex, checkPlainFigures, descriptionConflictsWithRecord, filedCalendarFiscalLabel, reportedSeriesLatest, validateClaimNumericSupport, valueConflictAtRecordDate, type ClaimEvidenceIndex, type ClaimSourceSpan, type PlainFigureText } from "@/pipeline/stageC/claimEvidence";
import { parseCitationRef, citationAsOf, citationSourceId, serializeCitationRef } from "@/pipeline/stageC/citations";
import { assessExecutiveEvidence, executiveEvidenceKind } from "@/report/financialDiagnostics";
import { collectPersonNames, collectPersonRows, proseNumbers, runConsistencyChecks, statesNumberWord, statesOnlyAllowedDates } from "@/pipeline/stageC/consistency";
import type { ConsistencyChecks } from "@/report/schema";
import { invokePassSettlementHook, type PassSettlementHook } from "@/pipeline/jobArtifacts";
import type { PassDeps } from "./passTypes";
import { retainedDecisionSources } from "./reportAssembly";

/* ------------------------------------------------------------------------ *
 * Verification pass — deterministic tracing (authoritative), model optional
 * ------------------------------------------------------------------------ */

export interface VerificationEvidence {
  fetchedUrls: string[];
  /** Retained analyst text, used only by deterministic value lookup. Never added to a model prompt. */
  retainedTexts?: readonly PlainFigureText[];
}

export interface VerifyResult<T = JudgeOutput> {
  verifiedReport: T;
  /** Legacy DB/API alias for numeric provenance coverage. */
  verificationRate: number | null;
  coverage: ProvenanceCoverage;
  /**
   * WS7 (D-20): what the deterministic checks CHECKED, kept separate from what
   * they could cite. `coverage` says a figure resolved to a record; `checks`
   * says the sentence around it agreed with that record.
   */
  checks: ConsistencyChecks;
  log: VerificationLogEntry[];
  /** Backward-compatible numeric counters. */
  traced: number;
  total: number;
}

/**
 * Collect every TracedNumber in a JudgeOutput with a mutable ref so the verify
 * pass can set `verified`/`verificationNote` in place. We walk the object
 * generically: any object with the TracedNumber shape (value+unit+source+asOf+
 * verified) is a hit. This keeps verification robust to schema growth.
 */
export function collectTracedNumbers(root: unknown): TracedNumber[] {
  return collectTracedNumberRefs(root).map((entry) => entry.number);
}

interface TracedNumberRef {
  number: TracedNumber;
  path: string;
  /**
   * The label of the metric row the number sits in ({label, values[]}), the
   * only description a TracedNumber has besides its unit. Read by the
   * excerpt-text match (D-45) and registry description conflict check (AI-407).
   */
  rowLabel?: string;
  rowKind?: "metric-row" | "named-row";
  cellPeriod?: string;
}

/** OD-3: null means the spelling/window is outside this cell check. */
function recordPeriodAgreement(label: string, record: NumericProvenanceRecord): boolean | null {
  if (/\b(?:ttm|12m|ending|ended|to)\b/i.test(label)) return null;
  const date = label.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (date) {
    if (record.period !== null) return /^\d{4}-\d{2}-\d{2}$/.test(record.period) ? date === record.period : null;
    const context = record.periodContext;
    return date === record.asOf || date === (context?.kind === "instant" ? context.at : context?.end);
  }
  if (/\b(?:Q[1-4]\s*)?FY\s*\d{4}\b/i.test(label)) {
    const fiscal = record.fiscalPeriod ?? record.periodContext?.fiscalLabel;
    return fiscal ? periodsAgree(label, fiscal, fiscal) : false;
  }
  return null;
}

function collectTracedNumberRefs(root: unknown): TracedNumberRef[] {
  const out: TracedNumberRef[] = [];
  const isTraced = (o: Record<string, unknown>): boolean =>
    typeof o.value === "number" &&
    typeof o.unit === "string" &&
    (typeof o.sourceId === "string" || typeof o.source === "string") &&
    ("asOf" in o) &&
    ("verified" in o);
  const walk = (node: unknown, path: string, rowLabel: string | undefined, rowKind?: TracedNumberRef["rowKind"], cellPeriod?: string): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index++) {
        walk(node[index], `${path}[${index}]`, rowLabel, rowKind, cellPeriod);
      }
      return;
    }
    const obj = node as Record<string, unknown>;
    if (isTraced(obj)) {
      out.push({ number: obj as unknown as TracedNumber, path: path || "$", cellPeriod, ...(rowLabel === undefined ? {} : { rowLabel, rowKind }) });
      return; // a TracedNumber has no nested TracedNumbers
    }
    // A MetricRow ({label, values: [{period, value}]}) labels the numbers
    // under its own `values` only; no sibling branch inherits the label.
    const ownRowLabel = typeof obj.label === "string" && Array.isArray(obj.values) ? obj.label : undefined;
    // A named row (a segment {name, revenue}, a peer {name, metrics[]}, a
    // macro series {name, latest}) is rendered under its name, so its numbers
    // are described by it too (review, 2026-10-13): without it a segment's
    // revenue verified on the unit text alone, against another segment's
    // figure, while the report printed it under this segment's name.
    const ownName = ownRowLabel === undefined && typeof obj.name === "string" ? obj.name : undefined;
    for (const key of Object.keys(obj)) {
      const childLabel = ownRowLabel !== undefined
        ? key === "values" ? ownRowLabel : undefined
        : ownName ?? rowLabel;
      walk(obj[key], path ? `${path}.${key}` : key, childLabel,
        ownRowLabel !== undefined ? key === "values" ? "metric-row" : undefined : ownName !== undefined ? "named-row" : rowKind,
        rowKind === "metric-row" && key === "value" && typeof obj.period === "string" ? obj.period : cellPeriod);
    }
  };
  walk(root, "", undefined);
  return out;
}

/** A sourced claim plus its exact report path, including optional market/competitor claims. */
interface SourcedClaimRef {
  claim: SourcedClaim;
  path: string;
}

function collectSourcedClaimRefs(root: unknown): SourcedClaimRef[] {
  const out: SourcedClaimRef[] = [];
  const labels = new Set(["FACT", "ESTIMATE", "JUDGMENT"]);
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index++) {
        walk(node[index], `${path}[${index}]`);
      }
      return;
    }
    const obj = node as Record<string, unknown>;
    if (
      typeof obj.text === "string" &&
      typeof obj.label === "string" &&
      labels.has(obj.label) &&
      (typeof obj.sourceId === "string" || typeof obj.source === "string") &&
      "asOf" in obj
    ) {
      out.push({ claim: obj as unknown as SourcedClaim, path: path || "$" });
      return;
    }
    for (const key of Object.keys(obj)) walk(obj[key], path ? `${path}.${key}` : key);
  };
  walk(root, "");
  return out;
}

/** Reader strings outside sourced claims/numbers, including optional future fields. */
function collectPlainProse(root: unknown): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const assembled = !!root && typeof root === "object" && "meta" in root && "appendix" in root;
  // These blocks are overwritten by assembly, not written by the judge. On an
  // intermediate judge/analyst output, still inspect every supplied string.
  const sections = new Set(JUDGE_OUTPUT_KEYS);
  const pipelineProse = /^(?:valuation\.(?:dcf|multiples|multiplesBasis|marketValueScope|peerCoverage)(?:\.|\[|$)|valuation\.scenarios\[\d+\]\.(?:assumptions|horizon)(?:\[|$)|quality\.notes(?:\[|$)|leadership\.executives\[\d+\]\.officeTenure(?:\.|$))/;
  const nonProse = new Set(["source", "sourceId", "asOf", "unit", "currency", "period", "url", "documentUrl", "filingDate", "occurredOn"]);
  const walk = (node: unknown, path: string): void => {
    if (assembled && path && (!sections.has(path.split(/[.[]/)[0]!) || pipelineProse.test(path))) return;
    const conditions = /^valuation\.scenarios\[(\d+)\]\.whatWouldHaveToBeTrue(?:\[|$)/.exec(path);
    // applyScenarioPresentation replaces these conditions only when its
    // deterministic assumption array has more than one row. Otherwise the
    // original AI conditions survive and must be checked here as reader prose.
    if (assembled && conditions && ((root as Report).valuation?.scenarios?.[Number(conditions[1])]?.assumptions?.length ?? 0) > 1) return;
    if (typeof node === "string") { out.push({ path, text: node }); return; }
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((child, i) => walk(child, `${path}[${i}]`)); return; }
    const obj = node as Record<string, unknown>;
    if ((typeof obj.text === "string" && ["FACT", "ESTIMATE", "JUDGMENT"].includes(String(obj.label))) ||
      (typeof obj.value === "number" && typeof obj.unit === "string" && "verified" in obj)) return;
    for (const [key, value] of Object.entries(obj)) {
      if (nonProse.has(key) || (!path && ["meta", "appendix"].includes(key))) continue;
      walk(value, path ? `${path}.${key}` : key);
    }
  };
  walk(root, "");
  return out;
}

function claimSourceMatch(
  claim: SourcedClaim,
  numericRegistry: readonly NumericProvenanceRecord[],
  citationRegistry: readonly CitationProvenanceRecord[],
  fetchedUrls: ReadonlySet<string>,
): {
  supported: boolean;
  reason: "supported" | "unknown-source" | "date-mismatch" | "gap-source-number" | "value-mismatch";
} {
  const sourceId = citationSourceId(claim);
  if (sourceId === null) return { supported: false, reason: "unknown-source" };
  const asOf = citationAsOf(claim);
  const numericMatches = numericRegistry.filter((record) => record.id === sourceId);
  const textMatches = citationRegistry.filter((record) => record.id === sourceId);
  const candidates = [
    ...numericMatches.map((record) => record.asOf),
    ...textMatches.map((record) => record.asOf),
  ];
  if (candidates.length > 0) {
    // A judgment can be timeless while still citing exact evidence. FACT and
    // ESTIMATE claims must reproduce the source's as-of date exactly.
    const dateMatches =
      claim.label === "JUDGMENT" || candidates.some((candidate) => candidate === asOf);
    if (!dateMatches) return { supported: false, reason: "date-mismatch" };
    // D-43: a citation of an absence (an n/a row, a manifest entry) or of a
    // figure whose unit, currency or date is not established supports prose
    // that states no number. Registering those printed tags is what lets
    // "EBIT interest coverage is not meaningful for this bank" verify; without
    // this guard "Net debt/EBITDA is 1.2x" citing the same n/a row verified too
    // (simulated 2026-10-13). Every record the claim could mean is read, so a
    // judgment citing an id with a gap row at any date is held to it.
    if (numericMatches.length === 0) {
      const cited = claim.label === "JUDGMENT"
        ? textMatches
        : textMatches.filter((record) => record.asOf === asOf);
      const stated = proseNumbers(claim.text);
      // A number written in words is a number too (review, 2026-10-13: "Net
      // debt/EBITDA is two times" citing the n/a row verified).
      if (
        (stated.length > 0 || statesNumberWord(claim.text)) &&
        cited.some((record) => record.kind !== "payload-text")
      ) {
        return { supported: false, reason: "gap-source-number" };
      }
      // A text row that shows numbers ("25/50/25") supports exactly that
      // sequence: the numbers in the row's order, all of them. Membership
      // alone let "the bull case carries a 50% weight" verify against
      // bull/base/bear 25/50/25 (review, 2026-10-13); prose that states the
      // numbers some other way fails closed.
      const allowed = cited.flatMap((record) => record.allowedNumbers ?? []);
      // A full officer filing may share a tag with a restricted transition
      // summary. A parsed package supports its exact recipient and amount,
      // without opening every amount in that filing to every named person.
      // Require the recipient as the explicit subject, never mere presence
      // elsewhere in the source. Excerpt metric/unit checks still follow.
      const packages = numericRegistry.filter((record) => record.subject !== undefined && record.origin === sourceId && record.asOf === asOf);
      const packageMatched = stated.length === 1 && packages.some((record) => {
        const subject = record.subject!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`^\\s*${subject}(?:['’]s)?\\s+`, "i").test(claim.text) && stated[0] === record.value;
      });
      if (stated.length > 0 && packages.length > 0 && !packageMatched) return { supported: false, reason: "value-mismatch" };
      if (
        (stated.length > 0 || statesNumberWord(claim.text)) &&
        cited.some((record) => record.allowedNumbers !== undefined) &&
        !packageMatched &&
        (stated.length !== allowed.length || stated.some((value, i) => value !== allowed[i]))
      ) {
        return { supported: false, reason: "value-mismatch" };
      }
      // A row whose content is a date (the next-earnings note) supports that
      // date only, and no other number (review, 2026-10-13).
      if (
        cited.some((record) => record.allowedDates !== undefined) &&
        !statesOnlyAllowedDates(claim.text, cited.flatMap((record) => record.allowedDates ?? []))
      ) {
        return { supported: false, reason: "value-mismatch" };
      }
    }
    return { supported: true, reason: "supported" };
  }
  const canonical = canonicalizeFetchedUrl(sourceId);
  return canonical !== null && fetchedUrls.has(canonical)
    ? { supported: true, reason: "supported" }
    : { supported: false, reason: "unknown-source" };
}

function appendUnverifiedNote(number: TracedNumber, reason: ProvenanceFailureReason): void {
  const note = `[unverified] ${reason}`;
  number.verificationNote = number.verificationNote
    ? `${number.verificationNote}; ${note}`
    : note;
}

function resolveOmittedIdentity(
  supplied: string | null | undefined,
  registered: string | null,
): string | null {
  return supplied ?? registered;
}

/**
 * WS7 (D-20): the people the report itself names in its executive cards. The
 * best evidence for "which names in this document are people" is the document's
 * own `leadership.executives[].name` list, which the judge filled from the
 * payload — no name guessing required for those.
 */
/**
 * The issuer's and its peers' company names, so an honorific inside a company
 * name ("Dr Pepper") is not read as a person (consistency.ts, F187). Peer
 * figures are labelled "SYMBOL — Company Name" (payload.ts peersSection).
 */
function payloadOrganizationNames(payload: ContextPayload): string[] {
  const names: string[] = [];
  if (payload.companyName) names.push(payload.companyName);
  for (const figure of payload.peers?.figures ?? []) {
    const parts = figure.label.split(" — ");
    if (parts.length >= 2 && parts[1].trim().length > 0 && parts[1].trim() !== "?") {
      names.push(parts[1].trim());
    }
  }
  return names;
}

function reportExecutiveNames(root: unknown): string[] {
  const leadership = (root as { leadership?: { executives?: unknown } }).leadership;
  const executives = leadership?.executives;
  if (!Array.isArray(executives)) return [];
  return executives.flatMap((executive) => {
    const name = (executive as { name?: unknown }).name;
    return typeof name === "string" && name.trim().length > 0 ? [name.trim()] : [];
  });
}

/**
 * Deterministic CITATION-COVERAGE pass (the authority for the `verified` flag).
 * This measures PROVENANCE, not correctness. A TracedNumber is supported only
 * when its exact registry ID resolves and value, unit, currency, period, and
 * as-of all match that record within its declared display precision, or (D-45)
 * when it cites a filing/transcript excerpt and that excerpt prints it as a
 * specific figure beside words of its own description — logged as
 * "excerpt-match", after the source-span binding checks any supplied period
 * and rejects ambiguous columns. A claim is
 * supported only by an exact numeric/text registry tag (including its as-of for
 * FACT/ESTIMATE) or a URL actually observed in provider web-search results.
 * Untraceable evidence is never deleted: numbers are marked
 * false with an explicit reason, and claims receive an unverified log entry.
 * Numeric prose is checked against its exact typed record or an unambiguous
 * source-span binding. Citation presence is counted separately from numeric
 * content validation; qualitative content and ambiguous bindings are unchecked.
 * Rates are null when their denominator is zero, never synthetic perfection.
 *
 * Deterministic-only: an earlier model-side pass (VERIFY_MODEL) was removed
 * because it discarded its output and merely burned tokens — the trace here has
 * always been the sole authority. The verifyModel setting/env/meta plumbing was
 * removed with it; old persisted reports keep their meta.verifyModel label.
 */
export async function runVerifyPass<T extends object = JudgeOutput>(
  deps: PassDeps,
  payload: ContextPayload,
  reportOutput: T,
  evidence: VerificationEvidence = { fetchedUrls: [] },
  settlement?: PassSettlementHook<T>,
): Promise<VerifyResult<T>> {
  void deps;
  // Deep-clone so we mutate a copy, never the caller's object.
  const verifiedReport = structuredClone(reportOutput) as T;
  // This optional report-owned field never accepts judge-authored facts.
  const reportRoot = verifiedReport as Partial<Report>;
  // Standalone judge verification has no report wrapper yet. Its eventual
  // rendered destination is established by the same trusted payload, rather
  // than by the presence of meta/appendix on this intermediate object.
  // Isolated legacy text/numeric verification callers can omit statement
  // blocks. They retain their existing verification contract and establish
  // no optional reported-earnings destination.
  const sourceFactSummary = Array.isArray(payload.statements) ? buildSourceFactSummary(payload) : undefined;
  if (reportRoot.meta && reportRoot.appendix) {
    if (sourceFactSummary) reportRoot.sourceFactSummary = sourceFactSummary;
    else delete reportRoot.sourceFactSummary;
  }
  // D-285 (P20, K33): a whole-feed news citation is re-cited to its one article or the statement is removed,
  // before any guard or check below reads a path.
  const recitation = reciteFeedClaims(verifiedReport, payload.news?.articles ?? []);
  const guardedReferences = guardEarningsReferences(verifiedReport, sourceFactSummary?.earningsReconciliation.status === "available");
  Object.assign(verifiedReport, guardedReferences.report);
  const guardedSchedule = guardEarningsSchedule(verifiedReport, payload.estimates?.notes ?? [], payload.citationRegistry, (payload.filings ?? []).filter(entry => entry.sourceEvidence?.kind === "issuer-statement").map(entry => entry.source),
    { issuerName: payload.companyName, newsNotes: payload.news?.notes ?? [], passages: payload.filings ?? [] });
  Object.assign(verifiedReport, guardedSchedule.report);
  const registry = payload.provenanceRegistry ?? [];
  const citationRegistry = payload.citationRegistry ?? [];
  const fetchedUrls = new Set(
    evidence.fetchedUrls.flatMap((value) => {
      const canonical = canonicalizeFetchedUrl(value);
      return canonical ? [canonical] : [];
    }),
  );
  const numbers = collectTracedNumberRefs(verifiedReport);
  const claims = collectSourcedClaimRefs(verifiedReport);

  // WS7 (D-20): the deterministic no-model checks. Run before the coverage loop
  // because the named-individual restriction can reject a claim the citation
  // check would otherwise have counted as supported.
  // D-43: the payload's person rows, which a claim citing one is read
  // against. The compensation rows' names join the known names, so a claim
  // naming a proxy-listed officer is recognised as naming a person.
  const personRows = collectPersonRows({
    leadershipNotes: payload.leadership?.notes,
    insiderNotes: payload.insiders?.notes,
    leadershipFigures: payload.leadership?.figures,
  });
  const personNames = collectPersonNames({
    leadershipNotes: payload.leadership?.notes,
    insiderNotes: payload.insiders?.notes,
    executiveNames: [
      ...reportExecutiveNames(verifiedReport),
      ...personRows.filter((row) => row.tag !== "fmp:key-executives" && !row.anyOrder).map((row) => row.name),
    ],
  });
  const consistency = runConsistencyChecks({
    claims,
    registry,
    citationRegistry,
    fetchedUrls,
    personNames,
    organizationNames: payloadOrganizationNames(payload),
    personRows,
    transcriptSource: payload.transcript?.source,
  });

  const log: VerificationLogEntry[] = [...guardedReferences.log, ...guardedSchedule.log,
    ...recitation.removed.map(({ path, claim, candidates }): VerificationLogEntry => ({
      claim: claim.text,
      outcome: "removed",
      note: `Removed: the statement cites the whole news feed on ${citationAsOf(claim) ?? "an undated day"}, and the payload holds ${candidates === 0 ? "no article" : candidates === 1 ? "one article without a link" : `${candidates} articles`} of that feed and date, so no single article can be named.`,
      traceKind: "untraced",
      path,
      evidenceKind: claim.label === "JUDGMENT" ? "judgment" : "factual-claim",
      source: claim.source,
      reason: "unknown-source",
    }))];
  let traced = 0;

  // D-45: the excerpts a number may be read against, and the one currency a
  // printed "$" can mean — the issuer's statements' own, when they agree on a
  // single one. No statement currency, or two, and no money figure in the
  // excerpts can verify.
  const excerpts = [payload.transcript ?? null, ...(payload.filings ?? [])].filter(
    (excerpt): excerpt is NonNullable<typeof excerpt> => excerpt !== null,
  );
  const statementCurrencies = new Set(
    registry.flatMap((record) =>
      record.id.startsWith("payload.statements.") && record.currency !== null ? [record.currency] : []),
  );
  const reportingCurrency = statementCurrencies.size === 1 ? [...statementCurrencies][0] : null;
  const issuerWords = [payload.companyName ?? "", payload.symbol ?? ""];
  const claimEvidenceIndex: ClaimEvidenceIndex = new Map();
  const seriesLatest = reportedSeriesLatest(registry);

  for (const { number, path, rowLabel, rowKind, cellPeriod } of numbers) {
    const sourceId = citationSourceId(number);
    const sourceAsOf = citationAsOf(number);
    if (sourceId !== null) number.sourceId = sourceId;
    let periodNote: string | null = null;
    let excerptNote: string | null = null;
    let excerptMatched = false;
    let numberSourceSpans: ClaimSourceSpan[] = [];
    const record = sourceId === null
      ? undefined
      : registry.find((entry) => entry.id === sourceId);
    let reason: ProvenanceFailureReason;
    let ok = false;
    if (!record) {
      // A number lifted from filing or transcript prose cites a registered
      // TEXT source. It is still unverifiable (numbers trace only against
      // numeric records) but the log should say that, not call a source the
      // payload itself advertised "unknown". A row that shows no verifiable
      // number (an n/a row, a manifest entry, a figure of unestablished
      // currency, unit or date) says so instead (D-43): it is not prose.
      const cited = sourceId === null
        ? []
        : citationRegistry.filter((entry) => entry.id === sourceId);
      reason = cited.length === 0
        ? "unknown-source"
        : cited.some((entry) => entry.kind !== "payload-text")
          ? "gap-source-number"
          : "text-source";
      const unitOnly = canonicalizeTracedUnit(number.unit, number.currency);
      // D-45: a number citing a filing or transcript excerpt is read against
      // that excerpt's own text — the exact (source, as-of) excerpt only, its
      // body without the truncation marker — and verifies only when printed
      // there at its precision, as a specific figure, beside most words of the
      // claim's own description (excerptNumbers.ts). Other text rows (news,
      // string figures, insider notes) carry no text to read and stay
      // text-source.
      const excerpt = reason === "text-source"
        ? excerpts.find((entry) => entry.source === sourceId && entry.asOf === sourceAsOf)
        : undefined;
      if (excerpt !== undefined) {
        if (unitOnly === null) {
          reason = "unit-mismatch";
        } else {
          const match = matchExcerptNumber(
            { value: number.value, unit: unitOnly.unit, currency: unitOnly.currency, displayUnit: number.unit },
            excerptBodyForVerification(excerpt),
            {
              reportingCurrency,
              description: `${number.unit} ${rowLabel ?? ""}`,
              ignoreWords: issuerWords,
            },
          );
          if (match.ok) {
            const suffix = unitOnly.unit === "shares" ? " shares" : unitOnly.unit === "count" ? " count" : "";
            const money = unitOnly.unit === "currency" || unitOnly.unit === "currency-per-share";
            const currency = money ? match.currency ?? unitOnly.currency ?? "" : "";
            const quantityText = match.mention.raw.replace(/\$/, `${currency || "$"} `);
            const binding = validateClaimNumericSupport({ label: "FACT", source: sourceId!, asOf: sourceAsOf,
              text: `${number.unit} ${rowLabel ?? ""} ${number.period ?? ""}: ${quantityText}${suffix}` },
            { excerpts: [excerpt], sourceId: sourceId!, reportingCurrency, ignoreWords: issuerWords, index: claimEvidenceIndex });
            ok = binding.status === "validated";
            excerptMatched = ok;
            numberSourceSpans = binding.spans;
            if (ok && match.currency !== null) number.currency = match.currency;
            if (!ok) reason = binding.reason === "supported" ? "text-ambiguous" : binding.reason;
            excerptNote = binding.note;
          } else {
            reason = match.reason;
            excerptNote = match.reason === "text-source"
              ? "value not printed in the cited excerpt"
              : match.reason === "text-ambiguous"
                ? `printed only as a low-precision figure (${(match.mentions ?? []).map((mention) => `"${mention.raw}"`).join(", ")})`
                : match.reason === "text-context-mismatch"
                  ? "printed, but no word of the number's own description appears beside it"
                  : null;
          }
        }
      }
      // Nothing establishes an omitted currency here: record it as unknown.
      if (
        !ok &&
        unitOnly !== null &&
        (unitOnly.unit === "currency" || unitOnly.unit === "currency-per-share") &&
        unitOnly.currency === null
      ) {
        number.currency = null;
      }
    } else {
      const normalized = canonicalizeTracedUnit(number.unit, number.currency);
      const amount = normalized?.unit === "currency"
        ? currencyCandidateInBaseUnits({ value: number.value, unit: normalized.unit, currency: normalized.currency, displayUnit: number.unit })
        : { ok: true as const, value: number.value, currency: normalized?.currency ?? null };
      // A unit that names an indicator ("RSI", "MACD histogram") is read only
      // on that indicator's record: the report prints the unit verbatim
      // beside the verified number (D-44).
      if (normalized === null || !namedUnitMatchesRecord(number.unit, record.id)) {
        reason = "unit-mismatch";
      } else if (!amount.ok) {
        reason = amount.reason;
      } else {
        // Tolerate an OMITTED optional dimension the payload never gave the model
        // a way to cite: `period` is derived from a figure LABEL and is never
        // rendered as a citable tag, and most monetary figures render with the
        // generic unit "currency" and NO ISO code in the prompt. When the model
        // drops one, adopt the record's value — the registry id already pins the
        // exact record (and hence its period/currency). A SUPPLIED-but-wrong
        // period or currency still mismatches, so a genuine error is not masked.
        // AI-408 / OD-3: retain decidable conflicts before erasing the
        // period-less as-of decoration used by the historical haiku output.
        const periodStated = number.period != null && number.period.trim() !== "";
        const suppliedPeriodConflict = record.period === null && number.period != null &&
          recordPeriodAgreement(number.period, record) === false;
        if (record.period === null && number.period != null && !suppliedPeriodConflict) number.period = null;
        // A spelling of the registered period ("total debt 2025-12-31", or
        // "FY2025" when the issuer's own label for the row is FY2025) is the
        // same period; adopt the registry's spelling and say so in the log.
        // Another period of the same year still mismatches (periodsAgree).
        if (
          record.period !== null &&
          number.period != null &&
          number.period !== record.period &&
          (periodsAgree(number.period, record.period, record.fiscalPeriod ?? null) || recordEstablishesInterval(number.period, record))
        ) {
          periodNote = `period "${number.period}" read as ${record.period}`;
          number.period = record.period;
        }
        const period = resolveOmittedIdentity(number.period, record.period);
        const currency = resolveOmittedIdentity(amount.currency, record.currency);
        const match = matchProvenanceRecord(
          {
            value: amount.value,
            unit: normalized.unit,
            currency,
            period,
            ...(number.periodContext === undefined ? {} : { periodContext: number.periodContext }),
            asOf: sourceAsOf ?? "",
            source: sourceId ?? "",
            periodStated,
          },
          registry,
        );
        ok = match.ok;
        reason = match.ok ? "unknown-source" : match.reason;
        const filedFiscal = record.fiscalPeriod === undefined && record.periodContext?.fiscalLabel === undefined
          ? filedCalendarFiscalLabel(record, excerpts) : undefined;
        const columnAgreement = cellPeriod === undefined ? null : recordPeriodAgreement(cellPeriod,
          filedFiscal === undefined ? record : { ...record, fiscalPeriod: filedFiscal });
        if (cellPeriod !== undefined && columnAgreement === null) {
          periodNote = [periodNote, `column "${cellPeriod}" not period-checked`].filter(Boolean).join("; ");
        }
        if (ok && (suppliedPeriodConflict || columnAgreement === false)) {
          ok = false;
          reason = "period-mismatch";
        }
        if (ok) {
          const words = unitLabel(number.unit) ?? "";
          const conflict = descriptionConflictsWithRecord({
            metric: `${rowKind === "metric-row" ? (rowLabel ?? "").replace(/^(?:FACT|ESTIMATE|JUDGMENT)\s*[:\u2010-\u2014-]\s*/i, "") : ""} ${words}`,
            segment: `${rowLabel ?? ""} ${words}`,
          }, record, issuerWords);
          const printed = typeof number.source === "string" ? parseCitationRef(number.source)?.sourceId : undefined;
          if (conflict || (printed && printed !== sourceId && registry.some(entry => entry.id === printed))) {
            ok = false;
            reason = "text-context-mismatch";
            excerptNote = conflict ? `the printed description names another metric: ${conflict}` : "the printed source names another record";
          }
        }
        // D-304: a match at registry precision must also agree at the
        // submitted figure's displayed decimals and unit (P19/P22).
        // Otherwise double rounding can give an incorrect figure a checkmark.
        if (ok) {
          const scale = number.value === 0 ? 1 : amount.value / number.value;
          if (!sameTracedDisplayValue(number, { ...number, value: record.value / scale })) {
            ok = false;
            reason = "value-mismatch";
          }
        }
        // Exact matching validates any registry context before it can pass.
        // Fresh AI output omits this source-owned metadata; retain the trusted
        // window on the verified number without sharing the payload object.
        if (match.ok && number.periodContext === undefined && match.record.periodContext !== undefined) {
          number.periodContext = structuredClone(match.record.periodContext);
        }
        // The match above read an omitted currency as the record's; the
        // STORED number has to say so too, or a TWD figure renders as
        // dollars. A monetary number nothing resolved is recorded as unknown
        // (null) — never left for the formatter to read as a legacy USD one.
        const monetary = normalized.unit === "currency" || normalized.unit === "currency-per-share";
        if (monetary && normalized.currency === null) {
          number.currency = ok ? record.currency : null;
        }
      }
    }
    number.verified = ok;
    const traceKind: NonNullable<VerificationLogEntry["traceKind"]> = !ok
      ? "untraced"
      : excerptMatched
        ? "excerpt-match"
        : record?.kind === "computed"
          ? "computed-derived"
          : "payload-match";
    const renderedCitation = sourceId === null
      ? "[unsupported citation]"
      : serializeCitationRef({ sourceId, asOf: sourceAsOf });
    const rendered = `${number.value} ${number.unit} ${renderedCitation}`;
    if (ok) {
      traced += 1;
      log.push({
        claim: rendered,
        outcome: "verified",
        note: excerptNote !== null
          ? excerptNote
          : periodNote === null ? "exact provenance record matched" : `exact provenance record matched (${periodNote})`,
        traceKind,
        path,
        evidenceKind: "number",
        source: sourceId ?? number.source,
        reason: "supported",
        validationStatus: "validated",
        ...(numberSourceSpans.length === 0 ? {} : { sourceSpans: numberSourceSpans }),
      });
    } else {
      appendUnverifiedNote(number, reason);
      log.push({
        claim: rendered,
        outcome: "unverified",
        note: excerptNote === null ? `[unverified] ${reason}` : `[unverified] ${reason}: ${excerptNote}`,
        traceKind,
        path,
        evidenceKind: "number",
        source: sourceId ?? number.source,
        reason,
        // F-22: only a value conflict contradicts; a period, unit or currency
        // the record does not establish leaves the figure unverified.
        validationStatus: reason === "value-mismatch" ? "contradicted" : "unchecked",
        ...(numberSourceSpans.length === 0 ? {} : { sourceSpans: numberSourceSpans }),
      });
    }
  }

  let factualSupported = 0;
  let factualTotal = 0;
  let factualValidated = 0;
  let factualUnchecked = 0;
  let factualContradicted = 0;
  let factualQualitative = 0;
  let judgmentsCited = 0;
  let judgmentsTotal = 0;
  for (const { claim, path } of claims) {
    const sourceId = citationSourceId(claim);
    if (sourceId !== null) claim.sourceId = sourceId;
    const match = claimSourceMatch(claim, registry, citationRegistry, fetchedUrls);
    // WS7 (D-20): a claim about a named person that rests on a web-search result
    // is REJECTED, and rejected means it does not count as supported either. If
    // the URL still carried it, the coverage number would say the opposite of
    // the finding sitting next to it in the same appendix.
    const rejected = consistency.rejectedClaimPaths.has(path);
    const scheduleQualified = guardedSchedule.qualifiedClaimPaths.has(path);
    const supported = match.supported && !rejected;
    const judgment = claim.label === "JUDGMENT";
    const registryRecord = sourceId === null
      ? undefined
      : registry.find((record) => record.id === sourceId);
    // A person the claim names in full is attribution, not part of the metric
    // ("Jen-Hsun Huang: operating cash flow for FY2026 was ..."). A partial
    // name stays, so a lone surname that is also a metric word cannot vanish.
    const claimWords = new Set(claim.text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
    const namedPeople = personNames.filter((name) => {
      const parts = name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      return parts.length > 1 && parts.every((part) => claimWords.has(part));
    });
    const validationOptions = { record: registryRecord, excerpts, sourceId: sourceId ?? "", reportingCurrency, ignoreWords: [...issuerWords, ...namedPeople], index: claimEvidenceIndex, seriesLatest, registry };
    // D-282 (P19, A1): a wrong cited date does not hide a value conflict with the one record the id names.
    const dateConflict = !supported && !rejected && !scheduleQualified && !judgment && match.reason === "date-mismatch" && sourceId !== null
      && registry.filter((record) => record.id === sourceId).length === 1
      ? valueConflictAtRecordDate(claim, validationOptions) : null;
    const validation = dateConflict ?? (supported && !scheduleQualified && sourceId !== null
      ? validateClaimNumericSupport({ ...claim, asOf: citationAsOf(claim) }, validationOptions)
      : { status: "unchecked" as const, reason: match.reason, note: "citation unavailable or rejected; factual content unchecked", spans: [] });
    if (supported && validation.status === "unchecked" && citationRegistry.some((entry) => entry.id === sourceId && entry.allowedNumbers !== undefined)) {
      validation.reason = "supported";
      validation.note = "citation and ordered declared text values matched; metric-specific content remains unchecked";
    }
    const semanticFailures = supported ? consistency.findings.filter((finding) => finding.path === path &&
      (finding.check === "direction" || finding.check === "period" || finding.check === "unit")) : [];
    const semanticFailure = semanticFailures.find((finding) => finding.check === "direction") ?? semanticFailures[0];
    // F-22: a direction word against the sign of its cited change is a value
    // conflict, and it outranks a period or unit finding on the same claim.
    // A period or unit word the check could not establish against the cited
    // record is a metadata gap: the claim is unverified, never validated, and
    // contradicted only when its value conflicts as well.
    const validationStatus = scheduleQualified ? "unchecked" : semanticFailure === undefined ? validation.status
      : semanticFailure.check === "direction" || validation.status === "contradicted" ? "contradicted" : "unchecked";
    // The recorded reason names the conflict, so a contradicted entry never
    // carries a metadata reason (presentation reads such legacy entries as
    // unverified).
    const statusFinding = semanticFailure !== undefined && semanticFailure.check !== "direction" && validation.status === "contradicted"
      ? undefined : semanticFailure;
    const validated = supported && validationStatus === "validated";
    if (judgment) {
      judgmentsTotal += 1;
      if (supported) judgmentsCited += 1;
    } else {
      factualTotal += 1;
      if (supported) factualSupported += 1;
      if (validated) factualValidated += 1;
      else if (validationStatus === "contradicted") factualContradicted += 1;
      else factualUnchecked += 1;
      if (supported && validationStatus === "cited") factualQualitative += 1;
    }
    // The check's own reason, not a blanket "unknown-source": a claim that
    // cited a registered row and was rejected for its content (a person the
    // row does not list, a currency the row does not establish) was not
    // unsourced (D-43).
    const rejection = rejected
      ? consistency.findings.find((finding) => finding.path === path &&
        (finding.check === "named-individual" || finding.reason === "currency-not-established"))
      : undefined;
    log.push({
      claim: claim.text,
      // Matching quantities does not adjudicate the entire prose proposition.
      // Keep numeric validation/counts while exposing the narrower claim scope.
      outcome: "unverified",
      note: scheduleQualified ? "Provider-only event date qualified; the original citation does not establish company confirmation or validate the surrounding claim." : dateConflict ? dateConflict.note : supported
        ? statusFinding?.note ?? validation.note
        : rejected
          ? rejection?.check === "named-individual"
            ? "[unverified] rejected by the named-individual restriction; see the check entry for this path"
            : "[unverified] rejected by a consistency check; see the check entry for this path"
          : `[unverified] ${match.reason}`,
      traceKind: supported
        ? validated && registryRecord?.kind === "computed"
          ? "computed-derived"
          : validated && registryRecord
            ? "payload-match"
            : validated && validation.spans.length > 0 ? "excerpt-match" : "source-cited"
        : "untraced",
      path,
      evidenceKind: judgment ? "judgment" : "factual-claim",
      source: sourceId ?? claim.source,
      reason: scheduleQualified ? "earnings-date-qualified" : rejected ? (rejection?.reason ?? "unknown-source") : dateConflict ? dateConflict.reason : !supported ? match.reason : statusFinding?.reason ?? validation.reason,
      validationStatus,
      numericSupportStatus: validationStatus,
      claimSupportStatus: validated ? "numeric-only" : validationStatus === "contradicted" ? "contradicted" : supported ? "cited" : "unreviewed",
      ...(validated && registryRecord && /^leadership\.executives\[\d+\]\.evidence\./.test(path) && executiveEvidenceKind(registryRecord)
        ? { executiveEvidenceKind: executiveEvidenceKind(registryRecord) } : {}),
      ...(validation.spans.length === 0 ? {} : { sourceSpans: validation.spans }),
    });
  }

  // WS7 (D-20): one log entry per deterministic-check FAILURE, each naming the
  // sentence, the figure it cited and why it failed. These are distinct from the
  // citation-coverage entries above (they carry `check`), so a reader can tell
  // "this number has no source" from "this sentence contradicts its source".
  for (const finding of consistency.findings) {
    log.push({
      claim: finding.sentence,
      outcome: "unverified",
      note: `[check:${finding.check}] ${finding.note} Cited figure: ${finding.figure}.`,
      traceKind: "untraced",
      path: finding.path,
      evidenceKind: "factual-claim",
      ...(finding.sourceId === null ? {} : { source: finding.sourceId }),
      reason: finding.reason,
      check: finding.check,
    });
  }

  // D-283 (P18, P19; revises D-197): a plain figure may value-match only code-owned evidence: the numeric
  // records, retained filing and transcript text and the provider's news rows. The report's own claims and the
  // analysts' retained cases and research notes are model-written, so a figure found only there (a model's own
  // key number restated in the verdict) is "not matched", never an unmarked value match.
  const plainIndex = buildPlainFigureIndex(registry, [
    ...excerpts.map(excerpt => ({ source: excerpt.source, text: excerptBodyForVerification(excerpt) })),
    ...(payload.news?.notes ?? []).map(text => ({ source: "payload.news", text })),
  ], reportingCurrency, issuerWords);
  for (const { path, text } of collectPlainProse(verifiedReport)) {
    const results = checkPlainFigures(text, { registry, excerpts, reportingCurrency, ignoreWords: issuerWords, seriesLatest, index: plainIndex });
    for (const outcome of ["contradiction", "not-found", "value-match"] as const) {
      const figures = results.filter(result => result.outcome === outcome);
      if (!figures.length) continue;
      const note = outcome === "contradiction"
        ? `Differs from the record: ${[...new Set(figures.map(result => `${result.figure} stated, ${result.recorded} recorded`))].join("; ")}.`
        : `${outcome === "value-match" ? "Value matched; context not confirmed" : "Not matched to a source"}: ${[...new Set(figures.map(result => result.figure))].join("; ")}.`;
      log.push({ path, claim: text, outcome: "unverified", check: "plain-figure", traceKind: outcome === "value-match" ? "value-match" : "untraced",
        validationStatus: "unchecked", numericSupportStatus: "unchecked", claimSupportStatus: "unreviewed",
        reason: outcome === "contradiction" ? "value-mismatch" : outcome === "value-match" ? "supported" : "text-source", note,
        ...(figures.length === 1 && figures[0]!.source ? { source: figures[0]!.source } : {}) });
    }
  }

  // Appended deterministic tables contain plain scalars as well as traced
  // cells. Their explicit unchecked inventory is separate from both rates.
  log.push(...supplementalNumericAudit(verifiedReport));
  const total = numbers.length;
  const numeric = calculateCoverage(traced, total);
  const factualClaims = calculateCoverage(factualSupported, factualTotal);
  const judgmentRate = calculateCoverage(judgmentsCited, judgmentsTotal);
  const coverage: ProvenanceCoverage = {
    numeric,
    factualClaims,
    factualValidation: {
      cited: factualSupported,
      validated: factualValidated,
      unchecked: factualUnchecked,
      contradicted: factualContradicted,
      qualitative: factualQualitative,
      total: factualTotal,
      rate: factualTotal === 0 ? null : factualValidated / factualTotal,
    },
    judgments: {
      cited: judgmentRate.supported,
      total: judgmentRate.total,
      rate: judgmentRate.rate,
    },
  };

  // NOTE: an optional model-side pass (VERIFY_MODEL) used to run here, but it
  // DISCARDED its output entirely — the deterministic trace above is, and always
  // was, the sole authority for `verified`/the rate — so it only spent tokens
  // (whose cost wasn't even captured, since the runPass return was ignored).
  // Removed as pure waste. A future REAL verification (dereference the payload
  // path or re-fetch the cited number — see the runVerifyPass docstring) would
  // slot in here and actually feed back into the report.

  const executiveRoot = verifiedReport as {leadership?: Report["leadership"]};
  if (executiveRoot.leadership && Array.isArray(executiveRoot.leadership.executives)) {
    executiveRoot.leadership = assessExecutiveEvidence(executiveRoot.leadership, log, false, {
      officerTenures: payload.leadership?.officerTenures, tenureConflicts: payload.leadership?.tenureConflicts, notes: payload.leadership?.notes, filings: retainedDecisionSources(payload), issuer: payload.companyName, numericRecords: registry,
      asOf: reportRoot.meta?.generatedAt ?? payload.quote?.figures?.find(f => f.asOf)?.asOf,
    });
  }
  if (reportRoot.meta && reportRoot.appendix) reportRoot.appendix.verificationLog = log;
  const result = {
    verifiedReport,
    verificationRate: numeric.rate,
    coverage,
    checks: consistency.checks,
    log,
    traced,
    total,
  };
  await invokePassSettlementHook(settlement, {
    outcome: "success",
    data: verifiedReport,
    telemetry: {
      model: "deterministic",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      webSearches: 0,
      costUsd: 0,
      fallbackUsed: false,
      billable: false,
      fetchedUrls: [],
    },
  });
  return result;
}
