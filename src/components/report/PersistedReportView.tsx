import type { Report } from "@/report/schema";

import { ReportView } from "./ReportView";

/** Render a persisted report from only the data stored in its snapshot. */
export function PersistedReportView({ report, selectedReportId, selectedReportStatus, headerNotices }: { report: Report; selectedReportId?: number; selectedReportStatus?: string; headerNotices?: boolean }) {
  const context = { ...(selectedReportId === undefined ? {} : { selectedReportId }), ...(selectedReportStatus === undefined ? {} : { selectedReportStatus }), ...(headerNotices === undefined ? {} : { headerNotices }) };
  return <ReportView report={report} {...context} />;
}
