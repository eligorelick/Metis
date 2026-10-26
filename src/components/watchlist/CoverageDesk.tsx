import Link from "next/link";
import { GradeChip } from "@/components/ui";
import { GRADE_SURFACES } from "@/report/surfaceManifest";
import type { WatchlistRowView } from "@/watchlist/watchlist";

/** Saved/cached coverage only. Missing currency is explicit, never assumed USD. */
export function CoverageDesk({ rows }: { rows: readonly WatchlistRowView[] }) {
  return (
    <>
      <div className="coverage-scroll" role="region" aria-label="Saved company coverage" tabIndex={0}>
        <table className="coverage-table">
          <caption className="sr-only">Saved company research, section assessments, cached quote dates and citation coverage</caption>
          <thead><tr><th scope="col">Company</th><th scope="col">Section assessments</th><th scope="col">Cached quote</th><th scope="col">Latest report</th><th scope="col">Figures traced</th><th scope="col">Next earnings</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.symbol}>
              <td className="coverage-company"><Link href={`/company/${encodeURIComponent(row.symbol)}`} prefetch={false}>{row.symbol}</Link><span>{row.companyName ?? "Company name not recorded"}</span>
                {row.gaps.length > 0 && <details className="mt-2 text-[11px] text-warn"><summary className="cursor-pointer">{row.gaps.length} coverage {row.gaps.length === 1 ? "gap" : "gaps"}</summary><ul>{row.gaps.map((gap, i) => <li key={i} className="mt-2 text-muted">{gap}</li>)}</ul></details>}
              </td>
              <td className="coverage-grades" data-label="Section assessments">
                {row.grades ? <div className="flex flex-wrap items-start">{GRADE_SURFACES.map((descriptor) => {
                  const grade = row.grades?.[descriptor.key];
                  if (grade === undefined) return null;
                  const label = `${descriptor.label}: ${row.gradeLabels?.[descriptor.key] ?? grade ?? "not assessed"}`;
                  return <Link key={descriptor.id} href={`/company/${encodeURIComponent(row.symbol)}#report-${descriptor.sectionKey}`} prefetch={false} title={label} aria-label={label} className="flex flex-col items-center"><span className="text-[11px] text-faint">{descriptor.shortLabel}</span><GradeChip grade={grade} /></Link>;
                })}</div> : <span className="text-muted">No report yet</span>}
              </td>
              <td className="coverage-date" data-label="Cached quote"><span className="mono">{typeof row.price === "number" ? row.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Not recorded"}</span>
                {typeof row.changePct === "number" && <div className={`text-[12px] ${row.changePct >= 0 ? "text-pos" : "text-neg"}`}>{row.changePct >= 0 ? "+" : ""}{row.changePct.toFixed(2)}%</div>}
                {row.asOf && <div className="text-[11px] text-muted">{row.asOf.slice(0, 10)}{row.priceStale ? " · stale" : ""}</div>}
              </td>
              <td className="coverage-date" data-label="Latest report">{row.lastReportAt ? <Link href={`/company/${encodeURIComponent(row.symbol)}/history`} prefetch={false} className="text-accent">{row.lastReportAt.slice(0, 10)}</Link> : "No report yet"}</td>
              <td data-label="Figures traced">{typeof row.verificationRate === "number" ? `${(row.verificationRate * 100).toFixed(1)}%` : "Not recorded"}</td>
              <td className="coverage-date" data-label="Next earnings">{row.nextEarnings ?? "Not recorded"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="coverage-footnote">Grades follow the report&apos;s assessment rules. Leadership measures the capital-stewardship proxy. Citation coverage describes traceability, not correctness. Coverage does not identify quote currency; open the company for currency and provenance.</p>
    </>
  );
}
