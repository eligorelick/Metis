/** Process termination is separate from successful mandatory research stages. */
export function analysisOutcomeFromSteps(
  steps: readonly { step: string; status: string; detail?: string | null }[],
  final: { dataOnly?: boolean } = {},
): "complete" | "data-only" {
  if (final.dataOnly) return "data-only";
  return ["bull", "bear", "synthesize", "verify"].every(name => {
    const stage = steps.find(s => s.step === name);
    if (stage?.status === "done") return true;
    return name !== "verify" && stage?.status === "skipped" &&
      /^covered by reused durable (?:synthesize|verify) artifact$/.test(stage.detail ?? "");
  }) ? "complete" : "data-only";
}

export function analysisOutcomeText(outcome: "complete" | "data-only" | undefined): string {
  return outcome === "complete" ? "Mandatory stages completed; verification is limited to the recorded checks."
    : outcome === "data-only" ? "Incomplete research; deterministic snapshot only."
      : "Legacy record; mandatory stage completion not recorded.";
}
