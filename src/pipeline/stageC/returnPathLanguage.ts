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
const RECOVERY_WORD = /\b(?:recover(?:s|y|ies|ing|ed)?|rebound(?:s|ing|ed)?|ris(?:e|es|ing)|improv(?:e|es|ing|ement)|climb(?:s|ing)?|rebuild(?:s|ing)?)\b/i;
// ... toward the cost of equity, or along the model's "recovery path".
const TOWARD_HURDLE = /\b(?:toward|towards|to)\b[^.;]{0,60}?\b(?:cost of equity|CoE)\b|\brecovery path\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

export function returnPathLanguageFindings(input: ReturnPathLanguageInput): ReturnPathFinding[] {
  const ttm = input.trailing?.returnPct;
  if (ttm == null || !Number.isFinite(ttm) || input.terminalTargetPct === null || !(ttm > input.terminalTargetPct)) return [];
  return input.texts.flatMap(({ path, text }) =>
    sentences(text)
      .filter((sentence) => RECOVERY_WORD.test(sentence) && TOWARD_HURDLE.test(sentence))
      .map((sentence) => ({ path, sentence })));
}

/** The verdict and the base scenario: the text a reader takes the conclusion from. */
function baseCaseTexts(judge: Pick<JudgeOutput, "verdict" | "valuation">): ReturnPathText[] {
  const texts: ReturnPathText[] = [{ path: "verdict.synthesis", text: judge.verdict.synthesis }];
  (judge.verdict.executiveSummary ?? []).forEach((claim, i) => texts.push({ path: `verdict.executiveSummary[${i}]`, text: claim.text }));
  judge.valuation.scenarios.forEach((scenario, i) => {
    if (scenario.name !== "base") return;
    for (const key of ["assumptions", "qualitativeCommentary", "whatWouldHaveToBeTrue"] as const) {
      (scenario[key] ?? []).forEach((text, j) => texts.push({ path: `valuation.scenarios[${i}].${key}[${j}]`, text }));
    }
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
  const ttm = computed.returns?.commonReturnTtm;
  if (valuation?.kind !== "excess-return" || ttm == null || ttm.returnPct === null) return [];
  const target = valuation.excessReturn.financialAssumptions?.terminalRoePct ?? null;
  const label = ttm.basis === "tangible-common-equity" ? "trailing four-quarter ROTE" : "trailing four-quarter common-equity ROE";
  const findings = returnPathLanguageFindings({ texts: baseCaseTexts(judge), trailing: { returnPct: ttm.returnPct, asOf: ttm.asOf, label }, terminalTargetPct: target });
  if (findings.length === 0 || target === null) return [];
  return [{
    field: "verify.check.returnPath",
    reason: `${findings.length} sentence(s) describe returns recovering toward the cost of equity, but the ${label}${ttm.asOf === null ? "" : ` to ${ttm.asOf}`} ` +
      `of ${fmt(ttm.returnPct)}% already exceeds the excess-return model's terminal target of ${fmt(target)}%, so the base path starts above where it ends: ` +
      findings.map((f) => `"${f.sentence}" (${f.path})`).join("; "),
    severity: "warn",
    attemptedSources: ["deterministic-verify"],
  }];
}
