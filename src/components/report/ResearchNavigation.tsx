import Link from "next/link";

/** Real server routes; choosing a saved report never prefetches live research. */
export function ResearchNavigation({ symbol, active, reportHref }: {
  symbol: string;
  active: "report" | "analysis" | "revisions";
  reportHref?: string;
}) {
  const company = `/company/${encodeURIComponent(symbol)}`;
  return (
    <nav className="research-navigation" aria-label="Company research views">
      {([
        ["report", "Report", reportHref ?? company],
        ["analysis", "Live analysis", `${company}?view=live`],
        ["revisions", "Revisions", `${company}/history`],
      ] as const).map(([key, label, href]) => <Link key={key} href={href} prefetch={false} aria-current={active === key ? "page" : undefined}>{label}</Link>)}
    </nav>
  );
}
