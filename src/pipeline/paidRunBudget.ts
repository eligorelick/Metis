/**
 * Paid-run budget feasibility, checked before the first paid request.
 *
 * Paid admission (`acquirePaidPassLease`) admits one reservation at a time:
 * what the job has already spent, plus live reservations, plus this request's
 * worst case must fit the per-job and rolling caps. A request that cannot fit
 * is refused when the run reaches it, after every earlier pass has been paid
 * for. On 2026-11-03 a Haiku 4.5 run under a $3 job cap paid $0.44 for its bull
 * pass, then could not admit bear's $2.90 research reservation on top of it,
 * and its judge (each section request reserves $5.28 on the Sonnet 5.5 floor)
 * could never have fit; the run ended data-only and the $0.44 bought nothing.
 *
 * This module lists every reservation the rest of a run asks admission for,
 * priced by the functions admission itself uses, so the runner can refuse the
 * whole run before anything is sent when the largest one cannot fit. Spend
 * only grows during a run, so if the largest reservation does not fit now, the
 * request carrying it will be refused when it is reached. The converse does
 * not hold: fitting now is necessary, not sufficient, because the requests
 * admitted first spend real money before the largest one is reached.
 */
import { parseSubscriptionModel } from "@/ai/contracts";
import { getConfig } from "@/config/env";
import { judgeFloorModelId, resolveRegistryModel } from "@/models/registry";
import type { DurablePass } from "@/pipeline/jobArtifacts";
import type { PaidCapRefusal } from "@/pipeline/jobScheduler";
import { JUDGE_PASSES_PER_SETTING } from "@/pipeline/stageC/judgeProtocol";
import {
  maximumPassCostUsd,
  maximumRequestCostUsd,
  type VerifyReservationCapability,
} from "@/providers/anthropic";

/**
 * What the PASS-level lease reserves (DECISIONS D-10). The runner's settlement
 * checkpoints take their lease at this amount, and the feasibility plan below
 * prices each pass lease with it.
 *
 * In "request" mode it reserves ONE request maximum. That covers a pass that
 * settles without ever reaching the provider, and it is released the moment
 * the first request takes its own reservation, so live exposure stays at one
 * request maximum per in-flight call. In "pass" mode it reserves the
 * pre-remediation bound covering every request the pass could make, kept for
 * one release as a fallback.
 *
 * WS7 (D-20), 2026-09 review: "every request the pass could make" includes the
 * MIRRORED judge request under `METIS_JUDGE_ORDER=both`. In "request" mode both
 * requests are admitted and settled individually, so the pass lease is still one
 * request maximum; in "pass" mode there is no per-request admission at all, and
 * two judge requests were sharing one reservation sized for one order.
 */
export function passReservationUsd(
  model: string,
  pass: DurablePass,
  verifyCapability?: VerifyReservationCapability,
): number {
  // Subscription allowance is managed by the provider. This route cannot send
  // API-key requests and reserves no USD; it retains durable launch gates.
  if (parseSubscriptionModel(model)) return 0;
  if (pass === "verify" && verifyCapability?.billable !== true) {
    return maximumPassCostUsd(model, pass, verifyCapability);
  }
  return getConfig().reservationMode === "pass"
    ? maximumPassCostUsd(model, pass, verifyCapability, judgeRequestsPerPass())
    : maximumRequestCostUsd(model, pass, verifyCapability);
}

/** How many provider requests one judge pass issues under the setting in force. */
export function judgeRequestsPerPass(): 1 | 2 {
  return JUDGE_PASSES_PER_SETTING[getConfig().judgeOrder];
}

/** Whether provider requests are admitted individually. */
export function usesRequestAdmission(): boolean {
  return getConfig().reservationMode === "request";
}

/**
 * What admission is asked to reserve.
 *
 * - `pass-admission`: the pass's own durable lease, taken before its first
 *   request. In request mode it is one request maximum and is released to
 *   zero as that request reserves for itself; in pass mode it is every
 *   request the pass could make, and no request reserves separately.
 * - `research`: an analyst's web-search request (up to eight searches and ten
 *   sampling inputs).
 * - `writing`: an analyst's tool-free writing request.
 * - `judge-section`: one synthesize section request (no tools, one-hour cache
 *   write). Every section, every mirrored order and every judge retry reserves
 *   this same amount.
 * - `verify`: one request of a billable verify adapter.
 */
