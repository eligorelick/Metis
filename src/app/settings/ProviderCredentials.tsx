"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Panel } from "@/components/ui";
import type { SettingsPayload } from "@/settings/contracts";
import {
  PROVIDER_CREDENTIAL_KEYS, PROVIDER_CREDENTIALS_CHANGED,
  type ProviderCredentialKey, type ProviderCredentialStatus, type ProviderCredentialStatuses,
} from "@/settings/credentialContracts";

const buttonClass = "border border-edge px-3 py-2 text-[12px] hover:border-accent disabled:cursor-not-allowed disabled:opacity-40";

function CredentialRow({ credentialKey, status, ready, onSaved }: {
  credentialKey: ProviderCredentialKey;
  status: ProviderCredentialStatus;
  ready: boolean;
  onSaved(statuses: ProviderCredentialStatuses): void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [result, setResult] = useState<{ kind: "saved" | "working" | "error"; message: string } | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  const contact = credentialKey === "EDGAR_CONTACT";
  const inputId = `credential-${credentialKey}`;

  async function act(action: "save" | "test") {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch("/api/settings/credentials", {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, key: credentialKey, ...(value.trim() ? { value: value.trim() } : {}) }),
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "The action could not be completed.");
      if (action === "save") {
        setValue("");
        setResult({ kind: "saved", message: "Saved. Test to verify the connection." });
        onSaved(data.credentials as ProviderCredentialStatuses);
      } else {
        setResult({ kind: data.ok === true ? "working" : "error", message: `${data.message}${data.ok === true && value.trim() ? " Save to use this value." : ""}` });
      }
    } catch (error) {
      if (!controller.signal.aborted) setResult({ kind: "error", message: error instanceof Error ? error.message : "The action could not be completed. Try again." });
    } finally {
      if (!controller.signal.aborted) setBusy(null);
      pending.current = null;
    }
  }

  return (
    <div className="min-w-0 border-b border-edge py-3 last:border-b-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="mono text-[12px]">{credentialKey}</label>
        <Badge tone="muted">{status.configured ? "configured" : "missing"}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          id={inputId} type={contact ? "text" : "password"} value={value}
          autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={2048}
          disabled={!ready || busy !== null}
          placeholder={status.configured ? "Saved value hidden; enter a replacement" : contact ? "Your Name you@your-organization.com" : "Enter API key"}
          aria-describedby={`${inputId}-status`}
          onChange={(event) => { setValue(event.target.value); setResult(null); }}
          className="min-w-0 flex-[1_1_16rem] border border-edge bg-bg px-2 py-2 text-[12px] outline-none focus:border-accent disabled:opacity-40"
        />
        <div className="flex gap-2">
          <button type="button" aria-label={`Save ${credentialKey}`} className={buttonClass} disabled={!ready || busy !== null || !value.trim()} onClick={() => void act("save")}>{busy === "save" ? "Saving…" : "Save"}</button>
          <button type="button" aria-label={`Test ${credentialKey}`} className={buttonClass} disabled={!ready || busy !== null || (!value.trim() && !status.configured)} onClick={() => void act("test")}>{busy === "test" ? "Testing…" : "Test"}</button>
        </div>
      </div>
      <div id={`${inputId}-status`} role="status" aria-live="polite" className={`mt-1 flex items-start gap-1.5 text-[11px] ${result?.kind === "working" ? "text-pos" : result?.kind === "error" ? "text-neg" : "text-faint"}`}>
        {result?.kind === "working" && <svg aria-label="Connection verified" role="img" className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m3 8 3 3 7-7" /></svg>}
        <span>{busy === "test" ? "Checking the provider…" : result?.message ?? (status.source === "environment" ? "Configured from environment. Test to verify access." : status.configured ? "Stored locally. Test to verify access." : contact ? "Use your name or organization and a reachable email." : "No key configured.")}</span>
      </div>
      {credentialKey === "ANTHROPIC_ADMIN_KEY" && <p className="mt-1 text-[11px] text-faint">Optional admin key for cost reconciliation; separate from the Claude API key.</p>}
    </div>
  );
}

export function ProviderCredentials({ capabilities }: { capabilities?: SettingsPayload["capabilities"] }) {
  const [statuses, setStatuses] = useState<ProviderCredentialStatuses | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/settings/credentials", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Credential settings unavailable.");
        if (!controller.signal.aborted) { setStatuses(data.credentials); setError(""); }
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Credential settings unavailable.");
      });
    return () => controller.abort();
  }, [revision]);

  const configured = {
    FMP_API_KEY: capabilities?.hasFmpKey, FINNHUB_API_KEY: capabilities?.hasFinnhubKey,
    FRED_API_KEY: capabilities?.hasFredKey, ANTHROPIC_API_KEY: capabilities?.hasAnthropicKey,
    ANTHROPIC_ADMIN_KEY: false, EDGAR_CONTACT: capabilities?.hasEdgarContact,
  };
  function saved(key: ProviderCredentialKey, next: ProviderCredentialStatuses) {
    // Other rows can save concurrently; their newer responses must stay authoritative.
    setStatuses((current) => current === null ? current : { ...current, [key]: next[key] });
    window.dispatchEvent(new CustomEvent(PROVIDER_CREDENTIALS_CHANGED));
  }
  return (
    <Panel title="Provider keys and SEC contact">
      <p className="pt-1 text-[11px] leading-snug text-faint">Save each value to use it immediately. Test checks the entered value, or the configured value when the field is blank. A green check means the provider returned usable test data.</p>
      {!(statuses?.FMP_API_KEY.configured ?? capabilities?.hasFmpKey) && <div className="mt-2 border border-warn/40 bg-warn/10 px-2 py-1.5 text-[11px] text-warn">Synthetic fixture mode — no FMP key, so no current market data from FMP. FMP-backed fields remain disclosed gaps; supported real US filers can use SEC EDGAR and Yahoo once EDGAR_CONTACT is set. <Link href="/company/DEMO" className="font-semibold underline">DEMO</Link> and DBNK use synthetic fixtures.</div>}
      {error && <div role="alert" className="py-2 text-[12px] text-neg">{error} <button type="button" className="underline" onClick={() => setRevision((n) => n + 1)}>Retry</button></div>}
      {PROVIDER_CREDENTIAL_KEYS.map((key) => <CredentialRow key={key} credentialKey={key} ready={statuses !== null} status={statuses?.[key] ?? { configured: !!configured[key], source: configured[key] ? "environment" : "missing" }} onSaved={(next) => saved(key, next)} />)}
      <p className="pt-2 text-[11px] leading-snug text-faint">Saved values stay in the app’s protected local credential store and override environment values. Existing keys are never sent back to the browser. No restart is needed.</p>
      <p className="pt-2 text-[11px] leading-snug text-faint">An FMP key does not confirm subscription entitlement. Free or lower-tier keys can return HTTP 402 for restricted endpoints or symbols. A successful test confirms access to the test endpoint; other datasets may require a different plan.</p>
      <p className="pt-2 text-[11px] leading-snug text-faint">SEC EDGAR needs no paid key. Use a reachable email in EDGAR_CONTACT. Testing confirms SEC connectivity, without verifying email ownership. Claude tests check API access without generating a paid response; remaining credits and report-model access are not confirmed.</p>
    </Panel>
  );
}
