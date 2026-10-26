"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";

type Selection = { key: string; label: string; kind: string; nodes: Node[] };
const mobileQuery = "(max-width: 1280px)";
const subscribeMobile = (notify: () => void) => {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const serverSnapshot = () => false;
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;

function containDialogFocus(event: ReactKeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(node => !node.closest("[hidden],[inert]") && getComputedStyle(node).display !== "none");
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
}

function RecordedContent({ selection }: { selection: Selection }) {
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Clone only the server-rendered, React-escaped disclosure. No raw HTML,
    // provider fetch, metadata reconstruction, or client-side financial math.
    content.current?.replaceChildren(...selection.nodes.map(node => node.cloneNode(true)));
  }, [selection]);
  return <div ref={content} className="evidence-recorded-content" />;
}

/** One enhancement per report; native server disclosures remain the fallback. */
export function EvidenceInspector({ reportIdentity }: { reportIdentity: string }) {
  // Remount even if a caller reuses this component across report transitions.
  return <InspectorController key={reportIdentity} reportIdentity={reportIdentity} />;
}

function InspectorController({ reportIdentity }: { reportIdentity: string }) {
  const section = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, serverSnapshot);
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  const id = useId();

  const releaseTrigger = useCallback(() => {
    const origin = trigger.current;
    if (origin) {
      origin.removeAttribute("aria-controls");
      origin.removeAttribute("aria-expanded");
      origin.removeAttribute("aria-haspopup");
      delete origin.dataset.evidenceSelected;
    }
    trigger.current = null;
    return origin;
  }, []);

  const dismiss = useCallback((restoreFocus = true) => {
    const origin = releaseTrigger();
    setSelection(null);
    if (dialog.current?.open) dialog.current.close();
    if (restoreFocus && origin?.isConnected) origin.focus({ preventScroll: true });
  }, [releaseTrigger]);

  useEffect(() => {
    const reportRoot = section.current?.closest<HTMLElement>(".thesis-report");
    if (!reportRoot) return;
    const scope = reportRoot;
    function select(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const activeModal = document.querySelector('dialog[open],[aria-modal="true"]');
      if (activeModal && activeModal !== dialog.current) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("a,button,input,select,textarea")) return;
      const summary = target.closest<HTMLElement>("summary");
      const disclosure = summary?.parentElement;
      if (!summary || !(disclosure instanceof HTMLDetailsElement) || !disclosure.dataset.evidenceKey || disclosure.closest(".thesis-report") !== scope) return;
      // A browser without the native modal API retains its inline disclosures.
      if (mobileSnapshot() && typeof dialog.current?.showModal !== "function") return;
      event.preventDefault();
      if (trigger.current === summary) { dismiss(); return; }
      releaseTrigger();
      trigger.current = summary;
      summary.dataset.evidenceSelected = "true";
      summary.focus({ preventScroll: true });
      const label = summary.cloneNode(true) as HTMLElement;
      label.querySelectorAll(".claim-source").forEach(node => node.remove());
      const claimLabel = label.querySelector(".claim-label")?.textContent?.trim();
      const selectionLabel = claimLabel ? `${claimLabel} · ${label.querySelector(".claim-text")?.textContent?.trim() ?? "Recorded claim"}` : label.textContent?.trim() || "Recorded evidence";
      const nodes = [...disclosure.childNodes].filter(node => node !== summary).map(node => node.cloneNode(true));
      const catalogKey = disclosure.dataset.evidenceKind === "number" ? "evidenceNumberContext" : "evidenceClaimContext";
      const recordedContext = [...scope.querySelectorAll<HTMLElement>('[data-evidence-context="recorded"]')]
        .find(node => node.dataset[catalogKey] === disclosure.dataset.evidenceContextKey);
      if (recordedContext) nodes.push(...[...recordedContext.childNodes].map(node => node.cloneNode(true)));
      else {
        const unavailable = document.createElement("p");
        unavailable.textContent = "No additional structured filing context is recorded for this observation.";
        nodes.push(unavailable);
      }
      setSelection({ key: disclosure.dataset.evidenceKey, kind: disclosure.dataset.evidenceKind ?? "source", label: selectionLabel, nodes });
    }
    function escape(event: KeyboardEvent) {
      if (!mobileSnapshot() && event.key === "Escape" && !event.defaultPrevented && trigger.current && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        dismiss();
      }
    }
    scope.addEventListener("click", select, true);
    document.addEventListener("keydown", escape);
    return () => {
      scope.removeEventListener("click", select, true);
      document.removeEventListener("keydown", escape);
      releaseTrigger();
    };
  }, [dismiss, releaseTrigger]);

  useLayoutEffect(() => {
    if (selection && trigger.current) {
      trigger.current.setAttribute("aria-controls", `${id}-${mobile ? "dialog" : "selection"}`);
      trigger.current.setAttribute("aria-expanded", "true");
      if (mobile) trigger.current.setAttribute("aria-haspopup", "dialog");
      else trigger.current.removeAttribute("aria-haspopup");
    }
    if (selection && mobile && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      closeButton.current?.focus({ preventScroll: true });
    } else if ((!selection || !mobile) && dialog.current?.open) dialog.current.close();
  }, [id, mobile, selection]);

  function toggleSources(open: boolean) {
    const scope = section.current?.closest(".thesis-report");
    if (!scope) return;
    dismiss(false);
    scope.querySelectorAll<HTMLDetailsElement>("details[data-evidence-key]").forEach(disclosure => {
      disclosure.open = open;
      if (open) {
        let ancestor = disclosure.parentElement?.closest("details");
        while (ancestor && scope.contains(ancestor)) {
          ancestor.open = true;
          ancestor = ancestor.parentElement?.closest("details");
        }
      }
    });
  }

  return <>
    <section ref={section} className="evidence-inspector" aria-label="Selected evidence" data-report-identity={reportIdentity}>
      <h3>Source inspector</h3>
      <p role="status" className="evidence-selection-status">{selection ? `Inspecting recorded ${selection.kind} evidence` : "Select a claim or a figure's provenance to inspect its recorded evidence."}</p>
      {selection && !mobile && <div id={`${id}-selection`} className="evidence-selection" key={selection.key}>
        <div className="evidence-selection-heading"><h4>{selection.label}</h4><button type="button" onClick={() => dismiss()}>Close evidence</button></div>
        <RecordedContent selection={selection} />
      </div>}
      <div className="evidence-tools">
        <button type="button" disabled={!hydrated} onClick={() => toggleSources(true)}>Expand all sources</button>
        <button type="button" disabled={!hydrated} onClick={() => toggleSources(false)}>Collapse source details</button>
      </div>
      <details className="evidence-legend"><summary>Evidence legend</summary>
        <p>FACT describes a factual claim. ESTIMATE describes a model estimate. JUDGMENT describes an analytical assessment.</p>
        <p>Citation-traced means the figure traces to a source or recorded payload. Untraced means the supplied citation was not resolved. Not checked means citation verification was not recorded.</p>
        <p>Citation status describes traceability, not correctness. Observation dates and measurement windows belong to the selected evidence, not the report generation date.</p>
      </details>
    </section>
    <dialog ref={dialog} id={`${id}-dialog`} className="evidence-dialog" aria-labelledby={`${id}-title`} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); dismiss(); }}>
      <div className="evidence-dialog-heading"><h2 id={`${id}-title`}>Recorded evidence</h2><button ref={closeButton} type="button" onClick={() => dismiss()}>Close evidence</button></div>
      {selection && mobile && <><h3>{selection.label}</h3><RecordedContent selection={selection} /></>}
      <p>Citation status describes traceability, not correctness.</p>
    </dialog>
  </>;
}