export type PlannedReservationKind = "pass-admission" | "research" | "writing" | "judge-section" | "verify";

export interface PlannedReservation {
  pass: DurablePass;
  kind: PlannedReservationKind;
  /** Model the reservation is priced for: the judge floor for a Haiku judge. */
  model: string;
  reservationUsd: number;
}

/** The paid work still to run in this generation. */
export interface RemainingPaidWork {
  /** Analyst sides with no settled, reusable result. */
  analysts: readonly ("bull" | "bear")[];
  synthesize: boolean;
  verify: boolean;
}

/** The model a synthesize request is priced for (maximumRequestCostUsd's own rule). */
function judgeModelFor(model: string): string {
  return resolveRegistryModel(model)?.entry.family === "haiku" ? judgeFloorModelId() : model;
}

/**
 * Every distinct reservation the remaining work asks admission for, priced
 * for the resolved analysis model by the functions admission uses
 * (`passReservationUsd` for each pass lease, `maximumRequestCostUsd` for each
 * request, whose arguments match what Stage C sends: analyst research at the
 * five-minute cache-write rate with the eight-search cap, analyst writing with
 * no tools, judge sections at the one-hour rate with no tools).
 *
 * Each distinct reservation is listed once. Retries, analyst repairs,
 * continuations, transport re-sends, pause resumptions, further judge sections
 * and the mirrored judge order reserve the same amount as the request they
 * repeat (pass mode folds them into the pass lease), so they cannot raise the
 * largest single reservation this plan is used for.
 *
 * A subscription connection reserves nothing and has an empty plan. A verify
 * adapter that declares no capability is left to the verify boundary, which
 * refuses it as before.
 */
export function plannedPaidReservations(
  model: string,
  work: RemainingPaidWork,
  verifyCapability?: VerifyReservationCapability,
): PlannedReservation[] {
  if (parseSubscriptionModel(model)) return [];
  const requestMode = usesRequestAdmission();
  const planned: PlannedReservation[] = [];
  for (const side of work.analysts) {
    planned.push({ pass: side, kind: "pass-admission", model, reservationUsd: passReservationUsd(model, side) });
    if (requestMode) {
      planned.push({ pass: side, kind: "research", model, reservationUsd: maximumRequestCostUsd(model, side) });
      planned.push({ pass: side, kind: "writing", model, reservationUsd: maximumRequestCostUsd(model, side, undefined, "5m", 0) });
    }
  }
  if (work.synthesize) {
    const judgeModel = judgeModelFor(model);
    planned.push({ pass: "synthesize", kind: "pass-admission", model: judgeModel, reservationUsd: passReservationUsd(model, "synthesize") });
    if (requestMode) {
      planned.push({ pass: "synthesize", kind: "judge-section", model: judgeModel, reservationUsd: maximumRequestCostUsd(model, "synthesize") });
    }
  }
  if (work.verify && verifyCapability !== undefined) {
    planned.push({ pass: "verify", kind: "pass-admission", model, reservationUsd: passReservationUsd(model, "verify", verifyCapability) });
    if (requestMode && verifyCapability.billable) {
      planned.push({ pass: "verify", kind: "verify", model, reservationUsd: maximumRequestCostUsd(model, "verify", verifyCapability) });
    }
  }
  return planned;
}

/**
 * The single largest positive reservation, or null when nothing reserves USD.
 * On a tie a request is named over the pass lease that equals it (in request
 * mode the lease is one request maximum), and an earlier pass over a later one.
 */
export function largestPlannedReservation(planned: readonly PlannedReservation[]): PlannedReservation | null {
  let largest: PlannedReservation | null = null;
  for (const entry of planned) {
    if (!(entry.reservationUsd > 0)) continue;
    if (
      largest === null ||
      entry.reservationUsd > largest.reservationUsd ||
      (entry.reservationUsd === largest.reservationUsd && largest.kind === "pass-admission" && entry.kind !== "pass-admission")
    ) {
      largest = entry;
    }
  }
  return largest;
}

/** Exact dollars: at least two decimals, up to six (the ledger's micro-USD). */
function usd(value: number): string {
  const fixed = value.toFixed(6).replace(/0+$/, "");
  const [whole, fraction = ""] = fixed.split(".");
  return `$${whole}.${fraction.padEnd(2, "0")}`;
}

