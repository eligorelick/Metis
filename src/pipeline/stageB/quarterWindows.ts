/** A statement row whose fiscal period may need validation and deduplication. */
export interface FiscalDatedRow {
  date?: unknown;
  acceptedDate?: unknown;
  filingDate?: unknown;
  cik?: unknown;
  reportedCurrency?: unknown;
  calendarYear?: unknown;
  fiscalYear?: unknown;
  period?: unknown;
  periodStart?: unknown;
  link?: unknown;
  finalLink?: unknown;
  accessionNumber?: unknown;
  fieldProvenance?: unknown;
}

const DAY_MS = 86_400_000;
const QUARTER_GAP_DAYS: readonly [number, number] = [70, 135];
const TTM_SPAN_DAYS: readonly [number, number] = [250, 320];

interface StrictDay {
  label: string;
  epochMs: number;
}

interface RecencyInterval {
  earliestMs: number;
  latestMs: number;
}

/**
 * Parse a real Gregorian YYYY-MM-DD without Date.parse coercions. Fiscal period
 * ends are dates, not timestamps, so no suffix or time component is accepted.
 */
function strictFiscalDay(value: unknown): StrictDay | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
  if (day > monthDays[month - 1]) return null;

  // Date.UTC remaps years 0-99 to 1900-1999. setUTCFullYear preserves the
  // actual four-digit Gregorian year while retaining a UTC-midnight epoch.
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return { label: value, epochMs: parsed.getTime() };
}

/** Whether two period ends establish adjacent quarters under the TTM rule. */
export function adjacentQuarterEnds(newer: unknown, older: unknown): boolean {
  const end = strictFiscalDay(newer);
  const prior = strictFiscalDay(older);
  if (end === null || prior === null) return false;
  const days = (end.epochMs - prior.epochMs) / DAY_MS;
  return days >= QUARTER_GAP_DAYS[0] && days <= QUARTER_GAP_DAYS[1];
}

function displayPeriod(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value === null || value === undefined || value === "") return "<missing>";
  return String(value);
}

/**
 * FMP acceptedDate is normally `YYYY-MM-DD HH:mm:ss`. Support its canonical
 * space form plus the equivalent ISO `T`/`Z` spelling, parsing every component
 * explicitly. A day-only acceptedDate is intentionally an imprecise full-day
 * interval, just like filingDate.
 */
function acceptedRecency(value: unknown): RecencyInterval | null {
  const day = strictFiscalDay(value);
  if (day) return { earliestMs: day.epochMs, latestMs: day.epochMs + DAY_MS - 1 };
  if (typeof value !== "string") return null;

  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z?$/.exec(value);
  if (!match) return null;
  const date = strictFiscalDay(match[1]);
  if (!date) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const millisecond = Number((match[5] ?? "0").padEnd(3, "0"));
  const epochMs = date.epochMs + hour * 3_600_000 + minute * 60_000 + second * 1_000 + millisecond;
  return { earliestMs: epochMs, latestMs: epochMs };
}

function rowRecency(row: FiscalDatedRow, periodEndMs: number): RecencyInterval | null {
  const acceptedPresent =
    row.acceptedDate !== null && row.acceptedDate !== undefined && row.acceptedDate !== "";
  let recency: RecencyInterval | null;
  if (acceptedPresent) {
    recency = acceptedRecency(row.acceptedDate);
  } else {
    const filing = strictFiscalDay(row.filingDate);
    recency = filing
      ? { earliestMs: filing.epochMs, latestMs: filing.epochMs + DAY_MS - 1 }
      : null;
  }

  // A filing/acceptance on a prior calendar day cannot describe a later
  // restatement of a fiscal period that had not ended yet.
  return recency !== null && recency.latestMs >= periodEndMs ? recency : null;
}

function fiscalScopeKey(row: FiscalDatedRow): string | null {
  const cik = String(row.cik ?? "");
  const years = [row.fiscalYear, row.calendarYear].filter(value => value !== undefined && value !== null).map(String);
  if (!/^\d{1,10}$/.test(cik) || Number(cik) <= 0 || typeof row.reportedCurrency !== "string" || !/^[A-Z]{3}$/.test(row.reportedCurrency) ||
      !years.length || years.some(value => !/^\d{4}$/.test(value) || value !== years[0]) || !/^(?:Q[1-4]|FY)$/.test(String(row.period))) return null;
  return JSON.stringify([cik.replace(/^0+/, ""), row.reportedCurrency, years[0], row.period]);
}

