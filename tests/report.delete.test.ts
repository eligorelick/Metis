import { afterEach, beforeEach, expect, it } from "vitest";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { jobs, reports } from "@/db/schema";
import { deleteSavedReport } from "@/report/delete";
import { DELETE } from "@/app/api/report/view/[reportId]/route";

let handle: DatabaseHandle;
beforeEach(() => { handle = createDatabase(":memory:"); setDbForTests(handle.db); });
afterEach(() => { setDbForTests(null); handle?.sqlite.close(); });
function seed(status = "done") {
  const row = handle.db.insert(reports).values({ symbol: "BRK.B", model: "test", status, createdAt: "2026-11-06T00:00:00Z" }).returning().get();
  handle.db.insert(jobs).values({ id: "job", symbol: "BRK.B", status, reportId: row.id, stepsJson: "[]", createdAt: row.createdAt, updatedAt: row.createdAt }).run();
  return row.id;
}
it("deletes only the requested ticker's saved report and retains job accounting", () => {
  const id = seed();
  expect(deleteSavedReport(id, "AAPL")).toBe("missing");
  expect(deleteSavedReport(id, "BRK-B")).toBe("deleted");
  expect(handle.db.select().from(reports).all()).toEqual([]);
  expect(handle.db.select().from(jobs).get()).toMatchObject({ id: "job", reportId: null, status: "done" });
  expect(deleteSavedReport(id, "BRK.B")).toBe("missing");
});
it("refuses to remove a report linked to an active job", () => {
  const id = seed("running");
  expect(deleteSavedReport(id, "BRK.B")).toBe("active");
  expect(handle.db.select().from(reports).all()).toHaveLength(1);
});
it("rejects cross-origin deletion and malformed ids before changing history", async () => {
  const id = seed();
  const url = `http://localhost:3000/api/report/view/${id}?symbol=BRK.B`;
  expect((await DELETE(new Request(url, { method: "DELETE", headers: { host: "localhost:3000", origin: "https://evil.example" } }), { params: Promise.resolve({ reportId: String(id) }) })).status).toBe(403);
  expect((await DELETE(new Request(url, { method: "DELETE", headers: { host: "localhost:3000", origin: "http://localhost:3000" } }), { params: Promise.resolve({ reportId: "1bad" }) })).status).toBe(400);
  expect(handle.db.select().from(reports).all()).toHaveLength(1);
  expect((await DELETE(new Request(url, { method: "DELETE", headers: { host: "localhost:3000", origin: "http://localhost:3000" } }), { params: Promise.resolve({ reportId: String(id) }) })).status).toBe(200);
});
