"use client";

import { useEffect, useRef, useState } from "react";
import { REPORT_SECTION_MANIFEST } from "@/report/sectionManifest";

/** Classic's wrapping assessment grid needs its measured height for jumps. */
export function ClassicReportScrollOffset() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const report = marker.current?.closest<HTMLElement>(".thesis-report");
    const strip = report?.querySelector<HTMLElement>(".report-grade-strip");
    if (!report || !strip) return;
    const update = () => report.style.setProperty("--classic-report-scroll-offset",`${Math.ceil(strip.getBoundingClientRect().height) + 16}px`);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(strip);
    window.addEventListener("resize",update);
    update();
    return () => { observer?.disconnect(); window.removeEventListener("resize",update); report.style.removeProperty("--classic-report-scroll-offset"); };
  },[]);
  return <span ref={marker} hidden />;
}

/** Native links/disclosure work before hydration; one observer adds reading position. */
export function ReportContents({ reportIdentity, hasProjections }: { reportIdentity: string; hasProjections: boolean }) {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState("report-verdict");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const report = root.current?.closest(".thesis-report");
    if (!report) return;
    const nodes = REPORT_SECTION_MANIFEST.map((section) => report.querySelector<HTMLElement>(`#report-${section.key}`)).filter((node) => node !== null);
    const main = report.closest("main");
    const scrollRoot = main && getComputedStyle(main).overflowY !== "visible" ? main : null;
    const shortcuts = report.querySelector<HTMLElement>(".dossier-grade-navigation");
    const revealShortcut = (event: FocusEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!shortcuts || !link || !shortcuts.contains(link)) return;
      const item = link.getBoundingClientRect(), bounds = shortcuts.getBoundingClientRect();
      if (item.left < bounds.left) shortcuts.scrollLeft += item.left - bounds.left;
      else if (item.right > bounds.right) shortcuts.scrollLeft += item.right - bounds.right;
    };
    shortcuts?.addEventListener("focusin",revealShortcut);
    // Destinations share one CSS anchor offset. Resolve styles once per resize,
    // rather than for every heading on every scroll frame in a large report.
    let anchorOffset = 0;
    const measureAnchor = () => { anchorOffset = nodes[0] ? Number.parseFloat(getComputedStyle(nodes[0]).scrollMarginTop) || 0 : 0; };
    measureAnchor();
    const update = () => {
      const stickyEdge = (report.querySelector(".report-grade-strip")?.getBoundingClientRect().bottom ?? 120) + 24;
      const edge = Math.max(stickyEdge,anchorOffset) + 1;
      // A long preceding section can still intersect while the next heading is
      // already readable. Use all ordered destinations at the actual sticky edge.
      const current = nodes.filter(node => node.getBoundingClientRect().top <= edge).at(-1) ?? nodes[0];
      if (current) setActive(current.id);
    };
    const onResize = () => { measureAnchor(); onScroll(); };
    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = null; update(); });
    };
    const observer = new IntersectionObserver(update, { root: scrollRoot, rootMargin: "-120px 0px -65% 0px", threshold: 0 });
    nodes.forEach((node) => observer.observe(node));
    const target = scrollRoot ?? window;
    target.addEventListener("scroll",onScroll,{passive:true});
    window.addEventListener("resize",onResize);
    update();
    return () => {
      observer.disconnect();
      shortcuts?.removeEventListener("focusin",revealShortcut);
      target.removeEventListener("scroll",onScroll);
      window.removeEventListener("resize",onResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [reportIdentity]);
  const current = REPORT_SECTION_MANIFEST.find((section) => `report-${section.key}` === active);
  return (
    <nav className="report-contents" aria-label="Report contents" ref={root} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      const details = root.current?.querySelector("details");
      if (!details?.open) return;
      event.preventDefault();
      details.open = false;
      root.current?.querySelector<HTMLElement>("summary")?.focus();
    }}>
      <details>
        <summary>Report contents <span className="text-muted">{current ? `${String(current.index).padStart(2, "0")} · ${current.label}` : "14 sections"}</span></summary>
        <div>{REPORT_SECTION_MANIFEST.map((section) => <a key={section.key} href={`#report-${section.key}`} aria-current={active === `report-${section.key}` ? "location" : undefined} onClick={() => {
          const details = root.current?.querySelector("details");
          if (details) details.open = false;
          setActive(`report-${section.key}`);
          root.current?.closest(".thesis-report")?.querySelector<HTMLElement>(`#report-${section.key}`)?.focus({ preventScroll: true });
        }}>
          <span className="mono text-faint">{String(section.index).padStart(2, "0")}</span><span>{section.label}{section.key === "projections" && !hasProjections ? " · not recorded" : ""}</span>
        </a>)}</div>
      </details>
    </nav>
  );
}