/** Nearby dates are aliases only with matching explicit fiscal and issuer scope. */
export function compatibleFiscalAlias(left: FiscalDatedRow, right: FiscalDatedRow): boolean {
  const a = strictFiscalDay(left.date), b = strictFiscalDay(right.date);
  if (!a || !b || a.label === b.label || Math.abs(a.epochMs - b.epochMs) > (left.period === "FY" && right.period === "FY" ? 7 : 3) * DAY_MS) return false;
  const scope = fiscalScopeKey(left);
  if (scope === null || scope !== fiscalScopeKey(right)) return false;
  const filed = strictFiscalDay(left.filingDate);
  if (!filed || filed.label !== strictFiscalDay(right.filingDate)?.label || filed.epochMs < Math.max(a.epochMs, b.epochMs)) return false;
  if (!rowRecency(left, a.epochMs) || !rowRecency(right, b.epochMs)) return false;
  const starts = [left.periodStart, right.periodStart].filter(value => value !== undefined && value !== null);
  if (starts.some(value => !strictFiscalDay(value)) || (starts.length === 2 && starts[0] !== starts[1])) return false;
  // Filing dates alone do not prove an accession. When accession evidence is
  // present, a conflict within either row or between rows forbids the alias.
  const accessions = (row: FiscalDatedRow): Set<string> => new Set([row.accessionNumber, row.finalLink, row.link].flatMap(value => {
    if (typeof value !== "string") return [];
    const direct = /^\d{10}-\d{2}-\d{6}$/.test(value) ? value.replaceAll("-", "") : null;
    const archived = /^https:\/\/(?:www\.)?sec\.gov\/Archives\/edgar\/data\/\d+\/(\d{18})\//i.exec(value)?.[1];
    return direct ? [direct] : archived ? [archived] : [];
  }));
  const ids = new Set([...accessions(left), ...accessions(right)]);
  return ids.size <= 1;
}

/**
 * Why `normalizeQuarterRowsWithKinds` rejected a period (P11, D-223). It is set
 * where the rejection is decided, next to its sentence, so code reads this value
 * instead of the wording. In memory only: it is never stored or shown, and
 * `normalizeQuarterRows` does not return it.
 */
export type QuarterRejectionKind =
  | "invalid-date"
  | "alias-scope-conflict"
  | "alias-value-restatement"
  | "duplicate-missing-recency"
  | "duplicate-tied-recency";

/** The two kinds behind a "duplicate fiscal period ..." sentence: a period served more than once with no provably latest row. */
export function isAmbiguousDuplicateRejection(kind: QuarterRejectionKind): boolean {
  return kind === "duplicate-missing-recency" || kind === "duplicate-tied-recency";
}

/**
 * Validate period ends, sort newest-first, and collapse restatements without
 * mutating either the source array or its row objects. A duplicate period is
 * retained only when one whole row is provably later than every other row.
 * Returns exactly `{ rows, rejected }`; the rejection kinds stay with
 * `normalizeQuarterRowsWithKinds`, so no caller's stored object gains a key.
 */
export function normalizeQuarterRows<T extends FiscalDatedRow>(
  rows: readonly T[],
): { rows: T[]; rejected: Array<{ period: string; reason: string }> } {
  const { rows: kept, rejected } = normalizeQuarterRowsWithKinds(rows);
  return { rows: kept, rejected };
}

/**
 * `normalizeQuarterRows`, plus `rejectionKinds[i]`: why `rejected[i]` was
 * rejected (P11, D-223). The records in `rejected` are the same `{ period,
 * reason }` objects `normalizeQuarterRows` returns.
 */
