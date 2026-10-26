import type { Report } from "@/report/schema";

import { ReportView } from "./ReportView";
import { getConfig } from "@/config/env";

/** Render a persisted report from only the data stored in its snapshot. */
export function PersistedReportView({ report, selectedReportId }: { report: Report; selectedReportId?: number }) {
  const context = selectedReportId === undefined ? {} : {selectedReportId};
  return getConfig().uiRedesign ? <ReportView report={report} layout="dossier" {...context} /> : <ReportView report={report} {...context} />;
}
