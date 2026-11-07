"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteReportButton({ reportId, symbol, redirect = false }: { reportId: number; symbol: string; redirect?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/report/view/${reportId}?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not delete this run.");
      if (redirect) router.replace(`/company/${encodeURIComponent(symbol)}/history`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this run."); setBusy(false); }
  }
  return <span className="inline-flex flex-wrap items-center gap-2 text-xs">
    {confirming ? <>
      <span>Delete saved run #{reportId}?</span>
      <button type="button" className="border border-neg/50 px-2 py-1 text-neg" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Confirm delete"}</button>
      <button type="button" className="px-2 py-1 text-muted" disabled={busy} onClick={() => setConfirming(false)}>Keep run</button>
    </> : <button type="button" className="border border-edge px-2 py-1 text-muted hover:border-neg hover:text-neg" aria-label={`Delete ${symbol} run #${reportId}`} onClick={() => setConfirming(true)}>Delete</button>}
    {error && <span role="alert" className="text-neg">{error}</span>}
  </span>;
}