export function normalizeQuarterRowsWithKinds<T extends FiscalDatedRow>(
  rows: readonly T[],
): { rows: T[]; rejected: Array<{ period: string; reason: string }>; rejectionKinds: QuarterRejectionKind[] } {
  const rejected: Array<{ period: string; reason: string }> = [];
  const rejectionKinds: QuarterRejectionKind[] = [];
  const reject = (kind: QuarterRejectionKind, period: string, reason: string): void => {
    rejected.push({ period, reason });
    rejectionKinds.push(kind);
  };
  const grouped = new Map<string, Array<{ row: T; day: StrictDay }>>();

  for (const row of rows) {
    const day = strictFiscalDay(row.date);
    if (!day) {
      const period = displayPeriod(row.date);
      reject("invalid-date", period, `invalid fiscal period-end date "${period}"; expected a real Gregorian YYYY-MM-DD`);
      continue;
    }
    const group = grouped.get(day.label);
    const candidate = { row, day };
    if (group) group.push(candidate);
    else grouped.set(day.label, [candidate]);
  }

  // Keep every exact-date candidate while establishing aliases: an older copy
  // can connect the true period end to a later restatement with a new accession.
  // Sorting first and bounding the entire group prevents order-dependent chains.
  const aliasGroups: Array<Array<{ row: T; day: StrictDay }>> = [];
  for (const candidates of [...grouped.values()].sort((a, b) => a[0].day.epochMs - b[0].day.epochMs)) {
    const group = aliasGroups.find(existing => candidates[0].day.epochMs - existing[0].day.epochMs <= (candidates[0].row.period === "FY" && existing[0].row.period === "FY" ? 7 : 3) * DAY_MS &&
      existing.some(a => candidates.some(b => compatibleFiscalAlias(a.row, b.row))));
    if (group) group.push(...candidates);
    else aliasGroups.push([...candidates]);
  }
  const selected: Array<{ row: T; day: StrictDay }> = [];
  for (const candidates of aliasGroups) {
    const period = [...new Set(candidates.map(candidate => candidate.day.label))].join(" / ");
    if (candidates.length === 1) {
      selected.push(candidates[0]);
      continue;
    }

    const recencies = candidates.map(({ row, day }) => rowRecency(row, day.epochMs));
    if (new Set(candidates.map(candidate => candidate.day.label)).size > 1) {
      const scopes = candidates.map(candidate => fiscalScopeKey(candidate.row));
      if (scopes.some(scope => scope === null || scope !== scopes[0])) {
        reject("alias-scope-conflict", period, `fiscal aliases ${period} contain contradictory issuer, currency or fiscal scope; whole period rejected as ambiguous`);
        continue;
      }
      // SEC rows retain first-reported dates while individual values may be
      // restated later. Such mixed value sources cannot establish whole-row
      // ordering against an intervening vendor revision.
      const sourceRecencyConflict = candidates.some(({ row }, index) => {
        const recency = recencies[index];
        if (!recency || !row.fieldProvenance || typeof row.fieldProvenance !== "object") return false;
        return Object.values(row.fieldProvenance).some((field: unknown) => {
          if (!field || typeof field !== "object" || !("filings" in field) || !Array.isArray(field.filings)) return false;
          return field.filings.some((filing: unknown) => {
            const filed = strictFiscalDay(filing && typeof filing === "object" && "filed" in filing ? filing.filed : undefined);
            return filed === null || filed.epochMs > recency.latestMs;
          });
        });
      });
      if (sourceRecencyConflict) {
        reject("alias-value-restatement", period, `fiscal aliases ${period} have value-source restatements not represented by row recency; whole period rejected as ambiguous`);
        continue;
      }
    }
    if (recencies.some((recency) => recency === null)) {
      reject("duplicate-missing-recency", period,
        `duplicate fiscal period ${period} has missing or invalid acceptedDate/filingDate recency; whole period rejected as ambiguous`);
      continue;
    }

    const provablyLatest: number[] = [];
    for (let index = 0; index < recencies.length; index++) {
      const candidate = recencies[index] as RecencyInterval;
      const laterThanEveryOther = recencies.every((other, otherIndex) =>
        otherIndex === index || candidate.earliestMs > (other as RecencyInterval).latestMs,
      );
      if (laterThanEveryOther) provablyLatest.push(index);
    }

    if (provablyLatest.length !== 1) {
      reject("duplicate-tied-recency", period,
        `duplicate fiscal period ${period} has tied or overlapping acceptedDate/filingDate recency; whole period rejected as ambiguous`);
      continue;
    }
    selected.push(candidates[provablyLatest[0]]);
  }

  selected.sort((left, right) => right.day.epochMs - left.day.epochMs);
  return { rows: selected.map(({ row }) => row), rejected, rejectionKinds };
}

/** Return why a newest-first window is not exactly four contiguous quarters. */
/**
 * @param priorRow The period-end immediately BEFORE the window, when the caller
 * has it. The gap checks below validate the three intervals BETWEEN the four
 * rows, which proves the window's internal spacing but says nothing about the
 * duration of the OLDEST quarter itself — that is the interval from the period
 * before it. A transition or stub period sitting in the oldest slot therefore
 * entered the TTM sum unchecked, understating every trailing-twelve-month
 * figure built on it. Supplying the prior row closes that hole; omitting it
 * preserves the previous behaviour for callers that genuinely have no earlier
 * row (the start of history).
 */
