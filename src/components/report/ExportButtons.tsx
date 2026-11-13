"use client";

/**
 * ExportButtons — the report's Export menu, mounted on the report and company
 * pages. Three exports of the saved report:
 *
 *   - Full report · Markdown → /api/export/[reportId]?format=md (a
 *     text/markdown attachment).
 *   - Audit trail · Markdown → /api/export/[reportId]?format=audit, the
 *     separate audit file (verification log, data-gap manifest, raw values; D-62).
 *   - Print / Save as PDF → the light print page
 *     /company/[symbol]/report/[reportId]/print?autoprint=1 in a new tab, which
 *     auto-fires the browser print dialog (dependency-free PDF via print-to-PDF).
 *
 * Pure client interactivity — no server-only imports. Takes only the
 * ids/symbol it needs as props. D-246: the classic layout's three buttons were
 * removed with that layout; the menu reaches the same three exports.
 */

import { useEffect, useRef, useState, type MouseEvent } from "react";

export function ExportButtons({
  reportId,
  symbol,
  className,
}: {
  reportId: number;
  symbol: string;
  /** Optional extra classes for the wrapper (layout at the mount site). */
  className?: string;
}) {
  const sym = encodeURIComponent(symbol);
  const mdHref = `/api/export/${reportId}?format=md`;
  const auditHref = `/api/export/${reportId}?format=audit`;
  const printHref = `/company/${sym}/report/${reportId}/print?autoprint=1`;
  return <DossierExportMenu key={`${symbol}:${reportId}`} reportId={reportId} mdHref={mdHref} auditHref={auditHref} printHref={printHref} className={className} />;
}

function positionExportMenu(root: HTMLDivElement | null): void {
  if (!root?.querySelector("details")?.open) return;
  const menu = root.querySelector("nav");
  if (!menu) return;
  // Measure the unshifted menu each time, so resize and status updates cannot
  // compound a previous correction. Native, unhydrated details stay in flow.
  menu.style.removeProperty("--export-menu-shift");
  const bounds = menu.getBoundingClientRect();
  const shift = Math.max(12 - bounds.left, Math.min(0, document.documentElement.clientWidth - 12 - bounds.right));
  menu.style.setProperty("--export-menu-shift", `${shift}px`);
}

function DossierExportMenu({ reportId, mdHref, auditHref, printHref, className }: {
  reportId: number; mdHref: string; auditHref: string; printHref: string; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handedOff, setHandedOff] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const timers = useRef<number[]>([]);
  const menuRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menuRoot.current?.setAttribute("data-menu-ready", "true");
    const resize = () => positionExportMenu(menuRoot.current);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => { positionExportMenu(menuRoot.current); }, [busy, error, handedOff]);
  useEffect(() => () => {
    pending.current?.abort();
    timers.current.forEach(timer => window.clearTimeout(timer));
    urls.current.forEach(url => URL.revokeObjectURL(url));
  }, []);
  async function download(event: MouseEvent<HTMLAnchorElement>, kind: "md" | "audit", href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(null); setHandedOff(false);
    try {
      const response = await fetch(href, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(`Export unavailable (${response.status}). Try again or open the saved report.`);
      const filename = /attachment;\s*filename="([^"]+)"/i.exec(response.headers.get("Content-Disposition") ?? "")?.[1];
      const suffix = `-report-${reportId}${kind === "audit" ? "-audit" : ""}.md`;
      if (!/^text\/markdown\b/i.test(response.headers.get("Content-Type") ?? "") || !filename || !/^[A-Za-z0-9._-]+$/.test(filename) || !filename.endsWith(suffix)) {
        throw new Error("Export returned invalid download metadata. Reload and try again.");
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob); urls.current.add(url);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.rel = "noopener";
      document.body.append(anchor); anchor.click(); anchor.remove();
      timers.current.push(window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 60_000));
      setHandedOff(true);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Export failed. Try again.");
    } finally {
      if (pending.current === controller) { pending.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }
  return <div ref={menuRoot} className={`report-export ${className ?? ""}`}>
    <details onToggle={() => positionExportMenu(menuRoot.current)} onKeyDown={event => {
      if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
    }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}>
      <summary>Export <span aria-hidden="true">⌄</span></summary>
      <nav aria-label="Report export formats">
        <a href={mdHref} download aria-disabled={busy || undefined} onClick={event => void download(event, "md", mdHref)}>Full report · Markdown</a>
        <a href={auditHref} download aria-disabled={busy || undefined} onClick={event => void download(event, "audit", auditHref)}>Audit trail · Markdown</a>
        <a href={printHref} target="_blank" rel="noopener noreferrer">Print / Save as PDF</a>
        <p>Exports this saved report, including its recorded dates and limitations.</p>
      </nav>
    </details>
    {busy && <p role="status">Preparing download…</p>}
    {error && <p role="alert">{error}</p>}
    {handedOff && <p role="status">Download handed to your browser. Check its downloads for completion.</p>}
  </div>;
}
