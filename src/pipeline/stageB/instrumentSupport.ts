export type UnsupportedInstrumentKind = "etf" | "fund" | "etf-fund" | "non-equity" | "unknown";

/** Shared wire guard: retain the exact terminal reason across live and resumed jobs. */
export function isUnsupportedInstrumentKind(value: unknown): value is UnsupportedInstrumentKind {
  return value === "etf" || value === "fund" || value === "etf-fund" || value === "non-equity" || value === "unknown";
}

export type InstrumentSupport =
  | { supported: true; kind: "company" }
  | { supported: false; kind: UnsupportedInstrumentKind; reason: string };

export class UnsupportedInstrumentError extends Error {
  readonly support: Extract<InstrumentSupport, { supported: false }>;

  constructor(support: Extract<InstrumentSupport, { supported: false }>) {
    super(support.reason);
    this.name = "UnsupportedInstrumentError";
    this.support = support;
  }
}

const UNSUPPORTED_REASON: Record<UnsupportedInstrumentKind, string> = {
  etf: "ETF analysis is not supported; this research workflow analyzes individual companies only.",
  fund: "Fund analysis is not supported; this research workflow analyzes individual companies only.",
  "etf-fund":
    "ETF and fund analysis is not supported; this research workflow analyzes individual companies only.",
  "non-equity": "This instrument is not supported for individual-company equity analysis.",
  unknown: "Security type is not established by the available sources. Company analysis is withheld until the instrument can be classified; this does not establish that the ticker is invalid or permanently unsupported.",
};

export function classifyInstrumentSupport(
  input: { isEtf?: boolean | null; isFund?: boolean | null; isAdr?: boolean | null; instrumentType?: string | null } | null,
): InstrumentSupport {
  const isEtf = input?.isEtf === true;
  const isFund = input?.isFund === true;
  if (isEtf || isFund) {
    const kind: UnsupportedInstrumentKind = isEtf && isFund ? "etf-fund" : isEtf ? "etf" : "fund";
    return { supported: false, kind, reason: UNSUPPORTED_REASON[kind] };
  }
  const type = typeof input?.instrumentType === "string" ? input.instrumentType.trim().toUpperCase() : "";
  if (type === "ETF" || type === "MUTUALFUND" || type === "CLOSEDEND") {
    const kind = type === "ETF" ? "etf" : "fund";
    return { supported: false, kind, reason: UNSUPPORTED_REASON[kind] };
  }
  if (["INDEX", "CRYPTOCURRENCY", "CURRENCY", "FUTURE", "OPTION"].includes(type)) {
    return { supported: false, kind: "non-equity", reason: `${type}: ${UNSUPPORTED_REASON["non-equity"]}` };
  }
  if (type === "EQUITY" || (!type && input?.isEtf === false && input?.isFund === false)) {
    return { supported: true, kind: "company" };
  }
  return { supported: false, kind: "unknown", reason: UNSUPPORTED_REASON.unknown };
}
