import type { ReactElement } from "react";
import type { Report } from "@/report/schema";
import { syntheticNotice } from "@/report/presentation";
import { providerFallbackNotice } from "@/report/providerFallback";

export function RunNotices({ report, notices }: { report: Pick<Report, "meta" | "appendix">; notices: "header" | "body" }): ReactElement | null {
 const synthetic = syntheticNotice(report);
 const fallback = providerFallbackNotice(report);
 if (!synthetic && !fallback) return null;
 const className = notices === "header" ? "snapshot-synthetic" : "text-warn";
 return <>{synthetic && <p className={className} data-run-notice="synthetic">{synthetic}</p>}{fallback && <p className={className} data-run-notice="providerFallback">{fallback}</p>}</>;
}
