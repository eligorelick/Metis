/**
 * D-273 (P22): the one reading order for the app, Markdown and print. The
 * business story comes before the figures: the verdict, then the business
 * group (business and segments, the competitive landscape and the outlook,
 * which hold competitors, protection and management's plan), then catalysts
 * and risks, then the figure sections. Read time only, so a report saved
 * before D-273 renders in this order too without any change to its bytes (P21).
 */
export const REPORT_SECTION_MANIFEST = [
  { key: "verdict", index: 1, label: "Verdict", printTitle: "Verdict", accent: false },
  { key: "business", index: 2, label: "Business", printTitle: "Business & Segments", accent: false },
  { key: "competitive", index: 3, label: "Competitive", printTitle: "Competitive Landscape", accent: false },
  { key: "outlook", index: 4, label: "Outlook", printTitle: "Future Outlook", accent: false },
  { key: "catalystsRisks", index: 5, label: "Catalysts & Risks", printTitle: "Catalysts & Risks", accent: true },
  { key: "fundamentals", index: 6, label: "Fundamentals", printTitle: "Fundamentals", accent: false },
  { key: "balanceSheet", index: 7, label: "Balance Sheet", printTitle: "Balance Sheet & Capital", accent: false },
  { key: "valuation", index: 8, label: "Valuation", printTitle: "Valuation", accent: false },
  { key: "quality", index: 9, label: "Quality", printTitle: "Quality & Red Flags", accent: false },
  { key: "technicals", index: 10, label: "Technicals", printTitle: "Technicals", accent: false },
  { key: "leadership", index: 11, label: "Leadership", printTitle: "Leadership & Governance", accent: false },
  { key: "projections", index: 12, label: "Projections", printTitle: "Weighted Projections", accent: false },
  { key: "macro", index: 13, label: "Macro", printTitle: "Macro Context", accent: false },
  { key: "appendix", index: 14, label: "Appendix", printTitle: "Appendix", accent: false },
] as const;

export type ReportSectionKey = (typeof REPORT_SECTION_MANIFEST)[number]["key"];

export function reportSection(key: ReportSectionKey) {
  const section = REPORT_SECTION_MANIFEST.find((entry) => entry.key === key);
  if (!section) throw new Error(`Unknown report section: ${key}`);
  return section;
}
