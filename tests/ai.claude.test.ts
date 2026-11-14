import { describe, expect, it, afterEach, vi } from "vitest";
import { claudeEnvironment, claudeRunArgs, parseClaudeResult, claudeIdentity, claudeResearchObserver, ClaudeResearchError, CLAUDE_RESEARCH_TOOLS, publicWebUrl } from "@/ai/claude";
afterEach(() => vi.unstubAllEnvs());
it("keeps OAuth in the official CLI and excludes inherited paid keys and code injection", () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "not-a-real-key"); vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "not-a-real-token");
  vi.stubEnv("NODE_OPTIONS", "--require unsafe.js");
  const env = claudeEnvironment();
  expect(env.ANTHROPIC_API_KEY).toBeUndefined(); expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined(); expect(env.NODE_OPTIONS).toBeUndefined();
  const args = claudeRunArgs("opus", "high");
  expect(args).toContain("--safe-mode"); expect(args).toContain("--no-session-persistence");
  expect(args[args.indexOf("--tools") + 1]).toBe(""); expect(args).toContain("--strict-mcp-config");
  expect(args).not.toContain("--bare"); expect(args).not.toContain("--dangerously-skip-permissions");
  expect(() => claudeRunArgs("--evil")).toThrow();
});
it("records observed CLI models and usage including cached input", () => {
  expect(parseClaudeResult(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: '{"ok":true}',
    modelUsage: { "claude-opus-5-5": { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 20, cacheCreationInputTokens: 4 } } })))
    .toMatchObject({ text: '{"ok":true}', model: "claude-opus-5-5", input: 34, output: 5, observedModels: ["claude-opus-5-5"] });
});
it.each([
  { type: "result", subtype: "error_max_turns", result: "partial" },
  { type: "result", subtype: "success", is_error: true, result: "error" },
  { type: "result", subtype: "success", result: "{}", modelUsage: {} },
  { type: "result", subtype: "success", result: "{}", modelUsage: { opus: { inputTokens: -1, outputTokens: 2 } } },
])("rejects partial, failed and unaccounted responses", result => {
  expect(() => parseClaudeResult(JSON.stringify(result))).toThrow();
});
it("binds to the authenticated account, and rejects an API-key login on the subscription route", () => {
  const login = { loggedIn: true, authMethod: "claude.ai", email: "test@example.com", orgId: "org" };
  expect(claudeIdentity(login)).toMatch(/^[a-f0-9]{64}$/);
  expect(claudeIdentity({ ...login, email: "other@example.com" })).not.toBe(claudeIdentity(login));
  expect(() => claudeIdentity({ ...login, authMethod: "api_key" })).toThrow();
  expect(() => claudeIdentity({ loggedIn: false })).toThrow();
});