export function quarterWindowViolation(
  rows: readonly { date?: unknown }[],
  priorRow?: { date?: unknown } | null,
): string | null {
  if (rows.length !== 4) return `quarter window must contain exactly 4 rows (received ${rows.length})`;

  const parsed: StrictDay[] = [];
  for (const row of rows) {
    const day = strictFiscalDay(row.date);
    if (!day) {
      return `invalid fiscal quarter period-end date "${displayPeriod(row.date)}"; expected a real Gregorian YYYY-MM-DD`;
    }
    parsed.push(day);
  }

  for (let index = 0; index < parsed.length - 1; index++) {
    const newer = parsed[index];
    const older = parsed[index + 1];
    const gapDays = (newer.epochMs - older.epochMs) / DAY_MS;
    if (gapDays === 0) return `duplicate quarter period-end ${newer.label}`;
    if (gapDays < 0) {
      return `quarter period-ends not in descending order (${newer.label} before ${older.label})`;
    }
    if (gapDays < QUARTER_GAP_DAYS[0] || gapDays > QUARTER_GAP_DAYS[1]) {
      return `non-contiguous quarters: ${gapDays}-day gap between ${older.label} and ${newer.label} (accepted ${QUARTER_GAP_DAYS[0]}–${QUARTER_GAP_DAYS[1]} for 52/53-week calendars)`;
    }
  }

  // Duration of the OLDEST quarter in the window, which the loop above cannot
  // see. Only checked when the caller supplied the preceding period.
  if (priorRow !== undefined && priorRow !== null) {
    const oldest = parsed[parsed.length - 1];
    const before = strictFiscalDay(priorRow.date);
    if (before) {
      const gapDays = (oldest.epochMs - before.epochMs) / DAY_MS;
      if (gapDays === 0) return `duplicate quarter period-end ${oldest.label}`;
      // Only a TOO-SHORT interval is disqualifying. A short span means the
      // oldest slot covers less than a quarter — a transition or stub period
      // whose value understates the TTM sum. A LONG interval means the earlier
      // history is simply missing, which says nothing about the oldest
      // quarter's own duration and must not reject an otherwise sound window.
      if (gapDays > 0 && gapDays < QUARTER_GAP_DAYS[0]) {
        return `oldest quarter ${oldest.label} spans only ${gapDays} days from ${before.label} (a quarter is ${QUARTER_GAP_DAYS[0]}–${QUARTER_GAP_DAYS[1]} days) — a transition/stub period would understate the TTM sum`;
      }
    }
  }

  const spanDays = (parsed[0].epochMs - parsed[3].epochMs) / DAY_MS;
  if (spanDays < TTM_SPAN_DAYS[0] || spanDays > TTM_SPAN_DAYS[1]) {
    return `four quarter-ends span ${spanDays} days (accepted ${TTM_SPAN_DAYS[0]}–${TTM_SPAN_DAYS[1]}) — not a trailing twelve months`;
  }
  return null;
}

/**
 * Scan every candidate anchor until `maxValid` valid windows have been found.
 * Invalid candidates are disclosed but never consume the valid-window limit.
 * Callers must first pass rows through normalizeQuarterRows; this function
 * intentionally preserves order so misuse is rejected as an order violation.
 */
export function contiguousQuarterWindows<T extends { date?: unknown }>(
  rows: readonly T[],
  maxValid: number,
): { windows: T[][]; rejected: Array<{ anchor: string; reason: string }> } {
  const windows: T[][] = [];
  const rejected: Array<{ anchor: string; reason: string }> = [];
  if (!Number.isFinite(maxValid) || maxValid <= 0) return { windows, rejected };
  const limit = Math.floor(maxValid);

  for (let index = 0; index + 4 <= rows.length && windows.length < limit; index++) {
    const window = rows.slice(index, index + 4);
    // rows is newest-first, so the period BEFORE the window is the next element.
    const violation = quarterWindowViolation(window, rows[index + 4] ?? null);
    if (violation === null) {
      windows.push(window);
    } else {
      rejected.push({
        anchor: displayPeriod(window[0]?.date),
        reason: violation,
      });
    }
  }
  return { windows, rejected };
}
