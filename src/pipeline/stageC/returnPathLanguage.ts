/**
 * Stage C — base-case language about returns "recovering toward" the cost of
 * equity (audit 2026-10-22 C-11).
 *
 * COF's report said returns "recover from the acquisition-affected annual
 * starting point toward the cost of equity along the model's explicit recovery
 * path" when its trailing four quarters already earned about 16.5%, above every
 * point of the path. When the trailing return already exceeds the excess-return
 * model's terminal target, the base path starts above where it ends, so such a
 * sentence misdescribes current data. This check finds those sentences in the
 * verdict and the base scenario and discloses them; it does not rewrite them.
 *
 * Pure, deterministic TypeScript: no network, no DB, no LLM.
 */

import type { ComputedMetrics } from "@/pipeline/compute";
import type { JudgeOutput } from "@/report/schema";
import type { ManifestEntry } from "@/types/core";

export interface ReturnPathText {
  path: string;
  text: string;
}

export interface ReturnPathFinding {
  path: string;
  sentence: string;
}

export interface ReturnPathLanguageInput {
  texts: readonly ReturnPathText[];
  /** The trailing return the model can start from; null when it was not established. */
  trailing: { returnPct: number | null; asOf: string | null; label: string } | null;
  /** The excess-return model's terminal target, percent. */
  terminalTargetPct: number | null;
}

// A rise in returns ...
const RECOVERY = String.raw`\b(?:recover(?:s|y|ies|ing|ed)?|rebound(?:s|ing|ed)?|ris(?:e|es|ing|en)|rose|improv(?:e|es|ed|ing|ement)|climb(?:s|ed|ing)?|rebuil(?:d|ds|ding|t))\b`;
// The rise must be in returns: a return names the verb's subject ("returns
// recover", "ROTE improves") or its object ("a recovery in ROE"), so margins or
// capital improving in a sentence that also names the hurdle are not flagged.
const RETURN = String.raw`\b(?:returns?|ROE|ROTE|ROTCE|return on (?:tangible )?(?:common )?equity)\b`;
const RETURN_RECOVERY = new RegExp(`${RETURN}[^;,]{0,40}?${RECOVERY}|${RECOVERY}[^;,]{0,20}?\\b(?:in|of)\\b[^;,]{0,20}?${RETURN}`, "i");
// ... toward the cost of equity, or along the model's "recovery path".
// Sentences are already split, so a decimal ("10.4%") may sit between the two.
// A return that rises to a level "above" or "exceeding" the cost of equity is
// not a recovery toward it, so those words end the reach.
const TOWARD_HURDLE = /\b(?:toward|towards|to)\b(?:(?!\b(?:above|over|beyond|exceed\w*|surpass\w*|top\w*)\b)[^;]){0,60}?\b(?:cost of equity|CoE)\b|\brecovery path\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

export function returnPathLanguageFindings(input: ReturnPathLanguageInput): ReturnPathFinding[] {
  const ttm = input.trailing?.returnPct;
  if (ttm == null || !Number.isFinite(ttm) || input.terminalTargetPct === null || !(ttm > input.terminalTargetPct)) return [];
  return input.texts.flatMap(({ path, text }) =>
    sentences(text)
      .filter((sentence) => RETURN_RECOVERY.test(sentence) && TOWARD_HURDLE.test(sentence))
      .map((sentence) => ({ path, sentence })));
}

/**
 * The verdict and the base scenario: the text a reader takes the conclusion
 * from. Scenario presentation keeps the commentary, else the legacy
 * assumptions under the commentary's name, and replaces the assumptions with
 * the model's own; only the text the report keeps is read, under that name.
 */
function baseCaseTexts(judge: Pick<JudgeOutput, "verdict" | "valuation">): ReturnPathText[] {
  const texts: ReturnPathText[] = [{ path: "verdict.synthesis", text: judge.verdict.synthesis }];
  (judge.verdict.executiveSummary ?? []).forEach((claim, i) => texts.push({ path: `verdict.executiveSummary[${i}]`, text: claim.text }));
  judge.valuation.scenarios.forEach((scenario, i) => {
    if (scenario.name !== "base") return;
    (scenario.qualitativeCommentary ?? scenario.assumptions).forEach((text, j) => texts.push({ path: `valuation.scenarios[${i}].qualitativeCommentary[${j}]`, text }));
    scenario.whatWouldHaveToBeTrue.forEach((text, j) => texts.push({ path: `valuation.scenarios[${i}].whatWouldHaveToBeTrue[${j}]`, text }));
  });
  return texts;
}

const fmt = (v: number): string => v.toFixed(1);

/** One warning in the missing-data manifest naming every flagged sentence; none when nothing is flagged. */
export function returnPathLanguageManifestEntries(
  judge: Pick<JudgeOutput, "verdict" | "valuation">,
  computed: Pick<ComputedMetrics, "returns" | "valuation">,
): ManifestEntry[] {
  const valuation = computed.valuation;
  if (valuation?.kind !== "excess-return") return [];
  const er = valuation.excessReturn;
  // The start the model actually used: its path's first year. That is the
  // trailing return only when the model started from the trailing window.
  const start = er.roePathPct.value[0];
  if (start === undefined || !Number.isFinite(start)) return [];
  const ttm = computed.returns?.commonReturnTtm;
  const fromTrailing = ttm != null && ttm.returnPct !== null && ttm.asOf !== null && ttm.asOf === er.asOf && Math.abs(ttm.returnPct - start) < 1e-9;
  const target = er.financialAssumptions?.terminalRoePct ?? null;
  const label = fromTrailing
    ? `${ttm.basis === "tangible-common-equity" ? "trailing four-quarter ROTE" : "trailing four-quarter common-equity ROE"} to ${ttm.asOf}`
    : `model's fiscal-year start${er.asOf === null ? "" : ` (${er.asOf})`}`;
  const findings = returnPathLanguageFindings({ texts: baseCaseTexts(judge), trailing: { returnPct: start, asOf: er.asOf, label }, terminalTargetPct: target });
  if (findings.length === 0 || target === null) return [];
  return [{
    field: "verify.check.returnPath",
    reason: `${findings.length} sentence(s) describe returns recovering toward the cost of equity, but the ${label} ` +
      `of ${fmt(start)}% already exceeds the excess-return model's terminal target of ${fmt(target)}%, so the base path starts above where it ends: ` +
      findings.map((f) => `"${f.sentence}" (${f.path})`).join("; "),
    severity: "warn",
    attemptedSources: ["deterministic-verify"],
  }];
}
