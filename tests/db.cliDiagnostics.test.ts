import { describe, expect, it } from "vitest";
import { serializeError } from "@vitest/utils/error";
import { describeTestFailure, withRequiredCleanup } from "./helpers/requiredCleanup";

function caught(body: () => void): unknown {
  try {
    body();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the test operation to fail");
}

describe("required test cleanup diagnostics", () => {
  it("runs body and mandatory cleanup once when both succeed", () => {
    const events: string[] = [];
    withRequiredCleanup(() => { events.push("body"); }, () => { events.push("cleanup"); });
    expect(events).toEqual(["body", "cleanup"]);
  });

  it("rethrows the original body error after successful cleanup", () => {
    const bodyError = new Error("body failed");
    const events: string[] = [];
    const error = caught(() => withRequiredCleanup(() => { events.push("body"); throw bodyError; }, () => { events.push("cleanup"); }));
    expect(error).toBe(bodyError);
    expect(events).toEqual(["body", "cleanup"]);
  });

  it("fails with the original cleanup error after a successful body", () => {
    const cleanupError = Object.assign(new Error("directory is locked"), { code: "EPERM" });
    const events: string[] = [];
    const error = caught(() => withRequiredCleanup(() => { events.push("body"); }, () => { events.push("cleanup"); throw cleanupError; }));
    expect(error).toBe(cleanupError);
    expect(events).toEqual(["body", "cleanup"]);
  });

  it("retains both failures and child diagnostics when required cleanup also fails", () => {
    const bodyError = Object.assign(new Error("child failed"), { code: "ETIMEDOUT", status: null, signal: "SIGTERM", stdout: "schema startup", stderr: "child diagnostic" });
    const cleanupError = Object.assign(new Error("directory is locked"), { code: "EPERM" });
    const events: string[] = [];
    const error = caught(() => withRequiredCleanup(() => { events.push("body"); throw bodyError; }, () => { events.push("cleanup"); throw cleanupError; }));
    expect(error).toBeInstanceOf(AggregateError);
    const aggregate = error as AggregateError;
    expect(aggregate.errors).toEqual([bodyError, cleanupError]);
    expect(aggregate.errors[0]).toBe(bodyError);
    expect(aggregate.errors[1]).toBe(cleanupError);
    expect(aggregate.cause).toBe(bodyError);
    for (const detail of ["ETIMEDOUT", "status=null", "SIGTERM", "schema startup", "child diagnostic", "EPERM"]) expect(aggregate.message).toContain(detail);
    expect(events).toEqual(["body", "cleanup"]);
  });

  it("does not mistake a thrown undefined value for a successful body", () => {
    const cleanupError = new Error("cleanup failed");
    const error = caught(() => withRequiredCleanup(() => { throw undefined; }, () => { throw cleanupError; }));
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([undefined, cleanupError]);
  });

  it("bounds child output tails and strips terminal controls from failure summaries", () => {
    const error = Object.assign(new Error("child failed"), {
      code: "ETIMEDOUT", status: null, signal: "SIGTERM",
      stdout: Buffer.from(`discarded stdout prefix${"x".repeat(10_000)}\u001b[31mstdout tail\u001b[0m`),
      stderr: `discarded stderr prefix${"y".repeat(10_000)}stderr tail\u0007`,
    });
    const summary = describeTestFailure(error);
    expect(summary).toContain("stdout tail");
    expect(summary).toContain("stderr tail");
    expect(summary).not.toContain("discarded stdout prefix");
    expect(summary).not.toContain("discarded stderr prefix");
    expect(summary).not.toContain("\u001b");
    expect(summary).not.toContain("\u0007");
    expect(summary.length).toBeLessThan(5_000);
  });

  it("does not dump environment or arbitrary child-error properties", () => {
    const error = Object.assign(new Error("child failed"), {
      code: "SQLITE_BUSY", status: 1, signal: null,
      env: { ANTHROPIC_API_KEY: "do-not-print-environment" }, spawnargs: ["do-not-print-arguments"],
    });
    const summary = describeTestFailure(error);
    expect(summary).toContain("SQLITE_BUSY");
    expect(summary).toContain("status=1");
    expect(summary).not.toContain("do-not-print");
    expect(summary).not.toContain("ANTHROPIC_API_KEY");
  });

  it("keeps Vitest's dual-failure serialization bounded without losing the original errors in memory", () => {
    const bodyError = Object.assign(new Error("child failed"), {
      code: "ETIMEDOUT", status: null, signal: "SIGTERM",
      stdout: `discarded child output${"x".repeat(20_000)}retained output tail`,
      env: { API_KEY: "do-not-serialize-environment" }, spawnargs: ["do-not-serialize-arguments"],
    });
    const cleanupError = Object.assign(new Error("cleanup failed"), { code: "EPERM" });
    const aggregate = caught(() => withRequiredCleanup(() => { throw bodyError; }, () => { throw cleanupError; })) as AggregateError;
    expect(aggregate).toBeInstanceOf(AggregateError);
    expect(aggregate.errors[0]).toBe(bodyError);
    expect(aggregate.cause).toBe(bodyError);
    const serialized = JSON.stringify(serializeError(aggregate));
    expect(serialized).toContain("ETIMEDOUT");
    expect(serialized).toContain("EPERM");
    expect(serialized).toContain("retained output tail");
    expect(serialized).not.toContain("discarded child output");
    expect(serialized).not.toContain("do-not-serialize");
    expect(serialized.length).toBeLessThan(20_000);
  });
});
