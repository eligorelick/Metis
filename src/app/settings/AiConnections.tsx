"use client";
import { PROVIDER_CREDENTIALS_CHANGED } from "@/settings/credentialContracts";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/ui";
import type { AnalysisRoute } from "@/ai/analysisRoute";
import { CHATGPT_EFFORTS, CHATGPT_MANAGE_USAGE_URL, chatGptFastOffered, type ChatGptEffort, type ChatGptModelChoice, type AiConnectionsView } from "@/ai/contracts";

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
  const [serviceTier, setServiceTier] = useState<"default" | "fast">("default");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [catalogError, setCatalogError] = useState("");
  const refresh = useCallback(async () => {
    const r = await fetch("/api/ai/connections", { cache: "no-store" });
    const data = await r.json(); if (!r.ok) throw new Error(data.error);
    setView(data as AiConnectionsView);
  }, []);
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
      if (body.action === "select") setMessage("Report connection saved. New reports will use these settings.");
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
  return <Panel title="AI connections">
    <div className="space-y-3 text-sm">
      <p>Choose how Metis runs its AI research. Financial calculations and citation checks stay in Metis.</p>
      <p className="text-faint">ChatGPT sign-in opens your normal Chrome browser. Gemini opens your default browser; choose Chrome as your default to use its saved sign-in. Signing in does not run a report. Metis never switches a failed connection to paid API usage.</p>
      {view && <>
        <p><strong>Active:</strong> {active?.provider === "none" ? "AI off — data-only reports" : active?.provider === "anthropic" ? "Claude API — separately billed" : `${active?.provider === "chatgpt" ? "ChatGPT plan" : "Google Gemini CLI allowance"} · ${active && "model" in active ? active.model : ""} · ${view.connections.find((c) => c.id === (active && "connectionId" in active ? active.connectionId : ""))?.label ?? "connection unavailable"}`}</p>
        {active?.provider === "chatgpt" && <p className="text-xs text-faint">Saved reasoning: {active.effort ?? "provider default"} · speed: {active.serviceTier === "fast" ? "Fast" : "Standard"}. Each report records the settings actually reported by the provider.</p>}
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy || view.pending?.status === "waiting"} onClick={() => void act({ action: "connect-chatgpt" })}>Continue with ChatGPT</button>
          <button className={button} disabled={busy || !view.geminiInstalled || view.pending?.status === "waiting"} onClick={() => void act({ action: "connect-gemini" })}>Connect Gemini with Google</button>
        </div>
        <p className="text-xs text-faint">ChatGPT requires an eligible plan. Gemini uses the official local Gemini CLI and its Google allowance. Claude remains available through a separately billed API key; third-party Claude subscription sign-in is not enabled.</p>
        {!view.geminiInstalled && <p>Gemini CLI is missing or unsupported. Install version 0.36.x using <a className="underline" href="https://geminicli.com/docs/get-started/installation/" target="_blank" rel="noreferrer">Google’s instructions</a>, then restart Metis.</p>}
        {view.pending && <div role="status" className="border border-edge p-2"><p>{view.pending.message}</p>{view.pending.url && <a className="underline" href={view.pending.url} target="_blank" rel="noreferrer">Open ChatGPT sign-in</a>}</div>}
        {view.connections.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-edge py-2">
          <span>{c.label} — {c.connected ? c.planEnabled ? c.provider === "chatgpt" ? "connected · ChatGPT plan usage is enabled" : "connected" : "plan access not granted" : "signed out"}</span>
          <div className="flex gap-2">
            {c.provider === "chatgpt" && <button className={button} disabled={busy} onClick={() => void act({ action: "connect-chatgpt", id: c.id })}>Reconnect</button>}
            <button className={button} disabled={busy} onClick={() => void act({ action: `disconnect-${c.provider}`, id: c.id })}>Disconnect</button>
          </div>
        </div>)}
        <label className="block">Use for new reports
          <select className="mt-1 w-full border border-edge bg-bg p-2" value={chosen} disabled={busy} onChange={(e) => { setChosen(e.target.value); setModels([]); setCatalogState("idle"); setCatalogError(""); setEffort(""); setServiceTier("default"); setModel(view.connections.find((c) => c.id === e.target.value)?.provider === "gemini" ? "auto" : ""); }}>
            <option value="none">AI off — data-only reports</option>
            {chosenUnavailable && <option value={chosen} disabled>Saved connection unavailable — select a connected account</option>}
            {view.connections.filter((c) => c.connected && c.planEnabled).map((c) => <option key={c.id} value={c.id}>{c.provider === "chatgpt" ? "ChatGPT plan" : "Gemini CLI allowance"} · {c.label}</option>)}
            <option value="anthropic" disabled={!view.hasAnthropicKey}>Claude API — separately billed{!view.hasAnthropicKey ? " (no key configured)" : ""}</option>
          </select>
        </label>
        {connection?.provider === "chatgpt" && <div className="space-y-2">
          <button className={button} disabled={busy || catalogState === "loading" || chosenUnavailable} onClick={() => setCatalogRevision((n) => n + 1)}>{catalogState === "loading" ? "Refreshing account models…" : "Refresh account models"}</button>
          <label className="block">Model<select className="mt-1 w-full border border-edge bg-bg p-2" value={model} disabled={busy} onChange={(e) => { setModel(e.target.value); setEffort(""); }}>
            <option value="">Choose a model</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}
            {!models.some((m) => m.id === knownSol) && <option value={knownSol}>GPT-6.1 Sol · access not confirmed by account catalog</option>}
            {model && model !== knownSol && !listedModel && <option value={model}>{model} · saved model, access not confirmed</option>}
          </select></label>
          {catalogError && <p role="status">{catalogError} Saved settings have not changed.</p>}
          {model && !listedModel && catalogState !== "loading" && <p className="text-xs text-warn">This model is not in the account’s returned list. You can request it explicitly, but OpenAI may reject it based on account access or rollout. Metis will not substitute another model or paid API.</p>}
          <label className="block">ChatGPT reasoning effort<select className="mt-1 w-full border border-edge bg-bg p-2" value={effort} disabled={busy} onChange={(e) => setEffort(e.target.value as ChatGptEffort | "")}>
            <option value="">Provider default</option>
            {efforts.map((level) => <option key={level} value={level}>{level}</option>)}
            {effort && !efforts.includes(effort) && <option value={effort}>{effort} · saved setting</option>}
          </select></label>
          <label className="block">ChatGPT speed<select className="mt-1 w-full border border-edge bg-bg p-2" value={speed} disabled={busy || !fastOffered} onChange={(e) => setServiceTier(e.target.value as "default" | "fast")}>
            <option value="default">Standard</option>{fastOffered && <option value="fast">Fast — uses your plan or credits faster</option>}
          </select></label>
          <p className="text-xs text-faint">{fastOffered
            ? "Fast is subject to account availability. OpenAI currently documents 2.5× included usage consumption and 2× purchased-credit or Enterprise pay-as-you-go rates. The provider may serve Standard instead; the saved report records the returned tier."
            : "OpenAI offers Fast only for GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Astra, GPT-6 Sol and GPT-6 Luna, so this model runs at Standard speed."}{" "}<a className="underline" href="https://learn.chatgpt.com/docs/agent-configuration/speed" target="_blank" rel="noreferrer">Speed and usage details</a>.</p>
        </div>}
        {connection?.provider === "gemini" && <label className="block">Gemini model<input className="mt-1 w-full border border-edge bg-bg p-2" value={model} maxLength={128} onChange={(e) => setModel(e.target.value)} /><span className="text-xs text-faint">“auto” uses Google’s CLI selection; you can enter an available Gemini model ID.</span></label>}
        <button className={button} disabled={busy || chosenUnavailable || (!!connection && !model)} onClick={() => void act({ action: "select", selection: connection ? { provider: connection.provider, connectionId: connection.id, model,
          ...(connection.provider === "chatgpt" ? { serviceTier: speed, ...(effort ? { effort } : {}) } : {}),
        } : { provider: chosen } })}>Save report connection</button>
        <p className="text-xs text-faint">Your remaining plan allowance is not available here. A model listing does not guarantee access or remaining quota. Check ChatGPT (<a className="underline" href={CHATGPT_MANAGE_USAGE_URL} target="_blank" rel="noreferrer">Manage usage</a>) or <a className="underline" href="https://geminicli.com/docs/resources/quota-and-pricing/" target="_blank" rel="noreferrer">Gemini allowance details</a> before running reports. Your provider’s credit settings still apply.</p>
      </>}
      {!view && !message && <p>Loading connections…</p>}
      {message && <p role="status">{message}</p>}
    </div>
  </Panel>;
}
