import type { Report } from "@/report/schema";

import { ReportView } from "./ReportView";
import { getConfig } from "@/config/env";

/** Render a persisted report from only the data stored in its snapshot. */
export function PersistedReportView({ report, selectedReportId, headerNotices }: { report: Report; selectedReportId?: number; headerNotices?: boolean }) {
  const context = selectedReportId === undefined ? {} : {selectedReportId};
  return getConfig().uiRedesign ? <ReportView report={report} headerNotices={headerNotices} layout="dossier" {...context} /> : <ReportView report={report} headerNotices={headerNotices} {...context} />;
}
