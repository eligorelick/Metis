import { describe, expect, it, afterEach, vi } from "vitest";
import { claudeEnvironment, claudeRunArgs, parseClaudeResult, claudeIdentity, claudeResearchObserver, ClaudeResearchError, CLAUDE_RESEARCH_TOOLS, NON_PUBLIC_WEBFETCH_HOSTS, publicWebUrl, CLAUDE_WEBFETCH_FIXED_DOMAINS, claudeWebFetchAllowlist, issuerWebFetchHost, registrableWebFetchParent } from "@/ai/claude";
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
    const research = claudeRunArgs("claude-opus-5-5", "high", { webFetch: claudeWebFetchAllowlist("issuer.example") });
    isolation(free); isolation(research);
    expect(free[free.indexOf("--tools") + 1]).toBe(""); expect(free).not.toContain("--allowedTools");
    expect(free[free.indexOf("--output-format") + 1]).toBe("json"); expect(free).not.toContain("--verbose");
    expect(research[research.indexOf("--tools") + 1]).toBe("WebSearch,WebFetch");
    // Lead decision (D-269): WebSearch unrestricted; WebFetch only on allowlisted domains and their subdomains, never bare.
    const allowed = research.slice(research.indexOf("--allowedTools") + 1, research.indexOf("--disallowedTools"));
    expect(allowed).toEqual(["WebSearch", ...[...CLAUDE_WEBFETCH_FIXED_DOMAINS, "issuer.example"].flatMap(domain => [`WebFetch(domain:${domain})`, `WebFetch(domain:*.${domain})`])]);
    expect(allowed).not.toContain("WebFetch");
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
    const observer = claudeResearchObserver(maxActions, claudeWebFetchAllowlist("issuer.example"));
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

  it("has the CLI itself deny WebFetch to every non-public host pattern before a fetch runs, on research requests only", () => {
    const research = claudeRunArgs("claude-opus-5-5", undefined, { webFetch: claudeWebFetchAllowlist() });
    const denied = research.slice(research.indexOf("--disallowedTools") + 1, research.indexOf("--strict-mcp-config"));
    expect(denied).toEqual(["mcp__*", ...NON_PUBLIC_WEBFETCH_HOSTS.map(host => `WebFetch(domain:${host})`)]);
    for (const host of ["localhost", "*.local", "10.*.*.*", "127.*.*.*", "169.254.*.*", "172.16.*.*", "172.31.*.*", "192.168.*.*", "*.nip.io"]) expect(NON_PUBLIC_WEBFETCH_HOSTS).toContain(host);
    expect(claudeRunArgs("claude-opus-5-5").join(" ")).not.toContain("WebFetch(");
  });

  it.each(["http://10.0.0.1.nip.io/", "https://app.localtest.me/", "http://172.20.1.1/", "http://a.b.internal/", "http://LOCALHOST./x"])(
    "uses the same host list for the observer: %s", url => expect(publicWebUrl(url)).toBeNull());

  it("builds the WebFetch allowlist from the fixed list and the profile's issuer domain", () => {
    expect(CLAUDE_WEBFETCH_FIXED_DOMAINS).toEqual(expect.arrayContaining(["sec.gov", "fda.gov", "federalreserve.gov", "ftc.gov", "europa.eu", "nasdaq.com", "nyse.com"]));
    expect(issuerWebFetchHost("https://www.lilly.com")).toBe("www.lilly.com");
    expect(claudeWebFetchAllowlist(issuerWebFetchHost("https://www.lilly.com"))).toEqual({ domains: [...CLAUDE_WEBFETCH_FIXED_DOMAINS, "lilly.com"], hosts: [] });
    expect(claudeWebFetchAllowlist(issuerWebFetchHost("www.tsmc.com"))).toEqual({ domains: [...CLAUDE_WEBFETCH_FIXED_DOMAINS, "tsmc.com"], hosts: [] });
    expect(claudeWebFetchAllowlist(issuerWebFetchHost("https://www.example.de/"))).toEqual({ domains: [...CLAUDE_WEBFETCH_FIXED_DOMAINS, "example.de"], hosts: [] });
    // Under a generic ccTLD second level the issuer gets its exact host only.
    expect(claudeWebFetchAllowlist(issuerWebFetchHost("https://investor.example-bank.co.uk/ir/"))).toEqual({ domains: [...CLAUDE_WEBFETCH_FIXED_DOMAINS], hosts: ["investor.example-bank.co.uk"] });
    expect(claudeWebFetchAllowlist(null)).toEqual({ domains: [...CLAUDE_WEBFETCH_FIXED_DOMAINS], hosts: [] });
    expect(claudeWebFetchAllowlist("sec.gov")).toEqual({ domains: [...CLAUDE_WEBFETCH_FIXED_DOMAINS], hosts: [] });
    expect(claudeWebFetchAllowlist("www.sec.gov")).toEqual({ domains: [...CLAUDE_WEBFETCH_FIXED_DOMAINS], hosts: [] });
  });

  it.each([null, undefined, "", 42, "http://127.0.0.1", "https://10.1.2.3/", "http://[::1]/", "localhost", "https://localhost:3000", "https://intranet/",
    "https://files.corp", "https://printer.local", "https://10.0.0.1.nip.io", "https://app.localtest.me", "https://issuer.github.io", "https://x.azurewebsites.net",
    "https://user:pw@issuer.example", "javascript:alert(1)", "ftp://issuer.example", "https://bad_label.example"])(
    "gives no issuer domain for an IP literal, local-use, shared-hosting or malformed profile website: %j", website => {
      expect(issuerWebFetchHost(website)).toBeNull();
      expect(claudeWebFetchAllowlist(website as string)).toEqual({ domains: [...CLAUDE_WEBFETCH_FIXED_DOMAINS], hosts: [] });
    });

  it("counts a fetch the CLI refused outside the allowlist as a failed action, never a source", () => {
    const refused = { type: "user", parent_tool_use_id: null,
      message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", is_error: true, content: "Permission to use WebFetch has been denied because Claude Code is running in don't ask mode." }] },
      tool_use_result: "Error: Permission to use WebFetch has been denied" };
    const result = run([init(), fetch("toolu_1", "https://news.example.com/story"), refused,
      fetch("toolu_2", "https://www.sec.gov/news"), fetchResult("toolu_2", 200),
      final("Notes.", { permission_denials: [{ tool_name: "WebFetch", tool_use_id: "toolu_1", tool_input: { url: "https://news.example.com/story" } }] })]);
    expect(result).toMatchObject({ webSearches: 2, fetchedUrls: ["https://www.sec.gov/news"] });
    // Even a success the CLI should have refused is not a source off the allowlist.
    const leaked = run([init(), fetch("toolu_1", "https://news.example.com/story"), fetchResult("toolu_1", 200), final("Notes.")]);
    expect(leaked).toMatchObject({ webSearches: 1, fetchedUrls: [] });
    // A denial of anything but an observed WebFetch still rejects the research.
    expect(rejection([init(), final("Notes.", { permission_denials: [{ tool_name: "Bash", tool_use_id: "toolu_9" }] })]).providerFailure.code).toBe("local_web_research_boundary");
    expect(rejection([init(), final("Notes.", { permission_denials: [{ tool_name: "WebFetch", tool_use_id: "toolu_unseen" }] })]).providerFailure.code).toBe("local_web_research_boundary");
  });

  it("keeps public addresses, and drops search links to local or private hosts from provenance", () => {
    expect(publicWebUrl("https://nip.io.example.com/page")).toBe("https://nip.io.example.com/page");
    expect(publicWebUrl("https://www.172.example.org/")).toBe("https://www.172.example.org/");
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
    ["a failed result", [init(), final("partial", { subtype: "error_during_execution", is_error: true })]],
    ["no result event", [init(), search("toolu_1"), searchResult("toolu_1", [])]],
    ["an event after the result", [init(), final("Notes."), search("toolu_1")]],
  ])("rejects research on %s, accepting no searched evidence", (_name, events) => {
    const error = rejection(events as unknown[]);
    expect(error.providerFailure).toMatchObject({ disposition: "terminal", code: "local_web_research_boundary" });
    expect(error.message).toMatch(/^Claude .*No (searched evidence was accepted and no )?paid fallback was attempted\.$/);
  });

  /* Independent review round 1 (2026-11-14) reproductions. */
  it.each(["https://co.uk", "com.au", "https://www.co.jp", "org.uk", "https://github.io", "https://ir.example.co.uk"])(
    "never grants a public-suffix-like base as a WebFetch wildcard: %s", website => {
      const args = claudeRunArgs("claude-opus-5-5", undefined, { webFetch: claudeWebFetchAllowlist(issuerWebFetchHost(website)) });
      const allowed = args.slice(args.indexOf("--allowedTools") + 1, args.indexOf("--disallowedTools"));
      const wildcards = allowed.filter(arg => arg.startsWith("WebFetch(domain:*.")).map(arg => arg.slice("WebFetch(domain:*.".length, -1));
      for (const base of wildcards) expect(CLAUDE_WEBFETCH_FIXED_DOMAINS).toContain(base);
    });

  it.each(["https://co.uk", "com.au", "co.jp", "org.uk", "https://github.io", "https://x.github.io"])("gives no issuer host for a bare public suffix or shared host: %s",
    website => expect(issuerWebFetchHost(website)).toBeNull());

  it("grants the issuer's registrable parent with subdomains, or its exact host only", () => {
    const rules = (website: string) => { const args = claudeRunArgs("claude-opus-5-5", undefined, { webFetch: claudeWebFetchAllowlist(issuerWebFetchHost(website)) });
      return args.slice(args.indexOf("--allowedTools") + 1, args.indexOf("--disallowedTools")).slice(1 + 2 * CLAUDE_WEBFETCH_FIXED_DOMAINS.length); };
    expect(rules("https://www.lilly.com")).toEqual(["WebFetch(domain:lilly.com)", "WebFetch(domain:*.lilly.com)"]);
    expect(rules("https://ir.example.co.uk")).toEqual(["WebFetch(domain:ir.example.co.uk)"]);
    expect(rules("https://www.co.jp")).toEqual(["WebFetch(domain:www.co.jp)"]);
    // A deeper host never widens to its parent: a hosting platform missing from the
    // shared-hosting list would otherwise hand its whole namespace to the fetch rules.
    expect(rules("https://acme.ngrok.io")).toEqual(["WebFetch(domain:acme.ngrok.io)"]);
    expect(rules("https://investor.lilly.com")).toEqual(["WebFetch(domain:investor.lilly.com)"]);
    expect(rules("https://lilly.com")).toEqual(["WebFetch(domain:lilly.com)", "WebFetch(domain:*.lilly.com)"]);
    expect(rules("https://www.www.lilly.com")).toEqual(["WebFetch(domain:www.www.lilly.com)"]);
    expect(registrableWebFetchParent("ir.example.co.uk")).toBeNull();
    expect(registrableWebFetchParent("a.b.com.au")).toBeNull();
    expect(registrableWebFetchParent("investor.lilly.com")).toBe("lilly.com");
    // The observer reads the same allowlist: the exact host is fetchable, its siblings are not.
    const observer = claudeResearchObserver(8, claudeWebFetchAllowlist("ir.example.co.uk"));
    for (const event of [init(), fetch("toolu_1", "https://ir.example.co.uk/results"), fetchResult("toolu_1", 200),
      fetch("toolu_2", "https://other.example.co.uk/x"), fetchResult("toolu_2", 200), final("Notes.")]) observer.line(JSON.stringify(event));
    expect(observer.finish().fetchedUrls).toEqual(["https://ir.example.co.uk/results"]);
    // Entries that bypass the builders are filtered again before they reach the CLI.
    const forged = claudeRunArgs("claude-opus-5-5", undefined, { webFetch: { domains: ["co.uk", "sec.gov"], hosts: ["127.0.0.1", "com.au"] } });
    expect(forged.join(" ")).not.toMatch(/domain:(\*\.)?(co\.uk|com\.au|127\.0\.0\.1)\)/);
  });

  it("rejects a reused tool id with a different call instead of counting one action and keeping its first URL", () => {
    const events = [init(), ...Array.from({ length: 9 }, (_, index) => fetch("toolu_1", `https://www.sec.gov/page-${index}`)), fetchResult("toolu_1", 200), final("Notes.")];
    expect(rejection(events).providerFailure.code).toBe("local_web_research_boundary");
  });

  it("counts an exact repeat of the same tool block once", () => {
    expect(run([init(), fetch("toolu_1", "https://www.sec.gov/a"), fetch("toolu_1", "https://www.sec.gov/a"), fetchResult("toolu_1", 200), final("Notes.")]))
      .toMatchObject({ webSearches: 1, fetchedUrls: ["https://www.sec.gov/a"] });
  });

  it("counts a call with no result by the final event as a failed action, never a source", () => {
    expect(run([init(), search("toolu_1"), fetch("toolu_2", "https://www.sec.gov/x"), final("Notes.")])).toMatchObject({ webSearches: 2, fetchedUrls: [] });
  });

  it.each([
    ["a string is_error on a tool result", [init(), fetch("toolu_1", "https://www.sec.gov/x"), fetchResult("toolu_1", 200, { is_error: "true" }), final("Notes.")]],
    ["a numeric is_error on a tool result", [init(), fetch("toolu_1", "https://www.sec.gov/x"), fetchResult("toolu_1", 200, { is_error: 0 }), final("Notes.")]],
    ["a non-boolean is_error on the final event", [init(), final("Notes.", { is_error: 0 })]],
    ["a final event from a nested agent with no init", [final("Notes.", { parent_tool_use_id: "toolu_0" })]],
    ["a final event from a nested agent after init", [init(), final("Notes.", { parent_tool_use_id: "toolu_0" })]],
    ["a final event with no init", [final("Notes.")]],
    ["an event before init", [{ type: "rate_limit_event" }, init(), final("Notes.")]],
    ["a second init", [init(), init(), final("Notes.")]],
    ["a nested system event", [init(), { type: "system", subtype: "status", parent_tool_use_id: "toolu_0" }, final("Notes.")]],
    ["non-array permission denials", [init(), final("Notes.", { permission_denials: { tool_name: "Bash" } })]],
  ])("rejects malformed or nested metadata: %s", (_name, events) => {
    expect(rejection(events as unknown[]).providerFailure.code).toBe("local_web_research_boundary");
  });
});
