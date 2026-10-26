"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { CoverageTarget } from "@/appearance/UiDesignProvider";
import { REPORT_SECTION_MANIFEST } from "@/report/sectionManifest";
import { canonicalEntitySymbol, normalizeSymbol, sameEntitySymbol } from "@/symbol";
import { AddTicker } from "./watchlist/AddTicker";

export interface CommandPaletteProps { coverage: readonly CoverageTarget[]; coverageAvailable: boolean; onClose(restoreFocus?: boolean): void }
type Destination = { id: string; label: string; detail: string; href: string; symbol?: string };
function currentSections(): Destination[] {
  return REPORT_SECTION_MANIFEST.filter(section => document.getElementById(`report-${section.key}`)?.closest(".thesis-report"))
    .map(section => ({ id: `section:${section.key}`, label: section.label, detail: `Current report section · ${section.printTitle}${section.key === "competitive" ? " · Moat" : ""}`, href: `#report-${section.key}` }));
}
const searchText = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function containFocus(event: ReactKeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled])')];
  const first = controls[0]; const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
}

export function CommandPalette({ coverage, coverageAvailable, onClose }: CommandPaletteProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [sections] = useState(currentSections);
  const [added, setAdded] = useState<string | null>(null);
  const id = useId();
  const symbols = new Set<string>();
  const companies = coverage.filter(row => {
    const symbol = canonicalEntitySymbol(row.symbol);
    if (symbol === null || symbols.has(symbol)) return false;
    symbols.add(symbol); return true;
  }).map(row => ({ id:`company:${row.symbol}`, label:row.symbol, detail:row.companyName ?? "Watchlist company", href:`/company/${encodeURIComponent(row.symbol)}`, symbol:row.symbol }));
  const words = searchText(query).split(/\s+/).filter(Boolean);
  const destinations: Destination[] = [...sections, ...companies, { id:"coverage",label:"Coverage",detail:"Saved company watchlist",href:"/" }, {id:"settings",label:"Settings",detail:"Appearance, connections and research preferences",href:"/settings"}];
  const matches = destinations.filter(result => query.trim().length === 0 || (words.length > 0 && words.every(word => searchText(`${result.label} ${result.detail}`).includes(word))) || (result.symbol !== undefined && sameEntitySymbol(result.symbol,query)));
  const shown = matches.slice(0,24);
  const candidate = matches.length === 0 ? normalizeSymbol(query) : null;
  useEffect(() => {
    const modal = dialog.current!;
    modal.showModal(); input.current?.focus();
    return () => { if (modal.open) modal.close(); };
  }, []);
  function close(restoreFocus = true) { dialog.current?.close(); onClose(restoreFocus); }
  function links() { return [...(list.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])]; }
  return <dialog ref={dialog} className="command-dialog" aria-label="Search research" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    containFocus(event);
  }}>
    <div className="command-search-field"><label htmlFor={id}>Search research</label><input ref={input} id={id} type="search" value={query} autoComplete="off" spellCheck={false} aria-controls={`${id}-results`} placeholder="Company, ticker or report section" onInput={event => { setQuery(event.currentTarget.value); setAdded(null); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); (event.key === "ArrowDown" ? links()[0] : links().at(-1))?.focus(); }
      else if (event.key === "Enter" && links()[0]) { event.preventDefault(); links()[0]!.click(); }
    }} /></div>
    {!coverageAvailable && <p role="status" className="command-warning">Coverage could not be loaded. Available report sections and workspace destinations remain searchable; reload to retry coverage.</p>}
    <p className="command-result-status" role="status">{matches.length === 0 ? "No matching destinations. Try a saved ticker, company name or section title." : `${matches.length} matching ${matches.length === 1 ? "destination" : "destinations"}${matches.length > shown.length ? ` · showing ${shown.length}; refine your search` : ""}.`}</p>
    <ul className="command-results" id={`${id}-results`} ref={list} onKeyDown={event => {
      if (event.nativeEvent.isComposing || !["ArrowDown","ArrowUp","Home","End"].includes(event.key)) return;
      const options = links(); const current = options.indexOf(document.activeElement as HTMLAnchorElement);
      if (current < 0 || options.length === 0) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length-1 : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }}>{shown.map(result => <li key={result.id}><a href={result.href} onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      close(false);
      if (result.href.startsWith("#")) document.getElementById(result.href.slice(1))?.focus({preventScroll:true});
    }}><span>{result.label}</span><span>{result.detail}</span><span aria-hidden="true">↵</span></a></li>)}</ul>
    {candidate !== null && <div className="command-add"><p>Add {candidate} to your watchlist. This does not generate a report or fetch market data.</p><AddTicker key={candidate} initialValue={candidate} submitLabel={`Add ${candidate} to watchlist`} onAdded={setAdded} /></div>}
    {added && <p role="status" className="command-added">Added {added} to watchlist.</p>}
    <div className="command-footer"><p>↑ ↓ Navigate · Enter Open · Esc Close</p><button type="button" onClick={() => close()}>Close search</button></div>
  </dialog>;
}