const ANALYST_LABEL = { bull: "bull", bear: "bear" } as const;

/** Reader wording for the reservation that cannot fit. */
function describeReservation(entry: PlannedReservation): string {
  const passMode = entry.kind === "pass-admission" && !usesRequestAdmission();
  switch (entry.pass) {
    case "bull":
    case "bear": {
      const side = ANALYST_LABEL[entry.pass];
      if (entry.kind === "research") return `the ${side} analyst's web-research request`;
      if (entry.kind === "writing") return `the ${side} analyst's writing request`;
      return passMode
        ? `the ${side} analyst pass (pass reservation mode reserves every request the pass could make)`
        : `the ${side} analyst pass`;
    }
    case "synthesize":
      if (entry.kind === "judge-section") return "each synthesize (judge) section request";
      return passMode
        ? "the synthesize (judge) pass (pass reservation mode reserves every request the pass could make)"
        : "the synthesize (judge) pass";
    case "verify":
      return "the verify pass";
  }
}

function jobCapSource(refusal: PaidCapRefusal): string {
  const recorded = refusal.recordedJobCapUsd;
  const configured = refusal.configuredJobCapUsd;
  if (recorded !== null && configured !== null) {
    return `the lower of the ${usd(recorded)} recorded when this job was created and the ${usd(configured)} set in METIS_MAX_JOB_COST_USD now`;
  }
  return recorded !== null ? "recorded when this job was created" : "set in METIS_MAX_JOB_COST_USD";
}

/**
 * The data-only reason and step detail for a refused run. It names the pass,
 * the model, the worst-case reservation, the cap that refuses it and the
 * smallest cap that could admit it, and says why that is not enough on its
 * own: the requests admitted before it spend first.
 */
export function paidBudgetRefusalReason(blocked: PlannedReservation, refusal: PaidCapRefusal): string {
  const what = `${describeReservation(blocked)} on ${blocked.model}`;
  const earlier = "plus whatever this run's earlier paid requests spend before that request is admitted";
  const ending = "Nothing was sent to the model and this run added no cost; this is a data-only report.";
  if (refusal.cap === "job") {
    const already = refusal.settledUsd + refusal.reservedUsd > 0
      ? ` (that reservation plus the ${usd(refusal.settledUsd)} this job has already spent${refusal.reservedUsd > 0 ? ` and ${usd(refusal.reservedUsd)} reserved by its requests in flight` : ""})`
      : "";
    // D-120: a job never runs above the cap recorded when it was created, Retry
    // included; only a new report records the cap in force now.
    const recorded = refusal.recordedJobCapUsd;
    const next = recorded !== null && recorded < refusal.minimumCapUsd
      ? `This job keeps the ${usd(recorded)} cap it was created with, even on Retry, so after raising METIS_MAX_JOB_COST_USD start a new report.`
      : "Raise METIS_MAX_JOB_COST_USD and restart Metis before running this report again.";
    return `Paid analysis was not started: the per-job cost cap cannot admit ${what}, whose worst-case reservation is ${usd(blocked.reservationUsd)}. ` +
      `Paid admission requires what the job has already spent or reserved, plus a request's worst case, to fit the cap, which is ${usd(refusal.capUsd)} (${jobCapSource(refusal)}). ` +
      `Finishing needs a per-job cap of at least ${usd(refusal.minimumCapUsd)}${already}, ${earlier}. ${next} ${ending}`;
  }
  const minutes = Math.round(refusal.rollingWindowMs / 60_000).toLocaleString("en-US");
  const inFlight = refusal.reservedUsd > 0 ? ` and ${usd(refusal.reservedUsd)} is reserved by requests in flight` : "";
  return `Paid analysis was not started: the rolling cost cap cannot admit ${what}, whose worst-case reservation is ${usd(blocked.reservationUsd)}. ` +
    `Only ${usd(refusal.headroomUsd)} of the ${usd(refusal.capUsd)} cap (METIS_MAX_ROLLING_COST_USD, over the last ${minutes} minutes) is free: ` +
    `${usd(refusal.settledUsd)} is already spent in the window${inFlight}. ` +
    `Finishing needs at least ${usd(blocked.reservationUsd)} free in the window (a rolling cap of at least ${usd(refusal.minimumCapUsd)} at the current spend), ${earlier}. ${ending}`;
}