/* D-269: analyst research on the Claude sign-in route. Synthetic events shaped like Claude Code 2.1.323 stream-json. */
describe("Claude research arguments and stream observation (D-269)", () => {
  const isolation = (args: string[]) => {
    expect(args).toEqual(expect.arrayContaining(["--print", "--safe-mode", "--strict-mcp-config", "--no-session-persistence"]));
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(JSON.parse(args[args.indexOf("--settings") + 1])).toEqual({ disableAllHooks: true, autoMemoryEnabled: false });
    expect(args[args.indexOf("--disallowedTools") + 1]).toBe("mcp__*");
    expect(args[args.indexOf("--mcp-config") + 1]).toBe('{"mcpServers":{}}');
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    for (const flag of ["--bare", "--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "--add-dir", "--resume", "--continue"]) expect(args).not.toContain(flag);
    expect(args.join(" ")).not.toMatch(/Bash|PowerShell|Edit|Write|Read|Agent|bypassPermissions/);
  };
  it("gives only analyst research the CLI's built-in WebSearch and WebFetch, with every isolation flag kept", () => {
    const free = claudeRunArgs("claude-opus-5-5", "high");
    const research = claudeRunArgs("claude-opus-5-5", "high", true);
    isolation(free); isolation(research);
    expect(free[free.indexOf("--tools") + 1]).toBe(""); expect(free).not.toContain("--allowedTools");
    expect(free[free.indexOf("--output-format") + 1]).toBe("json"); expect(free).not.toContain("--verbose");
    expect(research[research.indexOf("--tools") + 1]).toBe("WebSearch,WebFetch");
    expect(research.slice(research.indexOf("--allowedTools") + 1, research.indexOf("--allowedTools") + 3)).toEqual(["WebSearch", "WebFetch"]);
    expect(research[research.indexOf("--allowedTools") + 3]).toBe("--disallowedTools");
    expect(research[research.indexOf("--output-format") + 1]).toBe("stream-json"); expect(research).toContain("--verbose");
    expect(research.slice(-4)).toEqual(["--model", "claude-opus-5-5", "--effort", "high"]);
    expect(CLAUDE_RESEARCH_TOOLS).toEqual(["WebSearch", "WebFetch"]);
  });

  const init = (tools: unknown = ["WebFetch", "WebSearch"], extra: Record<string, unknown> = {}) => ({ type: "system", subtype: "init", tools, mcp_servers: [], ...extra });
  const call = (id: string, name: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ type: "assistant", parent_tool_use_id: null, message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] }, ...extra });
  const search = (id: string, query = "issuer results date") => call(id, "WebSearch", { query });
  const fetch = (id: string, url: string) => call(id, "WebFetch", { url, prompt: "When were results released?" });
  const searchResult = (id: string, links: unknown[], searchCount = 1) => ({ type: "user", parent_tool_use_id: null,
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "Web search results ... Links: [prose only]" }] },
    tool_use_result: { query: "issuer results date", results: [{ tool_use_id: "srvtoolu_1", content: links }, "summary text"], searchCount } });
  const fetchResult = (id: string, code: number, extra: Record<string, unknown> = {}) => ({ type: "user", parent_tool_use_id: null,
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "Page summary", ...extra }] },
    tool_use_result: { bytes: 1000, code, codeText: code === 200 ? "OK" : "Not Found", result: "Page summary", url: "https://issuer.example/ir" } });
  const final = (text: string, extra: Record<string, unknown> = {}) => ({ type: "result", subtype: "success", is_error: false, result: text, permission_denials: [],
    modelUsage: { "claude-opus-5-5": { inputTokens: 4, outputTokens: 50, cacheReadInputTokens: 10, webSearchRequests: 0 },
      "claude-haiku-5-5": { inputTokens: 900, outputTokens: 60, webSearchRequests: 0 } }, ...extra });
  const run = (events: unknown[], maxActions = 8) => {
    const observer = claudeResearchObserver(maxActions);
    for (const event of events) observer.line(typeof event === "string" ? event : JSON.stringify(event));
    return observer.finish();
  };
  const rejection = (events: unknown[], maxActions = 8): ClaudeResearchError => {
    try { run(events, maxActions); } catch (error) { if (error instanceof ClaudeResearchError) return error; throw error; }
    throw new Error("expected a research rejection");
  };

  it("takes provenance only from typed search links and successful fetches, never from prose URLs", () => {
    const result = run([init(), { type: "rate_limit_event" }, search("toolu_1"),
      searchResult("toolu_1", [{ title: "Issuer results", url: "https://issuer.example/news/results#top" },
        { title: "x", url: "javascript:alert(1)" }, { title: "creds", url: "https://user:secret@issuer.example/private" },
        { title: "Regulator filing", url: "https://regulator.example/filing" }]),
      fetch("toolu_2", "https://issuer.example/ir#q3"), fetchResult("toolu_2", 200),
      { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "thinking", thinking: "" }, { type: "text", text: "See https://invented.example/fiction" }] } },
      final("Results were released on a stated date. Source: https://invented.example/fiction")]);
    expect(result.fetchedUrls).toEqual(["https://issuer.example/ir", "https://issuer.example/news/results", "https://regulator.example/filing"]);
    expect(result.fetchedSources).toContainEqual({ url: "https://issuer.example/news/results", title: "Issuer results", pageAge: null });
    expect(result.fetchedUrls).not.toContain("https://invented.example/fiction");
    expect(result).toMatchObject({ webSearches: 2, researchText: expect.stringContaining("stated date"), model: "multiple-models",
      observedModels: ["claude-opus-5-5", "claude-haiku-5-5"], input: 914, output: 110 });
  });

  it.each(["http://127.0.0.1:3000/api/ai/connections", "http://localhost:3000/", "http://[::1]/", "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/admin", "http://0x7f.1/", "http://printer.local/", "http://intranet/", "https://db.internal/x", "file:///C:/Users/secret.txt", "https://user:pw@issuer.example/"])(
    "stops the CLI the moment it is asked to fetch a non-public address: %s", url => {
      const observer = claudeResearchObserver(8);
      observer.line(JSON.stringify(init()));
      let error: unknown;
      try { observer.line(JSON.stringify(fetch("toolu_1", url))); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(ClaudeResearchError);
      expect((error as ClaudeResearchError).providerFailure.code).toBe("local_web_research_boundary");
      expect((error as Error).message).toContain("local, private or non-web address");
    });

  it("keeps public addresses, and drops search links to local or private hosts from provenance", () => {
    expect(publicWebUrl("https://investor.issuer.example/news?id=1#top")).toBe("https://investor.issuer.example/news?id=1");
    expect(publicWebUrl("http://www.regulator.example.gov/filing")).toBe("http://www.regulator.example.gov/filing");
    const result = run([init(), search("toolu_1"), searchResult("toolu_1", [{ title: "Local", url: "http://192.168.1.1/" },
      { title: "Loopback", url: "http://localhost/x" }, { title: "Public", url: "https://news.example.com/story" }]), final("Notes.")]);
    expect(result.fetchedUrls).toEqual(["https://news.example.com/story"]);
  });

  it("counts a failed fetch as an observed action without creating provenance", () => {
    const result = run([init(), fetch("toolu_1", "https://missing.example/page"), fetchResult("toolu_1", 404),
      fetch("toolu_2", "https://blocked.example/page"), fetchResult("toolu_2", 200, { is_error: true }), final("No dated source was reachable.")]);
    expect(result).toMatchObject({ webSearches: 2, fetchedUrls: [], fetchedSources: [] });
  });

  it("accepts research in which the model chose not to search, with nothing marked as web evidence", () => {
    expect(run([init(), final("Notes from the supplied evidence only.")])).toMatchObject({ webSearches: 0, fetchedUrls: [] });
  });

  it("does not attribute typed results when one event carries several tool results", () => {
    const both = { type: "user", parent_tool_use_id: null, message: { content: [
      { type: "tool_result", tool_use_id: "toolu_1", content: "a" }, { type: "tool_result", tool_use_id: "toolu_2", content: "b" }] },
    tool_use_result: { code: 200, url: "https://issuer.example/a" } };
    const result = run([init(), fetch("toolu_1", "https://issuer.example/a"), fetch("toolu_2", "https://issuer.example/b"), both, final("Notes.")]);
    expect(result).toMatchObject({ webSearches: 2, fetchedUrls: [] });
  });

  it("stops at the first observed action beyond the limit, before the result arrives", () => {
    const observer = claudeResearchObserver(8);
    observer.line(JSON.stringify(init()));
    for (let index = 1; index <= 8; index++) observer.line(JSON.stringify(search(`toolu_${index}`)));
    let error: unknown;
    try { observer.line(JSON.stringify(fetch("toolu_9", "https://issuer.example/ninth"))); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ClaudeResearchError);
    expect((error as ClaudeResearchError).providerFailure).toEqual({ disposition: "terminal", code: "local_web_action_limit", bodyShape: "stream-error" });
    expect((error as ClaudeResearchError).message).toContain("local observed-action limit (8)");
    expect((error as ClaudeResearchError).message).toContain("No paid fallback was attempted");
    expect((error as ClaudeResearchError).webSearches).toBe(9);
  });

  it("counts each search a WebSearch reports, and cross-checks the searches the CLI reports at the end", () => {
    expect(rejection([init(), search("toolu_1"), searchResult("toolu_1", [], 5),
      ...[2, 3, 4, 5].flatMap(index => [fetch(`toolu_${index}`, `https://issuer.example/${index}`), fetchResult(`toolu_${index}`, 200)])])
      .providerFailure.code).toBe("local_web_action_limit");
    const reported = final("Notes.", { modelUsage: { "claude-opus-5-5": { inputTokens: 1, outputTokens: 1 }, "claude-haiku-5-5": { inputTokens: 1, outputTokens: 1, webSearchRequests: 9 } } });
    expect(rejection([init(), search("toolu_1"), searchResult("toolu_1", []), reported]).providerFailure.code).toBe("local_web_action_limit");
    expect(run([init(), search("toolu_1"), searchResult("toolu_1", [], 3), final("Notes.")]).webSearches).toBe(3);
  });

  it.each([
    ["malformed JSON", ["{not json"]],
    ["a non-object event", ["[1,2]"]],
    ["a tool outside the research set", [init(), call("toolu_1", "Bash", { command: "dir" })]],
    ["an offered tool outside the research set", [init(["WebFetch", "WebSearch", "Read"])]],
    ["an MCP server", [init(undefined, { mcp_servers: [{ name: "x", status: "connected" }] })]],
    ["a server-side tool block", [init(), { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "server_tool_use", id: "srv", name: "web_search", input: {} }] } }]],
    ["a nested agent event", [init(), search("toolu_1", "q"), { ...searchResult("toolu_1", []), parent_tool_use_id: "toolu_0" }]],
    ["a result for an unknown action", [init(), fetchResult("toolu_404", 200)]],
    ["a fetch without a URL", [init(), call("toolu_1", "WebFetch", { prompt: "x" })]],
    ["a denied tool request", [init(), final("Notes.", { permission_denials: [{ tool_name: "WebFetch" }] })]],
    ["an action that never completed", [init(), search("toolu_1"), final("Notes.")]],
    ["a failed result", [init(), final("partial", { subtype: "error_during_execution", is_error: true })]],
    ["no result event", [init(), search("toolu_1"), searchResult("toolu_1", [])]],
    ["an event after the result", [init(), final("Notes."), search("toolu_1")]],
  ])("rejects research on %s, accepting no searched evidence", (_name, events) => {
    const error = rejection(events as unknown[]);
    expect(error.providerFailure).toMatchObject({ disposition: "terminal", code: "local_web_research_boundary" });
    expect(error.message).toMatch(/^Claude .*No (searched evidence was accepted and no )?paid fallback was attempted\.$/);
  });
});
