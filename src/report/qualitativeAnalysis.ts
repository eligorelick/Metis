/**
 * Q1: reader wording for the recent-developments and management-actions
 * blocks, shared by the React view, the Markdown export and the print body so
 * the three surfaces say the same thing. Both fields are optional; a saved
 * report without them renders nothing new.
 */
import type {
  ManagementAction,
  ManagementActionCategory,
  RecentDevelopment,
  ShareholderAlignment,
  SourcedClaim,
} from "@/report/schema";

export const RECENT_DEVELOPMENTS_HEADING = "Recent developments";
export const MANAGEMENT_ACTIONS_HEADING = "Management actions";
export const NO_RECENT_DEVELOPMENTS = "No recent developments recorded.";
export const NO_MANAGEMENT_ACTIONS = "No management actions recorded.";

export const MANAGEMENT_CATEGORY_LABELS: Record<ManagementActionCategory, string> = {
  "leadership-change": "Leadership change",
  "board-change": "Board change",
  strategy: "Strategy",
  "acquisition-divestiture": "Acquisition or divestiture",
  "capital-allocation": "Capital allocation",
  guidance: "Guidance",
  "insider-transaction": "Insider transaction",
  compensation: "Compensation",
  other: "Other",
};

export const SHAREHOLDER_ALIGNMENT_LABELS: Record<ShareholderAlignment, string> = {
  aligned: "Aligned with shareholders",
  mixed: "Mixed",
  misaligned: "Not aligned with shareholders",
  unclear: "Unclear",
};

/** The event date as printed; an undated item says so rather than showing a dash. */
export function eventDateText(date: string | null): string {
  return date ?? "date not stated";
}

/** What happened, then why it matters: one paragraph of separately cited claims. */
export function developmentClaims(item: RecentDevelopment): SourcedClaim[] {
  return [...item.whatHappened, ...item.whyItMatters];
}

/** The action, then its assessment: one paragraph of separately cited claims. */
export function managementActionClaims(item: ManagementAction): SourcedClaim[] {
  return [...item.action, ...item.assessment];
}
