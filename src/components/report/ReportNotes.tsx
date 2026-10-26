"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { canonicalEntitySymbol } from "@/symbol";

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
// Only failed/conflicting writes are retained here, in this browser tab. A
// report switch cannot silently discard a draft when storage is blocked.
type NoteState = { text: string; status: "empty" | "saved" | "unsaved" | "unavailable" | "conflict"; incoming?: string | null };
const unsavedDrafts = new Map<string, NoteState>();
const warnAboutDrafts = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
function retainDraft(key: string, draft: NoteState | null) {
  if (draft === null) unsavedDrafts.delete(key);
  else unsavedDrafts.set(key, draft);
  // This guard belongs to tab memory, not to an editor that can unmount during
  // ordinary navigation. It leaves only when every retained draft is resolved.
  window.removeEventListener("beforeunload", warnAboutDrafts);
  if (unsavedDrafts.size > 0) window.addEventListener("beforeunload", warnAboutDrafts);
}

export function reportNotesKey(symbol: string, reportId: number): string | null {
  const canonical = canonicalEntitySymbol(symbol);
  return canonical !== null && Number.isSafeInteger(reportId) && reportId > 0
    ? `metis:report-notes:v1:${canonical}:${reportId}` : null;
}
function readNote(key: string): NoteState {
  const draft = unsavedDrafts.get(key);
  try {
    const stored = window.localStorage.getItem(key);
    if (draft !== undefined) return draft.status === "conflict" ? { ...draft, incoming: stored } : draft;
    return { text: stored ?? "", status: stored === null ? "empty" : "saved" };
  } catch {
    if (draft !== undefined) return draft.status === "conflict" ? { ...draft, incoming: undefined } : draft;
    return { text: "", status: "unavailable" };
  }
}

/** Browser-local plain text, deliberately separate from the report/export. */
export function ReportNotes({ symbol, reportId }: { symbol: string; reportId: number }) {
  const key = reportNotesKey(symbol, reportId);
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  if (key === null) return <p>Local notes unavailable: invalid saved-report identity.</p>;
  return hydrated ? <NotesEditor key={key} storageKey={key} symbol={symbol} reportId={reportId} /> : <NotesFrame symbol={symbol} reportId={reportId}><p>Local notes load in this browser after the page is ready.</p></NotesFrame>;
}

function NotesFrame({ symbol, reportId, status, children }: { symbol: string; reportId: number; status?: NoteState["status"]; children: ReactNode }) {
  return <details className="report-notes">
    <summary>Local notes <span className="mono">· {symbol} / #{reportId}</span>{(status === "unsaved" || status === "conflict" || status === "unavailable") && <span className="note-save-indicator"> · {status === "conflict" ? "Version conflict" : status === "unavailable" ? "Storage unavailable" : "Unsaved"}</span>}</summary>
    <p>Local to this browser; not part of the generated research or exports. These notes are not synchronized or backed up by Metis.</p>
    {children}
  </details>;
}

function NotesEditor({ storageKey, symbol, reportId }: { storageKey: string; symbol: string; reportId: number }) {
  const [state, setState] = useState<NoteState>(() => readNote(storageKey));
  const id = useId();
  function save(text: string) {
    retainDraft(storageKey, { text, status: "unsaved" });
    try {
      window.localStorage.setItem(storageKey, text);
      if (window.localStorage.getItem(storageKey) !== text) throw new Error("Write not retained");
      retainDraft(storageKey, null);
      setState({ text, status: "saved" });
    } catch { setState({ text, status: "unsaved" }); }
  }
  function useStoredVersion() {
    // Storage events are notifications, not the authority: another change may
    // have happened while this report was unmounted or before the click.
    try {
      const stored = window.localStorage.getItem(storageKey);
      retainDraft(storageKey, null);
      setState({ text: stored ?? "", status: stored === null ? "empty" : "saved" });
    } catch {
      const retained: NoteState = { text: state.text, status: "conflict", incoming: undefined };
      retainDraft(storageKey, retained);
      setState(retained);
    }
  }
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key !== storageKey && event.key !== null) return;
      try {
        if (event.storageArea !== window.localStorage) return;
        const stored = window.localStorage.getItem(storageKey);
        setState(current => {
          if (current.text === stored) return current;
          const conflict: NoteState = { ...current, status: "conflict", incoming: stored };
          retainDraft(storageKey, conflict);
          return conflict;
        });
      } catch { /* The current editable draft and its storage warning remain. */ }
    }
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [storageKey]);
  return <NotesFrame symbol={symbol} reportId={reportId} status={state.status}><div className="report-notes-editor">
    <label htmlFor={id}>Your note for {symbol}, saved report #{reportId}</label>
    <textarea id={id} value={state.text} rows={7} readOnly={state.status === "conflict"}
      onInput={event => { if (state.status !== "conflict") save(event.currentTarget.value); }} aria-describedby={`${id}-status`} spellCheck />
    <p id={`${id}-status`} role="status" className={state.status === "unsaved" || state.status === "conflict" || state.status === "unavailable" ? "text-warn" : "text-muted"}>
      {state.status === "saved" ? "Saved in this browser." : state.status === "empty" ? "No note saved for this report." : state.status === "unavailable" ? "Storage is unavailable. Notes will remain unsaved until browser storage is available." : state.status === "conflict" ? state.incoming === undefined ? "Stored version could not be read. Your version is retained here; retry reading storage or keep your version." : "Changed in another tab. Your version is retained here; choose a version before editing." : "Unsaved. Your draft is retained for this tab, but is not persisted. Copy it before closing or reloading."}
    </p>
    {state.status === "conflict" ? <div className="note-conflict-actions">
      <button type="button" onClick={useStoredVersion}>Use stored version</button>
      <button type="button" onClick={() => save(state.text)}>Keep this version</button>
      {state.incoming !== undefined && <details><summary>Read stored version</summary><pre>{state.incoming ?? ""}</pre></details>}
    </div> : state.status === "unsaved" && <button type="button" onClick={() => save(state.text)}>Save note</button>}
  </div></NotesFrame>;
}
