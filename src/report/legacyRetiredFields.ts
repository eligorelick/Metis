import { CORPORATE_ACTION_BRIDGE_WRITING_STAMPS } from "@/report/versions";
import { z } from "zod";
import { FilingDisclosuresSchema, type Report } from "@/report/schema";

/**
 * Fields that a stored report was written with but the current report schema
 * does not know (P21, D-216). The schema stays strict: a stored field is set
 * aside only when it is listed here, sits at its listed path, has exactly the
 * shape it was written with, and its report carries a spec stamp from the
 * builds that wrote it. Anything else still fails the read. The stored bytes
 * are never changed; the read-time view carries a fixed disclosure instead of
 * the field, so nothing the report holds disappears unannounced.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Frozen copy of the filing reference as those builds wrote it. */
const frozenFilingRef = z.object({
  form: z.string(),
  accession: z.string(),
  exhibit: z.string().nullable(),
  filingDate: day,
  url: z.string().nullable(),
}).strict();

/**
 * `filingDisclosures.corporateActionBridge`: written on 2026-11-01 by local,
 * uncommitted work on a spec 1.23.x checkout (later kept only in a git stash).
 * It never reached main. Frozen copy of that build's schema.
 */
const corporateActionBridge = z.object({
  status: z.enum(["unresolved", "coverage-incomplete"]),
  balanceDate: day.nullable(),
  asOf: day,
  evidence: z.array(z.object({
    kind: z.enum(["acquisition-completed", "acquisition-disclosure", "equity-issuance", "resale-registration"]),
    eventDate: day.nullable(),
    source: frozenFilingRef,
    text: z.string(),
  }).strict()),
  limitations: z.array(z.string()),
}).strict();

export type RetiredCorporateActionBridge = z.infer<typeof corporateActionBridge>;

/** One retired field found on a stored report, set aside for the read-time view. */
export interface RetiredStoredField {
  path: "filingDisclosures.corporateActionBridge";
  value: RetiredCorporateActionBridge;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Set aside the listed retired fields of one parsed stored-report JSON value.
 * Returns the input unchanged (same object) when nothing qualifies, and never
 * mutates it.
 */
export function detachRetiredStoredFields(raw: unknown): { raw: unknown; retired: RetiredStoredField[] } {
  if (!isRecord(raw) || !isRecord(raw.filingDisclosures) || !isRecord(raw.meta)) return { raw, retired: [] };
  const { corporateActionBridge: stored, ...rest } = raw.filingDisclosures;
  if (stored === undefined || "corporateActionBridge" in FilingDisclosuresSchema.shape) return { raw, retired: [] };
  if (typeof raw.meta.specVersion !== "string" || !CORPORATE_ACTION_BRIDGE_WRITING_STAMPS.has(raw.meta.specVersion)) return { raw, retired: [] };
  const parsed = corporateActionBridge.safeParse(stored);
  if (!parsed.success) return { raw, retired: [] };
  return {
    raw: { ...raw, filingDisclosures: rest },
    retired: [{ path: "filingDisclosures.corporateActionBridge", value: parsed.data }],
  };
}

/** Fixed wording only: no filing or model text reaches the disclosure, only counts and enums. */
export function retiredCorporateActionBridgeNote(bridge: RetiredCorporateActionBridge, notes: readonly string[]): string {
  const items = bridge.evidence.length;
  const status = bridge.status === "unresolved" ? "unresolved" : "coverage incomplete";
  // Claim the source details are still shown only when one note states every one of them for every item.
  const listed = items > 0 && bridge.evidence.every(({ source: { form, accession, filingDate, url } }) =>
    url !== null && notes.some((n) => n.includes(`${form} ${accession} filed ${filingDate}`) && n.includes(url)));
  return `Read-time notice: this saved report also stores a corporate-action evidence record (status: ${status}; ${items} source item${items === 1 ? "" : "s"}) written by a development build that never became part of the app. ` +
    (listed
      ? "The current app cannot show that record's table or its source excerpts; each item's form, accession number, filing date and link appear in these filing notes. "
      : "The current app cannot show that record's table, its source excerpts or its source list. ") +
    "The stored report was not changed.";
}

/** Disclose each set-aside field where its content would have been read. */
export function withRetiredFieldDisclosures(report: Report, retired: readonly RetiredStoredField[]): Report {
  const d = report.filingDisclosures;
  if (retired.length === 0 || d === undefined) return report;
  const notes = [...d.notes];
  for (const field of retired) {
    const note = retiredCorporateActionBridgeNote(field.value, d.notes);
    if (!notes.includes(note)) notes.push(note);
  }
  return { ...report, filingDisclosures: { ...d, notes } };
}
