"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshCompanyData({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/company/${encodeURIComponent(symbol)}/refresh`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not update ticker data.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update ticker data."); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <button type="button" className="border border-accent/50 px-3 py-2 text-accent disabled:opacity-50" disabled={busy} onClick={() => void refresh()}>{busy ? "Updating ticker data…" : "Update ticker data"}</button>
    <span className="text-faint">Checks for updated source data. Does not run AI or change saved reports.</span>
    {error && <span role="alert" className="text-neg">{error}</span>}
  </div>;
}
