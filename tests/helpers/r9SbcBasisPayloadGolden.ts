import { expect } from "vitest";
import type { ContextPayload } from "@/pipeline/stageC/payload";

/** R9: restore only reviewed basis labels/derived ids for the historical byte pins. */
export function restoreR9SbcBasisGolden<T extends { payload: ContextPayload }>(input: T): T {
  const payload = structuredClone(input.payload);
  const oldId = (id: string) => id.replace("computed.capital-cash.sbc-cash-flow-add-back-revenue", "computed.capital-cash.sbc-revenue")
    .replace("computed.capital-cash.sbc-cash-flow-add-back-fcf", "computed.capital-cash.sbc-fcf")
    .replace("computed.current-capital.sbc-cash-flow-add-back", "computed.current-capital.stock-based-compensation")
    .replace(/(payload\.statements\.cash-flow-(?:annual|quarterly)\.[\d-]+)\.sbc-cash-flow-add-back$/, "$1.stock-based-comp");
  const oldLabel = (label: string, origin: string): string => {
    if (origin === "computed.capital.current.cashBridge.stockBasedCompensation") { expect(label).toBe("SBC, cash-flow add-back"); return "stock based compensation"; }
    if (origin === "computed.capital.sbc") {
      expect(label).toMatch(/^SBC, cash-flow add-back \/ (?:revenue|FCF)$/);
      return label.endsWith("revenue") ? "SBC % revenue" : "SBC % FCF";
    }
    return label;
  };
  for (const section of payload.computed) for (const figure of section.figures) {
    figure.label = oldLabel(figure.label, figure.source);
    if (figure.provenanceId) figure.provenanceId = oldId(figure.provenanceId);
  }
  for (const block of payload.statements) for (const line of block.lineItems) {
    if (line.lineItem !== "SBC, cash-flow add-back") continue;
    line.lineItem = "stock-based comp";
    for (const cell of line.byPeriod) if (cell.provenanceId) cell.provenanceId = oldId(cell.provenanceId);
  }
  for (const record of payload.provenanceRegistry ?? []) {
    if (record.label !== undefined) record.label = record.id.startsWith("payload.statements.cash-flow-") && record.label === "SBC, cash-flow add-back"
      ? "stock-based comp" : oldLabel(record.label, record.origin);
    record.id = oldId(record.id);
  }
  return { ...input, payload };
}
