"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { useUiDesign } from "@/appearance/UiDesignProvider";
import type { CommandPaletteProps } from "./CommandPalette";

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function hasModal() { return document.querySelector('dialog[open],[aria-modal="true"]') !== null; }
function editing(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest('input,textarea,select,[role="textbox"],[role="combobox"]')) return true;
  const editable = target.closest("[contenteditable]");
  return editable !== null && editable.getAttribute("contenteditable") !== "false";
}

/** Only the small launcher is eager. The modal code loads on first request. */
export function CommandLauncher() {
  const { layout, coverage, coverageAvailable } = useUiDesign();
  const [Palette, setPalette] = useState<ComponentType<CommandPaletteProps> | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const live = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const requestOpen = useCallback(async (from?: HTMLElement | null) => {
    if (hasModal() || pending.current) return;
    if (typeof HTMLDialogElement === "undefined" || typeof HTMLDialogElement.prototype.showModal !== "function") {
      setError("Search needs modal support in this browser. Use Coverage and report contents to navigate."); return;
    }
    origin.current = from ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : button.current);
    setError(null);
    if (Palette) { setOpen(true); return; }
    pending.current = true; setLoading(true);
    try {
      const loadedPalette = await import("./CommandPalette");
      if (!live.current || hasModal()) return;
      setPalette(() => loadedPalette.CommandPalette); setOpen(true);
    } catch { if (live.current) setError("Search could not load. Try again, or use Coverage and report contents."); }
    finally { pending.current = false; if (live.current) setLoading(false); }
  }, [Palette]);
  useEffect(() => {
    if (layout !== "dossier") return;
    function shortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat || editing(event.target) || hasModal()) return;
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey;
      const command = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      if (!slash && !command) return;
      event.preventDefault(); void requestOpen();
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [layout, requestOpen]);
  if (layout !== "dossier") return null;
  return <div className="command-launcher">
    <button ref={button} type="button" aria-label="Search research" title="Search research · Ctrl/Cmd+K or /" disabled={!hydrated || loading} onClick={() => void requestOpen(button.current)}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" /></svg>
      <span className="command-search-label">{loading ? "Opening…" : "Search"}</span>
    </button>
    {error && <p role="alert">{error}</p>}
    {open && Palette && <Palette coverage={coverage} coverageAvailable={coverageAvailable} onClose={(restoreFocus = true) => { setOpen(false); if (restoreFocus && origin.current?.isConnected) origin.current.focus({ preventScroll: true }); }} />}
  </div>;
}
