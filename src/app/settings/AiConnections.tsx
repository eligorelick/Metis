"use client";
import { PROVIDER_CREDENTIALS_CHANGED } from "@/settings/credentialContracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui";
import type { AnalysisRoute } from "@/ai/analysisRoute";
import { CLAUDE_MODELS, CHATGPT_EFFORTS, CHATGPT_MANAGE_USAGE_URL, chatGptFastOffered, type ChatGptEffort, type ChatGptModelChoice, type AiConnectionsView } from "@/ai/contracts";

const button = "border border-edge px-3 py-1.5 text-sm hover:border-accent disabled:opacity-40";
type ViewWithRoute = AiConnectionsView & { route?: AnalysisRoute };
export function AiConnections({ onRoute }: { onRoute?: (route: AnalysisRoute | null) => void } = {}) {
  const [view, setView] = useState<ViewWithRoute | null>(null);
  const routeFromView = (view as ViewWithRoute | null)?.route ?? null;
  useEffect(() => { onRoute?.(routeFromView); }, [onRoute, routeFromView]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [chosen, setChosen] = useState("none");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<ChatGptModelChoice[]>([]);
  const [effort, setEffort] = useState<ChatGptEffort | "">("");
  const [customClaude, setCustomClaude] = useState(false);
  const [serviceTier, setServiceTier] = useState<"default" | "fast">("default");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [catalogError, setCatalogError] = useState("");
  const dirty = useRef(false);
  const applySelection = useCallback((selected: AiConnectionsView["selection"]) => {
    setChosen("connectionId" in selected ? selected.connectionId : selected.provider);
    setModel("model" in selected ? selected.model : "");
    setCustomClaude(false);
    setEffort("effort" in selected ? selected.effort ?? "" : "");
    setServiceTier("serviceTier" in selected ? selected.serviceTier ?? "default" : "default");
  }, []);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/ai/connections", { cache: "no-store" });
    const data = await r.json(); if (!r.ok) throw new Error(data.error);
    setView(data as AiConnectionsView);
    if (!dirty.current && data.selectionIsDefault) applySelection(data.selection);
  }, [applySelection]);
  useEffect(() => {
    const changed = () => { void refresh().catch(() => setMessage("Could not refresh provider access. Reload Settings to retry.")); };
    window.addEventListener(PROVIDER_CREDENTIALS_CHANGED, changed);
    return () => window.removeEventListener(PROVIDER_CREDENTIALS_CHANGED, changed);
  }, [refresh]);
  useEffect(() => {
    let active = true;
    void fetch("/api/ai/connections", { cache: "no-store" }).then(async (r) => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      if (active) {
        setView(data);
        const selected = (data as AiConnectionsView).selection;
        setChosen("connectionId" in selected ? selected.connectionId : selected.provider);
        setModel("model" in selected ? selected.model : "");
        setEffort("effort" in selected ? selected.effort ?? "" : "");
        setServiceTier("serviceTier" in selected ? selected.serviceTier ?? "default" : "default");
      }
    }).catch((e: Error) => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (view?.pending?.status !== "waiting") return;
    const timer = setInterval(() => { void refresh().catch((e: Error) => setMessage(e.message)); }, 3000);
    return () => clearInterval(timer);
  }, [refresh, view?.pending?.status]);
  const connection = view?.connections.find((c) => c.id === chosen);
  const catalogAccount = connection?.provider === "chatgpt" && connection.connected && connection.planEnabled ? connection.id : null;
  useEffect(() => {
    if (!catalogAccount) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setCatalogState("loading"); setCatalogError("");
      try {
        const r = await fetch("/api/ai/connections", { method: "POST", cache: "no-store", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "models", id: catalogAccount }) });
        const data = await r.json(); if (!r.ok) throw new Error(data.error);
        if (!controller.signal.aborted) { setModels(data.models); setCatalogState("ready"); }
      } catch (error) {
        if (!controller.signal.aborted) { setCatalogState("error"); setCatalogError(error instanceof Error ? error.message : "Model catalog unavailable"); }
      }
    });
    return () => controller.abort();
  }, [catalogAccount, catalogRevision]);
  async function act(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/ai/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      setView(data);
      if (body.action === "select") { dirty.current = false; applySelection(data.selection); setMessage("Report connection saved. New reports will use these settings."); }
      if (data.message) setMessage(data.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection action failed"); }
    finally { setBusy(false); }
  }
  const active = view?.selection;
  const listedModel = models.find((m) => m.id === model);
  const knownSol = "gpt-6.1-sol";
  const efforts = listedModel?.efforts ?? (model === knownSol ? [...CHATGPT_EFFORTS] : []);
  const chosenUnavailable = chosen !== "none" && chosen !== "anthropic" && (!connection?.connected || !connection.planEnabled);
  // OpenAI documents Fast only for the models it lists; for any other model
  // Standard is the only speed offered, and a saved Fast reads as Standard here.
  const fastOffered = model !== "" && chatGptFastOffered(model);
  const speed = fastOffered ? serviceTier : "default";
  // A saved full model ID is not one of the aliases, so it opens the ID box too.
  const claudeCustom = customClaude || (model !== "" && !(CLAUDE_MODELS as readonly string[]).includes(model));
  return <Panel title="AI connections">
    <div className="space-y-3 text-sm">
      <p>Choose how Metis runs its AI research. Financial calculations and citation checks stay in Metis.</p>
      <p className="text-faint">ChatGPT sign-in opens your normal Chrome browser. Signing in does not run a report. Metis never switches a failed connection to paid API usage.</p>
      {view && <>
        <p><strong>Active:</strong> {active?.provider === "none" ? "AI off — data-only reports" : active?.provider === "anthropic" ? "Claude API — separately billed" : `${active?.provider === "chatgpt" ? "ChatGPT plan" : active?.provider === "claude" ? "Claude via local CLI" : "Unsupported connection"} · ${active && "model" in active ? active.model : ""} · ${view.connections.find((c) => c.id === (active && "connectionId" in active ? active.connectionId : ""))?.label ?? "connection unavailable"}`}</p>
        {active?.provider === "chatgpt" && <p className="text-xs text-faint">Saved reasoning: {active.effort ?? "provider default"} · speed: {active.serviceTier === "fast" ? "Fast" : "Standard"}. Each report records the settings actually reported by the provider.</p>}
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy || view.pending?.status === "waiting"} onClick={() => void act({ action: "connect-chatgpt" })}>Continue with ChatGPT</button>
          <button className={button} disabled={busy || !view.claudeInstalled} onClick={() => void act({ action: "connect-claude" })}>Connect local Claude Code</button>
        </div>
        <p className="text-xs text-faint">ChatGPT requires an eligible plan.</p>
        <div className="space-y-2 border border-edge p-3">
          <p className="font-medium">Claude account / OAuth</p>
          <p>Sign in through the official Claude Code app: run <code>claude auth login</code> in your terminal and complete Anthropic’s browser sign-in. Then click <strong>Connect local Claude Code</strong> above. Metis runs the installed CLI; your OAuth credentials stay with Claude Code.</p>
          {!view.claudeInstalled && <p>Install <a className="underline" href="https://code.claude.com/docs/en/overview" target="_blank" rel="noreferrer">Claude Code</a> version 2.1.319 or newer, then restart Metis.</p>}
          <p className="text-xs text-faint">Reports use your Claude Code account’s model access and usage limits. Extra usage settings in your account still apply. <a className="underline" href="https://claude.ai/settings/usage" target="_blank" rel="noreferrer">View Claude usage</a> · <a className="underline" href="https://code.claude.com/docs/en/legal-and-compliance" target="_blank" rel="noreferrer">Authentication rules</a>. The separately billed Claude API connection remains available.</p>
        </div>
        {view.pending && <div role="status" className="border border-edge p-2"><p>{view.pending.message}</p>{view.pending.url && <a className="underline" href={view.pending.url} target="_blank" rel="noreferrer">Open ChatGPT sign-in</a>}</div>}
        {view.connections.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-edge py-2">
          <span>{c.label} — {c.connected ? c.planEnabled ? c.provider === "chatgpt" ? "connected · ChatGPT plan usage is enabled" : "connected" : "plan access not granted" : "signed out"}</span>
          <div className="flex gap-2">
            {c.provider === "chatgpt" && <button className={button} disabled={busy} onClick={() => void act({ action: "connect-chatgpt", id: c.id })}>Reconnect</button>}
            {c.provider === "claude" && <button className={button} disabled={busy} onClick={() => void act({ action: "connect-claude" })}>Check sign-in</button>}
            <button className={button} disabled={busy} onClick={() => void act({ action: `disconnect-${c.provider}`, id: c.id })}>Disconnect</button>
          </div>
        </div>)}
        <label className="block">Use for new reports
          <select className="mt-1 w-full border border-edge bg-bg p-2" value={chosen} disabled={busy} onChange={(e) => { dirty.current = true; setChosen(e.target.value); setModels([]); setCatalogState("idle"); setCatalogError(""); setEffort(""); setCustomClaude(false); setServiceTier("default"); const provider = view.connections.find((c) => c.id === e.target.value)?.provider; setModel(provider === "claude" ? "default" : ""); }}>
            <option value="none">AI off — data-only reports</option>
            {chosenUnavailable && <option value={chosen} disabled>Saved connection unavailable — select a connected account</option>}
            {view.connections.filter((c) => c.connected && c.planEnabled).map((c) => <option key={c.id} value={c.id}>{c.provider === "chatgpt" ? "ChatGPT plan" : "Claude via local CLI"} · {c.label}</option>)}
            <option value="anthropic" disabled={!view.hasAnthropicKey}>Claude API — separately billed{!view.hasAnthropicKey ? " (no key configured)" : ""}</option>
          </select>
        </label>
        {connection?.provider === "chatgpt" && <div className="space-y-2">
          <button className={button} disabled={busy || catalogState === "loading" || chosenUnavailable} onClick={() => setCatalogRevision((n) => n + 1)}>{catalogState === "loading" ? "Refreshing account models…" : "Refresh account models"}</button>
          <label className="block">Model<select className="mt-1 w-full border border-edge bg-bg p-2" value={model} disabled={busy} onChange={(e) => { dirty.current = true; setModel(e.target.value); setEffort(""); }}>
            <option value="">Choose a model</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}
            {!models.some((m) => m.id === knownSol) && <option value={knownSol}>GPT-6.1 Sol · access not confirmed by account catalog</option>}
            {model && model !== knownSol && !listedModel && <option value={model}>{model} · saved model, access not confirmed</option>}
          </select></label>
          {catalogError && <p role="status">{catalogError} Saved settings have not changed.</p>}
          {model && !listedModel && catalogState !== "loading" && <p className="text-xs text-warn">This model is not in the account’s returned list. You can request it explicitly, but OpenAI may reject it based on account access or rollout. Metis will not substitute another model or paid API.</p>}
          <label className="block">ChatGPT reasoning effort<select className="mt-1 w-full border border-edge bg-bg p-2" value={effort} disabled={busy} onChange={(e) => { dirty.current = true; setEffort(e.target.value as ChatGptEffort | ""); }}>
            <option value="">Provider default</option>
            {efforts.map((level) => <option key={level} value={level}>{level}</option>)}
            {effort && !efforts.includes(effort) && <option value={effort}>{effort} · saved setting</option>}
          </select></label>
          <label className="block">ChatGPT speed<select className="mt-1 w-full border border-edge bg-bg p-2" value={speed} disabled={busy || !fastOffered} onChange={(e) => { dirty.current = true; setServiceTier(e.target.value as "default" | "fast"); }}>
            <option value="default">Standard</option>{fastOffered && <option value="fast">Fast — uses your plan or credits faster</option>}
          </select></label>
          <p className="text-xs text-faint">{fastOffered
            ? "Fast is subject to account availability. OpenAI currently documents 2.5× included usage consumption and 2× purchased-credit or Enterprise pay-as-you-go rates. The provider may serve Standard instead; the saved report records the returned tier."
            : "OpenAI offers Fast only for GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Astra, GPT-6 Sol and GPT-6 Luna, so this model runs at Standard speed."}{" "}<a className="underline" href="https://learn.chatgpt.com/docs/agent-configuration/speed" target="_blank" rel="noreferrer">Speed and usage details</a>.</p>
        </div>}
        {connection?.provider === "claude" && <div className="space-y-2">
          <label className="block">Claude model<select className="mt-1 w-full border border-edge bg-bg p-2" value={claudeCustom ? "custom" : model} disabled={busy} onChange={e => { dirty.current = true; const custom = e.target.value === "custom"; setCustomClaude(custom); setModel(custom ? "" : e.target.value); }}>
            {CLAUDE_MODELS.map(id => <option key={id} value={id}>{id}</option>)}
            <option value="custom">Other — enter a full model ID</option>
          </select></label>
          {claudeCustom && <input aria-label="Claude model ID" placeholder="Full Claude model ID" className="w-full border border-edge bg-bg p-2" value={model} maxLength={128} disabled={busy} onChange={e => { dirty.current = true; setModel(e.target.value); }} />}
          <p className="text-xs text-faint">Choose default, opus, sonnet, haiku, fable or best, or pick Other to enter a full Claude model ID. Aliases resolve through your installed CLI; account access may vary. Reports record the models returned by the CLI. Research uses the supplied financial evidence; web tools are disabled for this connection.</p>
          <label className="block">Claude reasoning effort<select className="mt-1 w-full border border-edge bg-bg p-2" value={effort} disabled={busy} onChange={e => { dirty.current = true; setEffort(e.target.value as ChatGptEffort | ""); }}>
            <option value="">CLI default</option>{CHATGPT_EFFORTS.map(level => <option key={level} value={level}>{level}</option>)}
          </select></label>
        </div>}
        <button className={button} disabled={busy || chosenUnavailable || (!!connection && !model)} onClick={() => void act({ action: "select", selection: connection ? { provider: connection.provider, connectionId: connection.id, model,
          ...(connection.provider === "chatgpt" ? { serviceTier: speed, ...(effort ? { effort } : {}) } : {}),
          ...(connection.provider === "claude" && effort ? { effort } : {}),
        } : { provider: chosen } })}>Save report connection</button>
        <p className="text-xs text-faint">Your remaining plan allowance is not available here. A model listing does not guarantee access or remaining quota. Check ChatGPT (<a className="underline" href={CHATGPT_MANAGE_USAGE_URL} target="_blank" rel="noreferrer">Manage usage</a>) before running reports. Your provider’s credit settings still apply.</p>
      </>}
      {!view && !message && <p>Loading connections…</p>}
      {message && <p role="status">{message}</p>}
    </div>
  </Panel>;
}
