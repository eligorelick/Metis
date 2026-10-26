"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

export function SidebarNavigation({ children }: { children: ReactNode }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  function dismissOnEscape(event: ReactKeyboardEvent<HTMLElement>) {
    if (!expanded || event.key !== "Escape" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    setExpanded(false);
    toggle.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const onChange = () => { if (!media.matches) setExpanded(false); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return (
    <>
      <button type="button" ref={toggle} className="thesis-nav-toggle" aria-expanded={expanded} aria-controls={id}
        onClick={() => setExpanded((value) => !value)} onKeyDown={dismissOnEscape}>
        {expanded ? "Hide navigation" : "Show navigation"}
      </button>
      <aside id={id} data-mobile-expanded={expanded} className="thesis-sidebar flex w-64 shrink-0 flex-col overflow-y-auto border-r border-edge bg-panel"
        onClick={(event) => { if ((event.target as Element).closest("a[href]")) setExpanded(false); }}
        onKeyDown={dismissOnEscape}
        onBlurCapture={(event) => { if (expanded && !event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false); }}>
        {children}
      </aside>
    </>
  );
}
