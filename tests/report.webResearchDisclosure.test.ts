import { describe, expect, it } from "vitest";
import { buildExecutionMetadataEntry, webResearchLimitationGaps } from "@/report/execution";
import { evidenceScopeSummary } from "@/report/presentation";
import { ExecutionMetadataEntrySchema, ProviderExecutionSchema } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

const model = "chatgpt/example-model";
const input = { step: "bull", requestedModel: model, effectiveModel: model, requestedEffort: null, fallbackUsed: false };

describe("observed web research in plan execution disclosures", () => {
  it("distinguishes canceled research actions from evidence actually used by a completed writer", () => {
    const report = loadTask28Fixture();
    const entry = buildExecutionMetadataEntry({ ...input, execution: {
      usageReported: false, webSearches: 8, webResearchUsed: false, webResearchLimitation: "action_limit",
    }, usage: { input_tokens: 10, output_tokens: 5 } });
    expect(entry.webResearchUsed).toBe(false);
    expect(entry.note).toContain("8 observed web research actions");
    expect(entry.note).toContain("no web findings were accepted");
    expect(entry.note).toContain("allowance consumption is unknown");
    expect(entry.inputTokens).toBeUndefined();
    expect(ExecutionMetadataEntrySchema.parse(entry).webResearchLimitation).toBe("action_limit");
    report.meta.execution = [entry];
    expect(webResearchLimitationGaps([entry])).toEqual([expect.objectContaining({ field: "llm.bull.researchCoverage", severity: "warn", attemptedSources: ["chatgpt"] })]);
    expect(evidenceScopeSummary(report)).toContain("optional web research was unavailable");
    expect(evidenceScopeSummary(report)).not.toContain("used web research");
  });
  it("keeps aggregate research actions even when the final writer used no tools", () => {
    const entry = buildExecutionMetadataEntry({ ...input, execution: { webSearches: 0 },
      usage: { input_tokens: 100, output_tokens: 20, server_tool_use: { web_search_requests: 2 } } });
    expect(entry.webSearches).toBe(2);
    expect(entry.note).toContain("2 observed web research actions");
    expect(entry.note).not.toContain("without additional web search");
    expect(ExecutionMetadataEntrySchema.parse(entry).webSearches).toBe(2);
    expect(ProviderExecutionSchema.parse({ webSearches: 0 }).webSearches).toBe(0);
  });
  it("separates searched and payload-only passes, including in a mixed report", () => {
    const report = loadTask28Fixture();
    report.meta.execution = [buildExecutionMetadataEntry({ ...input, execution: { webSearches: 3 } }),
      buildExecutionMetadataEntry({ ...input, step: "synthesize", execution: { webSearches: 0 } })];
    expect(evidenceScopeSummary(report)).toBe("bull used web research with supplied evidence; judge used only the supplied evidence (payload-only; no web search)");
  });
  it("keeps the historical payload-only interpretation when stored entries predate search support", () => {
    const report = loadTask28Fixture();
    report.meta.execution = [buildExecutionMetadataEntry(input)];
    expect(evidenceScopeSummary(report)).toBe("bull used only the supplied evidence (payload-only; no web search)");
  });
  it("discloses retained web evidence after a checkpoint without inventing new searches", () => {
    const report = loadTask28Fixture();
    const entry = buildExecutionMetadataEntry({ ...input, execution: { webSearches: 0, webResearchUsed: true } });
    report.meta.execution = [entry];
    expect(entry.webSearches).toBe(0);
    expect(entry.note).toContain("retained web research");
    expect(evidenceScopeSummary(report)).toBe("bull used web research with supplied evidence");
  });

  // D-269: the Claude Code route states how many searches and fetches ran, and a research request that ran none as zero.
  it("states Claude Code research actions, including zero, and leaves tool-free and ChatGPT notes unchanged", () => {
    const claude = { ...input, requestedModel: "claude/opus", effectiveModel: "claude/claude-opus-5-5" };
    const searched = buildExecutionMetadataEntry({ ...claude, execution: { webSearches: 3, webResearchUsed: true } });
    expect(searched.note).toContain("Claude Code account allowance was used");
    expect(searched.note).toContain("3 observed web research actions (Claude Code web searches and page fetches, refused fetches included)");
    const none = buildExecutionMetadataEntry({ ...claude, execution: { webSearches: 0, webResearchUsed: false } });
    expect(none.webSearches).toBe(0);
    expect(none.note).toContain("Web research was available to this pass, but 0 web searches or page fetches ran, so it used only the supplied evidence.");
    const judge = buildExecutionMetadataEntry({ ...claude, step: "synthesize", execution: { modelObserved: true } });
    expect(judge.note).toContain("This pass used the supplied evidence without additional web search.");
    expect(buildExecutionMetadataEntry({ ...input, execution: { webSearches: 0 } }).note).toContain("This pass used the supplied evidence without additional web search.");
    expect(buildExecutionMetadataEntry({ ...input, execution: { webSearches: 2 } }).note).toContain("2 observed web research actions; this count");
    const report = loadTask28Fixture();
    report.meta.execution = [none, searched];
    expect(evidenceScopeSummary(report)).toContain("used only the supplied evidence");
  });
});
